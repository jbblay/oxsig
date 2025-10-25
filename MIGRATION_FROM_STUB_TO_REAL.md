# Migration Guide: From Stub Data to Real User Data

## Overview

This guide helps you migrate OxSig features from stub/mock data to real database-backed implementation.

## ✅ Already Migrated

### 1. Authentication System
- **Status**: 100% Real
- **Files**: `src/lib/auth/use-auth.tsx`, `src/app/auth/page.tsx`
- **Database**: `users` table with full schema
- **API**: `/api/auth/login`, `/api/auth/register`, `/api/auth/logout`

### 2. User Profiles
- **Status**: 100% Real
- **Files**: `src/app/profile/page.tsx`
- **Database**: Fetches from `users` table via `/api/users/me`
- **Real Data**: email, display_name, avatar_url, bio, created_at, role

### 3. Dashboard
- **Status**: 70% Real (user data real, stats placeholder)
- **Files**: `src/app/dashboard/page.tsx`
- **Real**: User name, email, auth method, role
- **Placeholder**: Document count, collaborations, storage

## 🔄 Next to Migrate

### 1. Document Signing (`/sign`)

**Current State**:
```typescript
// Mock signers in sign/page.tsx
const mockSigners = [
  { id: 1, name: "Alice Johnson", status: "signed" },
  { id: 2, name: "Bob Smith", status: "pending" },
  { id: 3, name: "Carol White", status: "pending" }
];
```

**Migration Steps**:

1. **Create Documents Table**
```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  filename VARCHAR(255) NOT NULL,
  file_hash VARCHAR(255) NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type VARCHAR(100),
  status VARCHAR(50) DEFAULT 'pending',
  signature_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  signed_at TIMESTAMP,
  metadata JSONB
);
```

2. **Create Signers Table**
```sql
CREATE TABLE document_signers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id),
  user_id UUID NOT NULL REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'pending',
  signature_hash TEXT,
  signed_at TIMESTAMP,
  public_key TEXT,
  algorithm VARCHAR(50)
);
```

3. **Create API Endpoints**
```typescript
// src/app/api/documents/route.ts
export async function POST(req: Request) {
  const { userId } = await requireAuth(req);
  const { filename, fileHash, fileSize } = await req.json();
  
  const result = await db.query(
    `INSERT INTO documents (user_id, filename, file_hash, file_size)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, filename, fileHash, fileSize]
  );
  
  return Response.json(result.rows[0]);
}
```

4. **Update Frontend**
```typescript
// src/app/sign/page.tsx
const [documents, setDocuments] = useState([]);

useEffect(() => {
  fetch('/api/documents', { credentials: 'include' })
    .then(res => res.json())
    .then(data => setDocuments(data));
}, []);
```

### 2. Vault Feature (`/vault`)

**Current State**: Uses localStorage for seed phrases

**Migration Steps**:

1. **Create Vault Table**
```sql
CREATE TABLE vault_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  encrypted_data TEXT NOT NULL,
  encryption_algorithm VARCHAR(50),
  nonce TEXT,
  item_type VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  accessed_at TIMESTAMP
);
```

2. **Encrypt Before Storage**
```typescript
// src/lib/vault/encryption.ts
import { encryptData } from '@/lib/crypto/encryption';

export async function saveToVault(userId: string, data: any, type: string) {
  const encrypted = await encryptData(JSON.stringify(data));
  
  await fetch('/api/vault', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      encryptedData: encrypted.ciphertext,
      nonce: encrypted.nonce,
      itemType: type
    })
  });
}
```

### 3. Collaboration (`/collab`)

**Current State**: WebRTC with mock users

**Migration Steps**:

1. **Create Collaborations Table**
```sql
CREATE TABLE collaborations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  owner_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'active',
  metadata JSONB
);

