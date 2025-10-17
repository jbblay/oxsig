# OxSig Backend Logic & Implementation Guide

## 🎯 Core Business Logic - What Makes OxSig Useful

### 1. Smart Signature System

**The Problem It Solves:**
- Traditional signatures are easy to forge
- No proof of consent conditions
- Can't verify WHO signed WHEN under WHAT context
- No quantum-resistance (future-proofing)

**OxSig Solution:**
```
User signs document
    ↓
1. Capture biometric proof (fingerprint/face)
2. Record GPS location (encrypted)
3. Generate quantum-resistant signature (Dilithium-3)
4. Add zero-knowledge proof (privacy-preserving)
5. Anchor to blockchain (ICP + Ethereum)
6. Store encrypted document (IPFS)
7. Create immutable audit trail
    ↓
Result: Legally binding, verifiable, tamper-proof signature
```

**Data Sources:**
```typescript
// Where data comes from:
{
  // FROM USER DEVICE
  biometric: "Device fingerprint scanner",
  location: "Browser Geolocation API (encrypted)",
  timestamp: "Device clock (verified by blockchain)",
  
  // FROM BLOCKCHAIN
  did: "Internet Identity (ICP)",
  blockchainAnchor: "ICP/Ethereum transaction hash",
  
  // FROM CRYPTOGRAPHY
  signature: "Post-quantum algorithm (Dilithium-3)",
  zkProof: "Zero-knowledge circuit (Circom/SnarkJS)",
  
  // FROM IPFS
  documentHash: "SHA-256 hash of uploaded file",
  ipfsCid: "IPFS content identifier"
}
```

---

### 2. Consent Ledger

