import { beforeEach, describe, expect, it } from 'vitest';
import {
  AiResponseError,
  classifyAiRequestError,
  clearAiRetrySnapshot,
  loadAiRetrySnapshot,
  saveAiRetrySnapshot,
  type AiRetrySnapshot,
} from './client-request';

const identity = 'user_test_1';
const snapshot: AiRetrySnapshot = {
  requestId: '11111111-1111-4111-8111-111111111111',
  userLineId: 'line-1',
  prompt: 'Explain copy-on-write',
  history: [{ role: 'user', content: 'Explain copy-on-write' }],
  createdAt: Date.now(),
};

describe('AI helper retry state', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('preserves and restores the exact prompt and retry context for one account', () => {
    saveAiRetrySnapshot(identity, snapshot);

    expect(loadAiRetrySnapshot(identity)).toEqual(snapshot);
    expect(loadAiRetrySnapshot('another-user')).toBeNull();
  });

  it('clears transient retry state after successful completion', () => {
    saveAiRetrySnapshot(identity, snapshot);
    clearAiRetrySnapshot(identity);

    expect(loadAiRetrySnapshot(identity)).toBeNull();
  });

  it('distinguishes timeout, provider failure, and cancellation', () => {
    expect(classifyAiRequestError(new AiResponseError('timed out', 504, 'AI_REQUEST_TIMEOUT'))).toBe('timed-out');
    expect(classifyAiRequestError(new Error('provider failed'))).toBe('failed');

    const controller = new AbortController();
    controller.abort();
    expect(classifyAiRequestError(new Error('fetch failed'), controller.signal)).toBe('cancelled');
  });
});
