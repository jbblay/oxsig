export function sanitizePostgresText(value: string): string {
  return value.replace(/\u0000/g, '\\0');
}

export function stringifyPostgresJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => (
    typeof item === 'string' ? sanitizePostgresText(item) : item
  ));
}
