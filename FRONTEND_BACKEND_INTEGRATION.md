# Frontend-Backend Integration Guide

## Overview

Your OxSig frontend (Next.js) is now configured to connect to the backend infrastructure we built.

## Connection Status: 🔄 Ready to Connect

### Backend Services Built:
- ✅ WebSocket Gateway (Rust/Axum) - `localhost:8080`
- ✅ PostgreSQL Database - `localhost:5432`
- ✅ Redis Cache - `localhost:6379`
- ✅ NATS Event Bus - `localhost:4222`
- ✅ MinIO Storage - `localhost:9000`
- ✅ Meilisearch - `localhost:7700`
- ✅ TURN Server - `localhost:3478`

### Frontend Configuration Added:
- ✅ `src/lib/backend-config.ts` - Backend connection configuration
- ✅ `.env.example` - Updated with backend URLs
- ✅ WebSocket helper functions
- ✅ API fetch helpers

## How to Connect

### 1. Start Backend Services

**Option A: Windows (PowerShell)**
```powershell
.\backend.ps1 setup
.\backend.ps1 start
```

**Option B: Linux/macOS**
```bash
make setup
make start
```

**Option C: Direct Docker**
```bash
docker compose up -d
```

### 2. Configure Frontend Environment

```bash
# Copy the environment template
cp .env.example .env.local

# The default values will work for local development
# No changes needed for local testing!
```

### 3. Start Frontend

```bash
pnpm dev
```

## Using the Backend in Your Frontend

### WebSocket Connection

```typescript
import { createWebSocketConnection } from '@/lib/backend-config';

// In your component
const ws = createWebSocketConnection((data) => {
  console.log('Received:', data);
});

// Send a message
ws.send(JSON.stringify({
  type: 'join',
  room: 'my-room',
  user_id: 'user-123'
}));
```

### API Calls

```typescript
import { apiFetch } from '@/lib/backend-config';

// Fetch from backend API
const data = await apiFetch('/documents', {
  method: 'GET'
});

// Create a document
const newDoc = await apiFetch('/documents', {
  method: 'POST',
  body: JSON.stringify({
    title: 'My Document',
    content: 'Document content'
  })
});
```

### Health Check

```typescript
import { checkBackendHealth } from '@/lib/backend-config';

const isHealthy = await checkBackendHealth();
if (isHealthy) {
  console.log('✅ Backend is running');
} else {
  console.log('❌ Backend is not available');
}
```

## Integration Points

### 1. P2P Networking (`src/lib/network/p2p.ts`)

Update to use backend TURN server:

```typescript
import { backendConfig } from '@/lib/backend-config';

const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls: backendConfig.turnUrl,
    username: backendConfig.turnUsername,
    credential: backendConfig.turnCredential
  }
];
```

### 2. Device Pairing (`src/lib/pairing/qr-pairing.ts`)

Already updated! The `PairingRelay` class now uses `NEXT_PUBLIC_WS_URL` by default.

### 3. Document Sync (`src/lib/db/offline.ts`)

Update the sync endpoint:

```typescript
import { apiFetch } from '@/lib/backend-config';

async function syncDocument(doc: StoredDocument) {
  try {
    await apiFetch('/documents/sync', {
      method: 'POST',
      body: JSON.stringify(doc)
    });
  } catch (error) {
    console.error('Sync failed:', error);
  }
}
```

### 4. Search Integration

```typescript
import { backendConfig } from '@/lib/backend-config';

const searchClient = {
  host: backendConfig.searchUrl,
  apiKey: backendConfig.searchKey
};

async function searchDocuments(query: string) {
  const response = await fetch(
    `${backendConfig.searchUrl}/indexes/documents/search`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query })
    }
  );
  return response.json();
}
```

## Testing the Connection

### 1. Check Backend Health

```bash
# In browser console or Node.js
fetch('http://localhost:8080/health')
  .then(r => r.json())
  .then(console.log)
```

