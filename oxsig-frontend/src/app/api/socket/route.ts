/**
 * Socket.io API Route
 * Note: This file is for type safety and documentation.
 * Actual Socket.io server is in server.js (custom Next.js server)
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Socket.io WebSocket endpoint',
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    events: {
      client: [
        'offer',
        'answer',
        'ice-candidate',
        'join-room',
        'leave-room',
        'message',
        'ping',
      ],
      server: [
        'offer',
        'answer',
        'ice-candidate',
        'user-joined',
        'user-left',
        'room-users',
        'message',
        'pong',
      ],
    },
    documentation: 'WebSocket connection available at ws://localhost:3000/socket.io/',
  });
}
