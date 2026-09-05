import { describe, expect, it } from 'vitest';
import type { LabInstanceStatus } from './types';
import {
  applyOptimisticLabLifecycle,
  optimisticLabLifecycleStatus,
  replaceLabInstance,
} from './optimistic-lifecycle';

type TestInstance = {
  id: string;
  status: LabInstanceStatus;
  name: string;
};

function instance(status: LabInstanceStatus = 'running'): TestInstance {
  return { id: 'lab-1', status, name: 'Lab 1' };
}

describe('optimistic lab lifecycle', () => {
  it('maps lifecycle actions to the server transitional statuses', () => {
    expect(optimisticLabLifecycleStatus('start')).toBe('provisioning');
    expect(optimisticLabLifecycleStatus('stop')).toBe('stopping');
    expect(optimisticLabLifecycleStatus('destroy')).toBe('destroying');
  });

  it('returns a new instance with only the optimistic status changed', () => {
    const previous = instance('running');
    const optimistic = applyOptimisticLabLifecycle(previous, 'stop');

    expect(optimistic).toEqual({ ...previous, status: 'stopping' });
    expect(optimistic).not.toBe(previous);
  });

  it('replaces only the matching lab instance while preserving order', () => {
    const first = instance('running');
    const second: TestInstance = { id: 'lab-2', status: 'stopped', name: 'Lab 2' };
    const replacement = { ...first, status: 'destroying' as LabInstanceStatus };

    expect(replaceLabInstance([first, second], replacement)).toEqual([replacement, second]);
  });

  it('can restore the exact previous instance after a failed optimistic action', () => {
    const previous = instance('stopped');
    const optimistic = applyOptimisticLabLifecycle(previous, 'start');
    const rolledBack = replaceLabInstance([optimistic], previous);

    expect(rolledBack[0]).toBe(previous);
    expect(rolledBack[0].status).toBe('stopped');
  });
});
