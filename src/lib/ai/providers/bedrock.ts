import 'server-only';

import { awsErrorMessage, signedAwsJsonRequest, type AwsCredentialProvider } from '@/lib/aws/signed-request';
import type { StructuredAiProvider, StructuredAiRequest } from './types';

/**
 * Amazon Bedrock adapter (Converse API).
 *
 * Structured output: the JSON schema is offered as the single tool and the
 * model is forced to call it (`toolChoice.tool`), so the tool input *is* the
 * structured result. Callers still validate results with their own zod
 * schemas, exactly as with the OpenAI adapter.
 *
 * Configuration (no defaults for the model: choose one enabled in the account):
 *   OXSIG_BEDROCK_MODEL_ID  model or inference-profile id, e.g. an `eu.` cross-region profile
 *   OXSIG_BEDROCK_REGION    defaults to AWS_REGION, then eu-central-1
 */
export function bedrockRegion(env: Record<string, string | undefined> = process.env) {
  return env.OXSIG_BEDROCK_REGION?.trim() || env.AWS_REGION?.trim() || 'eu-central-1';
}

export function bedrockModelId(env: Record<string, string | undefined> = process.env) {
  return env.OXSIG_BEDROCK_MODEL_ID?.trim() || '';
}

/** Bedrock tool names must match ^[a-zA-Z0-9_-]{1,64}$. */
export function bedrockToolName(name: string) {
  const cleaned = name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return cleaned || 'structured_result';
}

export function buildConverseRequest(request: StructuredAiRequest) {
  const toolName = bedrockToolName(request.name);
  return {
    toolName,
    body: {
      system: [{ text: request.instructions }],
      messages: [{ role: 'user', content: [{ text: request.input }] }],
      inferenceConfig: { maxTokens: request.maxOutputTokens ?? 1400 },
      toolConfig: {
        tools: [{
          toolSpec: {
            name: toolName,
            description: `Return the ${request.name} result. Always respond by calling this tool with arguments that satisfy the schema.`,
            inputSchema: { json: request.schema },
          },
        }],
        toolChoice: { tool: { name: toolName } },
      },
    },
  };
}

type ConverseContentBlock = { text?: string; toolUse?: { name?: string; input?: unknown } };

export function extractConverseResult<T>(payload: any, toolName: string): T {
  if (payload?.stopReason === 'max_tokens') {
    throw new Error('AI provider stopped before completing the structured response (max tokens)');
  }
  const content: ConverseContentBlock[] = Array.isArray(payload?.output?.message?.content)
    ? payload.output.message.content
    : [];
  const toolUse = content.find((block) => block?.toolUse && (!block.toolUse.name || block.toolUse.name === toolName))?.toolUse;
  if (toolUse && toolUse.input && typeof toolUse.input === 'object') return toolUse.input as T;

  // Some models answer with JSON text despite the tool contract.
  const text = content.map((block) => block?.text || '').join('\n').trim();
  if (text) {
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (json) return JSON.parse(json) as T;
  }
  throw new Error('AI provider returned no usable response');
}

export function createBedrockProvider(options: {
  credentials?: AwsCredentialProvider;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
} = {}): StructuredAiProvider {
  const env = () => options.env ?? process.env;

  async function generateStructured<T>(request: StructuredAiRequest): Promise<T> {
    const modelId = bedrockModelId(env());
    if (!modelId) throw new Error('Amazon Bedrock is not configured. Set OXSIG_BEDROCK_MODEL_ID on the Oxsig server.');
    const region = bedrockRegion(env());
    const { toolName, body } = buildConverseRequest(request);

    const response = await signedAwsJsonRequest({
      service: 'bedrock',
      region,
      hostname: `bedrock-runtime.${region}.amazonaws.com`,
      path: `/model/${encodeURIComponent(modelId)}/converse`,
      body,
      signal: request.signal,
      credentials: options.credentials,
      fetchImpl: options.fetchImpl,
    });

    if (!response.ok) {
      throw new Error(await awsErrorMessage(response, 'AI provider request failed'));
    }
    return extractConverseResult<T>(await response.json(), toolName);
  }

  return {
    id: 'bedrock',
    configured: () => Boolean(bedrockModelId(env())),
    model: () => bedrockModelId(env()),
    generateStructured,
  };
}

export const bedrockProvider = createBedrockProvider();
