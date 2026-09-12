import 'server-only';

import type { StructuredAiProvider, StructuredAiRequest } from './types';

function extractResponseText(payload: any): string {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  const chunks: string[] = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') chunks.push(content.text);
    }
  }
  return chunks.join('\n').trim();
}

function openAiModel() {
  return process.env.OXSIG_AI_MODEL?.trim() || 'gpt-5.4-mini';
}

async function generateStructured<T>(request: StructuredAiRequest): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI is not configured. Set OPENAI_API_KEY on the Oxsig server.');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: openAiModel(),
      store: false,
      instructions: request.instructions,
      input: request.input,
      max_output_tokens: request.maxOutputTokens ?? 1400,
      text: {
        format: {
          type: 'json_schema',
          name: request.name,
          strict: true,
          schema: request.schema,
        },
      },
    }),
    signal: request.signal,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `AI provider request failed (${response.status})`;
    throw new Error(String(message).slice(0, 500));
  }

  const text = extractResponseText(payload);
  if (!text) throw new Error('AI provider returned no usable response');
  return JSON.parse(text) as T;
}

export const openAiProvider: StructuredAiProvider = {
  id: 'openai',
  configured: () => Boolean(process.env.OPENAI_API_KEY),
  model: openAiModel,
  generateStructured,
};
