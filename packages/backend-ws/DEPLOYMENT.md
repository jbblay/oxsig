# Backend Deployment Guide - OxSig WebSocket Gateway

## Overview

The backend (ws-gateway) is a **Rust WebSocket signaling server** for:
- 🔄 WebRTC peer connection signaling
- 📱 QR code device pairing relay
- 💬 Real-time collaboration (future)
- 🔐 JWT authentication (optional)

## Deployment Platforms

### ✅ Railway (Recommended)

**Why Railway:**
- ✅ Native Rust support
- ✅ Free tier available
- ✅ Automatic PostgreSQL/Redis/NATS if needed
- ✅ Simple one-click deploy

**Setup:**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create project
cd packages/backend-ws
railway init

# Deploy
railway up
```

**Or use Railway GUI:**
1. Go to https://railway.app
2. Click "New Project" → "Deploy from GitHub"
3. Select `oxsig` repo
4. Root directory: `packages/backend-ws`
5. Railway auto-detects Rust
6. Deploy! 🚀

**Configuration in Railway dashboard:**
```bash
# Required (if using databases)
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
NATS_URL=nats://...

# Optional
JWT_SECRET=your-secret-key
WS_REQUIRE_AUTH=false
RUST_LOG=info
```

---

### 🪰 Fly.io (Best for Edge)

**Why Fly.io:**
- ✅ Global edge deployment
- ✅ Low latency worldwide
- ✅ Free tier (3 small VMs)
- ✅ WebSocket optimized

**Setup:**
```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Deploy from packages/backend-ws/
cd packages/backend-ws
fly launch

# Follow prompts, fly.toml already configured
fly deploy
```

**Set secrets:**
```bash
fly secrets set DATABASE_URL="postgresql://..."
fly secrets set REDIS_URL="redis://..."
fly secrets set NATS_URL="nats://..."
fly secrets set JWT_SECRET="your-secret"
```

**Scale to multiple regions:**
```bash
fly scale count 3 --region iad,lhr,nrt
```

---

### 🐳 Docker (Self-Hosted / Any Platform)

**Build and run:**
```bash
cd packages/backend-ws

# Build production image
docker build -f Dockerfile.production -t oxsig-backend .

# Run standalone (no databases)
docker run -p 8080:8080 \
  -e RUST_LOG=info \
  -e WS_REQUIRE_AUTH=false \
  oxsig-backend

# Run with full stack
docker compose -f ../../infrastructure/docker/docker-compose.yml up -d
```

**Deploy to any Docker platform:**
- **AWS ECS/Fargate:** Push to ECR, create service
- **Google Cloud Run:** `gcloud run deploy`
- **Azure Container Apps:** `az containerapp create`
- **DigitalOcean:** App Platform with Dockerfile
- **Self-hosted VPS:** Docker Compose

---

### ☁️ AWS (Production Grade)

**Option 1: AWS App Runner (Easiest)**
```bash
# Connect GitHub repo
# Point to packages/backend-ws/Dockerfile.production
# Auto-deploy on push
```

**Option 2: ECS Fargate (Scalable)**
```bash
# Build and push to ECR
aws ecr create-repository --repository-name oxsig-backend

docker build -t oxsig-backend packages/backend-ws
docker tag oxsig-backend:latest $ECR_URL/oxsig-backend:latest
docker push $ECR_URL/oxsig-backend:latest

# Create ECS cluster, task definition, service
# Connect to RDS, ElastiCache, EventBridge
```

**Option 3: Lambda (Serverless - Advanced)**
```bash
# Use AWS Lambda Web Adapter
# Package Rust binary with Lambda runtime
# Limited to HTTP/1.1 (WebSocket via API Gateway)
```

---

### 🔵 Azure

**Azure Container Apps:**
```bash
az containerapp create \
  --name oxsig-backend \
  --resource-group oxsig-rg \
  --image ghcr.io/jbblay/oxsig/backend-ws:latest \
  --target-port 8080 \
  --ingress external \
  --env-vars \
    RUST_LOG=info \
    WS_REQUIRE_AUTH=false
```

---

### 🟢 Google Cloud

**Cloud Run:**
```bash
gcloud run deploy oxsig-backend \
  --source packages/backend-ws \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080
```

**GKE (Kubernetes):**
```bash
# Build and push to GCR
gcloud builds submit --tag gcr.io/PROJECT/oxsig-backend packages/backend-ws

# Deploy to GKE
kubectl apply -f k8s/backend-deployment.yaml
```

---

## Environment Variables

### Required for Full Features
```bash
# Database (optional - for audit/persistence)
DATABASE_URL=postgresql://user:pass@host:5432/oxsig

# Redis (optional - for rate limiting)
REDIS_URL=redis://host:6379

# NATS (optional - for distributed setup)
NATS_URL=nats://host:4222

# JWT Auth (optional - for authenticated WebSockets)
JWT_SECRET=your-secret-key-here
WS_REQUIRE_AUTH=false  # Set to true to require JWT tokens
```

### Optional Configuration
```bash
# Logging
RUST_LOG=info  # Options: trace, debug, info, warn, error

# Server
PORT=8080
HOST=0.0.0.0

