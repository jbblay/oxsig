import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('Operation readiness commands', () => {
  it('checks the domain controller readiness marker', async () => {
    const { operationReadinessCommand } = await import('./readiness');
    const probe = operationReadinessCommand({ nodeKey: 'dc', osFamily: 'windows' });
    expect(probe.documentName).toBe('AWS-RunPowerShellScript');
    expect(probe.command).toContain('domain-ready.txt');
    expect(probe.command).toContain('OXSIG_READY');
  });

  it('checks workstation domain-join readiness independently', async () => {
    const { operationReadinessCommand } = await import('./readiness');
    const probe = operationReadinessCommand({ nodeKey: 'workstation', osFamily: 'windows' });
    expect(probe.command).toContain('workstation-ready.txt');
    expect(probe.command).not.toContain('domain-ready.txt');
  });

  it('requires the operator scope files and core tooling', async () => {
    const { operationReadinessCommand } = await import('./readiness');
    const probe = operationReadinessCommand({ nodeKey: 'operator', osFamily: 'ubuntu' });
    expect(probe.documentName).toBe('AWS-RunShellScript');
    expect(probe.command).toContain('/opt/oxsig/operation.env');
    expect(probe.command).toContain('/opt/oxsig/README');
  });

  it('rejects unsupported node families instead of manufacturing readiness', async () => {
    const { operationReadinessCommand } = await import('./readiness');
    expect(() => operationReadinessCommand({ nodeKey: 'operator', osFamily: 'windows' })).toThrow('Unsupported Windows Operation readiness target');
  });
});
