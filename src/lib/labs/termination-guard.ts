import 'server-only';

import { DescribeInstancesCommand, type EC2Client } from '@aws-sdk/client-ec2';

// Check the actual compute as well as configuration: stale database rows must
// never turn reusable machines into disposable cleanup candidates.
export async function assertDisposableInstances(ec2: EC2Client, instanceIds: string[]) {
  if (!instanceIds.length) return;
  const configured = new Set([
    process.env.LAB_AWS_BLACK_DOMAIN_DC_INSTANCE_ID,
    process.env.LAB_AWS_BLACK_DOMAIN_WORKSTATION_INSTANCE_ID,
    process.env.LAB_AWS_BLACK_DOMAIN_OPERATOR_INSTANCE_ID,
  ].filter(Boolean));
  if (instanceIds.some((id) => configured.has(id))) {
    throw new Error('Refusing to terminate configured reusable Operation compute.');
  }

  const response = await ec2.send(new DescribeInstancesCommand({ InstanceIds: instanceIds }));
  const instances = new Map((response.Reservations || [])
    .flatMap((reservation) => reservation.Instances || [])
    .map((instance) => [instance.InstanceId, instance]));
  for (const id of instanceIds) {
    const instance = instances.get(id);
    if (!instance) throw new Error('Cannot verify compute ownership before termination.');
    const tags = new Map((instance.Tags || []).map((tag) => [tag.Key, tag.Value]));
    if (tags.get('Lifecycle') === 'Reusable' || tags.has('EnvironmentSlot')
      || tags.get('Purpose') === 'OperationEnvironment') {
      throw new Error('Refusing to terminate reusable Operation compute.');
    }
    if (tags.get('App') !== 'Oxsig'
      || !['CyberLab', 'OperationNode'].includes(tags.get('Purpose') || '')) {
      throw new Error('Refusing to terminate compute without disposable Oxsig ownership tags.');
    }
  }
}
