import { randomUUID, createHmac } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { getPool } from '@/lib/db/pool';
import { getStoryboardAccess } from '@/lib/storyboards/server';

export const runtime = 'nodejs';
const uuid = z.string().uuid();
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('join'), presenter: z.boolean() }),
  z.object({ action: z.literal('poll'), session: uuid, after: z.string().regex(/^\d{1,20}$/) }),
  z.object({ action: z.literal('leave'), session: uuid }),
  z.object({ action: z.literal('signal'), session: uuid, recipient: uuid,
    kind: z.enum(['offer', 'answer', 'ice']), payload: z.record(z.string(), z.unknown()) }),
]);
const reply = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'private, no-store' },
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return requireAuth(request, async (req, user) => {
    if (!await validateCsrfToken(req)) return reply({ error: 'Invalid CSRF token' }, 403);
    const { id } = await context.params;
    if (!uuid.safeParse(id).success) return reply({ error: 'Invalid Board' }, 400);
    const limited = await checkRateLimit(req, { maxRequests: 240, windowMs: 60_000 }, `${user.id}:${id}:stream`);
    if (limited) return limited;
    const raw = await req.text();
    if (raw.length > 24_000) return reply({ error: 'Signal too large' }, 413);
    let data;
    try { data = schema.parse(JSON.parse(raw)); } catch { return reply({ error: 'Invalid stream request' }, 400); }
    const access = await getStoryboardAccess(id, user.id);
    if (!access) return reply({ error: 'Board not found or access revoked' }, 404);
    const pool = getPool();
    // Also removes revoked viewers before the presenter receives its peer list.
    await pool.query(`DELETE FROM storyboard_stream_sessions s WHERE expires_at <= NOW() OR
      (board_id=$1 AND NOT EXISTS (
        SELECT 1 FROM storyboard_sessions b WHERE b.id=s.board_id AND b.deleted_at IS NULL AND
        (b.owner_id=s.user_id OR EXISTS (SELECT 1 FROM storyboard_shares sh WHERE
         sh.session_id=b.id AND sh.user_id=s.user_id AND sh.revoked_at IS NULL AND
         (sh.expires_at IS NULL OR sh.expires_at>NOW())))))`, [id]);
    if (data.action === 'join') {
      if (data.presenter && access.permission !== 'owner') return reply({ error: 'Only the Board owner can present' }, 403);
      const turnUrls = (process.env.BOARD_TURN_URLS || '').split(',').map(v => v.trim()).filter(Boolean);
      const secret = process.env.BOARD_TURN_SECRET;
      if (!turnUrls.length || !secret) return reply({ error: 'Live streaming needs a TURN relay configured by the administrator.' }, 503);
      const session = randomUUID();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`board-stream:${id}`]);
        const count = await client.query('SELECT count(*)::int AS count FROM storyboard_stream_sessions WHERE board_id=$1 AND NOT presenter', [id]);
        if (!data.presenter && count.rows[0].count >= 8) {
          await client.query('ROLLBACK');
          return reply({ error: 'This stream already has 8 viewers.' }, 409);
        }
        const result = await client.query(`INSERT INTO storyboard_stream_sessions(id,board_id,user_id,presenter)
          VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id`, [session, id, user.id, data.presenter]);
        await client.query('COMMIT');
        if (!result.rows.length) return reply({ error: 'This Board already has a presenter. Stop that stream first.' }, 409);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
      const username = `${Math.floor(Date.now()/1000) + 3600}:${session}`;
      return reply({ session, iceServers: [{ urls: turnUrls, username,
        credential: createHmac('sha1', secret).update(username).digest('base64') }] });
    }
    const found = await pool.query(`SELECT presenter FROM storyboard_stream_sessions
      WHERE id=$1 AND board_id=$2 AND user_id=$3 AND expires_at>NOW()`, [data.session, id, user.id]);
    if (!found.rows.length) return reply({ error: 'Stream session ended. Join again.' }, 410);
    if (data.action === 'leave') {
      await pool.query('DELETE FROM storyboard_stream_sessions WHERE id=$1', [data.session]);
      return reply({ ok: true });
    }
    if (data.action === 'poll') {
      await pool.query("UPDATE storyboard_stream_sessions SET expires_at=NOW()+INTERVAL '20 seconds' WHERE id=$1", [data.session]);
      const peers = await pool.query(`SELECT id,presenter FROM storyboard_stream_sessions
        WHERE board_id=$1 AND id<>$2 AND presenter<>$3 AND expires_at>NOW() ORDER BY id LIMIT 9`, [id, data.session, found.rows[0].presenter]);
      const signals = await pool.query(`SELECT id::text,sender_session AS sender,kind,payload FROM storyboard_stream_signals
        WHERE recipient_session=$1 AND id>$2::bigint ORDER BY id LIMIT 100`, [data.session, data.after]);
      await pool.query("DELETE FROM storyboard_stream_signals WHERE created_at<NOW()-INTERVAL '2 minutes'");
      return reply({ peers: peers.rows, signals: signals.rows });
    }
    const recipient = await pool.query(`SELECT presenter FROM storyboard_stream_sessions
      WHERE id=$1 AND board_id=$2 AND expires_at>NOW() AND presenter<>$3`, [data.recipient, id, found.rows[0].presenter]);
    if (!recipient.rows.length) return reply({ error: 'Stream peer has left' }, 410);
    if ((data.kind === 'offer' && !found.rows[0].presenter) || (data.kind === 'answer' && found.rows[0].presenter)) {
      return reply({ error: 'Invalid signal direction' }, 403);
    }
    await pool.query(`INSERT INTO storyboard_stream_signals(sender_session,recipient_session,kind,payload)
      VALUES($1,$2,$3,$4)`, [data.session, data.recipient, data.kind, JSON.stringify(data.payload)]);
    return reply({ ok: true });
  });
}
