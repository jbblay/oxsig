import type { LabInstanceStatus } from './types';

export type LabLifecycleAction = 'start' | 'stop' | 'destroy';

export type LifecycleValidation =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Validate a requested lifecycle transition before calling AWS.
 *
 * AWS remains the runtime source of truth, but the application should reject
 * impossible or unsafe transitions instead of relying on EC2 to return a
 * provider-specific error. In particular, expired stopped labs must never be
 * restarted because their temporary session has ended.
 */
export function validateLabLifecycleAction(
  status: LabInstanceStatus,
  action: LabLifecycleAction,
  expiresAt?: string | Date | null,
  now = new Date()
): LifecycleValidation {
  if (status === 'destroyed') {
    return { ok: false, status: 410, error: 'This lab has already been destroyed.' };
  }

  if (status === 'destroying') {
    return { ok: false, status: 409, error: 'This lab is already being destroyed.' };
  }

  if (action === 'destroy') return { ok: true };

  if (action === 'start') {
    if (expiresAt) {
      const expiry = new Date(expiresAt).getTime();
      if (Number.isFinite(expiry) && expiry <= now.getTime()) {
        return { ok: false, status: 410, error: 'This lab session has expired and cannot be restarted.' };
      }
    }

    if (status !== 'stopped') {
      return {
        ok: false,
        status: 409,
        error: `A lab can only be started from stopped state. Current state: ${status}.`,
      };
    }

    return { ok: true };
  }

  if (status !== 'running') {
    return {
      ok: false,
      status: 409,
      error: `A lab can only be stopped from running state. Current state: ${status}.`,
    };
  }

  return { ok: true };
}
