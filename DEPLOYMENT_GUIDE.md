# 🔐 OxSig - Deployment Guide

## 🚀 Quick Deploy

### Frontend (Vercel)
```bash
# Vercel will auto-detect Next.js in oxsig-frontend/
vercel --prod
```

### Backend (Railway)
```bash
# Railway uses railway.toml config
railway up
```

## 🔗 Connecting Frontend ↔ Backend

### 1. Deploy Backend First (Railway)

After Railway deploys, you'll get a URL like:
```
https://oxsig-backend-production.up.railway.app
```

### 2. Configure Frontend Environment Variables

In Vercel Dashboard → Settings → Environment Variables:

```env
# Backend WebSocket URL
NEXT_PUBLIC_WS_URL=wss://oxsig-backend-production.up.railway.app/ws

# Optional: Backend API URL (if you add HTTP endpoints)
NEXT_PUBLIC_API_URL=https://oxsig-backend-production.up.railway.app/api
```

### 3. Frontend Code Already Uses These

```typescript
// oxsig-frontend/src/lib/websocket.ts
const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/ws';
const ws = new WebSocket(wsUrl);
```

## 📦 What Each Deploys

### Vercel (Frontend)
- **Source**: `oxsig-frontend/`
- **Builds**: Next.js 15 PWA
- **Serves**: Static site + API routes
- **Features**: 
  - Offline-first (Service Worker)
  - IndexedDB for local storage
  - WebAuthn biometric auth
  - Works without backend!

### Railway (Backend)
- **Source**: `oxsig-backend/`
- **Builds**: Rust WebSocket server
- **Serves**: WebSocket relay
- **Features**:
  - WebRTC signaling
  - QR device pairing relay
  - Real-time collaboration
  - Optional (frontend works without it)

## 🌐 Architecture

```
User Browser
    ↓
Vercel (Frontend)
    ├─→ Local Storage (offline-first)
    ├─→ IndexedDB (encrypted docs)
    └─→ WebSocket ↓
                  ↓
         Railway (Backend)
              ↓
    WebRTC Peer-to-Peer
         ↙        ↘
    Device A ←→ Device B
```

## 🔧 Development

### Local Development
```bash
# Terminal 1: Backend
cd oxsig-backend
cargo run

# Terminal 2: Frontend
cd oxsig-frontend
pnpm dev

# Frontend connects to localhost:8080
```

### Environment Files

**oxsig-frontend/.env.local**:
```env
# Development
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws

# Production (set in Vercel)
# NEXT_PUBLIC_WS_URL=wss://your-backend.railway.app/ws
```

**oxsig-backend/.env** (optional):
```env
HOST=0.0.0.0
PORT=8080
RUST_LOG=info
```

## 🎯 Deployment Checklist

- [ ] Deploy backend to Railway
- [ ] Copy backend URL
- [ ] Set `NEXT_PUBLIC_WS_URL` in Vercel
- [ ] Deploy frontend to Vercel
- [ ] Test WebSocket connection
- [ ] Verify offline mode works

## 🔐 Security Notes

- Backend is **optional** - frontend works standalone
- All crypto happens **client-side** (browser)
- Backend only relays WebSocket messages (can't decrypt)
- End-to-end encrypted by design