Expected response:
```json
{
  "status": "healthy",
  "service": "oxsig-ws-gateway",
  "version": "0.1.0"
}
```

### 2. Test WebSocket Connection

```javascript
const ws = new WebSocket('ws://localhost:8080/ws');

ws.onopen = () => {
  console.log('✅ Connected!');
  ws.send(JSON.stringify({ type: 'ping' }));
};

ws.onmessage = (event) => {
  console.log('Received:', event.data);
};
```

### 3. Test Database Connection

```bash
# From backend
docker compose exec postgres psql -U oxsig -d oxsig -c "SELECT count(*) FROM users;"
```

## Environment Variables Reference

### Required for Local Development
```env
NEXT_PUBLIC_WS_URL="ws://localhost:8080/ws"
NEXT_PUBLIC_API_URL="http://localhost:8080/api"
```

### Required for Production
```env
NEXT_PUBLIC_WS_URL="wss://api.yourdomain.com/ws"
NEXT_PUBLIC_API_URL="https://api.yourdomain.com/api"
DATABASE_URL="postgresql://user:password@host:5432/db"
REDIS_URL="redis://host:6379"
TURN_CREDENTIAL="your-secure-credential"
```

### Optional Services
```env
NEXT_PUBLIC_STORAGE_URL="https://storage.yourdomain.com"
NEXT_PUBLIC_SEARCH_URL="https://search.yourdomain.com"
```

## Current Integration Status

| Feature | Backend Ready | Frontend Ready | Connected |
|---------|---------------|----------------|-----------|
| WebSocket Gateway | ✅ | ✅ | 🔄 |
| Database (Postgres) | ✅ | ⚠️ Needs API routes | ❌ |
| Cache (Redis) | ✅ | ⚠️ Server-side only | ❌ |
| Storage (MinIO) | ✅ | ⚠️ Needs API routes | ❌ |
| Search (Meilisearch) | ✅ | ⚠️ Needs integration | ❌ |
| TURN Server | ✅ | ⚠️ Needs config update | ❌ |
| Monitoring | ✅ | N/A | N/A |

## Next Steps to Complete Integration

### 1. Create API Routes

Create Next.js API routes that call backend services:

```typescript
// app/api/documents/route.ts
import { apiFetch } from '@/lib/backend-config';

export async function GET() {
  const documents = await apiFetch('/documents');
  return Response.json(documents);
}
```

### 2. Update P2P Configuration

Add TURN server config from backend to P2P networking.

### 3. Implement Document Sync

Connect offline storage sync to backend database.

### 4. Add Search Integration

Connect Meilisearch for document search functionality.

### 5. Test End-to-End

Test complete flows:
- Document creation → Storage → Database
- WebSocket real-time updates
- P2P connections with TURN
- Search indexing

## Troubleshooting

### Backend Not Running
```bash
# Check status
docker compose ps

# Start if stopped
docker compose up -d
```

### Connection Refused
- Check firewall settings
- Verify ports are not in use: `netstat -ano | findstr :8080`
- Check Docker network: `docker network ls`

### CORS Issues
Backend Caddy is configured to allow CORS. If issues persist, check:
```bash
docker compose logs caddy
```

### WebSocket Connection Fails
1. Verify WebSocket Gateway is running
2. Check browser console for errors
3. Test with `wscat`: `wscat -c ws://localhost:8080/ws`

## Production Deployment

When deploying to production:

1. **Update `.env.local`** with production URLs
2. **Use WSS** (secure WebSocket) instead of WS
3. **Configure TURN credentials** for production
4. **Set up DNS** for your domain
5. **Enable HTTPS** via Caddy
6. **Update CORS settings** if needed

## Support

- Backend docs: `backend/README.md`
- Deployment: `backend/DEPLOYMENT.md`
- Quick ref: `BACKEND_QUICK_REF.md`
- Architecture: `docs/ARCHITECTURE.md`
