function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export class InvalidPostgresJsonKeyError extends Error {
  constructor() {
    super('JSON object keys must not contain NUL characters.');
    this.name = 'InvalidPostgresJsonKeyError';
  }
}

function assertJsonKey(key: string): void {
  if (key.includes('\u0000')) throw new InvalidPostgresJsonKeyError();
}

export function sanitizePostgresText(value: string): string {
  return value.replace(/\u0000/g, '\\0');
}

export function sanitizePostgresJsonValue<T>(value: T): T {
  if (typeof value === 'string') return sanitizePostgresText(value) as T;
  if (Array.isArray(value)) return value.map((item) => sanitizePostgresJsonValue(item)) as T;
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        assertJsonKey(key);
        return [key, sanitizePostgresJsonValue(item)];
      })
    ) as T;
  }
  return value;
}

/** Serialize JSON explicitly; never infer JSON from a text parameter's contents. */
export function stringifyPostgresJson(value: unknown): string {
  return JSON.stringify(value, (key, item: unknown) => {
    assertJsonKey(key);
    return typeof item === 'string' ? sanitizePostgresText(item) : item;
  });
}

export function sanitizePostgresParameter<T>(value: T): T {
  if (typeof value === 'string') return sanitizePostgresText(value) as T;
  if (Array.isArray(value)) return value.map((item) => sanitizePostgresParameter(item)) as T;
  if (isPlainObject(value)) return sanitizePostgresJsonValue(value);
  return value;
}

export function sanitizePostgresParameters(values?: readonly unknown[]): unknown[] | undefined {
  return values?.map((value) => sanitizePostgresParameter(value));
}
