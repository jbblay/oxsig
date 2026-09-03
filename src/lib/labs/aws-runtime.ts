import 'server-only';

import {
  DescribeImagesCommand,
  DescribeInstancesCommand,
  DescribeSecurityGroupsCommand,
  DescribeSubnetsCommand,
  EC2Client,
  RunInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand,
  type _InstanceType,
} from '@aws-sdk/client-ec2';
import {
  GetCommandInvocationCommand,
  SendCommandCommand,
  SSMClient,
} from '@aws-sdk/client-ssm';
import type { LabInstanceStatus, LabRuntimeCapabilities } from './types';

const REGION = process.env.LAB_AWS_REGION || process.env.AWS_REGION || 'eu-central-1';
const INSTANCE_TYPE = process.env.LAB_AWS_INSTANCE_TYPE || 't3.micro';
const SUBNET_ID = process.env.LAB_AWS_SUBNET_ID;
const SECURITY_GROUP_ID = process.env.LAB_AWS_SECURITY_GROUP_ID;
const INSTANCE_PROFILE = process.env.LAB_AWS_INSTANCE_PROFILE;
const AMI_ID = process.env.LAB_AWS_AMI_ID;

const ec2 = new EC2Client({ region: REGION });
const ssm = new SSMClient({ region: REGION });

const INSTANCE_ID = /^i-[0-9a-f]+$/i;

function assertAwsInstanceId(instanceId: string) {
  if (!INSTANCE_ID.test(instanceId)) throw new Error('Invalid AWS lab instance identifier');
}

async function resolveUbuntuAmi() {
  if (AMI_ID) return AMI_ID;

  const response = await ec2.send(new DescribeImagesCommand({
    Owners: ['099720109477'],
    Filters: [
      { Name: 'name', Values: ['ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*'] },
      { Name: 'architecture', Values: ['x86_64'] },
      { Name: 'root-device-type', Values: ['ebs'] },
      { Name: 'virtualization-type', Values: ['hvm'] },
      { Name: 'state', Values: ['available'] },
    ],
  }));

  const image = [...(response.Images || [])]
    .filter((item) => item.ImageId && item.CreationDate)
    .sort((a, b) => String(b.CreationDate).localeCompare(String(a.CreationDate)))[0];

  if (!image?.ImageId) throw new Error('No current Ubuntu 24.04 AMI was found in the configured AWS region');
  return image.ImageId;
}

export async function labCapabilities(): Promise<LabRuntimeCapabilities & { reason?: string; region?: string }> {
  if (process.env.LAB_AWS_ENABLED !== 'true') {
    return {
      provider: 'unconfigured',
      configured: false,
      supportsContainers: false,
      supportsVMs: false,
      supportsTerminal: false,
      supportsReset: false,
      region: REGION,
      reason: 'AWS lab provisioning is disabled for this deployment.',
    };
  }

  if (!SUBNET_ID || !SECURITY_GROUP_ID) {
    return {
      provider: 'unconfigured',
      configured: false,
      supportsContainers: false,
      supportsVMs: false,
      supportsTerminal: false,
      supportsReset: false,
      region: REGION,
      reason: 'AWS lab subnet and security-group configuration is incomplete.',
    };
  }

  try {
    await Promise.all([
      ec2.send(new DescribeSubnetsCommand({ SubnetIds: [SUBNET_ID] })),
      ec2.send(new DescribeSecurityGroupsCommand({ GroupIds: [SECURITY_GROUP_ID] })),
    ]);

    return {
      provider: 'aws-ec2',
      configured: true,
      supportsContainers: false,
      supportsVMs: true,
      supportsTerminal: Boolean(INSTANCE_PROFILE),
      supportsReset: false,
      region: REGION,
      reason: INSTANCE_PROFILE ? undefined : 'VM lifecycle is ready. Browser command execution requires an SSM instance profile.',
    };
  } catch (error) {
    return {
      provider: 'unconfigured',
      configured: false,
      supportsContainers: false,
      supportsVMs: false,
      supportsTerminal: false,
      supportsReset: false,
      region: REGION,
      reason: error instanceof Error ? `AWS lab runtime is not reachable: ${error.message}` : 'AWS lab runtime is not reachable.',
    };
  }
}

