# Frontend Code Analysis & Cleanup Plan

**Generated:** October 28, 2025  
**Purpose:** Complete analysis of stub/dummy data in frontend and categorization of backend vs. frontend requirements

---

## Executive Summary

After comprehensive file-by-file analysis, the codebase has:
- **Stub Data Present:** Primarily in page components and demo features
- **Mock Implementations:** IPFS, NATS, pairing relay, search tokens
- **Backend APIs:** Mostly implemented with some TODOs
- **Frontend-Only Features:** Can handle encryption, UI state, client-side crypto

---

## 🔴 CRITICAL: Files with Stub/Dummy Data to Remove

### 1. **Page Components** (`src/app/*/page.tsx`)

#### ✅ `src/app/sign/page.tsx`
**Stub Data Found:**
```typescript
// Hardcoded signers list (lines 31-34)
const [signers, setSigners] = React.useState<Signer[]>([
  { id: '1', address: 'did:example:alice...7a2b', status: 'signed', signedAt: new Date() },
  { id: '2', address: 'did:example:bob...9c4d', status: 'pending' },
]);

// Hardcoded recent signatures (lines 551-555)
{ name: "Contract_2024.pdf", status: "Completed", time: "2h ago", verified: true },
{ name: "NDA_Agreement.pdf", status: "Pending", time: "5h ago", verified: false },
{ name: "Invoice_Jan24.pdf", status: "Completed", time: "1d ago", verified: true },
```

**Action Required:**
- ❌ **REMOVE:** Hardcoded signers array
- ✅ **REPLACE WITH:** API call to `/api/signatures/pending` or `/api/collaborations/{id}/signers`
- ❌ **REMOVE:** Hardcoded recent signatures
- ✅ **REPLACE WITH:** API call to `/api/signatures/recent` or use existing `/api/signatures` endpoint

**Backend Needed:**
```typescript
// NEW ENDPOINT NEEDED
GET /api/signatures/recent
GET /api/collaborations/{id}/signers
POST /api/collaborations/{id}/signers (add signer)
DELETE /api/collaborations/{id}/signers/{signerId} (remove signer)
```

#### ✅ `src/app/profile/page.tsx`
**Stub Data Found:**
```typescript
// Hardcoded stats (lines 62-65)
const stats = [
  { label: "Documents Signed", value: "247", icon: FileSignature, color: "text-blue-500" },
  { label: "Collaborations", value: "34", icon: Users, color: "text-teal-500" },
  { label: "Security Score", value: "98%", icon: Shield, color: "text-emerald-500" },
  { label: "Uptime", value: "99.9%", icon: TrendingUp, color: "text-purple-500" }
];

// Hardcoded recent activity (lines 68-73)
const recentActivity = [
  { action: "Signed document", file: "Q4_Report.pdf", time: "2 hours ago", icon: FileSignature },
  // ... more hardcoded items
];

// Hardcoded devices (lines 76-80)
const connectedDevices = [
  { name: "MacBook Pro", type: "laptop", lastActive: "Active now", trusted: true, icon: Laptop },
  // ... more hardcoded items
];

// Hardcoded crypto keys (lines 83-87)
const cryptoKeys = [
  { id: 1, name: "Primary Signing Key", type: "CRYSTALS-Dilithium", created: "Jan 2024", uses: 247, status: "active" },
  // ... more hardcoded items
];
```

**Action Required:**
- ❌ **REMOVE:** All hardcoded arrays
- ✅ **REPLACE WITH:** Real API calls
- ✅ **KEEP:** User data fetch from `/api/users/me` (already implemented, lines 96-115)

**Backend Needed:**
```typescript
// NEW ENDPOINTS NEEDED
GET /api/users/me/stats
GET /api/users/me/activity
GET /api/users/me/devices
GET /api/users/me/keys
POST /api/users/me/keys (generate new key pair)
DELETE /api/users/me/devices/{deviceId}
```