**The Problem:**
- GDPR requires proof of consent
- Consent can be withdrawn anytime
- Need audit trail of ALL consent changes
- Selective disclosure (share only what's needed)

**OxSig Solution:**
```
User gives consent for data use
    ↓
1. Record WHO (DID), WHAT (data categories), WHY (purpose)
2. Set CONDITIONS (time limit, geographic restrictions)
3. Generate zero-knowledge proof (prove consent without revealing data)
4. Store on blockchain (immutable record)
5. Allow instant revocation
    ↓
Result: GDPR-compliant, verifiable consent management
```

**Data Sources:**
```typescript
{
  // FROM USER INPUT
  grantor: "User's DID",
  grantee: "Organization's DID",
  purpose: "Marketing emails",
  scope: ["email", "name"],
  
  // FROM SYSTEM
  timestamp: "When consent was given",
  expiresAt: "Auto-revocation date",
  
  // FROM BLOCKCHAIN
  onChainAnchor: "ICP transaction proving consent exists",
  
  // FROM CRYPTOGRAPHY
  zkProof: "Proof of consent without revealing identity"
}
```

---

### 3. Decentralized Identity (DID)

**The Problem:**
- Passwords are insecure and stolen
- Centralized auth (Google, Facebook) tracks users
- Need to prove identity without revealing personal info

**OxSig Solution:**
```
User creates identity
    ↓
1. Generate DID (did:icp:alice...7a2b)
2. Create key pairs (Ed25519 + Dilithium-3)
3. Issue verifiable credentials (KYC, licenses)
4. Enable selective disclosure (share only age, not birthdate)
    ↓
Result: Self-sovereign identity, privacy-preserving verification
```

**Data Sources:**
```typescript
{
  // FROM USER SETUP
  did: "Generated from Internet Identity principal",
  publicKeys: "Ed25519 + Kyber512 (quantum-resistant)",
  
  // FROM CREDENTIAL ISSUERS
  credentials: [
    {
      issuer: "TrustedID",
      type: "KYCVerification",
      attributes: { age: "over18", country: "US" }
    }
  ],
  
  // FROM BLOCKCHAIN
  didDocument: "Stored on ICP for global resolution",
  
  // FROM USAGE
  trustScore: "AI-calculated based on behavior"
}
```

---

## 🔧 Implementation Architecture

### Data Flow Example: Signing a Document

```typescript
// ============================================
// FRONTEND (Next.js)
// ============================================

// 1. User uploads document
const handleSign = async (file: File) => {
  // A. Hash the document
  const documentHash = await crypto.subtle.digest(
    'SHA-256',
    await file.arrayBuffer()
  );
  
  // B. Get user's DID from Internet Identity
  const identity = await AuthClient.create();
  const principal = identity.getIdentity().getPrincipal();
  const did = `did:icp:${principal.toText()}`;
  
  // C. Request biometric proof (if available)
  const biometric = await navigator.credentials.get({
    publicKey: { challenge: new Uint8Array(32) }
  });
  
  // D. Get encrypted location
  const position = await navigator.geolocation.getCurrentPosition();
  const encryptedLocation = await encryptLocation(position);
  
  // E. Send to backend canister
  const signature = await signatureVault.createSignature({
    documentHash,
    did,
    biometric,
    location: encryptedLocation,
    context: "legal",
    duressMode: false
  });
  
  return signature;
};

// ============================================
// BACKEND (ICP Motoko Canister)
// ============================================

// icp/actors/SignatureVault.mo
actor SignatureVault {
  import Principal "mo:base/Principal";
  import Time "mo:base/Time";
  import Hash "mo:base/Hash";
  import Array "mo:base/Array";
  
  // Storage for signatures
  stable var signatures : [(Text, Signature)] = [];
  
  type Signature = {
    id: Text;
    documentHash: Text;
    signer: Principal;
    timestamp: Time.Time;
    biometric: ?Blob;
    location: ?Blob;
    context: Text;
    pqSignature: Text; // Post-quantum signature
    classicSignature: Text; // ECDSA signature
    zkProof: ?Text;
    ipfsCid: Text;
    chainAnchors: [ChainAnchor];
    auditTrail: [AuditEntry];
  };
  
  type ChainAnchor = {
    chain: Text;
    transactionHash: Text;
    blockNumber: Nat;
    timestamp: Time.Time;
  };
  
  type AuditEntry = {
    action: Text;
    actor: Principal;
    timestamp: Time.Time;
    details: Text;
  };
  
  public shared(msg) func createSignature(
    documentHash: Text,
    biometric: ?Blob,
    location: ?Blob,
    context: Text
  ) : async Result<Signature, Text> {
    
    // 1. Verify caller identity
    let caller = msg.caller;
    if (Principal.isAnonymous(caller)) {
      return #err("Must be authenticated");
    };
    
    // 2. Generate quantum-resistant signature
    let pqSig = await generateDilithiumSignature(documentHash);
    
    // 3. Generate classic signature (hybrid approach)
    let classicSig = await generateECDSASignature(documentHash);
    
    // 4. Create zero-knowledge proof
    let zkProof = await generateZKProof({
      statement: "I possess the private key for DID",
      witness: caller,
    });
    
    // 5. Store document on IPFS
    let ipfsCid = await storeOnIPFS(documentHash);
    
    // 6. Anchor to blockchain
    let anchor : ChainAnchor = {
      chain = "icp";
      transactionHash = await anchorToICP(documentHash);
      blockNumber = await getBlockNumber();
      timestamp = Time.now();
    };
    
    // 7. Create signature record
    let signature : Signature = {
      id = generateId();
      documentHash;
      signer = caller;
      timestamp = Time.now();
      biometric;
      location;
      context;
      pqSignature = pqSig;
      classicSignature = classicSig;
      zkProof = ?zkProof;
      ipfsCid;
      chainAnchors = [anchor];
      auditTrail = [{
        action = "signature_created";
        actor = caller;
        timestamp = Time.now();
        details = context;
      }];
    };
    
    // 8. Store signature
    signatures := Array.append(signatures, [(signature.id, signature)]);
    
    return #ok(signature);
  };
  
  // Verify a signature
  public query func verifySignature(
    signatureId: Text
  ) : async Result<Bool, Text> {
    switch (Array.find(signatures, func(s: (Text, Signature)): Bool { s.0 == signatureId })) {
      case null { #err("Signature not found") };
      case (?sig) {
        // Verify quantum signature
        let pqValid = verifyDilithium(sig.1.pqSignature);
        
        // Verify classic signature
        let classicValid = verifyECDSA(sig.1.classicSignature);
        
        // Verify blockchain anchor
        let anchorValid = verifyChainAnchor(sig.1.chainAnchors[0]);
        
        // Verify ZK proof
        let zkValid = switch(sig.1.zkProof) {
          case null { true };
          case (?proof) { verifyZKProof(proof) };
        };
        
        #ok(pqValid and classicValid and anchorValid and zkValid)
      };
    };
  };
  
  // Helper functions (to be implemented)
  func generateId() : Text { "sig_" # Int.toText(Time.now()) };
  func generateDilithiumSignature(hash: Text) : async Text { "dilithium_sig" };
  func generateECDSASignature(hash: Text) : async Text { "ecdsa_sig" };
  func generateZKProof(data: Any) : async Text { "zk_proof" };
  func storeOnIPFS(hash: Text) : async Text { "Qm..." };
  func anchorToICP(hash: Text) : async Text { "tx_hash" };
  func getBlockNumber() : async Nat { 12345 };
  func verifyDilithium(sig: Text) : Bool { true };
  func verifyECDSA(sig: Text) : Bool { true };
  func verifyChainAnchor(anchor: ChainAnchor) : Bool { true };
  func verifyZKProof(proof: Text) : Bool { true };
}
```

---

## 📊 Data Sources Summary

| Data Type | Source | How to Get It |
|-----------|--------|---------------|
| **User Identity** | Internet Identity (ICP) | `AuthClient.create()` |
| **Biometric** | Device sensors | `navigator.credentials.get()` |
| **Location** | GPS | `navigator.geolocation.getCurrentPosition()` |
| **Document Hash** | Cryptography | `crypto.subtle.digest('SHA-256', file)` |
| **Signatures** | Post-quantum algorithms | External library (tweetnacl, dilithium.js) |
| **Zero-Knowledge Proofs** | ZK circuits | Circom + SnarkJS |
| **Blockchain Anchors** | ICP/Ethereum | `@dfinity/agent`, `ethers.js` |
| **IPFS Storage** | IPFS network | `ipfs-http-client`, Pinata API |
| **Timestamps** | Blockchain | `Time.now()` in Motoko |
| **Trust Scores** | AI analysis | Federated learning model on device |

---

## 🗂️ Key Implementation Files

```
oxsig/
├── icp/actors/
│   ├── SignatureVault.mo      # Creates & verifies signatures
│   ├── ConsentLedger.mo        # Manages consent records
│   ├── DIDRegistry.mo          # Stores DID documents
│   └── ZKProofVerifier.mo      # Verifies zero-knowledge proofs
│
├── src/lib/
│   ├── crypto/
│   │   ├── dilithium.ts        # Post-quantum signatures
│   │   ├── zk-proofs.ts        # Zero-knowledge proofs
│   │   └── hybrid-sig.ts       # Combines PQ + classic
│   ├── identity/
│   │   ├── did-manager.ts      # DID operations
│   │   └── internet-identity.ts # ICP auth
│   └── storage/
│       └── ipfs.ts             # Document storage
│
└── src/app/api/
    ├── signature/create/route.ts  # Bridge to SignatureVault
    ├── consent/update/route.ts    # Bridge to ConsentLedger
    └── identity/resolve/route.ts  # Bridge to DIDRegistry
```

---

## 🚀 Implementation Phases

### Phase 1: Identity & Authentication
1. Set up Internet Identity integration
2. Create DID Registry canister
3. Implement DID document creation/resolution
4. Add key management (Ed25519 + Dilithium-3)

### Phase 2: Signature System
1. Create SignatureVault canister
2. Implement post-quantum signature generation
3. Add biometric capture (WebAuthn API)
4. Integrate IPFS for document storage
5. Add blockchain anchoring (ICP + Ethereum)

### Phase 3: Consent Management
1. Create ConsentLedger canister
2. Implement consent record creation
3. Add selective disclosure
4. Enable consent revocation
5. Generate compliance reports

### Phase 4: Zero-Knowledge Proofs
1. Set up Circom circuits
2. Create ZKProofVerifier canister
3. Implement proof generation (client-side)
4. Add proof verification (on-chain)

### Phase 5: AI Security
1. Integrate threat detection model
2. Calculate trust scores
3. Add anomaly detection
4. Implement predictive security

---

## 🔐 Security Considerations

### Encryption at Rest
- All documents encrypted with AES-256
- Keys stored in user's Internet Identity
- Never store plaintext on-chain

### Encryption in Transit
- TLS 1.3 for all communications
- ICP uses HTTPS by default
- End-to-end encryption for P2P messages

### Key Management
- Hardware-backed keys (TPM, Secure Enclave)
- Key rotation every 90 days
- Multi-signature for critical operations
- Quantum-resistant algorithms (Dilithium-3, Kyber512)

### Privacy
- Zero-knowledge proofs for verification
- Selective disclosure of credentials
- Encrypted location data
- No metadata leakage

---

## 📚 Required Dependencies

### Frontend (Next.js)
```json
{
  "@dfinity/agent": "^0.21.0",
  "@dfinity/auth-client": "^0.21.0",
  "@dfinity/identity": "^0.21.0",
  "ipfs-http-client": "^60.0.0",
  "tweetnacl": "^1.0.3",
  "snarkjs": "^0.7.0",
  "ethers": "^6.0.0"
}
```

### Backend (ICP)
```
// dfx.json dependencies
mo:base
mo:crypto
mo:encoding
```

---

## 🎯 Next Steps

1. **Create Motoko canisters** with full logic
2. **Set up Internet Identity** authentication
3. **Implement crypto libraries** (Dilithium, ZK proofs)
4. **Build IPFS integration**
5. **Create complete data flow** from frontend to blockchain

---

**Document Version:** 1.0  
**Last Updated:** October 16, 2025  
**Author:** OxSig Development Team
