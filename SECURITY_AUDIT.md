# 🔒 OxSig Security & Code Quality Audit
**Date:** October 18, 2025  
**Auditor:** Deep Code Analysis  
**Scope:** Full codebase security, performance, and code quality review

---

## 🚨 CRITICAL ISSUES (Fix Immediately)

### 1. Next.js Security Vulnerabilities ⚠️ CRITICAL
**Severity:** HIGH | **Impact:** SSRF, Cache Confusion, Content Injection

**Current Version:** `next@15.3.4`  
**Required Version:** `next@15.4.7` or higher

**Vulnerabilities Found:**
1. **GHSA-4342-x723-ch2f** - SSRF via middleware redirect handling
2. **GHSA-g5qg-72qw-gw5v** - Cache key confusion in image optimization
3. **GHSA-xv57-4mr9-wg8v** - Content injection in image optimization

**Fix:**
```bash
pnpm update next@latest
```

**Files to Review After Update:**
- `next.config.ts` - Ensure image optimization is properly configured
- Any middleware files

---

### 2. Insecure localStorage Usage 🔐 CRITICAL
**Severity:** HIGH | **Impact:** Credential theft, key exposure

**Problem:** Sensitive cryptographic data stored in unencrypted localStorage:

**Affected Files:**
1. `src/lib/auth/webauthn.ts` - Lines 195, 206, 216
   - Stores biometric credentials in plaintext
   ```typescript
   localStorage.setItem('oxsig_biometric_credentials', JSON.stringify(existing));
   ```

2. `src/lib/pairing/qr-pairing.ts` - Lines 219, 236
   - Stores pairing challenges/responses
   ```typescript
   localStorage.setItem(`pairing:${challengeId}`, JSON.stringify(response));
   ```

3. `src/app/signature-editor/page.tsx` - Lines 56, 142, 168
   - Stores user signatures
   ```typescript
   localStorage.setItem('oxsig_signatures', JSON.stringify(updated));
   ```

4. `src/lib/storage/secure-storage.ts` - Lines 114, 160, 178
   - Ironic: "secure" storage using localStorage
   ```typescript
   localStorage.setItem('secure_files', JSON.stringify(existingFiles));
   ```

**Fix Required:**
- Migrate ALL sensitive data to encrypted IndexedDB
- Use the existing `OfflineDB` class in `src/lib/db/offline.ts`
- Add encryption layer using `WebCryptoProvider`

**Recommendation:**
```typescript
// Instead of:
localStorage.setItem('oxsig_biometric_credentials', JSON.stringify(creds));

// Use:
await db.saveEncrypted('biometric_credentials', creds, userMasterKey);
```

---

### 3. XSS Vulnerability in DocEditor 🛡️ HIGH
**Severity:** HIGH | **Impact:** Cross-Site Scripting attacks

**Problem:** Direct innerHTML assignment without sanitization

**File:** `src/components/app/DocEditor.tsx`  
**Lines:** 79, 196, 211, 229, 247

```typescript
// UNSAFE - No sanitization
editorRef.current.innerHTML = content;
```

**Attack Vector:**
User uploads malicious HTML/Markdown → Executed in editor → Steal credentials

**Fix Required:**
```typescript
import DOMPurify from 'dompurify';

// Safe version
editorRef.current.innerHTML = DOMPurify.sanitize(content, {
  ALLOWED_TAGS: ['p', 'b', 'i', 'u', 'strong', 'em', 'h1', 'h2', 'h3', 'ul', 'ol', 'li'],
  ALLOWED_ATTR: ['class', 'id']
});
```

**Install Required:**
```bash
pnpm add dompurify
pnpm add -D @types/dompurify
```

---

## ⚠️ HIGH PRIORITY ISSUES

### 4. Missing Cryptographic Signature Verification
**Severity:** MEDIUM-HIGH | **Impact:** Authentication bypass

**File:** `src/lib/pairing/qr-pairing.ts` - Line 95

