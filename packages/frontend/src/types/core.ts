// ============================================================================
// IDENTITY & DID TYPES
// ============================================================================

export interface DIDDocument {
  "@context": string[];
  id: string; // did:icp:canister-id:subaccount
  controller: string[];
  verificationMethod: VerificationMethod[];
  authentication: string[];
  assertionMethod: string[];
  keyAgreement: string[];
  capabilityInvocation: string[];
  capabilityDelegation: string[];
  service: ServiceEndpoint[];
  created: string;
  updated: string;
  metadata?: DIDMetadata;
}

export interface VerificationMethod {
  id: string;
  type: string; // "Dilithium2", "Kyber512", "Ed25519", etc.
  controller: string;
  publicKeyMultibase?: string;
  publicKeyJwk?: JsonWebKey;
}

export interface ServiceEndpoint {
  id: string;
  type: string;
  serviceEndpoint: string | Record<string, unknown>;
  description?: string;
}

export interface DIDMetadata {
  created: string;
  updated: string;
  deactivated?: boolean;
  versionId: string;
  recoveryCommitment?: string;
}

// ============================================================================
// VERIFIABLE CREDENTIALS
// ============================================================================

export interface VerifiableCredential {
  "@context": string[];
  id: string;
  type: string[];
  issuer: string | IssuerObject;
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: CredentialSubject;
  credentialStatus?: CredentialStatus;
  proof: Proof[];
  termsOfUse?: TermsOfUse[];
  refreshService?: RefreshService;
}

export interface CredentialSubject {
  id: string; // DID of subject
  [key: string]: unknown;
}

export interface IssuerObject {
  id: string;
  name?: string;
  description?: string;
}

export interface Proof {
  type: string; // "BbsBlsSignature2020", "DilithiumSignature2023"
  created: string;
  verificationMethod: string;
  proofPurpose: string;
  proofValue: string;
  challenge?: string;
  domain?: string;
}

export interface CredentialStatus {
  id: string;
  type: string; // "RevocationList2023"
  statusListIndex: string;
  statusListCredential: string;
}

export interface TermsOfUse {
  type: string;
  id?: string;
  profile?: string;
  prohibition?: Prohibition[];
}

export interface Prohibition {
  assigner: string;
  assignee: string;
  target: string;
  action: string[];
}

export interface RefreshService {
  id: string;
  type: string;
}

// ============================================================================
// SELECTIVE DISCLOSURE
// ============================================================================

export interface SelectiveDisclosureRequest {
  credentialId: string;
  requestedAttributes: string[];
  purpose: string;
  verifier: string; // DID
  challenge: string;
}

export interface SelectiveDisclosureResponse {
  presentationId: string;
  holder: string; // DID
  verifiableCredential: VerifiableCredential[];
  proof: Proof;
  disclosedAttributes: Record<string, unknown>;
  zkProof?: ZKProof;
}

// ============================================================================
// MESSAGING TYPES
// ============================================================================

export interface SecureMessage {
  id: string;
  version: string;
  type: MessageType;
  sender: string; // DID
  recipients: string[]; // DIDs
  onionLayers: OnionLayer[];
  payload: EncryptedPayload;
  ephemeralConfig?: EphemeralConfig;
  zkProof?: ZKProof;
  timestamp: number;
  signature: PostQuantumSignature;
  metadata: MessageMetadata;
}

export type MessageType = "text" | "file" | "ephemeral" | "stealth" | "group";

export interface OnionLayer {
  nodeId: string;
  encryptedNext: string;
  mac: string;
  delay?: number; // milliseconds
}

export interface EncryptedPayload {
  ciphertext: string;
  nonce: string;
  algorithm: string; // "Kyber512-AES256-GCM"
  encapsulatedKey: string;
}

export interface EphemeralConfig {
  ttl: number; // seconds
  viewLimit: number;
  destructAfterRead: boolean;
  notifyOnView: boolean;
  selfDestruct: Date;
}

export interface MessageMetadata {
  threadId?: string;
  replyTo?: string;
  forwardedFrom?: string;
  edited?: boolean;
  reactions?: Reaction[];
}

export interface Reaction {
  emoji: string;
  userId: string; // DID
  timestamp: number;
}

// ============================================================================
// SIGNATURE TYPES
// ============================================================================