# Metrics
METRICS_ENABLED=true
```

---

## Testing Deployment

### Health Check
```bash
curl https://your-backend-url/health

# Should return:
{
  "status": "healthy",
  "service": "oxsig-ws-gateway",
  "version": "0.1.0"
}
```

### WebSocket Test
```bash
# Using websocat (install: cargo install websocat)
websocat wss://your-backend-url/ws

# Send test message
{"type":"ping"}

# Should receive
{"type":"pong"}
```

### Metrics
```bash
curl https://your-backend-url/metrics

# Returns Prometheus metrics
# connected_clients, messages_sent, messages_received, etc.
```

---

## Connecting Frontend to Backend

Update `packages/frontend/.env.local`:

```bash
# WebSocket URL
NEXT_PUBLIC_WS_URL=wss://your-backend.railway.app/ws

# Or for development
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws
```

Frontend will automatically connect for:
- QR device pairing
- WebRTC signaling
- Real-time features

---

## Scaling Considerations

### Single Instance (Free Tier)
- ✅ Good for: Dev/testing, small scale
- ✅ Handles: ~1000 concurrent connections
- ✅ Platforms: Railway free, Fly.io free

### Horizontal Scaling
- 🔄 Use NATS for pub/sub between instances
- 🔄 Redis for shared session state
- 🔄 Load balancer for distribution

```bash
# Railway: Auto-scaling
railway scale --replicas 3

# Fly.io: Multi-region
fly scale count 3 --region iad,lhr,nrt

# Docker: Use docker-compose scale
docker-compose up -d --scale ws-gateway=3
```

### High Availability Setup
```bash
# Deploy to multiple regions
Backend: Railway (US) + Fly.io (EU, Asia)
Database: PostgreSQL read replicas
Cache: Redis cluster
Messages: NATS cluster

# Use geo-DNS for routing
Frontend auto-connects to nearest backend
```

---

## Monitoring & Observability

### Built-in Metrics
```bash
# Access Prometheus metrics
curl https://backend-url/metrics

# Key metrics:
- connected_clients
- messages_received
- messages_sent
- websocket_connections_total
```

### Grafana Dashboard
```bash
# Use infrastructure/observability/grafana/
# Import dashboard for ws-gateway metrics
# Connect to your deployed Prometheus
```

### Logging
```bash
# Railway: Built-in logs
railway logs

# Fly.io: Real-time logs
fly logs

# Docker: Standard logs
docker logs oxsig-ws-gateway -f
```

---

## Troubleshooting

### "Build failed - Rust not installed"
✅ **Solution:** Platform doesn't support Rust
- Use Railway or Fly.io (native Rust)
- Or deploy Docker image (pre-built)

### "WebSocket connection failed"
✅ **Check:**
```bash
# CORS enabled?
# SSL/TLS certificate valid?
# Port 8080 exposed?
# Firewall rules?
```

### "Database connection failed"
✅ **Solution:** Backend runs without databases!
```bash
# Just shows warning, continues running
# Only needed for persistence/audit features
```

### "High memory usage"
✅ **Solution:** Rust is efficient, but check:
```bash
# Too many open connections?
# Memory leak in message handling?
# Upgrade instance size
```

---

## Cost Estimates

### Free Tier (Good for Portfolio)
- **Railway:** Free $5/month credit
- **Fly.io:** 3 shared-cpu VMs free
- **Total:** $0/month for basic signaling

### Production (Medium Scale)
- **Railway Pro:** $20/month (8GB RAM)
- **Fly.io Dedicated:** $30/month (3 regions)
- **AWS Fargate:** $40/month (2 vCPU, 4GB)
- **Total:** $20-40/month

### Enterprise (High Scale)
- **Multi-region HA:** $200-500/month
- **Kubernetes cluster:** $500+/month
- **Managed services:** $1000+/month

---

## Security Checklist

- [ ] Enable JWT authentication (`WS_REQUIRE_AUTH=true`)
- [ ] Use HTTPS/WSS only (no plain HTTP/WS)
- [ ] Set up rate limiting (Redis)
- [ ] Configure CORS properly
- [ ] Enable security headers
- [ ] Monitor for DDoS attacks
- [ ] Use secrets management (not hardcoded)
- [ ] Enable audit logging (PostgreSQL)
- [ ] Set up alerts (Prometheus)
- [ ] Regular security updates

---

## Quick Deploy Commands

```bash
# Railway (Recommended)
cd packages/backend-ws && railway up

# Fly.io (Edge)
cd packages/backend-ws && fly deploy

# Docker (Self-hosted)
docker build -f packages/backend-ws/Dockerfile.production -t oxsig-backend .
docker run -p 8080:8080 oxsig-backend

# GitHub Actions (Automated)
# Push to main branch → Auto-deploys
```

---

## Next Steps

1. ✅ Deploy backend to Railway/Fly.io
2. ✅ Update frontend `.env.local` with backend URL
3. ✅ Test QR pairing flow
4. ✅ Monitor metrics at `/metrics`
5. ✅ Scale as needed

**Questions? See main DEPLOYMENT.md or infrastructure docs.**
