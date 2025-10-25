/**
 * Custom Next.js Server with Socket.io
 * Replaces Rust WebSocket backend
 */

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Room management
const rooms = new Map();
const userSockets = new Map();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
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

    // Store user connection
    const userId = socket.handshake.auth?.userId || socket.id;
    userSockets.set(userId, socket.id);

    // Handle WebRTC signaling
    socket.on('offer', (data) => {
      const { to, from, sdp } = data;
      console.log(`[WebRTC] Offer from ${from} to ${to}`);
      
      const targetSocketId = userSockets.get(to);
      if (targetSocketId) {
        io.to(targetSocketId).emit('offer', { from, sdp });
      }
    });

    socket.on('answer', (data) => {
      const { to, from, sdp } = data;
      console.log(`[WebRTC] Answer from ${from} to ${to}`);
      
      const targetSocketId = userSockets.get(to);
      if (targetSocketId) {
        io.to(targetSocketId).emit('answer', { from, sdp });
      }
    });

    socket.on('ice-candidate', (data) => {
      const { to, from, candidate } = data;
      console.log(`[WebRTC] ICE candidate from ${from} to ${to}`);
      
      const targetSocketId = userSockets.get(to);
      if (targetSocketId) {
        io.to(targetSocketId).emit('ice-candidate', { from, candidate });
      }
    });

    // Room management
    socket.on('join-room', (data) => {
      const { room, userId } = data;
      console.log(`[Room] ${userId} joining room ${room}`);
      
      socket.join(room);
      
      if (!rooms.has(room)) {
        rooms.set(room, new Set());
      }
      rooms.get(room).add(userId);
      
      // Notify others in room
      socket.to(room).emit('user-joined', { userId, room });
      
      // Send current room members
      socket.emit('room-users', {
        room,
        users: Array.from(rooms.get(room)),
      });
    });

    socket.on('leave-room', (data) => {
      const { room, userId } = data;
      console.log(`[Room] ${userId} leaving room ${room}`);
      
      socket.leave(room);
      
      if (rooms.has(room)) {
        rooms.get(room).delete(userId);
        if (rooms.get(room).size === 0) {
          rooms.delete(room);
        }
      }
      
      socket.to(room).emit('user-left', { userId, room });
    });

    // Generic message forwarding
    socket.on('message', (data) => {
      const { to, from, room, payload } = data;
      
      if (room) {
        // Broadcast to room
        socket.to(room).emit('message', { from, payload });
      } else if (to) {
        // Send to specific user
        const targetSocketId = userSockets.get(to);
        if (targetSocketId) {
          io.to(targetSocketId).emit('message', { from, payload });
        }
      }
    });

    // Ping/Pong for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Disconnect handler
    socket.on('disconnect', () => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
      
      // Remove from user sockets
      for (const [user, socketId] of userSockets.entries()) {
        if (socketId === socket.id) {
          userSockets.delete(user);
          
          // Remove from all rooms
          for (const [room, users] of rooms.entries()) {
            if (users.has(user)) {
              users.delete(user);
              socket.to(room).emit('user-left', { userId: user, room });
              
              if (users.size === 0) {
                rooms.delete(room);
              }
            }
          }
          break;
        }
      }
    });
  });

  // Health check endpoint
  httpServer.on('request', (req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'healthy',
        service: 'oxsig-nextjs',
        websocket: 'socket.io',
        connections: io.engine.clientsCount,
        rooms: rooms.size,
      }));
      return;
    }
  });

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
╚════════════════════════════════════════════════════════════╝
      `);
    });
});
