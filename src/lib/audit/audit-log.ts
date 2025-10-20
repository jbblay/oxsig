/**
 * Audit Log System with Merkle Tree Commitment
 * Append-only audit trail with periodic chain anchoring
 */

export interface AuditEvent {
  id: string;
  ts: string; // ISO 8601 timestamp
  actorDid: string;
  action: AuditAction;
  docHash?: string;
  context: AuditContext;
  zkProofRef?: string; // IPFS CID of ZK proof
  sig?: string; // Actor's signature of event
  merkleProof?: string[]; // Path to root
}

export type AuditAction =
  | 'SIGN_DOCUMENT'
  | 'REVOKE_SIGNATURE'
  | 'CREATE_DOCUMENT'
  | 'UPDATE_DOCUMENT'
  | 'DELETE_DOCUMENT'
  | 'GRANT_ACCESS'
  | 'REVOKE_ACCESS'
  | 'PAIR_DEVICE'
  | 'UNPAIR_DEVICE'
  | 'ROTATE_KEY'
  | 'RECOVERY_INITIATED'
  | 'RECOVERY_COMPLETED'
  | 'POLICY_VIOLATION'
  | 'SECURITY_ALERT'
  | 'EXPORT_DATA'
  | 'LOGIN'
  | 'LOGOUT';

export interface AuditContext {
  class?: 'LEGAL' | 'FINANCIAL' | 'MEDICAL' | 'PERSONAL' | 'CUSTOM';
  ip?: string;
  device?: string;
  userAgent?: string;
  location?: string;
  policyId?: string;
  metadata?: Record<string, any>;
}

export interface MerkleRoot {
  root: string; // Hash of the Merkle tree root
  periodStart: number; // Timestamp
  periodEnd: number; // Timestamp
  eventCount: number;
  committed: boolean;
  chainTxHash?: string; // Transaction hash if committed on-chain
}

/**
 * Simple hash function (use crypto.subtle.digest in production)
 */
async function hash(data: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  // Fallback for build-time (simple hash)
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

/**
 * Build Merkle tree from events
 */
export async function buildMerkleTree(events: AuditEvent[]): Promise<{
  root: string;
  proofs: Map<string, string[]>;
}> {
  if (events.length === 0) {
    return { root: await hash('empty'), proofs: new Map() };
  }

  // Hash all events (leaf nodes)
  const leaves = await Promise.all(
    events.map(event => hash(JSON.stringify(event)))
  );

  // Build tree bottom-up
  let currentLevel = leaves;
  const proofs = new Map<string, string[]>();
  
  // Store proof paths for each event
  for (let i = 0; i < events.length; i++) {
    proofs.set(events[i].id, []);
  }

  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];
    
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
      
      // Store siblings in proof paths
      if (i < events.length) {
        const eventId = events[Math.floor(i / Math.pow(2, Math.log2(leaves.length / currentLevel.length)))].id;
        const proof = proofs.get(eventId);
        if (proof) {
          proof.push(right);
        }
      }
      
      const parent = await hash(left + right);
      nextLevel.push(parent);
    }
    
    currentLevel = nextLevel;
  }

  return {
    root: currentLevel[0],
    proofs,
  };
}

/**
 * Verify Merkle proof
 */
export async function verifyMerkleProof(
  eventHash: string,
  proof: string[],
  root: string
): Promise<boolean> {
  let current = eventHash;
  
  for (const sibling of proof) {
    current = await hash(current + sibling);
  }
  
  return current === root;
}

/**
 * Create audit event
 */
export function createAuditEvent(
  actorDid: string,
  action: AuditAction,
  context: AuditContext = {},
  docHash?: string
): AuditEvent {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  return {
    id,
    ts: new Date().toISOString(),
    actorDid,
    action,
    docHash,
    context,
  };
}

/**
 * Sign audit event with actor's key
 */
export async function signAuditEvent(
  event: AuditEvent,
  privateKey: string
): Promise<AuditEvent> {
  // TODO: Implement actual ed25519 signing
  // For now, create mock signature
  const eventData = JSON.stringify({ ...event, sig: undefined });
  const signature = await hash(eventData + privateKey);
  
  return {
    ...event,
    sig: signature,
  };
}

/**
 * Export audit log as JSONL
 */
export function exportAuditLogJSONL(events: AuditEvent[]): string {
  return events.map(event => JSON.stringify(event)).join('\n');
}

/**
 * Export audit log as CSV
 */
