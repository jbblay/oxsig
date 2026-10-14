import 'server-only';

import { bedrockProvider } from './bedrock';
import { openAiProvider } from './openai';
import type { StructuredAiProvider, StructuredAiRequest } from './types';

const PROVIDERS: Record<string, StructuredAiProvider> = {
  openai: openAiProvider,
  bedrock: bedrockProvider,
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

/**
 * Optional secondary provider used when the primary fails (not on timeout or
 * cancellation). Enables incremental cutover, e.g. OXSIG_AI_PROVIDER=bedrock
 * with OXSIG_AI_FALLBACK_PROVIDER=openai, and instant rollback by env change.
 */
export function fallbackAiProviderId() {
  const id = process.env.OXSIG_AI_FALLBACK_PROVIDER?.trim().toLowerCase();
  return id && id !== activeAiProviderId() && PROVIDERS[id] ? id : null;
}

function providerChain(): StructuredAiProvider[] {
  const primary = getStructuredAiProvider();
  const fallbackId = fallbackAiProviderId();
  const fallback = fallbackId ? PROVIDERS[fallbackId] : null;
  const usable = [primary, fallback].filter(
    (provider): provider is StructuredAiProvider => Boolean(provider && provider.configured())
  );
  // Nothing configured: call the primary so it reports its own configuration error.
  return usable.length ? usable : [primary];
}

function logAiAttempt(entry: { provider: string; model: string; ms: number; ok: boolean; fallback: boolean; error?: string }) {
  // One structured line per attempt (CloudWatch Logs Insights / Vercel logs friendly).
  console.warn(JSON.stringify({ event: 'oxsig.ai.request', ...entry }));
}

async function generateWithProviders<T>(request: StructuredAiRequest, signal: AbortSignal): Promise<T> {
  const chain = providerChain();
  let lastError: unknown;
  for (const [index, provider] of chain.entries()) {
    const started = Date.now();
    try {
      const result = await provider.generateStructured<T>({ ...request, signal });
      if (chain.length > 1) logAiAttempt({ provider: provider.id, model: provider.model(), ms: Date.now() - started, ok: true, fallback: index > 0 });
      return result;
    } catch (error) {
      lastError = error;
      if (signal.aborted || index === chain.length - 1) throw error;
      logAiAttempt({
        provider: provider.id,
        model: provider.model(),
        ms: Date.now() - started,
        ok: false,
        fallback: index > 0,
        error: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
      });
    }
  }
  throw lastError;
}

export function aiProviderConfigured() {
  try {
    if (getStructuredAiProvider().configured()) return true;
    const fallbackId = fallbackAiProviderId();
    return Boolean(fallbackId && PROVIDERS[fallbackId].configured());
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
      generateWithProviders<T>(request, controller.signal),
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
