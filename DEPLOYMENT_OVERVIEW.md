# 🚀 OxSig Deployment Architecture

## Overview

OxSig uses a **decoupled architecture** allowing frontend and backend to deploy independently:

```
┌─────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT OVERVIEW                       │
└─────────────────────────────────────────────────────────────┘

Frontend (Next.js PWA)          Backend (Rust WS Gateway)
       │                                  │
       ├─ Vercel/Netlify                ├─ Railway/Fly.io
       ├─ Railway                        ├─ AWS/GCP/Azure
       ├─ Docker                         ├─ Docker
       └─ Static hosting                 └─ Self-hosted
              │                                │
              └────────── HTTPS/WSS ───────────┘
```

---

## 🎯 Recommended Stack (Free Tier)

### **Minimum Setup** (No backend needed!)
```
Frontend: Vercel (Free)
Backend:  None (PWA works offline)
Cost:     $0/month
```

Use for:
- Portfolio demonstrations
- Local development
- Offline-first PWA features
- Air-gapped signing

### **Basic Stack** (With real-time features)
```
Frontend: Vercel (Free)
Backend:  Railway (Free tier)
Cost:     $0/month
```

Use for:
- QR device pairing
- WebRTC signaling
- Testing full features

### **Production Stack** (High availability)
```
Frontend: Vercel Pro ($20/month)
Backend:  Railway Pro ($20/month) or Fly.io ($30/month)
Database: Railway PostgreSQL (included)
Cache:    Railway Redis (included)
Cost:     $40-50/month
```

Use for:
- Production deployments
- Multi-region availability
- Enterprise features

---

## 📦 Deployment Scenarios

### Scenario 1: Portfolio Demo (Recommended)
**Goal:** Showcase your CISA/CISM/CISSP/CEH skills

```bash
# Deploy frontend only
cd oxsig
git push origin feat/monorepo-structure

# Connect repo to Vercel (auto-detects config)
# Done! ✅ https://oxsig-yourname.vercel.app
```

**What works:**
- ✅ All crypto features (client-side)
- ✅ Document signing
- ✅ WebAuthn biometric auth
- ✅ Offline storage
- ✅ QR code generation (manual signaling)
- ✅ 90% of features without backend!

**What needs backend:**
- ⚠️ QR device pairing relay
- ⚠️ WebRTC automatic signaling
- ⚠️ Real-time collaboration

---

### Scenario 2: Full Stack (All Features)
**Goal:** Deploy complete system

```bash
# 1. Deploy Backend
cd packages/backend-ws
railway up  # Or: fly deploy

# Get backend URL: https://oxsig-backend.railway.app

# 2. Configure Frontend
cd packages/frontend
echo "NEXT_PUBLIC_WS_URL=wss://oxsig-backend.railway.app/ws" > .env.local

# 3. Deploy Frontend
vercel --prod

# Done! ✅ Everything connected
```

---

### Scenario 3: Self-Hosted (Maximum Security)
**Goal:** Full control, air-gapped option

```bash
# Use Docker Compose for everything
cd infrastructure/docker
docker-compose up -d

# Or Kubernetes
kubectl apply -f infrastructure/kubernetes/

# Serve on private network
# No external dependencies
```

---

## 🌍 Platform Matrix

| Platform | Frontend | Backend | Database | Cost (Free) | Cost (Prod) |
|----------|----------|---------|----------|-------------|-------------|
| **Vercel** | ✅ Best | ❌ No | ❌ No | $0 | $20/mo |
| **Netlify** | ✅ Good | ❌ No | ❌ No | $0 | $19/mo |
| **Railway** | ✅ Good | ✅ Best | ✅ Yes | $5 credit | $20/mo |
| **Fly.io** | ✅ Good | ✅ Best | ✅ Yes | 3 VMs | $30/mo |
| **AWS** | ✅ S3+CF | ✅ Fargate | ✅ RDS | ❌ | $50+/mo |
| **GCP** | ✅ Storage | ✅ Run | ✅ SQL | $300 credit | $50+/mo |
| **Azure** | ✅ Static | ✅ Apps | ✅ SQL | $200 credit | $50+/mo |
| **Self-host** | ✅ Nginx | ✅ Docker | ✅ Postgres | Server cost | Server cost |

---

## 🎓 For Certification Portfolio

### CISA (Audit & Compliance)
```
Deploy:
- Frontend: Vercel (audit logs)
- Backend: Railway (metrics enabled)
- Database: PostgreSQL (audit tables)
- Monitoring: Grafana Cloud (free)

Demonstrate:
✅ Immutable audit trails (Merkle trees)
✅ Compliance reporting (GDPR exports)
✅ Access logging (who/when/what)
✅ Integrity verification
```

### CISM (Security Management)
```
Deploy:
- Frontend: Vercel (WAF enabled)
- Backend: Railway (rate limiting)
- Auth: WebAuthn (hardware keys)
- Monitoring: Real-time alerts

Demonstrate:
✅ Risk-based authentication
✅ Incident response (alerts)
✅ Security metrics (dashboards)
✅ Threat detection (anomalies)
```

