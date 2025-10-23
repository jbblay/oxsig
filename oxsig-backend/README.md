# 🚀 OxSig Backend - Railway Deployment Guide

## 🎯 Overview

This is a Rust-based WebSocket gateway for real-time communication, WebRTC signaling, and device pairing. Optimized for Railway deployment with zero external dependencies required.

## ✨ Features

- ✅ **WebSocket Real-time Communication** - Instant message relay
- ✅ **WebRTC Signaling** - P2P connection setup (offer/answer/ICE)
- ✅ **Room Management** - Multi-user collaboration spaces
- ✅ **REST API** - Full CRUD for documents, auth, search
- ✅ **PostgreSQL Database** - Persistent storage for users, documents, signatures
- ✅ **S3/MinIO Storage** - File upload/download support
- ✅ **MeiliSearch** - Full-text search across documents
- ✅ **JWT Authentication** - Secure user authentication
- ✅ **Health Checks** - Built-in `/health` endpoint
- ✅ **Prometheus Metrics** - Performance monitoring at `/metrics`
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
| `DATABASE_URL` | PostgreSQL connection | - | Yes |
| `STORAGE_ENDPOINT` | S3/MinIO endpoint | - | Yes |
| `STORAGE_ACCESS_KEY` | S3/MinIO access key | - | Yes |
| `STORAGE_SECRET_KEY` | S3/MinIO secret key | - | Yes |
| `STORAGE_BUCKET` | S3/MinIO bucket name | `oxsig` | Yes |
| `STORAGE_REGION` | S3 region | `us-east-1` | No |
| `SEARCH_URL` | MeiliSearch URL | - | Yes |
| `SEARCH_KEY` | MeiliSearch API key | - | No (optional) |
| `JWT_SECRET` | JWT signing key | - | Yes |
| `WS_REQUIRE_AUTH` | Enable WS JWT auth | `false` | No |
| `RUST_LOG` | Log level | `info` | No |

### Railway Services Setup

Add these services in Railway:

1. **PostgreSQL** - Click "Add Service" → "PostgreSQL"
   - Railway auto-sets `DATABASE_URL`

2. **MinIO (S3-compatible storage)** - Use template or Docker service:
   ```bash
   railway service create
   # Select Docker image: minio/minio
   # Command: server /data --console-address ":9001"
   # Set variables: MINIO_ROOT_USER, MINIO_ROOT_PASSWORD
   ```

3. **MeiliSearch** - Use template or Docker service:
   ```bash
   railway service create
   # Select Docker image: getmeili/meilisearch
   # Set variable: MEILI_MASTER_KEY (optional)
   ```

### Minimal Setup (WebSocket Only)

If you only need WebSocket/WebRTC without database/storage/search:

```bash
railway variables set JWT_SECRET=your-secret-key
railway variables set WS_REQUIRE_AUTH=false
```

The backend will start but log warnings about missing services. REST API endpoints will fail but WebSocket will work.

## 📊 Endpoints

### WebSocket Connection
```
wss://your-app.railway.app/ws
```

With authentication:
```
wss://your-app.railway.app/ws?token=YOUR_JWT_TOKEN
```

### REST API Endpoints

#### Authentication
```bash
# Register new user
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "John Doe"
}

# Login
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword"
}

# Response
{
  "token": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

#### Documents
```bash
# Upload document (multipart/form-data)
POST /api/documents
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: multipart/form-data

file: [binary data]

# List documents
GET /api/documents?page=1&per_page=20
Authorization: Bearer YOUR_JWT_TOKEN

# Get document
GET /api/documents/:id
Authorization: Bearer YOUR_JWT_TOKEN

# Delete document
DELETE /api/documents/:id
Authorization: Bearer YOUR_JWT_TOKEN
```

#### Search
```bash
# Search documents
GET /api/search?q=query&limit=10&offset=0
Authorization: Bearer YOUR_JWT_TOKEN
```

### Health Check
```
GET https://your-app.railway.app/health
```

Response:
```json
{
  "status": "healthy",
  "service": "oxsig-backend",
  "version": "0.1.0",
  "services": {
    "database": true,
    "storage": true,
    "search": true
  }
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
