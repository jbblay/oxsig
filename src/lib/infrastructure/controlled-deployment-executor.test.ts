import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeploymentAuthorizationRecord } from './deployment-authorization';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  poolQuery: vi.fn(),
  createLabVm: vi.fn(),
  destroyLabVm: vi.fn(),
  labCapabilities: vi.fn(),
  logAudit: vi.fn(),
  captureProductEvent: vi.fn(),
}));

vi.mock('@/lib/db/pool', () => ({
  transaction: mocks.transaction,
  getPool: () => ({ query: mocks.poolQuery }),
}));
vi.mock('@/lib/labs/aws-runtime', () => ({
  createLabVm: mocks.createLabVm,
  destroyLabVm: mocks.destroyLabVm,
  labCapabilities: mocks.labCapabilities,
}));
vi.mock('@/lib/audit/logger', () => ({
  AUDIT_ACTIONS: {
    DEPLOYMENT_EXECUTE: 'deployment.execute',
    DEPLOYMENT_EXECUTE_FAILED: 'deployment.execute.failed',
  },
  logAudit: mocks.logAudit,
}));
vi.mock('@/lib/analytics/posthog', () => ({ captureProductEvent: mocks.captureProductEvent }));

import {
  ControlledDeploymentExecutionError,
  executeControlledDeployment,
} from './controlled-deployment-executor';

const authorizationId = '4a2e2dc5-b9b5-41b7-8c29-01f565231301';
const executionId = 'c311694f-2b48-4274-b8ef-c56b4e2927e0';
const instanceId = '2ff639a0-300d-45dd-a02e-28ebd6df289a';
const expiresAt = '2026-09-06T01:30:00.000Z';
const createdAt = '2026-09-06T00:30:00.000Z';

function authorization(overrides: Partial<DeploymentAuthorizationRecord> = {}): DeploymentAuthorizationRecord {
  return {
    id: authorizationId,
    ownerId: 'user-1',
    planId: 'plan_123',
    planHash: 'a'.repeat(64),
    planSnapshot: {
      version: 1,
      summary: { workloads: 1, networkFunctions: 0, segments: 0, links: 0 },
      workloads: [],
      networkFunctions: [],
      segments: [],
      links: [],
      actions: [],
      readiness: { executable: true, blockers: [], warnings: [] },
    },
    sourceDesignUpdatedAt: createdAt,
    executionSupport: {
      supported: true,
      adapter: 'existing-lab-vm',
      reasons: [],
      target: {
        nodeId: 'server-1',
        labSlug: 'ubuntu-security-lab',
        accessMode: 'terminal',
      },
    },
    state: 'receipt_issued',
    executionId,
    receiptIssuedAt: createdAt,
    expiresAt,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function clientQuery(sql: string) {
  if (sql.includes('SELECT id FROM users')) return Promise.resolve({ rows: [{ id: 'user-1' }] });
  if (sql.includes('FROM deployment_authorizations') && sql.includes('FOR UPDATE')) {
    return Promise.resolve({
      rows: [{
        id: authorizationId,
        owner_id: 'user-1',
        state: 'receipt_issued',
        execution_id: executionId,
        expires_at: expiresAt,
        lab_instance_id: null,
        execution_support: authorization().executionSupport,
      }],
    });
  }
  if (sql.includes('SELECT COUNT(*)::int AS count')) return Promise.resolve({ rows: [{ count: 0 }] });
  if (sql.includes('INSERT INTO lab_definitions')) return Promise.resolve({ rows: [{ id: 'definition-1' }] });
  if (sql.includes('INSERT INTO lab_instances')) {
    return Promise.resolve({
      rows: [{
        id: instanceId,
        status: 'provisioning',
        last_error: null,
        created_at: createdAt,
        started_at: null,
        expires_at: expiresAt,
        metadata: {},
      }],
    });
  }
  if (sql.includes('UPDATE deployment_authorizations') && sql.includes("state='executing'")) {
    return Promise.resolve({ rows: [{ id: authorizationId }] });
  }
  throw new Error(`Unexpected transaction query: ${sql.slice(0, 80)}`);
}

describe('executeControlledDeployment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.labCapabilities.mockResolvedValue({ configured: true, provider: 'aws-ec2' });
    mocks.transaction.mockImplementation(async (handler: (client: { query: typeof clientQuery }) => Promise<unknown>) => {
      return handler({ query: clientQuery });
    });
    mocks.createLabVm.mockResolvedValue({
      externalId: 'i-0123456789abcdef0',
      imageId: 'ami-123',
      region: 'eu-central-1',
      instanceType: 't3.micro',
      osFamily: 'ubuntu',
      platform: 'linux',
    });
    mocks.poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE lab_instances')) {
        return {
          rows: [{
            id: instanceId,
            status: 'provisioning',
            last_error: null,
            created_at: createdAt,
            started_at: null,
            expires_at: expiresAt,
            metadata: { region: 'eu-central-1' },
          }],
        };
      }
      if (sql.includes('INSERT INTO lab_events')) return { rows: [] };
      throw new Error(`Unexpected pool query: ${sql.slice(0, 80)}`);
    });
  });

  it('rejects a mismatched receipt before any runtime or database action', async () => {
    await expect(executeControlledDeployment({
      ownerId: 'user-1',
      distinctId: 'clerk-1',
      authorization: authorization(),
      executionId: '11111111-1111-4111-8111-111111111111',
    })).rejects.toMatchObject({ code: 'EXECUTION_RECEIPT_MISMATCH', status: 409 });

    expect(mocks.labCapabilities).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.createLabVm).not.toHaveBeenCalled();
  });

  it('keeps the receipt unconsumed when the cloud runtime is unavailable', async () => {
    mocks.labCapabilities.mockResolvedValue({ configured: false, reason: 'AWS disabled' });

    await expect(executeControlledDeployment({
      ownerId: 'user-1',
      distinctId: 'clerk-1',
      authorization: authorization(),
      executionId,
    })).rejects.toMatchObject({ code: 'LAB_RUNTIME_UNAVAILABLE', status: 503 });

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.createLabVm).not.toHaveBeenCalled();
  });

  it('reserves the lab and execution state before starting the provider VM', async () => {
    const result = await executeControlledDeployment({
      ownerId: 'user-1',
      distinctId: 'clerk-1',
      authorization: authorization(),
      executionId,
      auditRequestMetadata: { userAgent: 'vitest' },
    });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.createLabVm).toHaveBeenCalledWith(
      instanceId,
      'user-1',
      expiresAt,
      expect.objectContaining({ slug: 'ubuntu-security-lab', recommendedInstanceType: 't3.micro' })
    );
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'deployment.execute',
      userId: 'user-1',
      resourceId: instanceId,
      metadata: expect.objectContaining({ authorizationId, executionId, planId: 'plan_123' }),
    }));
    expect(mocks.captureProductEvent).toHaveBeenCalledWith(expect.objectContaining({
      distinctId: 'clerk-1',
      event: 'infrastructure_deployment_started',
    }));
    expect(result.alreadyStarted).toBe(false);
    expect(result.instance.id).toBe(instanceId);
  });

  it('returns a typed execution error class for route-safe failures', () => {
    const error = new ControlledDeploymentExecutionError('blocked', 409, 'BLOCKED');
    expect(error).toMatchObject({ message: 'blocked', status: 409, code: 'BLOCKED' });
  });
});