### CISSP (Architecture)
```
Deploy:
- Frontend: Multi-region CDN
- Backend: Load balanced (3+ regions)
- Database: Encrypted at rest
- Network: Zero-trust (mTLS)

Demonstrate:
✅ Defense in depth (layers)
✅ Least privilege (RBAC)
✅ Cryptographic controls
✅ Secure SDLC
```

### CEH (Ethical Hacking)
```
Deploy:
- Test environment: Docker
- Production: Hardened
- WAF: Cloudflare
- Monitoring: IDS/IPS

Demonstrate:
✅ Penetration testing results
✅ Vulnerability remediation
✅ Security hardening
✅ Exploit mitigation
```

---

## 🔐 Security Configurations

### Production Security Checklist

**Frontend (Vercel/Netlify):**
- [ ] Enable HTTPS only
- [ ] Configure CSP headers
- [ ] Enable HSTS
- [ ] Configure CORS
- [ ] Rate limiting
- [ ] DDoS protection (Cloudflare)

**Backend (Railway/Fly.io):**
- [ ] Enable WSS (not WS)
- [ ] JWT authentication enabled
- [ ] Rate limiting (Redis)
- [ ] Input validation
- [ ] SQL injection prevention
- [ ] XSS protection

**Infrastructure:**
- [ ] Secrets in environment vars (not code)
- [ ] Database encryption at rest
- [ ] TLS 1.3 only
- [ ] Regular security updates
- [ ] Backup strategy
- [ ] Disaster recovery plan

---

## 📊 Monitoring Setup

### Free Tier Monitoring
```bash
# Backend metrics at /metrics
curl https://backend-url/metrics

# Frontend: Vercel Analytics (built-in)
# Backend: Railway Metrics (built-in)
# Uptime: UptimeRobot (free)
```

### Production Monitoring
```bash
# Deploy Grafana stack
docker-compose -f infrastructure/docker/docker-compose.yml up -d

# Dashboards at:
- Grafana: http://localhost:3001
- Prometheus: http://localhost:9090
- Loki: http://localhost:3100

# Or use cloud:
- Grafana Cloud (free tier)
- Datadog (free tier)
- New Relic (free tier)
```

---

## 💰 Cost Optimization

### Free Tier Strategy
```
Frontend: Vercel Free (100GB bandwidth)
Backend:  Railway Free ($5 credit/month)
Database: Railway PostgreSQL (included)
Cache:    Railway Redis (included)
CDN:      Cloudflare (free)
Total:    $0/month (!)
```

### Budget Stack ($25/month)
```
Frontend: Vercel Pro ($20)
Backend:  Railway Hobby ($5)
Database: Included
Monitoring: Grafana Cloud (free)
Total:    $25/month
```

### Production Stack ($100/month)
```
Frontend: Vercel Pro ($20)
Backend:  Railway Pro ($20) x2 regions
Database: Railway ($10)
Cache:    Railway ($10)
Monitoring: Datadog ($40)
Total:    $100/month
```

---

## 🚀 Quick Deploy Commands

### Frontend Only
```bash
# Vercel (one command)
vercel --prod

# Netlify
netlify deploy --prod

# Docker
docker build -f Dockerfile.frontend -t oxsig-frontend .
docker run -p 3000:3000 oxsig-frontend
```

### Backend Only
```bash
# Railway
cd packages/backend-ws && railway up

# Fly.io
cd packages/backend-ws && fly deploy

# Docker
docker build -f packages/backend-ws/Dockerfile.production -t oxsig-backend .
docker run -p 8080:8080 oxsig-backend
```

### Full Stack (Local)
```bash
# Everything at once
cd infrastructure/docker
docker-compose up -d

# Access:
# - Frontend: http://localhost:3000
# - Backend: http://localhost:8080
# - Grafana: http://localhost:3001
```

---

## 📚 Documentation Links

- **Frontend:** `DEPLOYMENT.md` (root)
- **Backend:** `packages/backend-ws/DEPLOYMENT.md`
- **Infrastructure:** `infrastructure/docker/README.md`
- **Security:** `docs/SECURITY.md`
- **Architecture:** `docs/ARCHITECTURE.md`

---

## ✅ Verification

After deploying, test:

```bash
# Frontend health
curl https://your-frontend.vercel.app/api/health

# Backend health
curl https://your-backend.railway.app/health

# WebSocket connection
websocat wss://your-backend.railway.app/ws
> {"type":"ping"}
< {"type":"pong"}
```

---

## 🎯 Recommended Path

**For Portfolio/Demo:**
1. Deploy frontend to Vercel (free)
2. Test locally with `pnpm dev`
3. Show off to employers! 🎉

**For Full Features:**
1. Deploy backend to Railway (free tier)
2. Update frontend env with backend URL
3. Deploy frontend to Vercel
4. Connect and test QR pairing

**For Production:**
1. Use paid tiers for SLA
2. Enable monitoring
3. Set up backups
4. Configure CI/CD
5. Security hardening

---

**Choose your deployment path and start in 5 minutes!** 🚀