#### ✅ `src/app/collab/page.tsx`
**Stub Data Found:**
```typescript
// Hardcoded peers list (lines 14-19)
const peers = [
  { id: 1, name: "Alice", avatar: "/avatars/01.png", online: true },
  { id: 2, name: "Bob", avatar: "/avatars/02.png", online: false },
  { id: 3, name: "Charlie", avatar: "/avatars/03.png", online: true },
  { id: 4, name: "David", avatar: "/avatars/04.png", online: true },
];

// Hardcoded messages (lines 21-24)
const initialMessages = [
  { peerId: 1, text: "Hey, can you review the Q4 security report?", sender: "Alice", time: "10:30 AM" },
  { peerId: 1, text: "Sure, on it. Looks good so far.", sender: "Me", time: "10:31 AM" },
];

// Hardcoded files (lines 26-29)
const initialFiles = [
  { id: 1, name: "Q4_Security_Report.pdf", size: "2.3 MB", encrypted: true },
  { id: 2, name: "PQC_Implementation_Plan.docx", size: "850 KB", encrypted: true },
];
```

**Action Required:**
- ❌ **REMOVE:** All hardcoded data
- ✅ **REPLACE WITH:** Real collaboration API calls

**Backend Needed:**
```typescript
// ENDPOINTS EXIST - use them!
GET /api/collaborations (list all collaborations)
GET /api/collaborations/{id} (get specific collab with peers)
GET /api/collaborations/{id}/messages
POST /api/collaborations/{id}/messages
GET /api/collaborations/{id}/files
POST /api/collaborations/{id}/files
```

**Note:** Backend API already exists at `src/app/api/collaborations/` - just need to connect frontend!

#### ✅ `src/app/vault/page.tsx`
**No Stub Data** - This page is purely informational with feature descriptions. ✅ Can keep as-is.

#### ✅ `src/app/storage/page.tsx`
**No Stub Data** - Uses real `secure-storage.ts` lib for IndexedDB. ✅ Good to go.

---

### 2. **Component Files** (`src/components/`)

#### ✅ `src/components/app/KeyringViewer.tsx`
**Stub Data Found:**
```typescript
// Hardcoded keys array (lines 10-13)
const keys = [
  { name: "Main", did: "did:key:z6MkhaXgBZDvotGksks8kyDn3Wq", type: "Ed25519" },
  { name: "Recovery", did: "did:key:z6Mkfriq1MqLai", type: "Secp256k1" },
];
```

**Action Required:**
- ❌ **REMOVE:** Hardcoded keys
- ✅ **REPLACE WITH:** Read from vault or user's stored keys

**Backend Needed:**
```typescript
// Can be FRONTEND ONLY - read from IndexedDB vault
// OR add backend endpoint:
GET /api/users/me/keys
```

#### ✅ `src/components/app/ActivityFeed.tsx`
**Stub Data Found:**
```typescript
// Hardcoded events (lines 23-50)
const events: AuditTrail[] = [
  {
    eventId: "evt_1",
    type: "SIGNATURE_CREATE",
    actorDid: "did:example:alice",
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    // ...
  },
  // ... more events
];
```

**Action Required:**
- ❌ **REMOVE:** Hardcoded events
- ✅ **REPLACE WITH:** Real audit trail API

**Backend Needed:**
```typescript
// NEW ENDPOINT NEEDED
GET /api/audit/trail (get user's audit trail)
GET /api/audit/events?type={type}&limit={limit}
```

#### ✅ `src/components/app/SigningForm.tsx`
**Minor Stub:**
```typescript
// Line 89: example docId
docId: "example-doc",
```

**Action Required:**
- ❌ **REMOVE:** Use real document ID from props or context

#### ✅ `src/components/pairing/DevicePairingModal.tsx`
**Mock Implementation:**
```typescript
// Line 61: Mock relay for development
'wss://mock-relay.oxsig.app'
```

