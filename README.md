#  OxSig

> **Quantum-Safe Security Platform** - Document signing, identity management, and encrypted communications

##  Quick Start

### 1. Start Infrastructure
```bash
# Start Docker services (PostgreSQL, MinIO, etc.)
docker-compose up -d
```

### 2. Install & Run Frontend
```bash
cd oxsig-frontend
pnpm install
pnpm dev
```

**Server starts at**: http://localhost:3000

### 3. Test the Application

#### Quick Test (Browser)
1. Navigate to: http://localhost:3000/auth-test
2. Register: `test@example.com` / `SecurePass123!`
3. Login with same credentials
4. Access protected routes: `/profile`, `/vault`

#### Run Tests
```bash
# Unit tests (44 tests) - no server needed
cd oxsig-frontend
pnpm test:run

# Integration tests (12 tests) - requires running server
# In terminal 1: pnpm dev
# In terminal 2: pnpm test:run (all 56 tests should pass)
```

### 4. Access Services

| Service | URL | Credentials |
|---------|-----|-------------|
| **App** | http://localhost:3000 | Register new user |
| **MinIO Console** | http://localhost:9001 | minioadmin / minioadmin |
| **pgAdmin** | http://localhost:5050 | admin@oxsig.local / admin |
| **MeiliSearch** | http://localhost:7700 | - |

### 📖 Complete Testing Guide

See **[TESTING_GUIDE.md](./TESTING_GUIDE.md)** for:
- Detailed test scenarios
- Production readiness checklist
- Debugging tips
- Stub service status

##  Structure

```
oxsig/
 oxsig-frontend/    Next.js 15 PWA
 oxsig-backend/     Rust WebSocket gateway
```

##  Deployment

**Frontend (Vercel/Netlify)**:
- Root Directory: `oxsig-frontend`
- Auto-detects Next.js

**Backend (Railway/Fly.io)**:
- Root Directory: `oxsig-backend`
- Auto-detects Rust/Cargo

##  License

MIT
