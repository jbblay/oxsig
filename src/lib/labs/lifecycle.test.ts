import { describe, expect, it } from 'vitest';
import { validateLabLifecycleAction } from './lifecycle';

describe('validateLabLifecycleAction', () => {
  const now = new Date('2026-09-04T00:00:00.000Z');
  const future = '2026-09-04T01:00:00.000Z';
  const past = '2026-09-03T23:00:00.000Z';

  it('allows start only from stopped state before expiry', () => {
    expect(validateLabLifecycleAction('stopped', 'start', future, now)).toEqual({ ok: true });
    expect(validateLabLifecycleAction('running', 'start', future, now)).toMatchObject({ ok: false, status: 409 });
    expect(validateLabLifecycleAction('stopped', 'start', past, now)).toMatchObject({ ok: false, status: 410 });
  });

  it('allows stop only from running state', () => {
    expect(validateLabLifecycleAction('running', 'stop', future, now)).toEqual({ ok: true });
    expect(validateLabLifecycleAction('stopped', 'stop', future, now)).toMatchObject({ ok: false, status: 409 });
    expect(validateLabLifecycleAction('provisioning', 'stop', future, now)).toMatchObject({ ok: false, status: 409 });
  });

  it('allows destroy from live and failed states', () => {
    for (const status of ['created', 'provisioning', 'running', 'stopping', 'stopped', 'failed'] as const) {
      expect(validateLabLifecycleAction(status, 'destroy', future, now)).toEqual({ ok: true });
    }
  });

  it('rejects duplicate lifecycle calls after destruction begins', () => {
    expect(validateLabLifecycleAction('destroying', 'destroy', future, now)).toMatchObject({ ok: false, status: 409 });
    expect(validateLabLifecycleAction('destroyed', 'destroy', future, now)).toMatchObject({ ok: false, status: 410 });
  });
});