export async function createLabVm(instanceId: string, ownerId: string, expiresAt: string) {
  const capabilities = await labCapabilities();
  if (!capabilities.configured || !SUBNET_ID || !SECURITY_GROUP_ID) {
    throw new Error(capabilities.reason || 'AWS lab runtime is unavailable');
  }

  const imageId = await resolveUbuntuAmi();
  const expiryCalendar = new Date(expiresAt)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, ' UTC');
  const userData = `#!/bin/bash\nset -e\nif command -v snap >/dev/null 2>&1; then\n  snap list amazon-ssm-agent >/dev/null 2>&1 || snap install amazon-ssm-agent --classic || true\n  systemctl enable --now snap.amazon-ssm-agent.amazon-ssm-agent.service || true\nfi\ncat >/etc/systemd/system/oxsig-expiry.service <<'EOF'\n[Unit]\nDescription=Terminate expired Oxsig cyber lab\n\n[Service]\nType=oneshot\nExecStart=/sbin/shutdown -h now\nEOF\ncat >/etc/systemd/system/oxsig-expiry.timer <<'EOF'\n[Unit]\nDescription=Oxsig cyber lab expiry timer\n\n[Timer]\nOnCalendar=${expiryCalendar}\nPersistent=true\nAccuracySec=1min\n\n[Install]\nWantedBy=timers.target\nEOF\nsystemctl daemon-reload\nsystemctl enable --now oxsig-expiry.timer\n`;
  const tags = [
    { Key: 'Name', Value: `oxsig-lab-${instanceId.slice(0, 8)}` },
    { Key: 'App', Value: 'Oxsig' },
    { Key: 'Purpose', Value: 'CyberLab' },
    { Key: 'LabInstanceId', Value: instanceId },
    { Key: 'OwnerId', Value: ownerId },
    { Key: 'ExpiresAt', Value: expiresAt },
  ];

  const response = await ec2.send(new RunInstancesCommand({
    ImageId: imageId,
    InstanceType: INSTANCE_TYPE as _InstanceType,
    MinCount: 1,
    MaxCount: 1,
    NetworkInterfaces: [{
      DeviceIndex: 0,
      SubnetId: SUBNET_ID,
      Groups: [SECURITY_GROUP_ID],
      AssociatePublicIpAddress: true,
      DeleteOnTermination: true,
    }],
    IamInstanceProfile: INSTANCE_PROFILE ? { Name: INSTANCE_PROFILE } : undefined,
    MetadataOptions: { HttpEndpoint: 'enabled', HttpTokens: 'required' },
    InstanceInitiatedShutdownBehavior: 'terminate',
    UserData: Buffer.from(userData, 'utf8').toString('base64'),
    TagSpecifications: [
      { ResourceType: 'instance', Tags: tags },
      { ResourceType: 'volume', Tags: tags.filter((tag) => tag.Key !== 'Name') },
    ],
  }));

  const externalId = response.Instances?.[0]?.InstanceId;
  if (!externalId) throw new Error('AWS did not return an EC2 instance identifier');
  return { externalId, imageId, region: REGION, instanceType: INSTANCE_TYPE };
}

