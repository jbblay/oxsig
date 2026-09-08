import 'server-only';

import { DescribeInstancesCommand, EC2Client } from '@aws-sdk/client-ec2';

const REGION = process.env.LAB_AWS_REGION || process.env.AWS_REGION || 'eu-central-1';
const ec2 = new EC2Client({ region: REGION });

export type ExpiredTaggedOperationNode = {
  externalId: string;
  operationRunId?: string;
  operationNodeId?: string;
  ownerId?: string;
  expiresAt: string;
};

function tagsOf(tags: Array<{ Key?: string; Value?: string }> | undefined) {
  const result = new Map<string, string>();
  for (const tag of tags || []) {
    if (tag.Key && tag.Value) result.set(tag.Key, tag.Value);
  }
  return result;
}

export async function listExpiredTaggedOperationNodes(now = new Date()): Promise<ExpiredTaggedOperationNode[]> {
  const response = await ec2.send(new DescribeInstancesCommand({
    Filters: [
      { Name: 'tag:App', Values: ['Oxsig'] },
      { Name: 'tag:Purpose', Values: ['OperationNode'] },
      { Name: 'instance-state-name', Values: ['pending', 'running', 'stopping', 'stopped'] },
    ],
  }));

  const expired: ExpiredTaggedOperationNode[] = [];
  for (const reservation of response.Reservations || []) {
    for (const instance of reservation.Instances || []) {
      if (!instance.InstanceId) continue;
      const tags = tagsOf(instance.Tags);
      const expiresAt = tags.get('ExpiresAt');
      if (!expiresAt) continue;
      const expires = new Date(expiresAt);
      if (!Number.isFinite(expires.getTime()) || expires.getTime() > now.getTime()) continue;
      expired.push({
        externalId: instance.InstanceId,
        operationRunId: tags.get('OperationRunId'),
        operationNodeId: tags.get('OperationNodeId'),
        ownerId: tags.get('OwnerId'),
        expiresAt,
      });
    }
  }
  return expired;
}
