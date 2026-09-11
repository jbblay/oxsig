import { describe, expect, it } from 'vitest';
import { operationLifecycleVoiceCue, operationLifecycleVoiceStage } from './lifecycle-voice';

function run(status: string, readyKeys: string[] = [], lifecycleState?: string) {
  return {
    operationSlug: 'black-domain',
    status,
    metadata: lifecycleState ? { lifecycleState } : {},
    nodes: ['operator', 'dc', 'workstation'].map((key) => ({
      key,
      status: readyKeys.includes(key) ? 'running' : 'provisioning',
    })),
  };
}

describe('operationLifecycleVoiceStage', () => {
  it('tracks the Black Domain readiness sequence', () => {
    expect(operationLifecycleVoiceStage(run('provisioning'))).toBe('provisioning');
    expect(operationLifecycleVoiceStage(run('provisioning', ['operator']))).toBe('operator-ready');
    expect(operationLifecycleVoiceStage(run('provisioning', ['operator', 'dc']))).toBe('dc-ready');
    expect(operationLifecycleVoiceStage(run('provisioning', ['operator', 'dc', 'workstation']))).toBe('workstation-joined');
    expect(operationLifecycleVoiceStage(run('running', ['operator', 'dc', 'workstation']))).toBe('mission-ready');
  });

  it('prioritizes explicit lifecycle and terminal states', () => {
    expect(operationLifecycleVoiceStage(run('running', ['operator', 'dc', 'workstation'], 'paused'))).toBe('paused');
    expect(operationLifecycleVoiceStage(run('failed', ['operator']))).toBe('failed');
    expect(operationLifecycleVoiceStage(run('destroying', ['operator', 'dc', 'workstation']))).toBe('destroying');
    expect(operationLifecycleVoiceStage(run('destroyed', []))).toBe('destroyed');
  });
});

describe('operationLifecycleVoiceCue', () => {
  it('returns the matching narrated cue for Black Domain', () => {
    const cue = operationLifecycleVoiceCue(run('provisioning', ['operator', 'dc']));
    expect(cue?.stage).toBe('dc-ready');
    expect(cue?.text).toContain('Active Directory');
  });

  it('does not narrate operations without an authored lifecycle script', () => {
    expect(operationLifecycleVoiceCue({ ...run('running', ['operator', 'dc', 'workstation']), operationSlug: 'ghost-shell' })).toBeNull();
  });
});