```typescript
// TODO: Verify ed25519 signature
// For now, we'll trust the response (implement crypto verification later)

return { valid: true }; // ❌ ALWAYS RETURNS TRUE
```

**Risk:** Attackers can pair devices without valid signatures

**Fix Required:**
Implement actual ed25519 signature verification:
```typescript
import { verify } from '@noble/ed25519';

export async function verifyPairingResponse(
  challenge: PairingChallenge,
  response: PairingResponse
): Promise<{ valid: boolean; error?: string }> {
  // Verify challenge matches
  if (challenge.c !== response.c) {
    return { valid: false, error: 'Challenge mismatch' };
  }

  // Check timestamp
  const ageMs = Date.now() - challenge.timestamp;
  if (ageMs > 5 * 60 * 1000) {
    return { valid: false, error: 'Challenge expired' };
  }

  // ACTUALLY VERIFY SIGNATURE
  try {
    const message = new TextEncoder().encode(response.c);
    const signature = hexToBytes(response.sig);
    const publicKey = hexToBytes(response.devicePubKey);
    
    const valid = await verify(signature, message, publicKey);
    
    if (!valid) {
      return { valid: false, error: 'Invalid signature' };
    }
    
    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Signature verification failed' };
  }
}
```

---

### 5. Incomplete Push Notification Handlers
**Severity:** MEDIUM | **Impact:** Poor UX, broken flows

**File:** `src/lib/notifications/push-integration.ts`

**Missing Implementations:**
- Line 276: `// TODO: Navigate to sign page with pre-filled data`
- Line 283: `// TODO: Send rejection response`
- Line 290: `// TODO: Open document preview`

**Fix Required:**
```typescript
switch (action) {
  case 'approve':
    // Navigate to signing page
    self.clients.openWindow(`/sign?requestId=${requestId}`);
    break;
    
  case 'reject':
    // Send rejection to server
    await fetch('/api/signature/reject', {
      method: 'POST',
      body: JSON.stringify({ requestId })
    });
    break;
    
  case 'view':
    // Open document preview
    self.clients.openWindow(`/preview?requestId=${requestId}`);
    break;
}
```

---

### 6. Missing API Implementation
**Severity:** MEDIUM | **Impact:** Offline sync broken

**File:** `src/lib/db/offline.ts` - Line 389

```typescript
// TODO: Replace with actual API call
console.log('Would sync to API:', doc.id);
```

**Fix Required:**
Implement actual backend sync:
```typescript
async syncToAPI(doc: StoredDocument): Promise<void> {
  const response = await fetch('/api/documents/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${await getAuthToken()}`
    },
    body: JSON.stringify({
      id: doc.id,
      hash: doc.hash,
      content: doc.content,
      timestamp: doc.timestamp
    })
  });
  
  if (!response.ok) {
    throw new Error(`Sync failed: ${response.statusText}`);
  }
  
  const result = await response.json();
  return result;
}
```

---

## 📊 CODE QUALITY ISSUES

### 7. TypeScript Type Safety Violations
**Severity:** LOW-MEDIUM | **Impact:** Runtime errors, maintenance burden

**Files with `any` types:**

1. **src/types/core.ts** - Line 64
   ```typescript
   [key: string]: any; // ❌ Lose type safety
   ```

2. **src/lib/notifications/push.ts** - Line 11
   ```typescript
   data?: any; // ❌ Should be Record<string, unknown>
   ```

3. **src/lib/db/offline.ts** - Line 31
   ```typescript
   value: any; // ❌ Should be JsonValue
   ```

**Fix:**
```typescript
// Better types
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface StoredSettings {
  key: string;
  value: JsonValue;
  timestamp: number;
}
```

---

### 8. @ts-expect-error and @ts-ignore Usage
**Severity:** LOW | **Impact:** Hidden type errors

**Files:**
1. `src/lib/notifications/push-integration.ts` - Line 239
2. `src/lib/db/audit.ts` - Line 21
3. `src/lib/db/devices.ts` - Line 10

**Fix:** Address the underlying type issues instead of suppressing them

---

### 9. Console Statements in Production Code
**Severity:** LOW | **Impact:** Debug information exposure

**Found:** 100+ console.log/error statements throughout codebase

**Fix:** Implement proper logging system:
```typescript
// src/lib/logger.ts
const isDev = process.env.NODE_ENV === 'development';

