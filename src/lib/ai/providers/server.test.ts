import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateStructured: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('./openai', () => ({
  openAiProvider: {
    id: 'openai',
    configured: () => true,
    model: () => 'test-model',
    generateStructured: mocks.generateStructured,
  },
}));

import {
  AiRequestCancelledError,
  AiRequestTimeoutError,
  generateStructuredAi,
} from './server';

const request = {
  name: 'test_response',
  instructions: 'Return a structured result.',
  input: 'hello',
  schema: { type: 'object' },
};

describe('structured AI request lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    delete process.env.OXSIG_AI_PROVIDER;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a normal provider result and supplies a live abort signal', async () => {
    mocks.generateStructured.mockResolvedValue({ answer: 'ok' });

    await expect(generateStructuredAi(request, { timeoutMs: 1000 })).resolves.toEqual({ answer: 'ok' });
    expect(mocks.generateStructured).toHaveBeenCalledTimes(1);
    const providerRequest = mocks.generateStructured.mock.calls[0][0];
    expect(providerRequest.signal).toBeInstanceOf(AbortSignal);
    expect(providerRequest.signal.aborted).toBe(false);
  });

  it('aborts provider work and reports a distinct timeout at the configured deadline', async () => {
    vi.useFakeTimers();
    let providerSignal: AbortSignal | undefined;
    mocks.generateStructured.mockImplementation((providerRequest) => {
      providerSignal = providerRequest.signal;
      return new Promise((_resolve, reject) => {
        providerSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
    });

    const pending = generateStructuredAi(request, { timeoutMs: 25 });
    const rejection = expect(pending).rejects.toBeInstanceOf(AiRequestTimeoutError);
    await vi.advanceTimersByTimeAsync(25);
    await rejection;

    expect(providerSignal?.aborted).toBe(true);
  });

  it('preserves ordinary provider failures instead of mislabelling them as timeouts', async () => {
    mocks.generateStructured.mockRejectedValue(new Error('network unavailable'));

    await expect(generateStructuredAi(request, { timeoutMs: 1000 })).rejects.toThrow('network unavailable');
  });

  it('propagates caller cancellation and aborts the provider signal', async () => {
    const controller = new AbortController();
    let providerSignal: AbortSignal | undefined;
    mocks.generateStructured.mockImplementation((providerRequest) => {
      providerSignal = providerRequest.signal;
      return new Promise((_resolve, reject) => {
        providerSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
    });

    const pending = generateStructuredAi(request, { signal: controller.signal, timeoutMs: 1000 });
    const rejection = expect(pending).rejects.toBeInstanceOf(AiRequestCancelledError);
    controller.abort();
    await rejection;

    expect(providerSignal?.aborted).toBe(true);
  });
});
