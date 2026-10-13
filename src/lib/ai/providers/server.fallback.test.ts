import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openai: vi.fn(),
  bedrock: vi.fn(),
  openaiConfigured: true,
  bedrockConfigured: true,
}));

vi.mock('server-only', () => ({}));
vi.mock('./openai', () => ({
  openAiProvider: {
    id: 'openai',
    configured: () => mocks.openaiConfigured,
    model: () => 'openai-model',
    generateStructured: mocks.openai,
  },
}));
vi.mock('./bedrock', () => ({
  bedrockProvider: {
    id: 'bedrock',
    configured: () => mocks.bedrockConfigured,
    model: () => 'bedrock-model',
    generateStructured: mocks.bedrock,
  },
}));

import { aiProviderConfigured, generateStructuredAi } from './server';

const request = { name: 'test', instructions: 'i', input: 'x', schema: { type: 'object' } };

describe('AI provider selection and fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openaiConfigured = true;
    mocks.bedrockConfigured = true;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete process.env.OXSIG_AI_PROVIDER;
    delete process.env.OXSIG_AI_FALLBACK_PROVIDER;
    vi.restoreAllMocks();
  });

  it('defaults to OpenAI so existing deployments are unchanged', async () => {
    mocks.openai.mockResolvedValue({ from: 'openai' });
    await expect(generateStructuredAi(request)).resolves.toEqual({ from: 'openai' });
    expect(mocks.bedrock).not.toHaveBeenCalled();
  });

  it('routes to Bedrock when selected', async () => {
    process.env.OXSIG_AI_PROVIDER = 'bedrock';
    mocks.bedrock.mockResolvedValue({ from: 'bedrock' });
    await expect(generateStructuredAi(request)).resolves.toEqual({ from: 'bedrock' });
    expect(mocks.openai).not.toHaveBeenCalled();
  });

  it('falls back to the secondary provider when the primary fails', async () => {
    process.env.OXSIG_AI_PROVIDER = 'bedrock';
    process.env.OXSIG_AI_FALLBACK_PROVIDER = 'openai';
    mocks.bedrock.mockRejectedValue(new Error('ThrottlingException'));
    mocks.openai.mockResolvedValue({ from: 'openai' });

    await expect(generateStructuredAi(request)).resolves.toEqual({ from: 'openai' });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('"provider":"bedrock"'));
  });

  it('surfaces the last error when every provider fails', async () => {
    process.env.OXSIG_AI_PROVIDER = 'bedrock';
    process.env.OXSIG_AI_FALLBACK_PROVIDER = 'openai';
    mocks.bedrock.mockRejectedValue(new Error('bedrock down'));
    mocks.openai.mockRejectedValue(new Error('openai down'));
    await expect(generateStructuredAi(request)).rejects.toThrow('openai down');
  });

  it('uses the fallback directly when the primary is not configured', async () => {
    process.env.OXSIG_AI_PROVIDER = 'bedrock';
    process.env.OXSIG_AI_FALLBACK_PROVIDER = 'openai';
    mocks.bedrockConfigured = false;
    mocks.openai.mockResolvedValue({ from: 'openai' });

    expect(aiProviderConfigured()).toBe(true);
    await expect(generateStructuredAi(request)).resolves.toEqual({ from: 'openai' });
    expect(mocks.bedrock).not.toHaveBeenCalled();
  });

  it('does not fall back after cancellation', async () => {
    process.env.OXSIG_AI_PROVIDER = 'bedrock';
    process.env.OXSIG_AI_FALLBACK_PROVIDER = 'openai';
    const controller = new AbortController();
    mocks.bedrock.mockImplementation(async () => {
      controller.abort();
      throw new Error('aborted');
    });

    await expect(generateStructuredAi(request, { signal: controller.signal })).rejects.toMatchObject({ code: 'AI_REQUEST_CANCELLED' });
    expect(mocks.openai).not.toHaveBeenCalled();
  });
});
