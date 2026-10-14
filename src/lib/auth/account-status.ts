export const ACCOUNT_SUSPENDED_CODE = 'ACCOUNT_SUSPENDED';

/** Thrown during identity resolution when a platform admin has paused the account. */
export class AccountSuspendedError extends Error {
  readonly code = ACCOUNT_SUSPENDED_CODE;

  constructor(readonly reason: string | null = null) {
    super('Account suspended');
    this.name = 'AccountSuspendedError';
  }
}

export function isAccountSuspendedError(error: unknown): error is AccountSuspendedError {
  return error instanceof AccountSuspendedError ||
    (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === ACCOUNT_SUSPENDED_CODE);
}
