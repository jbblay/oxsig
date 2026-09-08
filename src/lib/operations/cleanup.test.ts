import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@aws-sdk/client-ec2', async () => {
  const actual = await vi.importActual<any>('@aws-sdk/client-ec2');
  return { ...actual, EC2Client: class EC2Client { send = mocks.send; } };
});

import { listExpiredTaggedOperationNodes } from './cleanup';

describe('Operation target expiry discovery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns only expired OperationNode instances with recovery identifiers', async () => {
    mocks.send.mockResolvedValue({
      Reservations: [{ Instances: [
        {
          InstanceId: 'i-expired',
          Tags: [
            { Key: 'ExpiresAt', Value: '2026-09-08T10:00:00.000Z' },
            { Key: 'OperationRunId', Value: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
            { Key: 'OperationNodeId', Value: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
            { Key: 'OwnerId', Value: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
          ],
        },
        {
          InstanceId: 'i-future',
          Tags: [{ Key: 'ExpiresAt', Value: '2026-09-09T10:00:00.000Z' }],
        },
        {
          InstanceId: 'i-invalid',
          Tags: [{ Key: 'ExpiresAt', Value: 'not-a-date' }],
        },
      ] }],
    });

    await expect(listExpiredTaggedOperationNodes(new Date('2026-09-08T12:00:00.000Z'))).resolves.toEqual([
      {
        externalId: 'i-expired',
        operationRunId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        operationNodeId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        ownerId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        expiresAt: '2026-09-08T10:00:00.000Z',
      },
    ]);
  });
});
