/**
 * Audit Events Database
 * Persistent storage for audit trail with periodic Merkle commitment
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { AuditEvent, AuditAction, MerkleRoot } from '../audit/audit-log';
import { buildMerkleTree } from '../audit/audit-log';

interface AuditDB extends DBSchema {
  events: {
    key: string;
    value: AuditEvent;
    indexes: {
      'by-actor': string;
      'by-action': AuditAction;
      'by-timestamp': string;
      'by-doc': string;
    };
  };
  // @ts-expect-error - idb type issue with DBSchema indexes
  roots: {
    key: number;
    value: MerkleRoot;
    indexes: {
      'by-committed': boolean;
    };
  };
}

let dbInstance: IDBPDatabase<AuditDB> | null = null;

/**
 * Initialize audit database
 */
async function getDB(): Promise<IDBPDatabase<AuditDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<AuditDB>('oxsig-audit', 1, {
    upgrade(db: any) {
      // Events store
      const eventsStore = db.createObjectStore('events', { keyPath: 'id' });
      eventsStore.createIndex('by-actor', 'actorDid');
      eventsStore.createIndex('by-action', 'action');
      eventsStore.createIndex('by-timestamp', 'ts');
      eventsStore.createIndex('by-doc', 'docHash');

      // Merkle roots store
      const rootsStore = db.createObjectStore('roots', { keyPath: 'periodEnd' });
      rootsStore.createIndex('by-committed', 'committed');
    },
  });

  return dbInstance;
}

/**
 * Log audit event
 */
export async function logAuditEvent(event: AuditEvent): Promise<void> {
  const db = await getDB();
  await db.add('events', event);
  console.log('Audit event logged:', event.action, event.id);
}

/**
 * Get audit event by ID
 */
export async function getAuditEvent(eventId: string): Promise<AuditEvent | undefined> {
  const db = await getDB();
  return await db.get('events', eventId);
}

/**
 * Get all audit events
 */
export async function getAllAuditEvents(): Promise<AuditEvent[]> {
  const db = await getDB();
  return await db.getAll('events');
}

/**
 * Get events by actor
 */
export async function getEventsByActor(actorDid: string): Promise<AuditEvent[]> {
  const db = await getDB();
  const index = db.transaction('events').store.index('by-actor');
  return await index.getAll(actorDid);
}

/**
 * Get events by action
 */
export async function getEventsByAction(action: AuditAction): Promise<AuditEvent[]> {
  const db = await getDB();
  const index = db.transaction('events').store.index('by-action');
  return await index.getAll(action);
}

/**
 * Get events by document hash
 */
export async function getEventsByDocument(docHash: string): Promise<AuditEvent[]> {
  const db = await getDB();
  const index = db.transaction('events').store.index('by-doc');
  return await index.getAll(docHash);
}

/**
 * Get events in time range
 */
export async function getEventsByTimeRange(
  startTs: string,
  endTs: string
): Promise<AuditEvent[]> {
  const db = await getDB();
  const index = db.transaction('events').store.index('by-timestamp');
  const range = IDBKeyRange.bound(startTs, endTs);
  return await index.getAll(range);
}

/**
 * Commit Merkle root for a period
 */
export async function commitMerkleRoot(
  periodStart: number,
  periodEnd: number,
  chainTxHash?: string
): Promise<MerkleRoot> {
  const db = await getDB();
  
  // Get events in period
  const startTs = new Date(periodStart).toISOString();
  const endTs = new Date(periodEnd).toISOString();
  const events = await getEventsByTimeRange(startTs, endTs);

  // Build Merkle tree
  const { root, proofs } = await buildMerkleTree(events);

  // Add proofs to events
  for (const event of events) {
    const proof = proofs.get(event.id);
    if (proof) {
      event.merkleProof = proof;
      await db.put('events', event);
    }
  }

  // Store root
  const merkleRoot: MerkleRoot = {
    root,
    periodStart,
    periodEnd,
    eventCount: events.length,
    committed: !!chainTxHash,
    chainTxHash,
  };

  await db.put('roots', merkleRoot);
  console.log('Merkle root committed:', root.substring(0, 16), '...', events.length, 'events');

  return merkleRoot;
}

/**
 * Get Merkle root for period
 */
export async function getMerkleRoot(periodEnd: number): Promise<MerkleRoot | undefined> {
  const db = await getDB();
  return await db.get('roots', periodEnd);
}

/**
 * Get all Merkle roots
 */
export async function getAllMerkleRoots(): Promise<MerkleRoot[]> {
  const db = await getDB();
  return await db.getAll('roots');
}

/**
 * Get uncommitted Merkle roots
 */
export async function getUncommittedRoots(): Promise<MerkleRoot[]> {
  const db = await getDB();
  const index = db.transaction('roots').store.index('by-committed');
  const keyRange = typeof IDBKeyRange !== 'undefined' ? IDBKeyRange.only(false) : undefined;
  return await index.getAll(keyRange) as MerkleRoot[];
}

/**
 * Mark root as committed on-chain
 */
export async function markRootCommitted(periodEnd: number, txHash: string): Promise<void> {
  const db = await getDB();
  const root = await db.get('roots', periodEnd);
  
  if (root) {
    root.committed = true;
    root.chainTxHash = txHash;
    await db.put('roots', root);
    console.log('Merkle root marked as committed on-chain:', txHash);
  }
}

/**
 * Schedule hourly Merkle commitment
 */
export class AuditCommitmentScheduler {
  private intervalId: number | null = null;

  /**
   * Start hourly commits
   */
  start(): void {
    if (this.intervalId) return;

    // Commit immediately
    this.commitPeriod();

    // Then every hour
    this.intervalId = window.setInterval(() => {
      this.commitPeriod();
    }, 60 * 60 * 1000); // 1 hour

    console.log('Audit commitment scheduler started');
  }

  /**
   * Stop scheduler
   */
  stop(): void {
    if (this.intervalId) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Audit commitment scheduler stopped');
    }
  }

  /**
   * Commit current period
   */
  private async commitPeriod(): Promise<void> {
    try {
      const now = Date.now();
      const hourAgo = now - (60 * 60 * 1000);
      
      await commitMerkleRoot(hourAgo, now);
    } catch (error) {
      console.error('Failed to commit Merkle root:', error);
    }
  }
}

/**
 * Global scheduler instance
 */
export const auditScheduler = new AuditCommitmentScheduler();

/**
 * Initialize audit system
 */
export async function initAuditSystem(): Promise<void> {
  console.log('Initializing audit system...');
  
  // Ensure DB is ready
  await getDB();
  
  // Start periodic commits
  if (typeof window !== 'undefined') {
    auditScheduler.start();
  }
  
  console.log('Audit system initialized');
}

/**
 * Clear all audit data (for testing)
 */
export async function clearAuditData(): Promise<void> {
  const db = await getDB();
  await db.clear('events');
  await db.clear('roots');
  console.log('Audit data cleared');
}
