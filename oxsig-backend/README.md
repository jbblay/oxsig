# 🚀 OxSig Backend - Railway Deployment Guide

## 🎯 Overview

This is a Rust-based WebSocket gateway for real-time communication, WebRTC signaling, and device pairing. Optimized for Railway deployment with zero external dependencies required.

## ✨ Features

- ✅ **WebSocket Real-time Communication** - Instant message relay
- ✅ **WebRTC Signaling** - P2P connection setup (offer/answer/ICE)
- ✅ **Room Management** - Multi-user collaboration spaces
- ✅ **Health Checks** - Built-in `/health` endpoint
- ✅ **Prometheus Metrics** - Performance monitoring at `/metrics`
- ✅ **Zero Dependencies** - Runs standalone, no DB/Redis/NATS required
- ✅ **JWT Authentication** - Optional token-based auth
- ✅ **Production Ready** - Multi-stage Docker build, optimized size

## 🚂 Deploy to Railway

### Quick Start (One Command)

```bash
# From the oxsig-backend directory
railway up
```

### Manual Setup

1. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login to Railway**
   ```bash
   railway login
   ```

3. **Create New Project**
   ```bash
   cd oxsig-backend
   railway init
   ```

4. **Set Environment Variables**
   ```bash
   railway variables set JWT_SECRET=your-super-secret-key-here
   railway variables set WS_REQUIRE_AUTH=false
   railway variables set RUST_LOG=info
   ```

5. **Deploy**
   ```bash
   railway up
   ```

6. **Get Your URL**
   ```bash
   railway domain
   ```

## 🔧 Configuration

### Required Environment Variables

Set these in Railway Dashboard → Variables:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Server port | `8080` | No (Railway sets this) |
| `JWT_SECRET` | JWT signing key | `change-me-in-production` | Yes (for auth) |
| `WS_REQUIRE_AUTH` | Enable JWT auth | `false` | No |
| `RUST_LOG` | Log level | `info` | No |

### Optional Variables (Advanced)

These are **not required** for basic operation:

```bash
# PostgreSQL (if you add Railway Postgres addon)
DATABASE_URL=postgresql://...

# Redis (if you add Railway Redis addon)
REDIS_URL=redis://...

# NATS (for multi-region deployments)
NATS_URL=nats://...
```

## 📊 Endpoints

### WebSocket Connection
```
wss://your-app.railway.app/ws
```

With authentication:
```
wss://your-app.railway.app/ws?token=YOUR_JWT_TOKEN
```

### Health Check
```
GET https://your-app.railway.app/health
```

Response:
```json
{
  "status": "healthy",
  "service": "oxsig-ws-gateway",
  "version": "0.1.0"
}
```

### Metrics (Prometheus)
```
GET https://your-app.railway.app/metrics
```

### List Active Rooms
```
GET https://your-app.railway.app/rooms
```

## 🔐 WebSocket Message Protocol

### Join Room
```json
{
  "type": "join",
  "room": "room-id",
  "user_id": "user-123"
}
```

### WebRTC Offer
```json
{
  "type": "offer",
  "from": "user-a",
  "to": "user-b",
  "sdp": "v=0\r\no=- ..."
}
```

### WebRTC Answer
```json
{
  "type": "answer",
  "from": "user-b",
  "to": "user-a",
  "sdp": "v=0\r\no=- ..."
}
```

### ICE Candidate
```json
{
  "type": "icecandidate",
  "from": "user-a",
  "to": "user-b",
  "candidate": "candidate:..."
}
```

### Custom Message
```json
{
  "type": "message",
  "from": "user-a",
  "to": "user-b",
  "room": "room-id",
  "data": { "custom": "payload" }
}
```

### Ping/Pong (Keep-Alive)
```json
// Send
{"type": "ping"}

// Receive
{"type": "pong"}
```

## 🐛 Troubleshooting

### Deployment Fails

**Issue:** Build fails with dependency errors

**Solution:**
```bash
# Ensure Cargo.lock exists
cd oxsig-backend
cargo build --release

# Commit Cargo.lock
git add Cargo.lock
git commit -m "Add Cargo.lock"
railway up
```

### Health Check Fails

**Issue:** Railway shows "Unhealthy" status

**Solution:**
- Check logs: `railway logs`
- Verify port binding: App should listen on `0.0.0.0:8080`
- Test locally: `curl http://localhost:8080/health`

### WebSocket Connection Refused

**Issue:** Frontend can't connect to WebSocket

**Solution:**
1. Use `wss://` (not `ws://`) for production
2. Check CORS settings (currently allows all origins)
3. Verify Railway domain is correct
4. Test with WebSocket client:
   ```bash
   websocat wss://your-app.railway.app/ws
   ```

### Authentication Errors

**Issue:** Getting 401 Unauthorized

**Solution:**
1. Check `WS_REQUIRE_AUTH` is set correctly
2. Verify JWT token is valid
3. Ensure `JWT_SECRET` matches token signing key
4. Test without auth first (`WS_REQUIRE_AUTH=false`)

## 📈 Monitoring

### View Logs
```bash
railway logs
railway logs --follow  # Live tail
```

### Check Metrics
```bash
curl https://your-app.railway.app/metrics
```

Key metrics:
- `oxsig_connected_clients` - Current WebSocket connections
- `oxsig_messages_sent_total` - Total messages sent
- `oxsig_messages_received_total` - Total messages received

## 🔄 Updates & Rollbacks

### Deploy Updates
```bash
git push origin main
# Railway auto-deploys from main branch
```

Or manually:
```bash
railway up
```

### Rollback
```bash
railway rollback
```

## 🏗️ Local Development

### Prerequisites
- Rust 1.75+
- Cargo

### Run Locally
```bash
cd oxsig-backend

# Copy example env
cp .env.example .env

# Run in development mode
cargo run

# Or build and run release
cargo build --release
./target/release/oxsig-ws-gateway
```

### Test WebSocket Connection
```bash
# Using websocat
websocat ws://localhost:8080/ws

# Or using wscat
wscat -c ws://localhost:8080/ws
```

### Run Tests
```bash
cargo test
```

## 📦 Docker Build (Manual)

If you want to test the Docker build locally:

```bash
# Build
docker build -f Dockerfile.production -t oxsig-backend .

# Run
docker run -p 8080:8080 \
  -e JWT_SECRET=test-secret \
  -e RUST_LOG=info \
  oxsig-backend
```

## 🔗 Connecting Frontend

In your frontend environment variables (Vercel, Netlify, etc.):

```env
# Production
NEXT_PUBLIC_WS_URL=wss://your-app.railway.app/ws

# Development
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws
```

## 🆘 Support

### Common Issues

1. **Build Times Too Long**
   - Railway caches Rust dependencies
   - First build: ~5-10 min
   - Subsequent builds: ~2-3 min

2. **Memory Issues**
   - Railway free tier: 512MB RAM
   - App uses ~50MB at idle
   - Monitor with metrics endpoint

3. **Connection Limits**
   - Default: 1000 concurrent connections
   - Adjust broadcast channel size in code if needed

### Need Help?

- Check Railway logs: `railway logs`
- Test health endpoint: `curl https://your-app.railway.app/health`
- Verify environment variables: `railway variables`

## 📄 License

See LICENSE file in repository root.

---

**Built with ❤️ using Rust + Axum + Tokio**
