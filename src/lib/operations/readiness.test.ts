import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('Operation readiness commands', () => {
  it('requires the domain controller marker and live AD/DNS services', async () => {
    const { operationReadinessCommand } = await import('./readiness');
    const probe = operationReadinessCommand({ nodeKey: 'dc', osFamily: 'windows' });
    expect(probe.documentName).toBe('AWS-RunPowerShellScript');
    expect(probe.command).toContain('domain-ready.txt');
    expect(probe.command).toContain('Get-Service NTDS');
    expect(probe.command).toContain('Get-Service DNS');
    expect(probe.command).toContain('Get-ADDomain');
    expect(probe.command).toContain('OXSIG_READY');
  });

  it('requires workstation domain membership and a live domain-controller lookup', async () => {
    const { operationReadinessCommand } = await import('./readiness');
    const probe = operationReadinessCommand({ nodeKey: 'workstation', osFamily: 'windows' });
    expect(probe.command).toContain('workstation-ready.txt');
    expect(probe.command).toContain('Win32_ComputerSystem');
    expect(probe.command).toContain('nltest.exe /dsgetdc:blackdomain.local');
    expect(probe.command).not.toContain('domain-ready.txt');
  });

  it('requires the operator scope files, learner readability, and every curated AD tool', async () => {
    const { operationReadinessCommand } = await import('./readiness');
    const probe = operationReadinessCommand({ nodeKey: 'operator', osFamily: 'ubuntu' });
    expect(probe.documentName).toBe('AWS-RunShellScript');
    expect(probe.command).toContain('/opt/oxsig/operation.env');
    expect(probe.command).toContain('chmod 0644 /opt/oxsig/operation.env');
    expect(probe.command).toContain('test -r /opt/oxsig/operation.env');
    expect(probe.command).toContain('/opt/oxsig/README');
    for (const command of ['nmap', 'smbclient', 'ldapsearch', 'dig', 'kinit', 'impacket-GetUserSPNs', 'python3']) {
      expect(probe.command).toContain(`command -v ${command}`);
    }
  });

  it('rejects unsupported node families instead of manufacturing readiness', async () => {
    const { operationReadinessCommand } = await import('./readiness');
    expect(() => operationReadinessCommand({ nodeKey: 'operator', osFamily: 'windows' })).toThrow('Unsupported Windows Operation readiness target');
  });
});
