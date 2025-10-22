#  OxSig

> **Quantum-Safe Security Platform** - Document signing, identity management, and encrypted communications

##  Quick Start

### Frontend (Next.js PWA)
```bash
cd oxsig-frontend
pnpm install
pnpm dev
```

### Backend (Rust WebSocket Gateway)
```bash
cd oxsig-backend
cargo run
```

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