export async function listExpiredTaggedLabVms(now = new Date()) {
  const expired: Array<{
    externalId: string;
    labInstanceId?: string;
    ownerId?: string;
    expiresAt: string;
  }> = [];
  let nextToken: string | undefined;

  do {
    const response = await ec2.send(new DescribeInstancesCommand({
      Filters: [
        { Name: 'tag:App', Values: ['Oxsig'] },
        { Name: 'tag:Purpose', Values: ['CyberLab'] },
        { Name: 'instance-state-name', Values: ['pending', 'running', 'stopping', 'stopped'] },
      ],
      NextToken: nextToken,
    }));

    for (const reservation of response.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        if (!instance.InstanceId) continue;
        const tags = Object.fromEntries((instance.Tags || []).map((tag) => [tag.Key || '', tag.Value || '']));
        const expiresAt = tags.ExpiresAt;
        const expiresTime = Date.parse(expiresAt || '');
        if (!expiresAt || !Number.isFinite(expiresTime) || expiresTime > now.getTime()) continue;
        expired.push({
          externalId: instance.InstanceId,
          labInstanceId: tags.LabInstanceId || undefined,
          ownerId: tags.OwnerId || undefined,
          expiresAt,
        });
      }
    }

    nextToken = response.NextToken;
  } while (nextToken);

  return expired;
}

export async function describeLabVmStates(instanceIds: string[]) {
  const ids = [...new Set(instanceIds.filter(Boolean))];
  if (ids.length === 0) return new Map<string, LabInstanceStatus>();
  ids.forEach(assertAwsInstanceId);

  // Filtering by instance-id safely omits IDs that AWS no longer returns,
  // whereas supplying a mixed InstanceIds list can fail the whole request when
  // only one stale identifier has disappeared. Omitted IDs are treated as
  // destroyed while returned instances override that default with live state.
  const response = await ec2.send(new DescribeInstancesCommand({
    Filters: [{ Name: 'instance-id', Values: ids }],
  }));
  const states = new Map<string, LabInstanceStatus>(
    ids.map((id) => [id, 'destroyed' as LabInstanceStatus])
  );

  for (const reservation of response.Reservations || []) {
    for (const instance of reservation.Instances || []) {
      if (!instance.InstanceId) continue;
      const status: LabInstanceStatus = instance.State?.Name === 'running' ? 'running'
        : instance.State?.Name === 'stopped' ? 'stopped'
        : instance.State?.Name === 'stopping' ? 'stopping'
        : instance.State?.Name === 'shutting-down' ? 'destroying'
        : instance.State?.Name === 'terminated' ? 'destroyed'
        : 'provisioning';
      states.set(instance.InstanceId, status);
    }
  }

  return states;
}

export async function startLabVm(instanceId: string) {
  assertAwsInstanceId(instanceId);
  await ec2.send(new StartInstancesCommand({ InstanceIds: [instanceId] }));
}

export async function stopLabVm(instanceId: string) {
  assertAwsInstanceId(instanceId);
  await ec2.send(new StopInstancesCommand({ InstanceIds: [instanceId] }));
}

export async function destroyLabVm(instanceId: string) {
  assertAwsInstanceId(instanceId);
  await ec2.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
}

export async function executeLabCommand(instanceId: string, command: string) {
  assertAwsInstanceId(instanceId);
  if (!INSTANCE_PROFILE) throw new Error('SSM terminal support is not configured for this deployment');
  if (!command.trim() || command.length > 1000 || command.includes('\0')) throw new Error('Command must contain 1 to 1000 characters');

  const sent = await ssm.send(new SendCommandCommand({
    InstanceIds: [instanceId],
    DocumentName: 'AWS-RunShellScript',
    Parameters: { commands: [command] },
    TimeoutSeconds: 30,
  }));
  const commandId = sent.Command?.CommandId;
  if (!commandId) throw new Error('SSM did not return a command identifier');

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 750));
    try {
      const result = await ssm.send(new GetCommandInvocationCommand({ CommandId: commandId, InstanceId: instanceId }));
      if (['Pending', 'InProgress', 'Delayed'].includes(result.Status || '')) continue;
      return {
        stdout: result.StandardOutputContent || '',
        stderr: result.StandardErrorContent || '',
        exitCode: result.ResponseCode ?? (result.Status === 'Success' ? 0 : 1),
      };
    } catch (error: any) {
      if (error?.name === 'InvocationDoesNotExist') continue;
      throw error;
    }
  }

  throw new Error('The lab command did not finish before the request timeout');
}