**Action Required:**
- ⚠️ **UPDATE:** Use real relay URL from environment variable
- ✅ **KEEP:** MockPairingRelay for local dev (already has conditional logic)

**Backend Needed:**
- Deploy real WebSocket relay server (not Next.js API)
- Or use existing WebRTC signaling

---

### 3. **Library Files** (`src/lib/`)

#### 🔴 `src/lib/storage/ipfs.ts` - **COMPLETE STUB**
```typescript
export async function uploadEncryptedBlob(blob: Blob): Promise<UploadResult> {
  // Stub: In production, use Web3.Storage or IPFS client.
  const cid = `bafy-stub-${crypto.randomUUID()}`;
  return { cid, size: blob.size };
}

export async function fetchEncryptedBlob(cid: string): Promise<Blob> {
  // Stub: fetch from IPFS gateway after auth; here return empty blob.
  return new Blob([], { type: "application/octet-stream" });
}
```

**Action Required:**
- ❌ **REMOVE:** Entire stub implementation
- ✅ **REPLACE WITH:** Real IPFS integration:
  - Option 1: Use Web3.Storage SDK
  - Option 2: Use Pinata API
  - Option 3: Use local IPFS node

**Implementation:**
```typescript
// Install: pnpm add @web3-storage/w3up-client
import { create } from '@web3-storage/w3up-client';

export async function uploadEncryptedBlob(blob: Blob): Promise<UploadResult> {
  const client = await create();
  await client.login('user@example.com');
  const cid = await client.uploadBlob(blob);
  return { cid: cid.toString(), size: blob.size };
}
```

#### 🔴 `src/lib/events/nats.ts` - **STUB IMPLEMENTATION**
```typescript
// Line 37: TODO: Initialize actual NATS connection
// Line 58: TODO: Publish to NATS
// Line 182: TODO: Close actual NATS connection
```

