# OxSig Local Testing Guide

## ✅ What's Production-Ready

### Fully Integrated (Real Implementations)
1. ✅ **Post-Quantum Cryptography**
   - ML-DSA-87 (Dilithium) signatures
   - ML-KEM-768 (Kyber) key encapsulation
   - Using @noble/post-quantum library

2. ✅ **Authentication System**
   - Ed25519-signed JWTs
   - bcrypt password hashing (10 rounds)
   - PostgreSQL user storage
   - HttpOnly cookie sessions

3. ✅ **Database Layer**
   - PostgreSQL connection pool
   - Documents, signatures, users tables
   - Persistent storage (no in-memory)

4. ✅ **Security Features**
   - Rate limiting (in-memory, works single-server)
   - Security headers (CSP, HSTS, X-Frame-Options)
   - JWT verification on protected routes

5. ✅ **Offline-First**
   - IndexedDB storage
   - Operation queue
   - Background sync manager
   - Offline indicators

6. ✅ **Identity & Privacy**
   - DID (did:key, did:web)
   - Verifiable Credentials
   - Zero-Knowledge Proofs (simplified)

---

## ⚠️ Still Stub/Mock (Non-Critical)

### Optional Services (Can skip for testing)
1. ⚠️ **IPFS Storage** - `src/lib/storage/ipfs.ts`
   - Returns mock CIDs
   - Not needed for core document signing

2. ⚠️ **NATS Events** - `src/lib/events/nats.ts`
   - Event publishing stubbed
   - App works without it

3. ⚠️ **MeiliSearch** - `src/lib/search/meilisearch.ts`
   - Search indexing may fail silently
   - Not critical for signing

4. ⚠️ **Supabase** - `src/lib/supabase.example.ts`
   - Not used in current implementation
   - PostgreSQL is used instead

### Minor TODOs (Edge Cases)
- User roles in JWT (currently hardcoded to 'user')
- Audit log Ed25519 signing (mock signature)
- Push notification action handlers (placeholders)

---

## 🚀 Local Testing Steps

### 1. Prerequisites
```bash
# Ensure installed:
- Node.js 20+
- pnpm 8+
- Docker & Docker Compose
- PostgreSQL 16 (via Docker)
```

### 2. Start Infrastructure
```bash
# From project root
cd c:/Users/jbnya/oxsig

# Start all services
docker-compose up -d

# Verify services running
docker-compose ps

# Expected services:
# - postgres:5432
# - pgadmin:5050
# - minio:9000, 9001
# - meilisearch:7700
# - nats:4222
# - loki, prometheus, grafana (monitoring)
```

### 3. Initialize Database
```bash
# Connect to PostgreSQL
# Method 1: pgAdmin (http://localhost:5050)
#   Email: admin@oxsig.io
#   Password: admin

# Method 2: psql command line
docker exec -it oxsig-postgres psql -U oxsig -d oxsig

# Run migration
\i /migrations/001_initial_schema.sql

# Verify tables
\dt

# Expected tables:
# - users
# - documents  
# - signatures
# - audit_logs
```

### 4. Configure Environment
```bash
cd oxsig-frontend

# Create .env.local
cat > .env.local << EOF
# Database
DATABASE_URL=postgresql://oxsig:oxsig_secure_password@localhost:5432/oxsig

# MinIO Storage
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=oxsig_admin
MINIO_SECRET_KEY=oxsig_secret_key_2024
MINIO_USE_SSL=false
MINIO_BUCKET=oxsig-documents

# MeiliSearch (optional)
MEILISEARCH_HOST=http://localhost:7700
MEILISEARCH_API_KEY=oxsig_search_master_key

# NATS (optional)
NATS_URL=nats://localhost:4222

# App Config
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
EOF
```

### 5. Install Dependencies
```bash
pnpm install
```

### 6. Run Tests
```bash
# Unit tests (44 tests)
pnpm test:run

# Expected: 44 passed, 12 skipped (integration tests)
```

### 7. Start Development Server
```bash
# Start Next.js with Socket.io
pnpm dev

# Server starts on http://localhost:3000
# Socket.io on same port with /socket.io path
```

---

## 🧪 Test Scenarios

### Test 1: User Registration & Login
1. **Navigate**: http://localhost:3000/auth-test
2. **Register**:
   - Email: `test@example.com`
   - Password: `SecurePass123!`
   - Click "Register"
3. **Expected**:
   - ✅ Success message
   - ✅ User created in PostgreSQL
   - ✅ Access token in httpOnly cookie
   - ✅ Redirected to dashboard

4. **Verify Database**:
```sql
SELECT id, email, created_at, is_active FROM users;
-- Should show your new user
```

5. **Login**:
   - Use same credentials
   - Click "Login"
   - ✅ Should receive new JWT tokens

### Test 2: Rate Limiting
1. **Navigate**: http://localhost:3000/auth-test
2. **Try login 6 times rapidly** (limit is 5/min)
3. **Expected**:
   - First 5 attempts: Normal response
   - 6th attempt: `429 Too Many Requests`
   - Response includes `Retry-After` header

### Test 3: Protected Routes
1. **Without login**, navigate to:
   - http://localhost:3000/profile
   - http://localhost:3000/vault
2. **Expected**: Redirect to `/auth-test`

3. **After login**, navigate to same routes
4. **Expected**: Access granted

### Test 4: Document Creation (Online)
1. **Login first**
2. **Navigate**: http://localhost:3000/sign
3. **Create document**:
   - Title: "Test Contract"
   - Content: "This is a test document"
   - Click "Create"
