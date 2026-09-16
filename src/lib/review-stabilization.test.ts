import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/ai/providers/server', () => ({
  aiProviderConfigured: () => true,
  aiProviderModel: () => 'test-model',
  generateStructuredAi: vi.fn(),
}));

import { classifyPractitionerCommand, validatePractitionerCommand } from '@/lib/ai-practitioner/server';
import {
  collaborationChannelName,
  collaborationSignalChannelName,
  storyboardChannelName,
  storyboardSignalChannelName,
} from '@/lib/realtime/channel-names';
import { vaultUpdateSchema } from '@/lib/vault/server';

describe('review stabilization regressions', () => {
  it('defaults unknown AI commands to changes-system instead of read-only', () => {
    expect(classifyPractitionerCommand('custom-admin-tool --inspect')).toBe('changes-system');
    expect(validatePractitionerCommand('custom-admin-tool --inspect')).toEqual({
      ok: true,
      risk: 'changes-system',
    });
  });

  it('keeps only constrained inspection commands read-only', () => {
    expect(classifyPractitionerCommand('ls -la /tmp')).toBe('read-only');
    expect(classifyPractitionerCommand('cat /etc/os-release | grep NAME')).toBe('read-only');
    expect(classifyPractitionerCommand('cat /etc/os-release > /tmp/copy')).toBe('changes-system');
    expect(classifyPractitionerCommand('systemctl status nginx')).toBe('changes-system');
  });

  it('requires an optimistic version for Vault updates', () => {
    expect(vaultUpdateSchema.safeParse({ title: 'stale write' }).success).toBe(false);
    expect(vaultUpdateSchema.safeParse({ version: 3, title: 'fresh write' }).success).toBe(true);
  });

  it('separates trusted realtime event channels from client signal channels', () => {
    expect(collaborationSignalChannelName('c1')).not.toBe(collaborationChannelName('c1'));
    expect(storyboardSignalChannelName('b1')).not.toBe(storyboardChannelName('b1'));
    expect(collaborationSignalChannelName('c1')).toContain(':signals');
    expect(storyboardSignalChannelName('b1')).toContain(':signals');
  });
});