**Action Required:**
- ⚠️ **DECISION NEEDED:**
  - Option A: **REMOVE** NATS entirely if not using event-driven architecture
  - Option B: **IMPLEMENT** real NATS client (backend only - can't run in browser)

**Recommendation:** Move NATS to backend API routes only. Frontend shouldn't publish directly to NATS.

**Backend Implementation:**
```typescript
// Install: pnpm add nats
import { connect, StringCodec } from 'nats';

const nc = await connect({ servers: process.env.NATS_URL });
const sc = StringCodec();

export async function publishEvent(event: Event): Promise<void> {
  const subject = event.type.replace('.', '_');
  nc.publish(subject, sc.encode(JSON.stringify(event)));
}
```

#### 🟡 `src/lib/search/secure-search.ts` - **WEAK STUB**
```typescript
export function deriveSearchToken(query: string, salt: string): string {
  // Simple deterministic token; replace with SSE scheme (e.g., PRF) in production.
  // Not cryptographically secure; stub only.
  let h = 0;
  for (let i = 0; i < enc.length; i++) h = (h * 131 + enc[i]) >>> 0;
  return `tok-${h.toString(16)}`;
}
```

**Action Required:**
- ⚠️ **UPGRADE:** Implement proper SSE (Searchable Symmetric Encryption)
- ✅ **OR:** Move search to backend with encrypted indices

**Recommendation:** Use backend search with Meilisearch (already in docker-compose) + encrypted fields.

#### 🟡 `src/lib/pairing/qr-pairing.ts` - **HAS MOCK RELAY**
```typescript
// Lines 251-298: MockPairingRelay class for development
export class MockPairingRelay extends PairingRelay {
  // Uses localStorage for mock relay
}
```

**Action Required:**
- ✅ **KEEP:** Mock for local development
- ✅ **ADD:** Real WebSocket relay implementation
- ✅ **USE:** Environment variable to switch between mock/real

**Already Good:** Has conditional logic to use mock in dev!

---

### 4. **API Routes** (`src/app/api/`)

#### ✅ `src/app/api/storage/upload/presigned/route.ts`
**Mock Implementation:**
```typescript
// Lines 78-94: Mock presigned URL generation
// Mock presigned URL with required parameters
url.searchParams.set('X-Amz-Signature', 'mock-signature-' + Date.now());
```

**Action Required:**
- ❌ **REMOVE:** Mock signature generation
- ✅ **IMPLEMENT:** Real MinIO/S3 presigned URL

**Implementation:**
```typescript
// Install: pnpm add minio
import * as Minio from 'minio';

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT!,
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY!,
  secretKey: process.env.MINIO_SECRET_KEY!,
});

async function generatePresignedUploadUrl(
  bucketName: string, 
  objectKey: string, 
  mimeType?: string
): Promise<string> {
  return await minioClient.presignedPutObject(
    bucketName,
    objectKey,
    24 * 60 * 60, // 24 hours
    mimeType ? { 'Content-Type': mimeType } : undefined
  );
}
```

#### ✅ `src/app/api/storage/upload/route.ts`
**TODO Found:**
```typescript
// Line 76: TODO: Calculate checksum
checksum: '',
```

**Action Required:**
- ✅ **IMPLEMENT:** Real checksum calculation

**Implementation:**
```typescript
import { createHash } from 'crypto';

const buffer = await file.arrayBuffer();
const checksum = createHash('sha256').update(Buffer.from(buffer)).digest('hex');
```

#### ✅ `src/app/api/documents/upload/route.ts`
**TODOs Found:**
```typescript
// Line 163: TODO: Index in Meilisearch
// Line 164: TODO: Publish event to NATS
```

**Action Required:**
- ✅ **IMPLEMENT:** Meilisearch indexing
- ✅ **IMPLEMENT:** NATS event publishing (or remove if not using)

**Implementation:**
```typescript
// Meilisearch
import { MeiliSearch } from 'meilisearch';

const client = new MeiliSearch({
  host: process.env.MEILISEARCH_URL!,
  apiKey: process.env.MEILISEARCH_KEY!,
});

await client.index('documents').addDocuments([{
  id: documentId,
  name: filename,
  owner_id: user.id,
  content: extractedText, // Use text extraction
  created_at: new Date().getTime(),
}]);
```

#### ✅ `src/app/api/auth/refresh/route.ts`
**TODO Found:**
```typescript
// Line 97: TODO: Validate session in Redis
```

**Action Required:**
- ⚠️ **OPTIONAL:** Add Redis session validation for extra security
- ✅ **CURRENT:** JWT validation is sufficient for now

---

## 📊 Summary Tables

### Stub Data by Category

| Category | Files with Stubs | Severity | Action |
|----------|-----------------|----------|--------|
| Page Components | 3 files | 🔴 High | Remove all hardcoded data |
| UI Components | 3 files | 🟡 Medium | Replace with API calls |
| Library Utils | 4 files | 🔴 High | Implement real services |
| API Routes | 4 files | 🟡 Medium | Complete implementations |

### Backend Requirements

| Feature | Current State | Backend Needed | Priority |
|---------|--------------|----------------|----------|
| **Signing Workflow** | Stub signers | Multi-party signature API | 🔴 High |
| **User Stats** | Hardcoded | Stats aggregation endpoint | 🟡 Medium |
| **Activity Feed** | Hardcoded | Audit trail API | 🔴 High |
| **Collaboration** | API exists | ✅ Just connect! | 🟢 Low |
| **Device Management** | Hardcoded | Device CRUD API | 🟡 Medium |
| **Key Management** | Hardcoded | Key storage API | 🟡 Medium |
| **IPFS Storage** | Complete stub | Real IPFS integration | 🔴 High |
| **NATS Events** | Stub | Real NATS or remove | 🟡 Medium |
| **Search** | Weak stub | Meilisearch integration | 🟡 Medium |
| **MinIO Presigned** | Mock | Real Minio SDK | 🔴 High |

### Frontend-Only Features (No Backend Needed)

| Feature | Implementation | Status |
|---------|----------------|--------|
| **Vault Management** | IndexedDB via `seed-vault.ts` | ✅ Complete |
| **Secure Storage** | IndexedDB via `secure-storage.ts` | ✅ Complete |
| **Client Encryption** | Web Crypto API | ✅ Complete |
| **UI State** | React hooks | ✅ Complete |
| **QR Pairing** | WebRTC + Mock Relay | ⚠️ Needs real relay |
| **Biometric Auth** | WebAuthn API | ✅ API routes exist |
| **Document Editing** | DocEditor component | ✅ Complete |

---

## 🎯 Action Plan

### Phase 1: Remove Critical Stubs (Week 1)

1. **Remove stub data from pages:**
   - `src/app/sign/page.tsx` - Remove hardcoded signers & recent signatures
   - `src/app/profile/page.tsx` - Remove all hardcoded arrays
   - `src/app/collab/page.tsx` - Remove hardcoded peers, messages, files

2. **Implement missing backend APIs:**
   ```typescript
   // Priority endpoints:
   POST /api/signatures/multi-party
   GET /api/signatures/recent
   GET /api/users/me/stats
   GET /api/users/me/activity
   GET /api/users/me/devices
   GET /api/users/me/keys
   GET /api/audit/trail
   ```

3. **Fix IPFS integration:**
   - Install Web3.Storage or Pinata
   - Replace stub functions in `src/lib/storage/ipfs.ts`

4. **Fix MinIO presigned URLs:**
   - Install `minio` package
   - Implement real presigned URL generation

### Phase 2: Complete TODOs (Week 2)

1. **Implement Meilisearch indexing:**
   - Install `meilisearch` client
   - Index documents on upload
   - Remove search token stub

2. **Complete API route TODOs:**
   - Add checksum calculation
   - Add Meilisearch indexing
   - Decide on NATS (implement or remove)

3. **Connect frontend to existing APIs:**
   - Collaboration page → `/api/collaborations`
   - User profile → `/api/users/me`

### Phase 3: Enhance (Week 3)

1. **Deploy real services:**
   - WebSocket relay for device pairing
   - NATS server (if keeping event-driven architecture)

2. **Optimize:**
   - Add caching for stats
   - Add pagination for activity feeds
   - Add real-time updates via WebSocket

---

## 🔧 Configuration Changes Needed

### Environment Variables to Add

```bash
# IPFS
WEB3_STORAGE_TOKEN=your_token_here
# OR
PINATA_API_KEY=your_key_here
PINATA_SECRET_KEY=your_secret_here

# MinIO (update existing)
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_BUCKET=oxsig-files

# Meilisearch (add if not exists)
MEILISEARCH_URL=http://localhost:7700
MEILISEARCH_KEY=your_master_key

# NATS (if keeping)
NATS_URL=nats://localhost:4222

# Pairing Relay
PAIRING_RELAY_URL=wss://relay.oxsig.app
# OR for dev
PAIRING_RELAY_URL=ws://localhost:8080
```

### Package Installations Needed

```bash
# Backend services
pnpm add minio
pnpm add meilisearch
pnpm add @web3-storage/w3up-client
# OR
pnpm add @pinata/sdk

# Optional (if keeping NATS)
pnpm add nats

# For checksum
# Already have: crypto (built-in Node.js)
```

---

## 📋 File-by-File Cleanup Checklist

### 🔴 MUST REMOVE/REPLACE

- [ ] `src/app/sign/page.tsx` - Lines 31-34 (signers array)
- [ ] `src/app/sign/page.tsx` - Lines 551-555 (recent signatures)
- [ ] `src/app/profile/page.tsx` - Lines 62-87 (all hardcoded arrays)
- [ ] `src/app/collab/page.tsx` - Lines 14-29 (peers, messages, files)
- [ ] `src/components/app/KeyringViewer.tsx` - Lines 10-13 (keys array)
- [ ] `src/components/app/ActivityFeed.tsx` - Lines 23-50 (events array)
- [ ] `src/lib/storage/ipfs.ts` - Entire file (replace with real impl)
- [ ] `src/app/api/storage/upload/presigned/route.ts` - Lines 78-94 (mock presigned)

### 🟡 SHOULD COMPLETE

- [ ] `src/lib/events/nats.ts` - Implement or remove
- [ ] `src/lib/search/secure-search.ts` - Upgrade crypto or remove
- [ ] `src/app/api/storage/upload/route.ts` - Line 76 (add checksum)
- [ ] `src/app/api/documents/upload/route.ts` - Lines 163-164 (Meilisearch + NATS)
- [ ] `src/app/api/auth/refresh/route.ts` - Line 97 (optional Redis)

### ✅ CAN KEEP AS-IS

- [x] `src/app/vault/page.tsx` - Informational only
- [x] `src/app/storage/page.tsx` - Uses real IndexedDB
- [x] `src/lib/pairing/qr-pairing.ts` - Has mock for dev
- [x] `src/lib/storage/secure-storage.ts` - Real implementation
- [x] `src/lib/vault/seed-vault.ts` - Real implementation

---

## 💡 Recommendations

### What to Handle in Frontend

✅ **Good for frontend:**
- Encryption/decryption (Web Crypto API)
- Vault management (IndexedDB)
- UI state management
- Client-side validation
- Local file storage
- Biometric authentication (WebAuthn)

### What Needs Backend

❌ **Must be backend:**
- Multi-party signatures (coordination)
- User stats (aggregation from DB)
- Activity/audit trails (persistent storage)
- Device management (persistent storage)
- File storage (MinIO/S3)
- Search indexing (Meilisearch)
- Event publishing (NATS)
- Session management (Redis optional)

### Architecture Decision: NATS

**Question:** Do you need event-driven architecture?

**If YES:**
- Implement real NATS in backend
- Keep event publishing in API routes
- Add NATS consumers for async processing

**If NO:**
- Remove all NATS code
- Use direct database writes
- Simpler architecture

**Recommendation:** Start without NATS. Add later if needed for:
- Real-time notifications
- Background job processing
- Microservices communication

---

## 🚀 Quick Start: Remove Stubs Now

### Immediate Changes (Can do right now)

1. **Sign Page - Connect to API:**
```typescript
// Replace hardcoded signers with API call
const [signers, setSigners] = React.useState<Signer[]>([]);

React.useEffect(() => {
  fetch('/api/collaborations/current/signers')
    .then(r => r.json())
    .then(data => setSigners(data.signers));
}, []);
```

2. **Profile Page - Fetch Real Data:**
```typescript
// Replace hardcoded stats
const [stats, setStats] = React.useState<any>(null);

React.useEffect(() => {
  fetch('/api/users/me/stats')
    .then(r => r.json())
    .then(data => setStats(data));
}, []);
```

3. **Collab Page - Use Existing API:**
```typescript
// Replace hardcoded peers
const [peers, setPeers] = React.useState([]);

React.useEffect(() => {
  fetch('/api/collaborations')
    .then(r => r.json())
    .then(data => setPeers(data.collaborations));
}, []);
```

---

## 📞 Next Steps

1. **Review this analysis** and decide:
   - Which backend features to implement first
   - Whether to keep NATS or remove it
   - IPFS provider choice (Web3.Storage vs Pinata)

2. **Create implementation tickets** for:
   - Missing API endpoints
   - IPFS integration
   - MinIO SDK integration
   - Frontend API connections

3. **Set up services:**
   - Configure MinIO credentials
   - Set up Meilisearch
   - Deploy pairing relay (optional)

4. **Start removing stubs:**
   - Begin with high-priority files
   - Test each change
   - Deploy incrementally

---

**Ready to begin cleanup?** Start with Phase 1, Priority 1 items! 🚀
