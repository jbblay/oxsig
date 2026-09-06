import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeploymentPlan } from '@/lib/infrastructure/deployment-plan-schema';

const mocks = vi.hoisted(() => ({ getCsrfToken: vi.fn() }));

vi.mock('@/lib/security/csrf-client', () => ({ getCsrfToken: mocks.getCsrfToken }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import DeploymentPlanner from './DeploymentPlanner';

function plan(executable: boolean, blockers: string[]): DeploymentPlan {
  return {
    version: 1,
    sourceDesignVersion: 1,
    summary: { devices: 1, links: 0, workloads: 1, networkFunctions: 0, segments: 0 },
    workloads: [
      {
        nodeId: 'server-1',
        kind: 'server',
        label: 'Ubuntu Server',
        runtime: 'virtual-machine',
        runtimeProfile: {
          profileId: 'ubuntu-24-04',
          architecture: 'x86_64',
          resourceClass: 'lab-small',
          accessMode: 'terminal',
        },
        runtimeProfileLabel: 'Ubuntu 24.04',
        runtimeAdapter: { status: 'mapped-available', labSlug: 'ubuntu-security-lab' },
      },
    ],
    networkFunctions: [],
    segments: [],
    links: [],
    actions: [
      {
        id: 'compute:server-1',
        phase: 'compute',
        type: 'provision-workload',
        nodeId: 'server-1',
        description: 'Provision Ubuntu Server as a virtual machine using Ubuntu 24.04.',
        executableNow: false,
        blocker: 'Provider execution requires explicit server-side authorization and a one-time execution receipt.',
      },
      {
        id: 'verification:runtime-evidence',
        phase: 'verification',
        type: 'verify-runtime',
        description: 'Verify runtime evidence.',
        executableNow: false,
        blocker: 'Runtime verification begins after controlled deployment.',
      },
    ],
    readiness: { executable, blockers, warnings: [] },
  };
}

function response(supported: boolean) {
  const reasons = supported ? [] : ['The controlled deployment adapter accepts exactly one VM workload per execution receipt.'];
  return {
    planId: 'plan_1234567890abcdef12345678',
    planHash: 'a'.repeat(64),
    sourceDesignUpdatedAt: '2026-09-06T00:00:00.000Z',
    generatedAt: '2026-09-06T00:01:00.000Z',
    plan: plan(supported, reasons),
    executionSupport: supported
      ? {
          supported: true,
          adapter: 'existing-lab-vm',
          reasons: [],
          target: { nodeId: 'server-1', labSlug: 'ubuntu-security-lab', accessMode: 'terminal' },
        }
      : { supported: false, adapter: 'none', reasons },
  };
}

function json(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('DeploymentPlanner adapter eligibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCsrfToken.mockResolvedValue('csrf-token');
  });

  it('keeps a design-only plan visible but disables deployment authorization', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(response(false))));

    render(<DeploymentPlanner />);
    fireEvent.click(screen.getByRole('button', { name: /generate deployment plan/i }));

    await waitFor(() => expect(screen.getAllByText('Design-only').length).toBeGreaterThan(0));
    expect(screen.getByText(/exactly one VM workload/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /authorize exact plan/i })).toBeDisabled();
    vi.unstubAllGlobals();
  });

  it('enables authorization only when the current controlled adapter supports the exact plan', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(response(true))));

    render(<DeploymentPlanner />);
    fireEvent.click(screen.getByRole('button', { name: /generate deployment plan/i }));

    await waitFor(() => expect(screen.getAllByText('Available').length).toBeGreaterThan(0));
    expect(screen.getByText(/ubuntu-security-lab/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /authorize exact plan/i })).toBeEnabled();
    vi.unstubAllGlobals();
  });
});