export interface SmartSignature {
  id: string;
  version: string;
  documentHash: string;
  documentMetadata: DocumentMetadata;
  signer: string; // DID
  context: SignatureContext;
  biometric?: BiometricProof;
  location?: EncryptedLocation;
  timestamp: number;
  consentProof: ConsentProof;
  chainAnchors: ChainAnchor[];
  ipfsCid: string;
  duressFlag?: boolean;
  signature: HybridSignature;
  auditTrail: AuditEntry[];
}

export interface DocumentMetadata {
  name: string;
  mimeType: string;
  size: number;
  hash: string;
  hashAlgorithm: string;
  encryptionKey?: string; // encrypted with signer's public key
}

export interface SignatureContext {
  purpose: string;
  jurisdiction?: string;
  legalFramework?: string;
  witnesses?: string[]; // DIDs
  notary?: string; // DID
  contractTerms?: string;
}

export interface BiometricProof {
  type: string; // "fingerprint", "face", "voice"
  template: string; // encrypted template
  confidence: number;
  deviceInfo: string;
  timestamp: number;
}

export interface EncryptedLocation {
  ciphertext: string;
  encryptedFor: string; // DID
}

export interface ConsentProof {
  consentId: string;
  grantor: string; // DID
  purpose: string;
  scope: string[];
  timestamp: number;
  zkProof: ZKProof;
}

export interface ChainAnchor {
  chain: "icp" | "ethereum" | "solana" | "polygon";
  transactionHash: string;
  blockNumber: number;
  timestamp: number;
  merkleProof?: string[];
}

export interface HybridSignature {
  pqSignature: string; // Dilithium3
  classicSignature: string; // ECDSA secp256k1
  zkProof?: string; // Optional ZK proof of signature validity
  hashCommitment: string;
}

export interface AuditEntry {
  action: string;
  actor: string; // DID
  timestamp: number;
  details: Record<string, unknown>;
  signature: string;
}

// ============================================================================
// CONSENT LEDGER TYPES
// ============================================================================

export interface ConsentRecord {
  id: string;
  version: string;
  grantor: string; // DID
  grantee: string; // DID
  purpose: string;
  scope: string[];
  conditions: ConsentConditions;
  timestamp: number;
  expiresAt: number;
  revocable: boolean;
  revoked?: boolean;
  revokedAt?: number;
  zkProof: ZKProof;
  onChainAnchor: ChainAnchor;
  auditTrail: AuditEntry[];
}

export interface ConsentConditions {
  dataCategories: string[];
  allowedOperations: string[];
  geographicRestrictions?: string[];
  timeLimits?: TimeLimit[];
  dataSharingLimits?: DataSharingLimit[];
  automaticRevocation?: AutoRevocation[];
}

export interface TimeLimit {
  startTime: Date;
  endTime: Date;
  timezone: string;
}

export interface DataSharingLimit {
  maxRecipients: number;
  allowedRecipients?: string[]; // DIDs
  prohibitedRecipients?: string[]; // DIDs
}

export interface AutoRevocation {
  condition: string;
  action: string;
}

// ============================================================================
// ZERO-KNOWLEDGE PROOF TYPES
// ============================================================================

export interface ZKProof {
  type: string; // "groth16", "plonk", "bulletproof"
  circuit: string;
  proof: string;
  publicSignals: string[];
  verificationKey?: string;
}

export interface ZKAuthProof {
  commitment: string;
  nullifier: string;
  proof: ZKProof;
  merkleRoot: string;
}

export interface ZKRangeProof {
  commitment: string;
  proof: string;
  range: [number, number];
}

// ============================================================================
// POST-QUANTUM CRYPTOGRAPHY TYPES
// ============================================================================

export interface PostQuantumSignature {
  algorithm: string; // "Dilithium3", "SPHINCS+-SHA256"
  signature: string;
  publicKey: string;
  timestamp: number;
}

export interface PostQuantumKeyPair {
  publicKey: string;
  privateKey: string;
  algorithm: string;
  created: number;
  expiresAt?: number;
}

export interface HybridKeyExchange {
  classicECDH: string;
  kyberEncapsulation: string;
  sharedSecret: string; // derived from both
}

