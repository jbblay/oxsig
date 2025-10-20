# 🚀 OxSig Developer Guide

This guide covers the complete setup and backend integration for OxSig, connecting the Next.js frontend to the Rust/PostgreSQL/MinIO backend infrastructure.

## 🔧 Setup Instructions

### 1. Start Backend Services

**Windows (PowerShell)**:
```powershell
.\\backend.ps1 start
```

**Linux/Mac**:
```bash
make start
```

This starts:
- PostgreSQL (port 5432)
- MinIO (port 9000)
- Redis (port 6379)
- NATS (port 4222)
- Meilisearch (port 7700)
- WebSocket Gateway (port 8080)
- Monitoring stack (Prometheus, Grafana, etc.)

For a quick reference of commands and endpoints, see [Backend Quick Reference](BACKEND_QUICK_REF.md).

### 2. Configure Environment Variables

Update your `.env.local`:

```env
# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=oxsig
POSTGRES_USER=oxsig
POSTGRES_PASSWORD=oxsig_secure_password

# MinIO
MINIO_ENDPOINT=http://localhost:9000
MINIO_REGION=us-east-1
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=oxsig-documents

# WebSocket
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws

# API Base URL (optional)
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### 3. Install Dependencies

```powershell
pnpm install
```

### 4. Initialize Database

```powershell
# Run migrations
.\\backend.ps1 migrate

# Or manually
cd backend
psql -h localhost -U oxsig -d oxsig -f migrations/001_initial_schema.sql
```

### 5. Create MinIO Bucket

Access MinIO Console at http://localhost:9001 (Login: minioadmin / minioadmin) and create a bucket named `oxsig-documents`.

Or use the MinIO client:
```powershell
mc alias set local http://localhost:9000 minioadmin minioadmin
mc mb local/oxsig-documents
mc policy set download local/oxsig-documents
```

### 6. Start Development Server

```powershell
pnpm dev
```

## 📝 Using the Backend

### API Client

The frontend includes a powerful API client library in `src/lib/api/` for interacting with the backend.

```typescript
import { documents, signatures, storage, search } from '@/lib/api';

// Create a document
const doc = await documents.create({
  title: 'My Document',
  content: '<p>Hello World</p>',
  contentType: 'html',
  tags: ['test', 'demo'],
  status: 'draft'
});

// Upload a file
const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
const uploaded = await documents.upload(file, {
  title: 'Test PDF',
  encrypted: true,
  tags: ['pdf']
});

// Search documents
const results = await search.documents({
  query: 'test',
  limit: 20,
  filter: ['status = draft']
});
```

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

## 🧪 Testing and Troubleshooting

### Health Checks

- **WebSocket Gateway**: `curl http://localhost:8080/health`
- **PostgreSQL**: `docker compose exec postgres pg_isready -U oxsig`
- **MinIO**: `curl http://localhost:9000/minio/health/live`

### Common Issues

- **Connection Refused**: Ensure backend services are running with `docker compose ps`.
- **CORS Errors**: The backend is configured for local development. If you have issues, check the Caddy logs: `docker compose logs caddy`.
- **Database Errors**: Verify your `.env.local` credentials match the backend setup.

## 📚 Additional Resources

- [Backend Architecture](ARCHITECTURE.md)
- [Security Guide](SECURITY.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Backend Quick Reference](BACKEND_QUICK_REF.md)
