import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import {
  MissionControlError,
  askMissionMentor,
  listMissionProgress,
  markMissionHint,
  prepareRepairMission,
  saveMissionNotes,
  verifyDockerMission,
  prepareDockerWorkspace,
  reviewDockerConcept,
} from '@/lib/academy/mission-control';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const id = z.enum(['deploy', 'repair', 'persist']);
const level = z.enum(['beginner', 'intermediate', 'advanced']);
const payload = z.discriminatedUnion('action', [
  z.object({ action: z.literal('readiness'), labInstanceId: z.string().uuid(), install: z.boolean() }).strict(),
  z.object({ action: z.literal('concept'), answer: z.string().trim().min(3).max(2000) }).strict(),
  z.object({ action: z.literal('notes'), missionId: id, notes: z.string().max(4000) }).strict(),
  z.object({ action: z.literal('hint'), missionId: id }).strict(),
  z.object({ action: z.literal('prepare'), missionId: z.literal('repair'), labInstanceId: z.string().uuid(), confirm: z.literal(true) }).strict(),
  z.object({ action: z.literal('verify'), missionId: id, labInstanceId: z.string().uuid(), difficulty: level }).strict(),
  z.object({ action: z.literal('mentor'), missionId: id, question: z.string().trim().min(1).max(1500), difficulty: level }).strict(),
]);

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    const limit = await checkRateLimit(req, { maxRequests: 40, windowMs: 60_000 }, user.id);
    if (limit) return limit;
    try {
      return NextResponse.json(await listMissionProgress(user.id), { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      console.error('Academy mission state read failed:', error);
      return NextResponse.json({ error: 'Mission progress is temporarily unavailable. Check that migrations through 068 have been applied.' }, { status: 503 });
    }
  });
}

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const limit = await checkRateLimit(req, { maxRequests: 12, windowMs: 60_000 }, user.id);
    if (limit) return limit;
    const parsed = payload.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid mission request' }, { status: 400 });
    const input = parsed.data;
    try {
      let result: unknown;
      switch (input.action) {
        case 'readiness':
          result = await prepareDockerWorkspace(user.id, input.labInstanceId, input.install);
          break;
        case 'concept':
          result = await reviewDockerConcept(user.id, input.answer);
          break;
        case 'notes':
          result = { progress: await saveMissionNotes(user.id, input.missionId, input.notes) };
          break;
        case 'hint':
          result = { progress: await markMissionHint(user.id, input.missionId) };
          break;
        case 'prepare':
          result = { progress: await prepareRepairMission(user.id, input.labInstanceId) };
          break;
        case 'verify':
          result = await verifyDockerMission(user.id, input.missionId, input.labInstanceId, input.difficulty);
          break;
        case 'mentor':
          result = { answer: await askMissionMentor(user.id, input.missionId, input.question, input.difficulty) };
          break;
      }
      return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      if (error instanceof MissionControlError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
      }
      console.error('Academy mission request failed:', error);
      return NextResponse.json({ error: 'Mission action failed; check the lab runtime, AI configuration and database migration.' }, { status: 503 });
    }
  });
}