export const logger = {
  debug: (...args: any[]) => isDev && console.log('[DEBUG]', ...args),
  info: (...args: any[]) => console.info('[INFO]', ...args),
  warn: (...args: any[]) => console.warn('[WARN]', ...args),
  error: (...args: any[]) => console.error('[ERROR]', ...args),
};

// Replace all console.log with logger.debug
```

**Note:** `next.config.ts` already has `removeConsole: true` for production ✓

---

## 🔍 SECURITY BEST PRACTICES VIOLATIONS

### 10. No Input Validation
**Files:** Multiple file upload handlers lack validation

**Missing:**
- File size limits
- File type validation (beyond extension check)
- Content-Type verification
- Malware scanning hooks

**Recommendation:**
```typescript
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['text/plain', 'application/pdf', 'image/png', 'image/jpeg'];

function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'File too large (max 10MB)' };
  }
  
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: 'File type not allowed' };
  }
  
  // Check file signature (magic bytes)
  // ...
  
  return { valid: true };
}
```

---

### 11. No Rate Limiting
**Missing:** Rate limiting on critical operations

**Add rate limiting for:**
- Biometric registration attempts
- Device pairing requests
- Document signing operations
- QR code generation

**Recommendation:**
```typescript
class RateLimiter {
  private attempts = new Map<string, number[]>();
  
  checkLimit(key: string, maxAttempts: number, windowMs: number): boolean {
    const now = Date.now();
    const attempts = this.attempts.get(key) || [];
    
    // Remove old attempts
    const recent = attempts.filter(t => now - t < windowMs);
    
    if (recent.length >= maxAttempts) {
      return false; // Rate limited
    }
    
    recent.push(now);
    this.attempts.set(key, recent);
    return true;
  }
}

// Usage
const limiter = new RateLimiter();
if (!limiter.checkLimit(`biometric:${userId}`, 5, 60000)) {
  throw new Error('Too many attempts. Try again in 1 minute.');
}
```

---

### 12. Weak Random Number Generation Fallback
**File:** `src/lib/pairing/qr-pairing.ts` - Lines 60-62

```typescript
// Fallback for build-time
for (let i = 0; i < 32; i++) {
  challengeBytes[i] = Math.floor(Math.random() * 256); // ❌ WEAK
}
```

**Issue:** Math.random() is NOT cryptographically secure

**Fix:**
```typescript
function generateSecureRandom(length: number): Uint8Array {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint8Array(length));
  }
  
  // If crypto is not available, FAIL SECURELY
  throw new Error('Cryptographically secure random number generation not available');
}
```

---

## 🚀 PERFORMANCE ISSUES

### 13. Missing IndexedDB Indexes
**File:** `src/lib/db/offline.ts`

**Current indexes:**
- `synced`, `timestamp`, `hash` (documents)
- `documentId`, `synced`, `timestamp` (signatures)

**Missing indexes for common queries:**
- `documents.name` - For document search
- `documents.metadata.tags` - For filtering
- `activity.userId` - For user-specific activity

**Fix:**
```typescript
request.onupgradeneeded = (event) => {
  const db = (event.target as IDBOpenDBRequest).result;
  
  if (!db.objectStoreNames.contains('documents')) {
    const documentsStore = db.createObjectStore('documents', { keyPath: 'id' });
    documentsStore.createIndex('synced', 'synced', { unique: false });
    documentsStore.createIndex('timestamp', 'timestamp', { unique: false });
    documentsStore.createIndex('hash', 'hash', { unique: false });
    documentsStore.createIndex('name', 'name', { unique: false }); // ✓ Add
  }
};
```

---

### 14. No Bundle Size Optimization
**Issue:** Large dependencies imported without tree-shaking

**Examples:**
- Entire `lucide-react` library imported
- Full `framer-motion` for simple animations

**Fix:**
```typescript
// Before
import { Shield, Lock, Key } from 'lucide-react';

