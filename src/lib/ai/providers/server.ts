import 'server-only';

import { openAiProvider } from './openai';
import type { StructuredAiProvider, StructuredAiRequest } from './types';

const PROVIDERS: Record<string, StructuredAiProvider> = {
  openai: openAiProvider,
};

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

export async function generateStructuredAi<T>(request: StructuredAiRequest): Promise<T> {
  return getStructuredAiProvider().generateStructured<T>(request);
}
