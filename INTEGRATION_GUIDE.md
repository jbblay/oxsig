# 🚀 OxSig Backend Integration - Complete Guide

## Overview

This guide covers the complete backend integration for OxSig, connecting the Next.js frontend to the Rust/PostgreSQL/MinIO backend infrastructure.

## ✅ What's Been Built

### 1. API Client Library (`src/lib/api/`)

**client.ts** - Core HTTP client with:
- ✅ Automatic retries with exponential backoff
- ✅ Request/response interceptors
- ✅ Token-based authentication
- ✅ Error handling & normalization
- ✅ Timeout management
- ✅ Type-safe responses

**documents.ts** - Document management:
- ✅ CRUD operations (create, read, update, delete)
- ✅ File upload/download
- ✅ Version management
- ✅ Document sharing
- ✅ Export functionality

**signatures.ts** - Digital signatures:
- ✅ Signature creation & verification
- ✅ Certificate management
- ✅ Signature requests
- ✅ Blockchain anchoring
- ✅ Audit trail

**storage.ts** - File storage (MinIO):
- ✅ Single & multi-file upload
- ✅ Multipart upload for large files
- ✅ Presigned URLs
- ✅ File metadata
- ✅ Thumbnail generation

**search.ts** - Full-text search (Meilisearch):
- ✅ Document/signature/user search
- ✅ Faceted search
- ✅ Autocomplete/suggestions
- ✅ Index management

### 2. API Routes (`src/app/api/`)

**documents/route.ts**:
- ✅ `GET /api/documents` - List with filters, pagination, sorting
- ✅ `POST /api/documents` - Create new document

**documents/[id]/route.ts**:
- ✅ `GET /api/documents/[id]` - Get single document
- ✅ `PUT /api/documents/[id]` - Update document
- ✅ `DELETE /api/documents/[id]` - Soft delete document

**documents/upload/route.ts**:
- ✅ `POST /api/documents/upload` - Upload file to MinIO + create record

**documents/[id]/download/route.ts**:
- ✅ `GET /api/documents/[id]/download` - Download file from MinIO

## 📦 New Dependencies Added

```json
{
  "dependencies": {
    "@aws-sdk/client-s3": "^3.732.0",  // MinIO/S3 client
    "pg": "^8.13.1",                    // PostgreSQL client
    "uuid": "^11.0.5"                   // UUID generation
  },
  "devDependencies": {
    "@types/pg": "^8.11.10",
    "@types/uuid": "^10.0.0"
  }
}
```

## 🔧 Setup Instructions

### 1. Install Dependencies

```powershell
pnpm install
```

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

### 3. Start Backend Services

**Windows (PowerShell)**:
```powershell
.\backend.ps1 start
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

### 4. Initialize Database

```powershell
# Run migrations
.\backend.ps1 migrate

# Or manually
cd backend
psql -h localhost -U oxsig -d oxsig -f migrations/001_initial_schema.sql
```

### 5. Create MinIO Bucket

```powershell
# Access MinIO Console at http://localhost:9001
# Login: minioadmin / minioadmin
# Create bucket: oxsig-documents
```

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

## 📝 Usage Examples

### Using the API Client

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

// Sign a document
const signature = await signatures.create({
  documentId: doc.id,
  signatureData: 'base64_signature_data',
  signatureType: 'draw',
  publicKey: 'ed25519_public_key'
});

// Verify signature
const verification = await signatures.verify({
  documentId: doc.id,
  signatureId: signature.id,
  documentHash: 'sha256_hash'
});
```

### Using Raw API Routes

```typescript
import { apiClient } from '@/lib/api';

// List documents with filters
const response = await apiClient.get('/api/documents', {
  query: 'test',
  tags: 'legal,finance',
  status: 'published',
  page: 1,
  pageSize: 20
});

if (response.error) {
  console.error('Error:', response.error.message);
} else {
  console.log('Documents:', response.data);
}
```

## 🔄 Integration with Existing Code

### Update Sign Page (`src/app/sign/page.tsx`)

Replace mock data with real API calls:

```typescript
import { documents } from '@/lib/api';

// Instead of mock setTimeout
const handleSign = async () => {
  try {
    const doc = await documents.create({
      title: documentTitle,
      content: editorContent,
      contentType: 'html',
      status: 'published',
      tags: ['signed']
    });

    // Create signatures for each signer
    for (const signer of signers) {
      await signatures.create({
        documentId: doc.id,
        signatureData: signer.signatureData,
        signatureType: 'draw',
        publicKey: signer.publicKey,
        signerName: signer.name,
        signerEmail: signer.email
      });
    }

    toast.success('Document signed successfully!');
  } catch (error) {
    toast.error('Failed to sign document');
    console.error(error);
  }
};
```

