function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function sanitizePostgresText(value: string): string {
  return value.replace(/\u0000/g, '\\0');
}

export function sanitizePostgresJsonValue<T>(value: T): T {
  if (typeof value === 'string') return sanitizePostgresText(value) as T;
  if (Array.isArray(value)) return value.map((item) => sanitizePostgresJsonValue(item)) as T;
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizePostgresJsonValue(item)])
    ) as T;
  }
  return value;
}

export function stringifyPostgresJson(value: unknown): string {
  return JSON.stringify(sanitizePostgresJsonValue(value));
}

function sanitizePossiblySerializedJson(value: string): string {
  const hasActualNull = value.includes('\u0000');
  const hasJsonNullEscape = value.includes('\\u0000');
  if (!hasActualNull && !hasJsonNullEscape) return value;

  const parseCandidate = hasActualNull ? value.replace(/\u0000/g, '\\u0000') : value;
  try {
    return stringifyPostgresJson(JSON.parse(parseCandidate));
  } catch {
    return sanitizePostgresText(value);
  }
}

export function sanitizePostgresParameter<T>(value: T): T {
  if (typeof value === 'string') return sanitizePossiblySerializedJson(value) as T;
  if (Array.isArray(value)) return value.map((item) => sanitizePostgresParameter(item)) as T;
  if (isPlainObject(value)) return sanitizePostgresJsonValue(value);
  return value;
}

export function sanitizePostgresParameters(values?: readonly unknown[]): unknown[] | undefined {
  return values?.map((value) => sanitizePostgresParameter(value));
}
