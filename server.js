/**
 * Custom Next.js Server with Socket.io
 * Replaces Rust WebSocket backend
 */

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');
const { authenticateLabSocket } = require('./lab-engine/auth');
const { logLabAudit } = require('./lab-engine/audit');
const {
  attachTerminal,
  getCatalog,
  getSessionForUser,
  resetSession,
  startSession,
  stopSession,
  sweepExpired,
} = require('./lab-engine/orchestrator');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Room management
const rooms = new Map();
const userSockets = new Map();

function getSocketMetadata(socket) {
  const forwardedFor = socket.request?.headers?.['x-forwarded-for'];
  const ipAddress = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(',')[0]?.trim() || socket.handshake.address || 'unknown';

  return {
    ipAddress,
    userAgent: socket.request?.headers?.['user-agent'] || 'unknown',
  };
}

function ack(acknowledge, payload) {
  if (typeof acknowledge === 'function') acknowledge(payload);
}

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'healthy',
          service: 'oxsig-nextjs',
          websocket: 'socket.io',
          labsEnabled: process.env.LABS_ENABLED === 'true',
        }));
        return;
      }

      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      if (!res.headersSent) res.statusCode = 500;
      if (!res.writableEnded) res.end('internal server error');
    }
  });

  // Initialize Socket.io
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
    },
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
  });

  // Socket.io connection handler
  io.on('connection', (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    // Existing collaboration identity. Lab actions DO NOT trust this value.
    const userId = socket.handshake.auth?.userId || socket.id;
    userSockets.set(userId, socket.id);

    async function requireLabUser() {
      if (socket.data.labUser) return socket.data.labUser;
      const payload = await authenticateLabSocket(socket);
      if (!payload) throw new Error('Unauthorized lab request.');
      socket.data.labUser = payload;
      return payload;
    }

    function detachLabTerminal() {
      const proc = socket.data.labTerminal;
      if (proc) {
        try {
          proc.kill('SIGTERM');
        } catch {}
        socket.data.labTerminal = null;
      }
    }

    // Handle WebRTC signaling
    socket.on('offer', (data) => {
      const { to, from, sdp } = data;
      console.log(`[WebRTC] Offer from ${from} to ${to}`);
      const targetSocketId = userSockets.get(to);
      if (targetSocketId) io.to(targetSocketId).emit('offer', { from, sdp });
    });

    socket.on('answer', (data) => {
      const { to, from, sdp } = data;
      console.log(`[WebRTC] Answer from ${from} to ${to}`);
      const targetSocketId = userSockets.get(to);
      if (targetSocketId) io.to(targetSocketId).emit('answer', { from, sdp });
    });

    socket.on('ice-candidate', (data) => {
      const { to, from, candidate } = data;
      console.log(`[WebRTC] ICE candidate from ${from} to ${to}`);
      const targetSocketId = userSockets.get(to);
      if (targetSocketId) io.to(targetSocketId).emit('ice-candidate', { from, candidate });
    });

    // Room management
    socket.on('join-room', (data) => {
      const { room, userId } = data;
      console.log(`[Room] ${userId} joining room ${room}`);
      socket.join(room);

      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room).add(userId);
      socket.to(room).emit('user-joined', { userId, room });
      socket.emit('room-users', { room, users: Array.from(rooms.get(room)) });
    });

    socket.on('leave-room', (data) => {
      const { room, userId } = data;
      console.log(`[Room] ${userId} leaving room ${room}`);
      socket.leave(room);

      if (rooms.has(room)) {
        rooms.get(room).delete(userId);
        if (rooms.get(room).size === 0) rooms.delete(room);
      }

      socket.to(room).emit('user-left', { userId, room });
    });

    // Generic message forwarding
    socket.on('message', (data) => {
      const { to, from, room, payload } = data;
      if (room) {
        socket.to(room).emit('message', { from, payload });
      } else if (to) {
        const targetSocketId = userSockets.get(to);
        if (targetSocketId) io.to(targetSocketId).emit('message', { from, payload });
      }
    });

    // Authenticated lab catalog and current session.
    socket.on('lab:catalog', async (_payload, acknowledge) => {
      try {
        const user = await requireLabUser();
        ack(acknowledge, {
          ok: true,
          labs: getCatalog(),
          session: getSessionForUser(user.sub),
        });
      } catch (error) {
        ack(acknowledge, { ok: false, error: error.message });
      }
    });

    socket.on('lab:start', async ({ labId } = {}, acknowledge) => {
      try {
        const user = await requireLabUser();
        const session = await startSession(user.sub, labId);
        const metadata = getSocketMetadata(socket);
        await logLabAudit({
          userId: user.sub,
          action: 'lab.session.start',
          sessionId: session.id,
          labId,
          ...metadata,
          metadata: { expiresAt: session.expiresAt },
        });
        ack(acknowledge, { ok: true, session });
      } catch (error) {
        console.error('[Labs] start failed:', error.message);
        ack(acknowledge, { ok: false, error: error.message });
      }
    });

    socket.on('lab:stop', async ({ sessionId } = {}, acknowledge) => {
      try {
        const user = await requireLabUser();
        detachLabTerminal();
        const session = await stopSession(user.sub, sessionId);
        const metadata = getSocketMetadata(socket);
        await logLabAudit({
          userId: user.sub,
          action: 'lab.session.stop',
          sessionId,
          labId: session.labId,
          ...metadata,
        });
        ack(acknowledge, { ok: true, session });
      } catch (error) {
        ack(acknowledge, { ok: false, error: error.message });
      }
    });

    socket.on('lab:reset', async ({ sessionId } = {}, acknowledge) => {
      try {
        const user = await requireLabUser();
        detachLabTerminal();
        const session = await resetSession(user.sub, sessionId);
        const metadata = getSocketMetadata(socket);
        await logLabAudit({
          userId: user.sub,
          action: 'lab.session.reset',
          sessionId: session.id,
          labId: session.labId,
          ...metadata,
        });
        ack(acknowledge, { ok: true, session });
      } catch (error) {
        ack(acknowledge, { ok: false, error: error.message });
      }
    });

    socket.on('lab:terminal:attach', async ({ sessionId } = {}, acknowledge) => {
      try {
        const user = await requireLabUser();
        detachLabTerminal();

        const proc = attachTerminal(
          user.sub,
          sessionId,
          data => socket.emit('lab:terminal:data', { sessionId, data }),
          result => {
            socket.data.labTerminal = null;
            socket.emit('lab:terminal:exit', { sessionId, ...result });
          }
        );

        socket.data.labTerminal = proc;
        ack(acknowledge, { ok: true });
      } catch (error) {
        ack(acknowledge, { ok: false, error: error.message });
      }
    });

    socket.on('lab:terminal:input', async ({ sessionId, data } = {}, acknowledge) => {
      try {
        const user = await requireLabUser();
        const current = getSessionForUser(user.sub);
        if (!current || current.id !== sessionId) throw new Error('Lab session not found.');
        if (typeof data !== 'string' || Buffer.byteLength(data, 'utf8') > 8192) {
          throw new Error('Terminal input rejected.');
        }

        const proc = socket.data.labTerminal;
        if (!proc || !proc.stdin?.writable) throw new Error('Terminal is not attached.');
        proc.stdin.write(data);
        ack(acknowledge, { ok: true });
      } catch (error) {
        ack(acknowledge, { ok: false, error: error.message });
      }
    });

    socket.on('lab:terminal:detach', (_payload, acknowledge) => {
      detachLabTerminal();
      ack(acknowledge, { ok: true });
    });

    // Ping/Pong for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Disconnect handler
    socket.on('disconnect', () => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
      detachLabTerminal();

      for (const [user, socketId] of userSockets.entries()) {
        if (socketId === socket.id) {
          userSockets.delete(user);
          for (const [room, users] of rooms.entries()) {
            if (users.has(user)) {
              users.delete(user);
              socket.to(room).emit('user-left', { userId: user, room });
              if (users.size === 0) rooms.delete(room);
            }
          }
          break;
        }
      }
    });
  });

  // Expire disposable sessions without capturing terminal contents.
  const labSweepTimer = setInterval(() => {
    sweepExpired(async session => {
      await logLabAudit({
        userId: session.userId,
        action: 'lab.session.expire',
        sessionId: session.id,
        labId: session.labId,
        metadata: { expiresAt: session.expiresAt },
      });
    }).catch(error => console.error('[Labs] expiry sweep failed:', error.message));
  }, 60 * 1000);
  labSweepTimer.unref?.();

  httpServer
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`
╔════════════════════════════════════════════════════════════╗
║                    OxSig Server Ready                      ║
╠════════════════════════════════════════════════════════════╣
║  Next.js:     http://${hostname}:${port}                     ║
║  Socket.io:   ws://${hostname}:${port}/socket.io/            ║
║  Health:      http://${hostname}:${port}/health              ║
║  Labs:        ${process.env.LABS_ENABLED === 'true' ? 'enabled ' : 'disabled'}                                  ║
╚════════════════════════════════════════════════════════════╝
      `);
    });
});