### Update Offline DB (`src/lib/db/offline.ts`)

Replace sync TODOs with real API:

```typescript
import { documents } from '@/lib/api';

async syncDocument(id: string): Promise<void> {
  const doc = await this.getDocument(id);
  if (!doc) return;

  try {
    if (doc.id.startsWith('temp-')) {
      // Create on backend
      const created = await documents.create({
        title: doc.title,
        content: doc.content,
        contentType: doc.contentType,
        tags: doc.tags,
        metadata: doc.metadata
      });

      // Update local ID
      await this.db.delete('documents', doc.id);
      await this.db.put('documents', { ...doc, id: created.id, synced: true });
    } else {
      // Update existing
      await documents.update(doc.id, {
        title: doc.title,
        content: doc.content,
        tags: doc.tags,
        metadata: doc.metadata
      });

      await this.db.put('documents', { ...doc, synced: true });
    }
  } catch (error) {
    console.error('Sync failed:', error);
  }
}
```

## 🧪 Testing

### Manual Testing

1. **Test Document Creation**:
```powershell
curl -X POST http://localhost:3000/api/documents `
  -H "Content-Type: application/json" `
  -d '{"title":"Test Doc","content":"Hello","status":"draft"}'
```

2. **Test Document Upload**:
```powershell
curl -X POST http://localhost:3000/api/documents/upload `
  -F "file=@test.pdf" `
  -F 'metadata={"title":"Test PDF"}'
```

3. **Test Document List**:
```powershell
curl http://localhost:3000/api/documents?status=draft
```

### Check Backend Services

```powershell
# Check PostgreSQL
.\backend.ps1 status

# Check database connection
psql -h localhost -U oxsig -d oxsig -c "SELECT COUNT(*) FROM documents;"

# Check MinIO
curl http://localhost:9000/minio/health/live

# Check WebSocket Gateway
curl http://localhost:8080/health
```

## 🚨 Common Issues

### 1. Database Connection Failed

**Error**: `connection refused` or `timeout`

**Fix**:
```powershell
# Start PostgreSQL
.\backend.ps1 start

# Check if running
docker ps | grep postgres
```

### 2. MinIO Upload Failed

**Error**: `SignatureDoesNotMatch` or `AccessDenied`

**Fix**:
```powershell
# Check MinIO credentials in .env.local
# Verify bucket exists
mc ls local/oxsig-documents
```

### 3. CORS Errors

**Error**: `CORS policy blocked`

**Fix**: Add to `next.config.ts`:
```typescript
const nextConfig = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ];
  },
};
```

## 📊 Monitoring

### Check API Metrics

- **Grafana**: http://localhost:3001
  - Dashboard: "OxSig API Metrics"
  - View request rates, latency, errors

- **Prometheus**: http://localhost:9090
  - Query: `http_requests_total{path="/api/documents"}`

### Check Logs

```powershell
# WebSocket Gateway logs
docker logs oxsig-ws-gateway

# PostgreSQL logs
docker logs oxsig-postgres

# MinIO logs
docker logs oxsig-minio
```

## 🔐 Security Considerations

### Current Implementation

- ⚠️ **Auth**: Using temp user IDs (TODO: implement real auth)
- ⚠️ **Rate Limiting**: Not implemented yet
- ⚠️ **Input Validation**: Basic validation only
- ✅ **SQL Injection**: Prevented with parameterized queries
- ✅ **File Upload**: Size limits and type validation needed

### Next Steps

1. Implement authentication (JWT or session-based)
2. Add rate limiting middleware
3. Add input validation with Zod schemas
4. Implement CSP headers
5. Add API key management
6. Enable HTTPS in production

## 🎯 Next Integration Tasks

1. **Signatures API Routes**
   - POST /api/signatures
   - GET /api/signatures/[id]
   - POST /api/signatures/verify

2. **Storage API Routes**
   - POST /api/storage/upload
   - GET /api/storage/download
   - POST /api/storage/multipart/*

3. **Search API Routes**
   - POST /api/search/documents
   - POST /api/search/suggest
   - POST /api/search/index/*

4. **WebSocket Integration**
   - Real-time document updates
   - Collaboration features
   - Presence system

5. **Background Sync**
   - IndexedDB → PostgreSQL sync
   - Conflict resolution
   - Offline queue

## 📚 Additional Resources

- [Backend Architecture](../docs/ARCHITECTURE.md)
- [API Documentation](../docs/API.md)
- [Security Guide](../SECURITY.md)
- [Deployment Guide](../docs/DEPLOYMENT.md)

---

**Status**: Phase 1 Complete ✅
**Next**: Continue with remaining API routes and WebSocket integration