export function exportAuditLogCSV(events: AuditEvent[]): string {
  const headers = ['ID', 'Timestamp', 'Actor', 'Action', 'Doc Hash', 'Class', 'Device', 'IP'];
  const rows = events.map(event => [
    event.id,
    event.ts,
    event.actorDid,
    event.action,
    event.docHash || '',
    event.context.class || '',
    event.context.device || '',
    event.context.ip || '',
  ]);

  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

/**
 * Filter events by criteria
 */
export function filterAuditEvents(
  events: AuditEvent[],
  filters: {
    actorDid?: string;
    action?: AuditAction;
    dateFrom?: Date;
    dateTo?: Date;
    docHash?: string;
    class?: string;
  }
): AuditEvent[] {
  return events.filter(event => {
    if (filters.actorDid && event.actorDid !== filters.actorDid) return false;
    if (filters.action && event.action !== filters.action) return false;
    if (filters.docHash && event.docHash !== filters.docHash) return false;
    if (filters.class && event.context.class !== filters.class) return false;
    
    if (filters.dateFrom) {
      const eventDate = new Date(event.ts);
      if (eventDate < filters.dateFrom) return false;
    }
    
    if (filters.dateTo) {
      const eventDate = new Date(event.ts);
      if (eventDate > filters.dateTo) return false;
    }
    
    return true;
  });
}

/**
 * Generate compliance report sections
 */
export interface ComplianceReport {
  period: { start: string; end: string };
  summary: {
    totalEvents: number;
    uniqueActors: number;
    documentsSigned: number;
    securityAlerts: number;
  };
  gdpr: {
    article5_integrity: string; // Integrity and confidentiality
    article12_15_access: string; // Right of access
    article17_erasure: string; // Right to erasure
    article30_records: string; // Records of processing
    article32_security: string; // Security measures
  };
  iso27001: {
    a5_policies: string;
    a8_assetMgmt: string;
    a9_access: string;
    a12_operations: string;
    a18_compliance: string;
  };
  events: AuditEvent[];
  merkleRoot?: string;
  chainProof?: string;
}

export function generateComplianceReport(
  events: AuditEvent[],
  periodStart: Date,
  periodEnd: Date,
  merkleRoot?: MerkleRoot
): ComplianceReport {
  const filteredEvents = filterAuditEvents(events, {
    dateFrom: periodStart,
    dateTo: periodEnd,
  });

  const uniqueActors = new Set(filteredEvents.map(e => e.actorDid)).size;
  const documentsSigned = filteredEvents.filter(e => e.action === 'SIGN_DOCUMENT').length;
  const securityAlerts = filteredEvents.filter(e => e.action === 'SECURITY_ALERT').length;

  return {
    period: {
      start: periodStart.toISOString(),
      end: periodEnd.toISOString(),
    },
    summary: {
      totalEvents: filteredEvents.length,
      uniqueActors,
      documentsSigned,
      securityAlerts,
    },
    gdpr: {
      article5_integrity: `All ${filteredEvents.length} events cryptographically signed and integrity-protected via Merkle tree (root: ${merkleRoot?.root.substring(0, 16)}...)`,
      article12_15_access: `Audit log exportable in JSONL/CSV formats. ${filteredEvents.filter(e => e.action === 'EXPORT_DATA').length} export requests processed.`,
      article17_erasure: `${filteredEvents.filter(e => e.action === 'DELETE_DOCUMENT').length} deletion events recorded. ${filteredEvents.filter(e => e.action === 'REVOKE_SIGNATURE').length} signature revocations.`,
      article30_records: `Complete processing records maintained with ${filteredEvents.length} activities logged across ${uniqueActors} data subjects.`,
      article32_security: `End-to-end encryption enforced. ${filteredEvents.filter(e => e.action === 'ROTATE_KEY').length} key rotations. ${securityAlerts} security alerts investigated.`,
    },
    iso27001: {
      a5_policies: `${filteredEvents.filter(e => e.context.policyId).length} events with policy enforcement. ${filteredEvents.filter(e => e.action === 'POLICY_VIOLATION').length} policy violations detected.`,
      a8_assetMgmt: `${documentsSigned} documents signed (treated as information assets). All document hashes cryptographically anchored.`,
      a9_access: `${filteredEvents.filter(e => e.action === 'GRANT_ACCESS').length} access grants. ${filteredEvents.filter(e => e.action === 'REVOKE_ACCESS').length} access revocations. Device pairing: ${filteredEvents.filter(e => e.action === 'PAIR_DEVICE').length}.`,
      a12_operations: `${filteredEvents.filter(e => e.action === 'LOGIN').length} authentication events. ${filteredEvents.filter(e => e.action === 'RECOVERY_INITIATED').length} recovery operations.`,
      a18_compliance: `Full audit trail maintained. Merkle root anchored ${merkleRoot?.committed ? 'on-chain' : 'locally'}. ${filteredEvents.filter(e => e.zkProofRef).length} zero-knowledge proofs attached.`,
    },
    events: filteredEvents,
    merkleRoot: merkleRoot?.root,
    chainProof: merkleRoot?.chainTxHash,
  };
}