CREATE TABLE collaboration_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collaboration_id UUID NOT NULL REFERENCES collaborations(id),
  user_id UUID NOT NULL REFERENCES users(id),
  role VARCHAR(50) DEFAULT 'member',
  joined_at TIMESTAMP DEFAULT NOW()
);
```

2. **Create API Endpoints**
```typescript
// src/app/api/collaborations/route.ts
export async function GET(req: Request) {
  const { userId } = await requireAuth(req);
  
  const result = await db.query(
    `SELECT c.*, u.display_name as owner_name
     FROM collaborations c
     JOIN collaboration_members cm ON c.id = cm.collaboration_id
     JOIN users u ON c.owner_id = u.id
     WHERE cm.user_id = $1`,
    [userId]
  );
  
  return Response.json(result.rows);
}
```

### 4. Storage (`/storage`)

**Current State**: MinIO with mock file listings

**Migration Steps**:

1. **Create Files Table**
```sql
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  filename VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type VARCHAR(100),
  encryption_key_id UUID,
  is_encrypted BOOLEAN DEFAULT false,
  uploaded_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB
);
```

2. **Link MinIO to Database**
```typescript
// src/app/api/storage/upload/route.ts
export async function POST(req: Request) {
  const { userId } = await requireAuth(req);
  const formData = await req.formData();
  const file = formData.get('file') as File;
  
  // Upload to MinIO
  const minioPath = await uploadToMinio(file);
  
  // Save metadata to DB
  const result = await db.query(
    `INSERT INTO files (user_id, filename, file_path, file_size, mime_type)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, file.name, minioPath, file.size, file.type]
  );
  
  return Response.json(result.rows[0]);
}
```

### 5. Activity Feed

**Current State**: Static mock data in dashboard

**Migration Steps**:

1. **Create Activity Table**
```sql
CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

2. **Log Activities**
```typescript
// src/lib/audit/activity.ts
export async function logActivity(
  userId: string,
  action: string,
  entityType?: string,
  entityId?: string
) {
  await db.query(
    `INSERT INTO activity_log (user_id, action, entity_type, entity_id)
     VALUES ($1, $2, $3, $4)`,
    [userId, action, entityType, entityId]
  );
}

// Usage in API routes
await logActivity(userId, 'document_signed', 'document', documentId);
```

3. **Fetch Recent Activity**
```typescript
// src/app/api/activity/route.ts
export async function GET(req: Request) {
  const { userId } = await requireAuth(req);
  
  const result = await db.query(
    `SELECT * FROM activity_log
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [userId]
  );
  
  return Response.json(result.rows);
}
```

## 📊 Statistics Migration

### Dashboard Stats (Real Implementation)

**Documents Signed**:
```typescript
const { rows } = await db.query(
  `SELECT COUNT(*) as count FROM documents
   WHERE user_id = $1 AND status = 'signed'`,
  [userId]
);
return rows[0].count;
```

**Active Collaborations**:
```typescript
const { rows } = await db.query(
  `SELECT COUNT(DISTINCT c.id) as count
   FROM collaborations c
   JOIN collaboration_members cm ON c.id = cm.collaboration_id
   WHERE cm.user_id = $1 AND c.status = 'active'`,
  [userId]
);
return rows[0].count;
```

**Storage Used**:
```typescript
const { rows } = await db.query(
  `SELECT COALESCE(SUM(file_size), 0) as total
   FROM files WHERE user_id = $1`,
  [userId]
);
return rows[0].total;
```

**Security Score** (Calculated):
```typescript
let score = 50; // Base score

// +20 for 2FA enabled
if (user.twofa_enabled) score += 20;

// +15 for recent activity
if (daysSinceLastLogin < 7) score += 15;

// +10 for email verified
if (user.email_verified) score += 10;

// +5 for strong password (if using email auth)
if (authMethod === 'email' && hasStrongPassword) score += 5;

return Math.min(score, 100);
```

## 🔐 Security Considerations

### 1. Data Encryption
- Encrypt sensitive data before storing in vault
- Use AES-256-GCM for file encryption
- Store encryption keys securely (not in database)

### 2. Access Control
- Always verify user ownership before returning data
- Use row-level security policies in PostgreSQL
- Implement proper authorization checks

### 3. Audit Trail
- Log all sensitive operations
- Include IP address and user agent
- Never delete audit logs (archive instead)

## 🧪 Testing Migration

### 1. Before Migration
```bash
# Test existing functionality
pnpm test

# Verify stub data works
curl http://localhost:3000/api/documents
```

### 2. During Migration
```bash
# Create migration file
touch migrations/003_add_documents.sql

# Test migration
psql -U oxsig -d oxsig -f migrations/003_add_documents.sql

# Verify schema
psql -U oxsig -d oxsig -c "\d documents"
```

### 3. After Migration
```bash
# Test new endpoints
curl -X POST http://localhost:3000/api/documents \
  -H "Content-Type: application/json" \
  -d '{"filename":"test.pdf","fileHash":"abc123"}'

# Run integration tests
pnpm test:integration
```

## 📝 Migration Checklist

For each feature:

- [ ] Design database schema
- [ ] Create migration SQL file
- [ ] Run migration on dev database
- [ ] Create API endpoints (POST, GET, PUT, DELETE)
- [ ] Add authentication middleware
- [ ] Implement authorization checks
- [ ] Update frontend to use real API
- [ ] Remove stub/mock data
- [ ] Add error handling
- [ ] Write tests
- [ ] Update documentation
- [ ] Test in production-like environment

## 🎯 Priority Order

1. **High Priority** (User-facing features):
   - Document signing
   - Vault storage
   - Activity feed

2. **Medium Priority** (Collaboration features):
   - Collaborations
   - File sharing
   - Real-time chat

3. **Low Priority** (Analytics):
   - Advanced statistics
   - Usage analytics
   - Performance metrics

## 📚 Resources

- **Database Migrations**: See `migrations/` directory
- **API Examples**: See `src/app/api/users/me/route.ts`
- **Authentication**: See `AUTH_QUICK_REFERENCE.md`
- **Testing**: See `TESTING_GUIDE.md`

## 🆘 Common Issues

### Issue: "Cannot read property of null"
**Solution**: Check if user is authenticated before fetching data
```typescript
if (!user) return;
fetch('/api/data', { credentials: 'include' });
```

### Issue: "404 on API endpoint"
**Solution**: Create the endpoint file in `src/app/api/`
```typescript
// src/app/api/myendpoint/route.ts
export async function GET(req: Request) {
  return Response.json({ message: 'Hello' });
}
```

### Issue: "Unauthorized"
**Solution**: Include credentials in fetch
```typescript
fetch('/api/endpoint', {
  credentials: 'include' // Important!
});
```

---

**Last Updated**: January 2025  
**Progress**: 30% migrated (auth + profiles done)  
**Next**: Document signing implementation
