export type AiRequestPhase =
  | 'idle'
  | 'preparing'
  | 'generating'
  | 'completed'
  | 'failed'
  | 'timed-out'
  | 'cancelled';

export type AiRequestFailurePhase = 'failed' | 'timed-out' | 'cancelled';

export type AiRequestHistoryItem = {
  role: 'user' | 'assistant';
  content: string;
};

export type AiRetrySnapshot = {
  requestId: string;
  userLineId: string;
  prompt: string;
  history: AiRequestHistoryItem[];
  createdAt: number;
  lastFailure?: AiRequestFailurePhase;
};

export class AiResponseError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = 'AiResponseError';
  }
}

const RETRY_MAX_AGE_MS = 30 * 60 * 1000;

function storageKey(identityId: string) {
  return `oxsig:ai-helper-retry:v1:${encodeURIComponent(identityId)}`;
}

function isHistoryItem(value: unknown): value is AiRequestHistoryItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string';
}

function isFailurePhase(value: unknown): value is AiRequestFailurePhase {
  return value === 'failed' || value === 'timed-out' || value === 'cancelled';
}

function isRetrySnapshot(value: unknown): value is AiRetrySnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Record<string, unknown>;
  return typeof snapshot.requestId === 'string'
    && typeof snapshot.userLineId === 'string'
    && typeof snapshot.prompt === 'string'
    && snapshot.prompt.length > 0
    && Array.isArray(snapshot.history)
    && snapshot.history.every(isHistoryItem)
    && typeof snapshot.createdAt === 'number'
    && (snapshot.lastFailure === undefined || isFailurePhase(snapshot.lastFailure));
}

export function saveAiRetrySnapshot(identityId: string | null, snapshot: AiRetrySnapshot) {
  if (!identityId || typeof window === 'undefined') return;
  window.sessionStorage.setItem(storageKey(identityId), JSON.stringify(snapshot));
}

export function loadAiRetrySnapshot(identityId: string | null): AiRetrySnapshot | null {
  if (!identityId || typeof window === 'undefined') return null;
  const key = storageKey(identityId);
  const raw = window.sessionStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRetrySnapshot(parsed) || Date.now() - parsed.createdAt > RETRY_MAX_AGE_MS) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    window.sessionStorage.removeItem(key);
    return null;
  }
}

export function clearAiRetrySnapshot(identityId: string | null) {
  if (!identityId || typeof window === 'undefined') return;
  window.sessionStorage.removeItem(storageKey(identityId));
}

export async function readAiResponseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as { error?: unknown; code?: unknown };
  const message = typeof body.error === 'string' && body.error.trim() ? body.error : fallback;
  const code = typeof body.code === 'string' ? body.code : undefined;
  return new AiResponseError(message, response.status, code);
}

export function classifyAiRequestError(error: unknown, signal?: AbortSignal): AiRequestFailurePhase {
  if (signal?.aborted) return 'cancelled';
  if (error instanceof AiResponseError) {
    if (error.code === 'AI_REQUEST_TIMEOUT') return 'timed-out';
    if (error.code === 'AI_REQUEST_CANCELLED') return 'cancelled';
  }
  if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
  if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
  return 'failed';
}

export function aiRequestFailureLabel(phase: AiRequestPhase) {
  if (phase === 'timed-out') return 'Request timed out';
  if (phase === 'cancelled') return 'Request cancelled';
  return 'Request failed';
}
