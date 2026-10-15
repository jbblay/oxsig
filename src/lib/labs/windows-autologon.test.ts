import { describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), send: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('./aws-runtime', () => ({ executeLabCommand: m.execute }));
vi.mock('@/lib/aws/client-config', () => ({ awsClientConfig: () => ({}) }));
vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: class { send = m.send; },
  SendCommandCommand: class { constructor(readonly input: unknown) {} },
  StartSessionCommand: class { constructor(readonly input: unknown) {} },
}));
import { ensureDesktopRuntime } from './desktop-runtime';
import { windowsAutoLogonSetup } from './windows-autologon';
describe('Windows desktop bootstrap migration', () => {
  it('upgrades an existing VNC-only guest with a versioned automatic logon setup', async () => {
    m.execute.mockResolvedValue({ exitCode: 1 }); m.send.mockResolvedValue({});
    expect(await ensureDesktopRuntime('i-0123456789abcdef0', 'windows')).toEqual({ ready: false, bootstrapStarted: true });
    expect(m.execute.mock.calls[0][1]).toContain('desktop-autologon-v1');
    const command = m.send.mock.calls[0][0].input.Parameters.commands[0];
    expect(command).toContain(windowsAutoLogonSetup);
    expect(command).toContain('if (-not (Test-Path $ready))');
  });
  it('keeps the guest-generated password out of plaintext registry and command output', () => {
    expect(windowsAutoLogonSetup).toContain('RandomNumberGenerator');
    expect(windowsAutoLogonSetup).toContain('LsaStorePrivateData');
    expect(windowsAutoLogonSetup).toContain('ZeroFreeGlobalAllocUnicode');
    expect(windowsAutoLogonSetup).not.toMatch(/Write-(?:Output|Host).*\$password/);
    expect(windowsAutoLogonSetup).not.toMatch(/New-ItemProperty[^\n]+DefaultPassword/);
    expect(windowsAutoLogonSetup).toContain("Get-LocalGroup -SID 'S-1-5-32-545'");
    expect(windowsAutoLogonSetup).not.toContain("S-1-5-32-544");
  });
  it('does not restart an existing interactive session', () => {
    expect(windowsAutoLogonSetup).toContain('if (-not (Get-CimInstance Win32_ComputerSystem).UserName)');
    expect(windowsAutoLogonSetup).not.toContain('shutdown.exe /r /f');
  });
});
