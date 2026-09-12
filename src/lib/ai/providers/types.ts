export type StructuredAiRequest = {
  name: string;
  instructions: string;
  input: string;
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

export type StructuredAiProvider = {
  id: string;
  configured: () => boolean;
  model: () => string;
  generateStructured: <T>(request: StructuredAiRequest) => Promise<T>;
};