// After - import only what you need
import Shield from 'lucide-react/dist/esm/icons/shield';
import Lock from 'lucide-react/dist/esm/icons/lock';
```

Already configured in `next.config.ts` ✓:
```typescript
experimental: {
  optimizePackageImports: ['lucide-react', 'framer-motion'],
}
```

---

### 15. Memory Leaks - Event Listeners
**Potential Issues:** WebSocket connections, Speech Recognition not cleaned up

**File:** `src/lib/voice/commands.ts`

**Missing cleanup:**
```typescript
export function stopVoiceCommands(): void {
  if (recognition) {
    recognition.stop();
    isListening = false;
    
    // ❌ MISSING: Remove event listeners
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
  }
}
```

---

## ✅ POSITIVE FINDINGS

### What's Done Well:
1. ✅ **Strict TypeScript** enabled in `tsconfig.json`
2. ✅ **Security Headers** properly configured in `next.config.ts`
3. ✅ **PWA Support** with proper service worker caching
4. ✅ **Error Boundaries** implemented
5. ✅ **WebAuthn** implementation follows best practices
6. ✅ **Console removal** in production build
7. ✅ **Merkle Tree** audit logging is solid
8. ✅ **Crypto agility** framework is well-designed

---

## 📋 PRIORITIZED FIX LIST

### Must Fix Before Launch (P0):
1. ✅ Update Next.js to 15.4.7+
2. ✅ Migrate localStorage to encrypted IndexedDB
3. ✅ Add DOMPurify for XSS protection
4. ✅ Implement signature verification in device pairing

### Should Fix Soon (P1):
5. ✅ Complete push notification handlers
6. ✅ Implement proper API sync
7. ✅ Fix weak random number generation fallback
8. ✅ Add input validation for file uploads

### Nice to Have (P2):
9. ⚠️ Replace `any` types with proper types
10. ⚠️ Add rate limiting
11. ⚠️ Fix memory leaks in event listeners
12. ⚠️ Add IndexedDB indexes for performance

### Long-term Improvements (P3):
13. 📝 Implement proper logging system
14. 📝 Add comprehensive error handling
15. 📝 Bundle size optimization

---

## 🛠️ IMPLEMENTATION PLAN

### Week 1: Critical Security Fixes
**Day 1:** Update Next.js, test thoroughly  
**Day 2-3:** Migrate localStorage to encrypted IndexedDB  
**Day 4:** Add DOMPurify XSS protection  
**Day 5:** Implement ed25519 signature verification  

### Week 2: High Priority Issues
**Day 1-2:** Complete push notification handlers  
**Day 3:** Implement API sync  
**Day 4:** Add input validation  
**Day 5:** Fix cryptographic fallbacks  

### Week 3: Code Quality
**Day 1-2:** TypeScript type improvements  
**Day 3:** Add rate limiting  
**Day 4:** Memory leak fixes  
**Day 5:** Code review and testing  

---

## 📊 RISK ASSESSMENT

| Issue | Severity | Exploitability | Impact | Priority |
|-------|----------|----------------|--------|----------|
| Next.js vulns | HIGH | HIGH | HIGH | P0 |
| localStorage | HIGH | MEDIUM | HIGH | P0 |
| XSS in editor | HIGH | MEDIUM | HIGH | P0 |
| Missing sig verify | HIGH | LOW | HIGH | P0 |
| Incomplete handlers | MEDIUM | LOW | MEDIUM | P1 |
| Type safety | LOW | LOW | MEDIUM | P2 |
| Console logs | LOW | HIGH | LOW | P3 |

---

## ✅ READY TO PROCEED

**All critical issues identified and documented.**  
**No blockers for implementing new features once P0 items are fixed.**

**Recommendation:** Fix P0 issues (1-4) first, then proceed with feature additions in parallel with P1 fixes.

---

*Audit completed: October 18, 2025*
