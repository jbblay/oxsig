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
cd oxsig
pnpm install
pnpm dev
```

**Server starts at**: http://localhost:3000

### 3. Access Services

| Service | URL | Credentials |
|---------|-----|-------------|
| **App** | http://localhost:3000 | Register new user |
| **MinIO Console** | http://localhost:9001 | minioadmin / minioadmin |
| **pgAdmin** | http://localhost:5050 | admin@oxsig.local / admin |
| **MeiliSearch** | http://localhost:7700 | - |

##  Structure

```
oxsig/
├── src/               # Next.js 15 PWA application
├── src-tauri/        # Tauri desktop app
├── backend/          # Infrastructure configs (Caddy, TURN, monitoring)
├── migrations/       # Database migrations
└── scripts/          # Service initialization scripts
```

##  Deployment

**Frontend (Vercel/Netlify)**:
- Auto-detects Next.js
- Build command: `pnpm build`
- Output directory: `.next`

##  License

MIT
