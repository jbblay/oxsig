import 'server-only';

import { openAiProvider } from './openai';
import type { StructuredAiProvider, StructuredAiRequest } from './types';

const PROVIDERS: Record<string, StructuredAiProvider> = {
  openai: openAiProvider,
};

export const DEFAULT_AI_REQUEST_TIMEOUT_MS = 45_000;
const MAX_AI_REQUEST_TIMEOUT_MS = 120_000;

export class AiRequestTimeoutError extends Error {
  readonly code = 'AI_REQUEST_TIMEOUT';

  constructor(readonly timeoutMs: number) {
    super('AI request timed out');
    this.name = 'AiRequestTimeoutError';
  }
}

export class AiRequestCancelledError extends Error {
  readonly code = 'AI_REQUEST_CANCELLED';

  constructor() {
    super('AI request was cancelled');
    this.name = 'AiRequestCancelledError';
  }
}

export type StructuredAiGenerationOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

function boundedTimeoutMs(value: number | undefined) {
  if (value === undefined) return DEFAULT_AI_REQUEST_TIMEOUT_MS;
  if (!Number.isFinite(value) || value <= 0) throw new Error('AI request timeout must be a positive finite number');
  return Math.min(value, MAX_AI_REQUEST_TIMEOUT_MS);
}

export function activeAiProviderId() {
  return process.env.OXSIG_AI_PROVIDER?.trim().toLowerCase() || 'openai';
}

export function getStructuredAiProvider(): StructuredAiProvider {
  const id = activeAiProviderId();
  const provider = PROVIDERS[id];
  if (!provider) {
    throw new Error(`Unsupported Oxsig AI provider: ${id}`);
  }
  return provider;
}

export function aiProviderConfigured() {
  try {
    return getStructuredAiProvider().configured();
  } catch {
    return false;
  }
}

export function aiProviderModel() {
  try {
    return getStructuredAiProvider().model();
  } catch {
    return null;
  }
}

export async function generateStructuredAi<T>(
  request: StructuredAiRequest,
  options: StructuredAiGenerationOptions = {}
): Promise<T> {
  const timeoutMs = boundedTimeoutMs(options.timeoutMs);
  const controller = new AbortController();
  const externalSignal = options.signal ?? request.signal;

  if (externalSignal?.aborted) throw new AiRequestCancelledError();

  let timeout: ReturnType<typeof setTimeout> | undefined;
  let onExternalAbort: (() => void) | undefined;
  let deadlineExceeded = false;

  const lifecycleFailure = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      deadlineExceeded = true;
      controller.abort();
      reject(new AiRequestTimeoutError(timeoutMs));
    }, timeoutMs);

    if (externalSignal) {
      onExternalAbort = () => {
        controller.abort();
        reject(new AiRequestCancelledError());
      };
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  });

  try {
    return await Promise.race([
      getStructuredAiProvider().generateStructured<T>({ ...request, signal: controller.signal }),
      lifecycleFailure,
    ]);
  } catch (error) {
    if (deadlineExceeded) throw new AiRequestTimeoutError(timeoutMs);
    if (error instanceof AiRequestTimeoutError || error instanceof AiRequestCancelledError) throw error;
    if (externalSignal?.aborted) throw new AiRequestCancelledError();
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    if (externalSignal && onExternalAbort) externalSignal.removeEventListener('abort', onExternalAbort);
  }
}
