# 🔧 OxSig Development Setup & Backend Guide

## Quick Start

### Development Environment

```bash
# Clone and install
git clone https://github.com/yourusername/oxsig.git
cd oxsig
pnpm install

# Setup environment variables
cp .env.example .env.local
# Edit .env.local with your configuration

# Start development server
pnpm dev
# Open http://localhost:3000
```

### Prerequisites

- **Node.js 18+** (LTS recommended)
- **pnpm** (preferred) or npm
- **Git**
- **Modern browser** with WebAuthn support

---

## 🌐 Environment Configuration

### Essential Services

#### Database & Authentication (Supabase)
```env
# Required for user data and real-time features
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_KEY=eyJhbG...
```

**Setup Steps:**
1. Sign up at [supabase.com](https://supabase.com)
2. Create new project
3. Go to Settings → API
4. Copy URL and anon key
5. Copy service key for backend operations

#### Encryption Keys
```env
# Generate secure random keys
ENCRYPTION_KEY=64-character-hex-string
JWT_SECRET=32-character-random-string
WEBHOOK_SECRET=32-character-random-string
```

**Generate Keys:**
```bash
# Encryption key (64 chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# JWT secret (32 chars) 
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

### Optional Services

#### IPFS Storage (Decentralized Files)
```env
NEXT_PUBLIC_IPFS_GATEWAY=https://gateway.pinata.cloud
IPFS_API_KEY=your-pinata-api-key
IPFS_SECRET=your-pinata-secret
```

#### Blockchain Integration
```env
# Internet Computer
IC_NETWORK=local
IC_IDENTITY=default

# Ethereum
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/your-key
ETHEREUM_PRIVATE_KEY=your-private-key

# Solana
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_PRIVATE_KEY=your-private-key-array
```

#### Push Notifications
```env
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_EMAIL=mailto:your-email@example.com
```

#### External APIs
```env
# AI/ML Services
OPENAI_API_KEY=sk-...
HUGGINGFACE_API_KEY=hf_...

# Communication
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Analytics (Privacy-focused)
PLAUSIBLE_DOMAIN=your-domain.com
UMAMI_WEBSITE_ID=your-umami-id
```

### Development Tools
```env
# Debugging
DEBUG=oxsig:*
LOG_LEVEL=debug

# Testing
TEST_DATABASE_URL=postgresql://...
E2E_BASE_URL=http://localhost:3000

# Build
ANALYZE_BUNDLE=false
DISABLE_ESLINT=false
```

---

## 🏗️ Backend Architecture & Implementation

### Core Business Logic

#### Smart Signature System

**Problem Solved:**
- Traditional signatures are forgeable
- No proof of consent conditions
- Can't verify WHO signed WHEN under WHAT context
- No quantum-resistance for future-proofing

**OxSig Solution:**
```
User signs document
    ↓
1. Capture biometric proof (fingerprint/face)
2. Record encrypted metadata (time, location, device)
3. Generate quantum-resistant signature (Dilithium-3)
4. Add zero-knowledge proof (privacy-preserving)
5. Anchor to blockchain (ICP + Ethereum)
6. Store encrypted document (IPFS)
7. Create immutable audit trail
    ↓
Result: Legally binding, verifiable, tamper-proof signature
```

#### Data Sources & Flow

```typescript
interface SignatureData {
  // User inputs
  documentContent: string;
  signerIntent: SignatureIntent;
  
  // Biometric proof
  webAuthnSignature: AuthenticatorAssertionResponse;
  biometricType: 'fingerprint' | 'face' | 'voice';
  
  // Context (encrypted)
  timestamp: number;
  location?: GeolocationCoordinates;
  deviceFingerprint: string;
  ipAddress: string; // Hashed for privacy
  
  // Cryptographic proof
  documentHash: string;
  signatureAlgorithm: 'Ed25519' | 'Dilithium';
  publicKey: string;
  signature: string;
  
  // Zero-knowledge proof
  zkProof?: ZKProof;
  
  // Audit trail
  auditLogEntry: AuditEntry;
  merkleRoot: string;
}
```

### Database Schema

#### Core Tables (PostgreSQL/Supabase)

```sql
-- Users and Identity
CREATE TABLE users (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  did TEXT UNIQUE, -- Decentralized Identifier
  public_key TEXT,
  trust_score REAL DEFAULT 0.0,
  biometric_enrolled BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Documents
CREATE TABLE documents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT, -- Encrypted
  content_hash TEXT NOT NULL,
  owner_id UUID REFERENCES users(id),
  signatures JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  ipfs_hash TEXT, -- Decentralized storage
  blockchain_anchors JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Signatures
CREATE TABLE signatures (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  document_id UUID REFERENCES documents(id),
  signer_id UUID REFERENCES users(id),
  signature_data JSONB NOT NULL,
  algorithm TEXT NOT NULL,
  biometric_proof JSONB,
  context_data JSONB, -- Encrypted metadata
  zk_proof JSONB,
  blockchain_tx TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit Log
CREATE TABLE audit_log (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details JSONB DEFAULT '{}',
  ip_address_hash TEXT,
  user_agent TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  hash TEXT, -- For integrity chain
  previous_hash TEXT
);

-- Device Management
CREATE TABLE paired_devices (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  device_did TEXT UNIQUE NOT NULL,
  device_public_key TEXT NOT NULL,
  device_info JSONB,
  trust_level TEXT DEFAULT 'unknown',
  push_endpoint TEXT,
  last_seen TIMESTAMP WITH TIME ZONE,
  paired_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Row Level Security (RLS)

```sql
-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own data" ON users 
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own data" ON users 
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view own documents" ON documents 
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can manage own documents" ON documents 
  FOR ALL USING (auth.uid() = owner_id);

CREATE POLICY "Users can view own signatures" ON signatures 
  FOR SELECT USING (auth.uid() = signer_id);

CREATE POLICY "Users can view own audit logs" ON audit_log 
  FOR SELECT USING (auth.uid() = user_id);
```

### API Implementation

#### REST API Endpoints

```typescript
// Authentication
POST   /api/auth/webauthn/register    // Register biometric
POST   /api/auth/webauthn/authenticate // Authenticate
GET    /api/auth/session              // Current session
POST   /api/auth/logout               // Logout

// Document Management
GET    /api/documents                 // List documents
POST   /api/documents                 // Create document
GET    /api/documents/:id             // Get document
PUT    /api/documents/:id             // Update document
DELETE /api/documents/:id             // Delete document
POST   /api/documents/:id/share       // Share document

// Digital Signatures
POST   /api/signatures/sign           // Sign document
GET    /api/signatures/:id            // Get signature
POST   /api/signatures/verify         // Verify signature
GET    /api/signatures/certificate    // Get signing certificate

// Identity & Credentials
GET    /api/identity/did              // Get DID document
POST   /api/identity/credential/issue // Issue credential
POST   /api/identity/credential/verify // Verify credential
GET    /api/identity/trust-score      // Get trust score

// Device Management
GET    /api/devices                   // List paired devices
POST   /api/devices/pair              // Pair device
DELETE /api/devices/:id               // Unpair device
PUT    /api/devices/:id/trust         // Update trust level

// Audit & Compliance
GET    /api/audit/logs                // Get audit logs
POST   /api/audit/export              // Export audit data
GET    /api/audit/integrity           // Verify integrity
POST   /api/audit/report              // Generate compliance report

// Security
GET    /api/security/threats          // Get threat alerts
POST   /api/security/report           // Report security event
GET    /api/security/score            // Get security score

// Blockchain Integration
POST   /api/blockchain/anchor         // Anchor to blockchain
GET    /api/blockchain/verify         // Verify blockchain record
GET    /api/blockchain/transactions   // List transactions
```

#### Example API Implementation

```typescript
// /api/documents/[id]/sign.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase';
import { signDocument } from '@/lib/crypto/signatures';
import { auditLog } from '@/lib/audit';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;
    const { signature, publicKey, biometricProof } = req.body;
    
    // Get authenticated user
    const supabase = createClient(req, res);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get document
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single();

    if (docError || !document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Verify signature
    const isValid = await signDocument.verify(
      document.content,
      signature,
      publicKey
    );

    if (!isValid) {
      await auditLog.log('SIGNATURE_VERIFICATION_FAILED', {
        documentId: id,
        userId: user.id,
        reason: 'Invalid signature'
      });
      
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // Store signature
    const { data: newSignature, error: sigError } = await supabase
      .from('signatures')
      .insert({
        document_id: id,
        signer_id: user.id,
        signature_data: {
          signature,
          publicKey,
          algorithm: 'Ed25519'
        },
        biometric_proof: biometricProof,
        context_data: {
          timestamp: Date.now(),
          userAgent: req.headers['user-agent'],
          ipHash: hashIP(getClientIP(req))
        }
      })
      .select()
      .single();

    if (sigError) {
      throw sigError;
    }

    // Log audit event
    await auditLog.log('DOCUMENT_SIGNED', {
      documentId: id,
      signatureId: newSignature.id,
      algorithm: 'Ed25519',
      biometricAuth: !!biometricProof
    });

    // Anchor to blockchain (async)
    anchorToBlockchain(newSignature.id, document.content_hash);

    res.status(200).json({
      success: true,
      signature: newSignature,
      message: 'Document signed successfully'
    });

  } catch (error) {
    console.error('Signature error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
```

### Cryptographic Implementation

#### Key Generation and Management

```typescript
// /lib/crypto/keys.ts
import { ed25519 } from '@noble/curves/ed25519';
import { randomBytes } from '@noble/hashes/utils';

export class KeyManager {
  // Generate Ed25519 key pair
  static generateSigningKeyPair(): KeyPair {
    const privateKey = ed25519.utils.randomPrivateKey();
    const publicKey = ed25519.getPublicKey(privateKey);
    
    return {
      privateKey: bytesToHex(privateKey),
      publicKey: bytesToHex(publicKey)
    };
  }

  // Derive key from password using PBKDF2
  static async deriveKeyFromPassword(
    password: string,
    salt: Uint8Array
  ): Promise<CryptoKey> {
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // Secure key storage
  static async storeEncryptedKey(
    keyId: string,
    privateKey: Uint8Array,
    masterKey: CryptoKey
  ): Promise<void> {
    const iv = randomBytes(12);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      masterKey,
      privateKey
    );

    await indexedDB.put('keys', {
      id: keyId,
      encryptedKey: Array.from(new Uint8Array(encrypted)),
      iv: Array.from(iv),
      created: Date.now()
    });
  }
}
```

#### Document Signing

```typescript
// /lib/crypto/signatures.ts
export class DocumentSigner {
  static async signDocument(
    content: string,
    privateKey: string
  ): Promise<DocumentSignature> {
    const message = new TextEncoder().encode(content);
    const privKey = hexToBytes(privateKey);
    const signature = ed25519.sign(message, privKey);
    
    return {
      signature: bytesToHex(signature),
      algorithm: 'Ed25519',
      timestamp: Date.now(),
      publicKey: bytesToHex(ed25519.getPublicKey(privKey))
    };
  }

  static async verifySignature(
    content: string,
    signature: DocumentSignature
  ): Promise<boolean> {
    const message = new TextEncoder().encode(content);
    const sig = hexToBytes(signature.signature);
    const pubKey = hexToBytes(signature.publicKey);
    
    return ed25519.verify(sig, message, pubKey);
  }

  // Future: Post-quantum signatures
  static async signWithDilithium(
    content: string,
    privateKey: string
  ): Promise<DocumentSignature> {
    // Implementation when browser support arrives
    throw new Error('Dilithium not yet supported in browsers');
  }
}
```

### Integration Points

#### Blockchain Anchoring

```typescript
// /lib/blockchain/anchor.ts
export class BlockchainAnchor {
  static async anchorToICP(signatureHash: string): Promise<string> {
    // Internet Computer integration
    const actor = createActor(canisterId, { agent });
    const result = await actor.anchor_signature({
      hash: signatureHash,
      timestamp: Date.now()
    });
    
    return result.transaction_id;
  }

  static async anchorToEthereum(signatureHash: string): Promise<string> {
    // Ethereum smart contract integration
    const contract = new ethers.Contract(contractAddress, abi, signer);
    const tx = await contract.anchorSignature(signatureHash);
    await tx.wait();
    
    return tx.hash;
  }
}
```

#### IPFS Storage

```typescript
// /lib/storage/ipfs.ts
export class IPFSStorage {
  static async uploadDocument(
    content: string,
    metadata: any
  ): Promise<string> {
    const data = {
      content,
      metadata,
      timestamp: Date.now()
    };

    const response = await fetch('/api/ipfs/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const result = await response.json();
    return result.ipfsHash;
  }

  static async retrieveDocument(ipfsHash: string): Promise<any> {
    const response = await fetch(`${process.env.NEXT_PUBLIC_IPFS_GATEWAY}/ipfs/${ipfsHash}`);
    return response.json();
  }
}
```

### Testing & Development

#### Database Migrations

```bash
# Create migration
npx supabase migration new add_signatures_table

# Apply migrations
npx supabase migration up

# Reset database (development)
npx supabase db reset
```

#### Seed Data

```typescript
// /scripts/seed.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function seedDatabase() {
  // Create test users
  const { data: users } = await supabase.from('users').insert([
    {
      email: 'alice@example.com',
      name: 'Alice Smith',
      did: 'did:ox:alice',
      trust_score: 0.95
    },
    {
      email: 'bob@example.com', 
      name: 'Bob Johnson',
      did: 'did:ox:bob',
      trust_score: 0.87
    }
  ]).select();

  // Create test documents
  await supabase.from('documents').insert([
    {
      title: 'Sample Contract',
      content: 'This is a sample contract...',
      content_hash: 'sha256:abc123...',
      owner_id: users[0].id
    }
  ]);

  console.log('Database seeded successfully');
}

seedDatabase().catch(console.error);
```

#### Testing Commands

```bash
# Unit tests
pnpm test

# Integration tests
pnpm test:integration

# E2E tests
pnpm test:e2e

# Security tests
pnpm test:security

# Load tests
pnpm test:load
```

---

## 🚀 Deployment Setup

### Production Environment Variables

```env
# Production essentials
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://your-domain.com

# Database (production)
DATABASE_URL=postgresql://user:pass@host:5432/oxsig_prod
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-production-anon-key
SUPABASE_SERVICE_KEY=your-production-service-key

# Security (production keys)
ENCRYPTION_KEY=production-64-char-hex-key
JWT_SECRET=production-32-char-secret
WEBHOOK_SECRET=production-webhook-secret

# External services
IPFS_API_KEY=production-ipfs-key
BLOCKCHAIN_RPC_URLS=production-rpc-endpoints
```

### Docker Configuration

```dockerfile
# Dockerfile
FROM node:18-alpine AS base
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

FROM base AS builder
COPY . .
RUN pnpm build

FROM node:18-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
```

### Health Checks

```typescript
// /api/health.ts
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Check database connection
    const supabase = createClient();
    const { error: dbError } = await supabase.from('users').select('count').limit(1);
    
    if (dbError) throw new Error('Database connection failed');

    // Check external services
    const checks = {
      database: 'healthy',
      ipfs: await checkIPFS(),
      blockchain: await checkBlockchain(),
      timestamp: new Date().toISOString()
    };

    res.status(200).json(checks);
  } catch (error) {
    res.status(503).json({ error: 'Service unhealthy', details: error.message });
  }
}
```

---

This comprehensive setup guide covers everything needed to develop, deploy, and maintain OxSig's backend infrastructure while preserving the client-first architecture that makes it secure and privacy-preserving.