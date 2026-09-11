export function normalizeSentryDsn(raw: string | null | undefined): string | null {
  const value = String(raw || '').trim();
  if (!value) return null;

  try {
    const dsn = new URL(value);
    const projectId = dsn.pathname.split('/').filter(Boolean).pop();

    if (
      !['http:', 'https:'].includes(dsn.protocol) ||
      !dsn.hostname ||
      !dsn.username ||
      !/^\d+$/.test(projectId || '') ||
      dsn.search ||
      dsn.hash
    ) {
      return null;
    }

    return value;
  } catch {
    return null;
  }
}