// ============================================================================
// THRESHOLD CRYPTOGRAPHY TYPES
// ============================================================================

export interface ThresholdConfig {
  threshold: number; // m
  total: number; // n
  shares: KeyShare[];
}

export interface KeyShare {
  id: string;
  share: string;
  holder: string; // DID
  created: number;
}

export interface ThresholdSignature {
  partialSignatures: PartialSignature[];
  combinedSignature: string;
  threshold: number;
  participants: string[]; // DIDs
}

export interface PartialSignature {
  shareId: string;
  signature: string;
  signer: string; // DID
  timestamp: number;
}

// ============================================================================
// AI SECURITY TYPES
// ============================================================================

export interface ThreatDetection {
  id: string;
  type: ThreatType;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  timestamp: number;
  affectedEntities: string[]; // DIDs or resource IDs
  indicators: ThreatIndicator[];
  recommendation: string;
  automated: boolean;
}

export type ThreatType =
  | "phishing"
  | "malware"
  | "social_engineering"
  | "data_exfiltration"
  | "unauthorized_access"
  | "anomalous_behavior"
  | "credential_stuffing"
  | "ddos";

export interface ThreatIndicator {
  type: string;
  value: string;
  confidence: number;
  source: string;
}

export interface TrustScore {
  entityId: string; // DID
  score: number; // 0-1000
  components: TrustComponent[];
  history: TrustHistory[];
  lastUpdated: number;
  factors: TrustFactor[];
}

export interface TrustComponent {
  category: string;
  weight: number;
  score: number;
  rationale: string;
}

export interface TrustHistory {
  timestamp: number;
  score: number;
  event: string;
}

export interface TrustFactor {
  name: string;
  impact: number; // -100 to +100
  evidence: string;
}

export interface AICoPilotSuggestion {
  id: string;
  type: "security" | "privacy" | "efficiency" | "warning";
  priority: "low" | "medium" | "high";
  title: string;
  description: string;
  action?: string;
  automated: boolean;
  timestamp: number;
}

// ============================================================================
// STORAGE TYPES
// ============================================================================

export interface IPFSMetadata {
  cid: string;
  size: number;
  encrypted: boolean;
  encryptionAlgorithm?: string;
  pins: Pin[];
  created: number;
  accessControl?: AccessControl;
}

export interface Pin {
  service: "pinata" | "web3storage" | "fleek" | "local";
  pinned: boolean;
  timestamp: number;
}

export interface AccessControl {
  owner: string; // DID
  readers: string[]; // DIDs
  writers: string[]; // DIDs
  zkAccessProof: boolean;
}

// ============================================================================
// TEE TYPES
// ============================================================================

export interface TEEAttestation {
  type: "sgx" | "sev" | "trustzone";
  quote: string;
  measurements: string[];
  timestamp: number;
  verificationReport: string;
}

export interface SecureEnclave {
  enclaveId: string;
  attestation: TEEAttestation;
  operations: string[];
  created: number;
}

// ============================================================================
// DURESS MODE TYPES
// ============================================================================

export interface DuressConfig {
  enabled: boolean;
  duressCode: string; // hashed
  actions: DuressAction[];
  notificationEndpoints: string[];
}

export interface DuressAction {
  type: "wipe" | "alert" | "decoy" | "lockdown";
  target: string;
  delay: number; // milliseconds
  reversible: boolean;
}

export interface DuressEvent {
  id: string;
  timestamp: number;
  triggeredBy: string; // DID
  actionsExecuted: string[];
  alertsSent: string[];
}

// ============================================================================
// MULTI-CHAIN TYPES
// ============================================================================

export interface ChainConfig {
  chain: "icp" | "ethereum" | "solana" | "polygon";
  rpcUrl: string;
  contractAddress?: string;
  canisterId?: string;
  enabled: boolean;
}

export interface CrossChainProof {
  sourceChain: string;
  targetChain: string;
  proof: string;
  merkleRoot: string;
  timestamp: number;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface Result<T, E = Error> {
  ok: boolean;
  value?: T;
  error?: E;
}

export interface AsyncResult<T, E = Error> extends Promise<Result<T, E>> {}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface EncryptedData {
  ciphertext: string;
  nonce: string;
  algorithm: string;
  metadata?: Record<string, unknown>;
}