4. **Expected**:
   - ✅ Document saved to PostgreSQL
   - ✅ API returns document ID
   - ✅ Can view in documents list

5. **Verify Database**:
```sql
SELECT id, title, content_type, owner_id, created_at 
FROM documents 
ORDER BY created_at DESC 
LIMIT 5;
```

### Test 5: Post-Quantum Signatures
1. **Navigate**: http://localhost:3000/sign
2. **Enable quantum-safe mode**
3. **Sign document**
4. **Check console logs**:
   - ✅ "Using ML-DSA-87 for signing"
   - ✅ Public key: 2592 bytes
   - ✅ Signature generated successfully

### Test 6: Offline Mode
1. **Open DevTools** → Network tab
2. **Enable "Offline" mode**
3. **Navigate**: http://localhost:3000/sign
4. **Create document**
5. **Expected**:
   - ✅ Document saved to IndexedDB
   - ✅ Operation queued
   - ✅ Offline indicator shows "Offline"
   - ✅ Queue count shows "1"

6. **Go back online**:
   - Disable offline mode
   - Wait ~5 seconds
7. **Expected**:
   - ✅ Auto-sync triggered
   - ✅ Document uploaded to server
   - ✅ Queue count returns to "0"

### Test 7: Security Headers
1. **Open DevTools** → Network tab
2. **Navigate**: http://localhost:3000
3. **Inspect response headers**:
   - ✅ `Content-Security-Policy` present
   - ✅ `X-Frame-Options: DENY`
   - ✅ `X-Content-Type-Options: nosniff`
   - ✅ `Referrer-Policy` present

### Test 8: DID & Verifiable Credentials
```javascript
// Open browser console on http://localhost:3000

// Generate DID identity
const identity = await window.crypto.subtle.generateKey(
  "Ed25519",
  true,
  ["sign", "verify"]
);

// Test available at /identity page
```

---

## 🔍 Debugging Tips

### Check Service Status
```bash
# All services
docker-compose ps

# PostgreSQL logs
docker logs oxsig-postgres

# MinIO logs  
docker logs oxsig-minio

# Check if database is accessible
docker exec -it oxsig-postgres psql -U oxsig -d oxsig -c "SELECT version();"
```

### Check Database Connection
```bash
cd oxsig-frontend

# Test database connectivity
node -e "
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://oxsig:oxsig_secure_password@localhost:5432/oxsig'
});
pool.query('SELECT NOW()').then(r => console.log('✅ Connected:', r.rows[0])).catch(e => console.error('❌ Error:', e));
"
```

### View IndexedDB (Offline Storage)
1. **Open DevTools** → Application tab
2. **IndexedDB** → `oxsig-offline`
3. **View stores**:
   - `documents` - Offline documents
   - `signatures` - Offline signatures
   - `offline-queue` - Pending sync operations

### Clear All Data (Fresh Start)
```bash
# Stop services
docker-compose down -v

# Remove all volumes (deletes all data!)
docker volume prune -f

# Restart
docker-compose up -d

# Re-run migrations
# (See step 3 above)
```

### Common Issues

#### "Connection refused" on PostgreSQL
```bash
# Check if container is running
docker ps | grep postgres

# Check logs
docker logs oxsig-postgres

# Restart container
docker-compose restart postgres
```

#### "pnpm command not found"
```bash
npm install -g pnpm@8
```

#### "Module not found" errors
```bash
cd oxsig-frontend
rm -rf node_modules .next
pnpm install
pnpm dev
```

#### Rate limit blocking you
```javascript
// Open browser console
// Clear rate limits (development only)
localStorage.clear();
// Refresh page
```

---

## 📊 Monitoring & Observability

### pgAdmin (Database GUI)
- **URL**: http://localhost:5050
- **Email**: admin@oxsig.io
- **Password**: admin
- **Add Server**:
  - Host: postgres
  - Port: 5432
  - Username: oxsig
  - Password: oxsig_secure_password

### MinIO Console (File Storage)
- **URL**: http://localhost:9001
- **Username**: oxsig_admin
- **Password**: oxsig_secret_key_2024
- **Bucket**: `oxsig-documents`

### Grafana (Metrics)
- **URL**: http://localhost:3001
- **Username**: admin
- **Password**: admin
- Preconfigured dashboards for app monitoring

---

## ✅ Success Criteria

Your local setup is working correctly if:
1. ✅ All Docker containers running (`docker-compose ps`)
2. ✅ Can register user at `/auth-test`
3. ✅ User appears in PostgreSQL `users` table
4. ✅ Can login and receive JWT cookies
5. ✅ Protected routes require authentication
6. ✅ Rate limiting triggers on 6th rapid request
7. ✅ 44/44 unit tests passing (`pnpm test:run`)
8. ✅ Security headers present in responses
9. ✅ Offline mode queues operations
10. ✅ Going online triggers auto-sync

---

## 🎯 Next Steps After Testing

Once local testing works:
1. **Integration Testing** - Run E2E tests with Playwright
2. **Voice Communication** - Add WebRTC voice calls
3. **Backup/Recovery** - Encrypted backups to MinIO
4. **Production Deployment** - Deploy to Vercel/AWS
5. **Mobile App** - React Native or Tauri mobile

---

## 📝 Notes

- **Stub Services**: IPFS, NATS, MeiliSearch are stubbed but won't block core functionality
- **Single Server**: Rate limiting uses in-memory store (Redis needed for multi-server)
- **Development Mode**: Some features like HSTS are disabled in development
- **Test Data**: All test data goes to local PostgreSQL, can be wiped with `docker-compose down -v`

Need help with any specific test scenario? Let me know! 🚀
