export type StructuredAiRequest = {
  name: string;
  instructions: string;
  input: string;
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
};

export type StructuredAiProvider = {
  id: string;
  configured: () => boolean;
  model: () => string;
  generateStructured: <T>(request: StructuredAiRequest) => Promise<T>;
};
