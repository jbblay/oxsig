/**
 * Offline Operation Queue
 * 
 * Queues operations when offline and replays them when connection returns.
 * Handles create, update, delete operations for documents and signatures.
 */

import { setItem, getAllItems, deleteItem, STORES } from './storage';

export type OperationType = 
  | 'CREATE_DOCUMENT'
  | 'UPDATE_DOCUMENT'
  | 'DELETE_DOCUMENT'
  | 'CREATE_SIGNATURE'
  | 'UPDATE_SIGNATURE'
  | 'DELETE_SIGNATURE';

export type OperationStatus = 'pending' | 'syncing' | 'completed' | 'failed';

export interface QueuedOperation {
  id?: number; // Auto-incremented by IndexedDB
  type: OperationType;
  endpoint: string;
  method: 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  data?: any;
  timestamp: number;
  status: OperationStatus;
  retryCount: number;
  error?: string;
  localId?: string; // Temporary ID for local reference
}

/**
 * Add operation to queue
 */
export async function queueOperation(operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'status' | 'retryCount'>): Promise<number> {
  const queuedOp: QueuedOperation = {
    ...operation,
    timestamp: Date.now(),
    status: 'pending',
    retryCount: 0,
  };

  const db = await (await import('./storage')).initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.QUEUE, 'readwrite');
    const store = transaction.objectStore(STORES.QUEUE);
    const request = store.add(queuedOp);

    request.onsuccess = () => {
      console.log('✅ Operation queued:', operation.type, request.result);
      resolve(request.result as number);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all pending operations
 */
export async function getPendingOperations(): Promise<QueuedOperation[]> {
  const all = await getAllItems<QueuedOperation>(STORES.QUEUE);
  return all.filter(op => op.status === 'pending').sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Update operation status
 */
export async function updateOperationStatus(
  id: number,
  status: OperationStatus,
  error?: string
): Promise<void> {
  const db = await (await import('./storage')).initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.QUEUE, 'readwrite');
    const store = transaction.objectStore(STORES.QUEUE);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const operation = getRequest.result;
      if (!operation) {
        reject(new Error('Operation not found'));
        return;
      }

      operation.status = status;
      if (error) operation.error = error;
      if (status === 'syncing') operation.retryCount++;

      const updateRequest = store.put(operation);
      updateRequest.onsuccess = () => resolve();
      updateRequest.onerror = () => reject(updateRequest.error);
    };

    getRequest.onerror = () => reject(getRequest.error);
  });
}

/**
 * Delete operation from queue
 */
export async function deleteOperation(id: number): Promise<void> {
  const db = await (await import('./storage')).initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.QUEUE, 'readwrite');
    const store = transaction.objectStore(STORES.QUEUE);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear completed operations (older than 24 hours)
 */
export async function clearCompletedOperations(): Promise<void> {
  const all = await getAllItems<QueuedOperation>(STORES.QUEUE);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago

  const toDelete = all.filter(
    op => op.status === 'completed' && op.timestamp < cutoff
  );

  await Promise.all(toDelete.map(op => op.id ? deleteOperation(op.id) : Promise.resolve()));
  
  console.log(`🧹 Cleared ${toDelete.length} completed operations`);
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
  pending: number;
  syncing: number;
  completed: number;
  failed: number;
  total: number;
}> {
  const all = await getAllItems<QueuedOperation>(STORES.QUEUE);

  return {
    pending: all.filter(op => op.status === 'pending').length,
    syncing: all.filter(op => op.status === 'syncing').length,
    completed: all.filter(op => op.status === 'completed').length,
    failed: all.filter(op => op.status === 'failed').length,
    total: all.length,
  };
}

/**
 * Helper to create document operation
 */
export async function queueDocumentCreate(document: any): Promise<number> {
  return queueOperation({
    type: 'CREATE_DOCUMENT',
    endpoint: '/api/documents',
    method: 'POST',
    data: document,
    localId: document.id || `local-${Date.now()}`,
  });
}

/**
 * Helper to update document operation
 */
export async function queueDocumentUpdate(id: string, updates: any): Promise<number> {
  return queueOperation({
    type: 'UPDATE_DOCUMENT',
    endpoint: `/api/documents/${id}`,
    method: 'PUT',
    data: updates,
    localId: id,
  });
}

/**
 * Helper to delete document operation
 */
export async function queueDocumentDelete(id: string): Promise<number> {
  return queueOperation({
    type: 'DELETE_DOCUMENT',
    endpoint: `/api/documents/${id}`,
    method: 'DELETE',
    localId: id,
  });
}

/**
 * Helper to create signature operation
 */
export async function queueSignatureCreate(signature: any): Promise<number> {
  return queueOperation({
    type: 'CREATE_SIGNATURE',
    endpoint: '/api/signatures',
    method: 'POST',
    data: signature,
    localId: signature.id || `local-sig-${Date.now()}`,
  });
}

/**
 * Check if operation should be retried
 */
export function shouldRetry(operation: QueuedOperation, maxRetries = 3): boolean {
  return operation.retryCount < maxRetries && operation.status === 'failed';
}
