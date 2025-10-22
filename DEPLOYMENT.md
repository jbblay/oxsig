# Deployment Guide - OxSig Monorepo

## Quick Deploy Options

### ✅ Vercel (Recommended for Next.js)

**Automatic Deploy:**
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/jbblay/oxsig)

**Manual Setup:**
1. Connect your GitHub repo to Vercel
2. Vercel will auto-detect `vercel.json` configuration
3. Build automatically uses: `packages/frontend` only
4. Deploy! 🚀

**Configuration:** Already set in `vercel.json`
- Build Command: `cd packages/frontend && pnpm install && pnpm build`
- Output Directory: `packages/frontend/.next`
- Install Command: `pnpm install --filter=@oxsig/frontend`

---

### 🌐 Netlify

**Setup:**
1. Connect repo to Netlify
2. Configuration is in `netlify.toml`
3. Base directory: `packages/frontend`
4. Build command: `pnpm install && pnpm build`
5. Deploy! 🚀

---

### 🚂 Railway

**Setup:**
1. Connect repo to Railway
2. Configuration is in `railway.json`
3. Automatically builds from `packages/frontend`
4. Deploy! 🚀

---

### 🐳 Docker (Self-Hosted)

**Build and run:**
```bash
# Build frontend-only image
docker build -f Dockerfile.frontend -t oxsig-frontend .

# Run
docker run -p 3000:3000 oxsig-frontend
```

**Deploy to any platform supporting Docker:**
- AWS ECS/Fargate
- Google Cloud Run
- Azure Container Apps
- DigitalOcean App Platform
- Fly.io
- Render

---

### ⚙️ GitHub Actions (Automated)

**Already configured in `.github/workflows/deploy-frontend.yml`**

Automatically deploys when you push to `main` or `feat/monorepo-structure`:
- Only triggers on `packages/frontend/**` changes
- Caches dependencies for fast builds
- Deploys to Vercel (configure secrets)

**Required Secrets:**
```bash
VERCEL_TOKEN          # Get from Vercel dashboard
VERCEL_ORG_ID         # Found in Vercel settings
VERCEL_PROJECT_ID     # Found in project settings
```

---

## Environment Variables

Create `.env.local` in `packages/frontend/`:

```bash
# Optional - for backend integration
NEXT_PUBLIC_WS_URL=wss://your-backend.com/ws
NEXT_PUBLIC_API_URL=https://your-api.com

# Optional - for cloud storage
NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
```

---

## Platform-Specific Notes

### Vercel
- ✅ Best for Next.js (built by Vercel)
- ✅ Automatic previews for PRs
- ✅ Edge functions support
- ✅ Free tier available

### Netlify
- ✅ Great alternative to Vercel
- ✅ Drag-and-drop deploys
- ✅ Free tier available

### Railway
- ✅ Simple Dockerized deploys
- ✅ Built-in PostgreSQL/Redis if needed
- ✅ Good for full-stack

### Self-Hosted (Docker)
- ✅ Full control
- ✅ Works with any cloud provider
- ✅ Best for security-critical deployments

---

## Testing Deployment Locally

```bash
# Build production frontend
cd packages/frontend
pnpm build

# Test production build
pnpm start

# Or test Docker build
cd ../..
docker build -f Dockerfile.frontend -t oxsig-test .
docker run -p 3000:3000 oxsig-test
```

---

## Troubleshooting

### "Build failed - Rust not found"
✅ **Solution:** Platform is trying to build backend. Check:
- `vercel.json` is present
- `.vercelignore` excludes `packages/backend-ws`
- Build command targets only `packages/frontend`

### "Module not found" errors
✅ **Solution:** pnpm workspace not configured properly
```bash
# Make sure workspace install runs first
pnpm install --filter=@oxsig/frontend
```

### "Port already in use"
✅ **Solution:** Change port in deployment settings
```bash
# Local testing
PORT=3001 pnpm start
```

---

## Production Checklist

- [ ] Environment variables configured
- [ ] Build succeeds locally: `pnpm --filter=@oxsig/frontend build`
- [ ] Production test: `pnpm --filter=@oxsig/frontend start`
- [ ] Security headers configured (Next.js handles most)
- [ ] Domain/SSL configured on platform
- [ ] Analytics/monitoring setup (optional)

---

## Backend Deployment (Separate)

Backend services should be deployed independently:

```bash
# Deploy ws-gateway to separate service
cd packages/backend-ws
docker build -t oxsig-backend .
# Deploy to Railway/Fly.io/AWS/etc.

# Or use docker-compose for full stack
cd infrastructure/docker
docker-compose up -d
```

**Recommended:** Deploy backend to:
- Railway (easy Rust deployment)
- Fly.io (edge computing)
- AWS ECS (enterprise)
- Self-hosted VPS (maximum security)

---

## Questions?

- Frontend only (PWA): Deploy to Vercel
- Full stack (frontend + backend): Deploy frontend to Vercel, backend to Railway
- Maximum security: Self-host both using `infrastructure/docker/docker-compose.yml`
