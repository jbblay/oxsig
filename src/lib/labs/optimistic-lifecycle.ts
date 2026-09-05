import type { LabInstanceStatus } from './types';

export type LabLifecycleAction = 'start' | 'stop' | 'destroy';

const OPTIMISTIC_STATUS: Record<LabLifecycleAction, LabInstanceStatus> = {
  start: 'provisioning',
  stop: 'stopping',
  destroy: 'destroying',
};

export function optimisticLabLifecycleStatus(action: LabLifecycleAction): LabInstanceStatus {
  return OPTIMISTIC_STATUS[action];
}

export function applyOptimisticLabLifecycle<T extends { status: LabInstanceStatus }>(
  instance: T,
  action: LabLifecycleAction
): T {
  return { ...instance, status: optimisticLabLifecycleStatus(action) };
}

export function replaceLabInstance<T extends { id: string }>(instances: T[], replacement: T): T[] {
  return instances.map((instance) => instance.id === replacement.id ? replacement : instance);
}
