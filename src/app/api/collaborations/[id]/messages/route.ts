/**
 * Collaboration Messages API Routes
 * GET /api/collaborations/[id]/messages - List messages in a collaboration
 * POST /api/collaborations/[id]/messages - Send a message
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/postgres';

/**
 * GET /api/collaborations/[id]/messages
 * List messages in a collaboration
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return requireAuth(request, async (_req, user) => {
    try {
      const { id } = await params;
      const { searchParams } = new URL(request.url);
      const limit = parseInt(searchParams.get('limit') || '50');
      const offset = parseInt(searchParams.get('offset') || '0');
      
      const pool = getPool();

      // Check if user has access to this collaboration
      const accessCheck = await pool.query(
        `SELECT c.id
         FROM collaborations c
         LEFT JOIN collaboration_members cm ON c.id = cm.collaboration_id AND cm.user_id = $1
         WHERE c.id = $2 
           AND (c.owner_id = $1 OR (cm.user_id = $1 AND cm.status = 'active'))`,
        [user.id, id]
      );

      if (accessCheck.rows.length === 0) {
        return NextResponse.json(
          { error: 'Collaboration not found or access denied' },
          { status: 404 }
        );
      }

      // Get messages
      const messagesResult = await pool.query(
        `SELECT 
          m.id,
          m.collaboration_id,
          m.user_id,
          m.content,
          m.message_type,
          m.created_at,
          m.edited_at,
          m.metadata,
          u.display_name as sender_name,
          u.email as sender_email,
          u.avatar_url as sender_avatar
         FROM collaboration_messages m
         JOIN users u ON m.user_id = u.id
         WHERE m.collaboration_id = $1
         ORDER BY m.created_at DESC
         LIMIT $2 OFFSET $3`,
        [id, limit, offset]
      );

      const messages = messagesResult.rows.map(msg => ({
        id: msg.id,
        peer_id: msg.collaboration_id,
        text: msg.content,
        sender: msg.user_id === user.id ? 'Me' : msg.sender_name,
        created_at: msg.created_at,
        edited_at: msg.edited_at,
        type: msg.message_type,
        metadata: msg.metadata,
        senderName: msg.sender_name,
        senderEmail: msg.sender_email,
        senderAvatar: msg.sender_avatar,
        isOwnMessage: msg.user_id === user.id
      }));

      return NextResponse.json({
        messages: messages.reverse(), // Return in chronological order
        total: messages.length,
        limit,
        offset
      });
    } catch (error) {
      console.error('Failed to fetch messages:', error);
      return NextResponse.json(
        { error: 'Failed to fetch messages' },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/collaborations/[id]/messages
 * Send a message to a collaboration
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return requireAuth(request, async (req, user) => {
    try {
      const { id } = await params;
      const body = await req.json();
      const { text, type = 'text', metadata = {} } = body;

      // Validate input
      if (!text || text.trim().length === 0) {
        return NextResponse.json(
          { error: 'Message content is required' },
          { status: 400 }
        );
      }

      if (text.length > 5000) {
        return NextResponse.json(
          { error: 'Message must be less than 5000 characters' },
          { status: 400 }
        );
      }

      const pool = getPool();

      // Check if user has access to this collaboration
      const accessCheck = await pool.query(
        `SELECT c.id, cm.permissions
         FROM collaborations c
         LEFT JOIN collaboration_members cm ON c.id = cm.collaboration_id AND cm.user_id = $1
         WHERE c.id = $2 
           AND (c.owner_id = $1 OR (cm.user_id = $1 AND cm.status = 'active'))`,
        [user.id, id]
      );

      if (accessCheck.rows.length === 0) {
        return NextResponse.json(
          { error: 'Collaboration not found or access denied' },
          { status: 404 }
        );
      }

      // Create table if it doesn't exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS collaboration_messages (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          collaboration_id UUID NOT NULL REFERENCES collaborations(id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          message_type VARCHAR(50) DEFAULT 'text',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          edited_at TIMESTAMP WITH TIME ZONE,
          metadata JSONB DEFAULT '{}'::jsonb,
          CONSTRAINT fk_collaboration FOREIGN KEY (collaboration_id) REFERENCES collaborations(id) ON DELETE CASCADE,
          CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        
        CREATE INDEX IF NOT EXISTS idx_messages_collaboration ON collaboration_messages(collaboration_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_messages_user ON collaboration_messages(user_id);
      `);

      // Insert message
      const result = await pool.query(
        `INSERT INTO collaboration_messages (collaboration_id, user_id, content, message_type, metadata)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, collaboration_id, user_id, content, message_type, created_at, metadata`,
        [id, user.id, text.trim(), type, JSON.stringify(metadata)]
      );

      const message = result.rows[0];

      // Get sender info
      const userInfo = await pool.query(
        `SELECT display_name, email, avatar_url FROM users WHERE id = $1`,
        [user.id]
      );

      const senderInfo = userInfo.rows[0];

      return NextResponse.json({
        message: {
          id: message.id,
          peer_id: message.collaboration_id,
          text: message.content,
          sender: 'Me',
          created_at: message.created_at,
          type: message.message_type,
          metadata: message.metadata,
          senderName: senderInfo.display_name,
          senderEmail: senderInfo.email,
          senderAvatar: senderInfo.avatar_url,
          isOwnMessage: true
        }
      }, { status: 201 });
    } catch (error) {
      console.error('Failed to send message:', error);
      return NextResponse.json(
        { error: 'Failed to send message' },
        { status: 500 }
      );
    }
  });
}
