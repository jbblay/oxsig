# ⚡ Quick Reference - OxSig Backend

## 🚀 Deploy (3 Commands)

```bash
cd oxsig-backend
railway init
railway up
```

## 🔑 Essential Commands

```bash
# Deploy
railway up

# View logs
railway logs --follow

# Set variables
railway variables set KEY=value

# Get domain
railway domain

# Check status
railway status

# Restart
railway restart
```

## 🌐 Endpoints

| Endpoint | Purpose | Example |
|----------|---------|---------|
| `/health` | Health check | `curl https://app.railway.app/health` |
| `/ws` | WebSocket | `wss://app.railway.app/ws` |
| `/metrics` | Prometheus | `curl https://app.railway.app/metrics` |
| `/rooms` | List rooms | `curl https://app.railway.app/rooms` |

## 🔧 Environment Variables

```bash
# Required (if using auth)
JWT_SECRET=your-secret-here

# Optional
WS_REQUIRE_AUTH=false
RUST_LOG=info
```

## 🧪 Test Commands

```bash
# Health
curl https://your-app.railway.app/health

# WebSocket
websocat wss://your-app.railway.app/ws

# Metrics
curl https://your-app.railway.app/metrics
```

## 📱 WebSocket Messages

### Ping/Pong
```json
// Send
{"type":"ping"}

// Receive
{"type":"pong"}
```

### Join Room
```json
{
  "type":"join",
  "room":"room-123",
  "user_id":"user-456"
}
```

### WebRTC Offer
```json
{
  "type":"offer",
  "from":"user-a",
  "to":"user-b",
  "sdp":"v=0..."
}
```

### WebRTC Answer
```json
{
  "type":"answer",
  "from":"user-b",
  "to":"user-a",
  "sdp":"v=0..."
}
```

### ICE Candidate
```json
{
  "type":"icecandidate",
  "from":"user-a",
  "to":"user-b",
  "candidate":"candidate:..."
}
```

## 🔥 Quick Fixes

### Build Fails
```bash
railway logs
# Check Dockerfile.production exists
# Verify railway.toml is correct
```

### Health Check Fails
```bash
railway logs --follow
# Look for: "listening on 0.0.0.0:8080"
# Verify PORT is not hardcoded
```

### Connection Refused
```bash
# Use wss:// not ws://
# Check domain: railway domain
# Test health first: curl .../health
```

## 📊 Resource Usage

| Resource | Usage | Limit |
|----------|-------|-------|
| Memory | ~50MB | 512MB |
| CPU | <5% | Shared |
| Build | 5-8min | First time |
| Rebuild | 2-3min | Cached |

## 🎯 Success Checklist

- [ ] `railway up` completes
- [ ] Health endpoint returns 200
- [ ] WebSocket connects
- [ ] Ping/pong works
- [ ] Logs show no errors
- [ ] Metrics accessible

## 📚 Docs

- Full Guide: [README.md](./README.md)
- Railway Guide: [RAILWAY.md](./RAILWAY.md)
- Changes: [REFACTOR.md](./REFACTOR.md)
- Deploy Guide: [DEPLOY_NOW.md](./DEPLOY_NOW.md)

---

**Deploy now:** `./deploy.sh` 🚀
