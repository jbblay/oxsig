// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { bedrockToolName, buildConverseRequest, createBedrockProvider, extractConverseResult } from './bedrock';

const credentials = async () => ({ accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret', sessionToken: 'token' });
const schema = {
  type: 'object',
  properties: { summary: { type: 'string' } },
  required: ['summary'],
  additionalProperties: false,
};
const request = { name: 'lab.analysis', instructions: 'Be precise.', input: 'nmap output', schema, maxOutputTokens: 900 };

function converseResponse(content: unknown[], stopReason = 'tool_use', status = 200) {
  return new Response(JSON.stringify({ output: { message: { role: 'assistant', content } }, stopReason }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Bedrock Converse request', () => {
  it('forces the structured schema as the only tool', () => {
    const { toolName, body } = buildConverseRequest(request);
    expect(toolName).toBe('lab_analysis');
    expect(body.system).toEqual([{ text: 'Be precise.' }]);
    expect(body.messages).toEqual([{ role: 'user', content: [{ text: 'nmap output' }] }]);
    expect(body.inferenceConfig).toEqual({ maxTokens: 900 });
    expect(body.toolConfig.toolChoice).toEqual({ tool: { name: 'lab_analysis' } });
    expect(body.toolConfig.tools[0].toolSpec.inputSchema).toEqual({ json: schema });
  });

  it('produces valid Bedrock tool names', () => {
    expect(bedrockToolName('a.b c/d')).toBe('a_b_c_d');
    expect(bedrockToolName('x'.repeat(80))).toHaveLength(64);
    expect(bedrockToolName('')).toBe('structured_result');
  });
});

describe('Bedrock provider', () => {
  it('is unconfigured until a model id is set', () => {
    expect(createBedrockProvider({ env: {} }).configured()).toBe(false);
    expect(createBedrockProvider({ env: { OXSIG_BEDROCK_MODEL_ID: 'eu.amazon.nova-lite-v1:0' } }).configured()).toBe(true);
  });

  it('sends a SigV4-signed Converse call to the regional runtime endpoint and returns the tool input', async () => {
    const fetchImpl = vi.fn(async () => converseResponse([{ toolUse: { toolUseId: 't1', name: 'lab_analysis', input: { summary: 'ok' } } }]));
    const provider = createBedrockProvider({
      credentials,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: { OXSIG_BEDROCK_MODEL_ID: 'eu.amazon.nova-lite-v1:0', OXSIG_BEDROCK_REGION: 'eu-central-1' },
    });

    await expect(provider.generateStructured(request)).resolves.toEqual({ summary: 'ok' });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('https://bedrock-runtime.eu-central-1.amazonaws.com/model/eu.amazon.nova-lite-v1%3A0/converse');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/eu-central-1\/bedrock\/aws4_request/);
    expect(init.headers['x-amz-security-token']).toBe('token');
    expect(init.headers.host).toBeUndefined();
    expect(JSON.parse(String(init.body)).toolConfig.toolChoice).toEqual({ tool: { name: 'lab_analysis' } });
  });

  it('reports AWS errors without leaking request details', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ message: 'You do not have access to the model' }), {
      status: 403,
      headers: { 'x-amzn-errortype': 'AccessDeniedException:http://internal.amazon.com/' },
    }));
    const provider = createBedrockProvider({
      credentials,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: { OXSIG_BEDROCK_MODEL_ID: 'model' },
    });

    await expect(provider.generateStructured(request)).rejects.toThrow('AccessDeniedException: You do not have access to the model (403)');
  });

  it('fails clearly when unconfigured', async () => {
    await expect(createBedrockProvider({ env: {} }).generateStructured(request)).rejects.toThrow(/OXSIG_BEDROCK_MODEL_ID/);
  });
});

describe('extractConverseResult', () => {
  it('accepts JSON text when a model answers without calling the tool', () => {
    expect(extractConverseResult(
      { output: { message: { content: [{ text: 'Here you go: {"summary":"text"}' }] } }, stopReason: 'end_turn' },
      'lab_analysis'
    )).toEqual({ summary: 'text' });
  });

  it('rejects truncated output', () => {
    expect(() => extractConverseResult({ stopReason: 'max_tokens', output: { message: { content: [] } } }, 'x'))
      .toThrow(/max tokens/);
  });

  it('rejects empty output', () => {
    expect(() => extractConverseResult({ output: { message: { content: [] } } }, 'x')).toThrow(/no usable response/);
  });
});
