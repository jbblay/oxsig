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
  DescribeSessionsCommand,
  GetCommandInvocationCommand,
  SendCommandCommand,
  SSMClient,
  StartSessionCommand,
  TerminateSessionCommand,
} from '@aws-sdk/client-ssm';
import { awsClientConfig } from '@/lib/aws/client-config';
import { assertDisposableInstances } from './termination-guard';
import type { LabDefinition, LabInstanceStatus, LabOsFamily, LabRuntimeCapabilities } from './types';

const REGION = process.env.LAB_AWS_REGION || process.env.AWS_REGION || 'eu-central-1';
const SUBNET_ID = process.env.LAB_AWS_SUBNET_ID;
const SECURITY_GROUP_ID = process.env.LAB_AWS_SECURITY_GROUP_ID;
const INSTANCE_PROFILE = process.env.LAB_AWS_INSTANCE_PROFILE;

const ec2 = new EC2Client(awsClientConfig(REGION));
const ssm = new SSMClient(awsClientConfig(REGION));

const INSTANCE_ID = /^i-[0-9a-f]+$/i;

function assertAwsInstanceId(instanceId: string) {
  if (!INSTANCE_ID.test(instanceId)) throw new Error('Invalid AWS lab instance identifier');
}

function amiOverride(osFamily: LabOsFamily) {
  if (osFamily === 'ubuntu') return process.env.LAB_AWS_UBUNTU_AMI_ID || process.env.LAB_AWS_AMI_ID;
  if (osFamily === 'amazon-linux') return process.env.LAB_AWS_AMAZON_LINUX_AMI_ID;
  if (osFamily === 'rocky') return process.env.LAB_AWS_ROCKY_AMI_ID;
  if (osFamily === 'kali') return process.env.LAB_AWS_KALI_AMI_ID;
  if (osFamily === 'windows') return process.env.LAB_AWS_WINDOWS_AMI_ID;
  return undefined;
}

function instanceTypeFor(lab: LabDefinition) {
  const specific = lab.osFamily === 'ubuntu' ? process.env.LAB_AWS_UBUNTU_INSTANCE_TYPE
    : lab.osFamily === 'amazon-linux' ? process.env.LAB_AWS_AMAZON_LINUX_INSTANCE_TYPE
    : lab.osFamily === 'rocky' ? process.env.LAB_AWS_ROCKY_INSTANCE_TYPE
    : lab.osFamily === 'kali' ? process.env.LAB_AWS_KALI_INSTANCE_TYPE
    : process.env.LAB_AWS_WINDOWS_INSTANCE_TYPE;

  if (specific) return specific;
  if (lab.platform === 'linux' && process.env.LAB_AWS_INSTANCE_TYPE) return process.env.LAB_AWS_INSTANCE_TYPE;
  return lab.recommendedInstanceType;
}

function imageSpec(lab: LabDefinition) {
  if (lab.osFamily === 'ubuntu') {
    return {
      owners: ['099720109477'],
      names: ['ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*'],
      label: 'Ubuntu 24.04',
    };
  }
  if (lab.osFamily === 'amazon-linux') {
    return {
      owners: ['amazon'],
      names: ['al2023-ami-2023.*-kernel-6.1-x86_64'],
      label: 'Amazon Linux 2023',
    };
  }
  if (lab.osFamily === 'rocky') {
    return {
      owners: ['aws-marketplace'],
      names: ['Rocky-9-EC2-Base-9*.x86_64-*'],
      label: 'Rocky Linux 9',
    };
  }
  if (lab.osFamily === 'kali') {
    return {
      owners: ['aws-marketplace'],
      names: ['debian-kali-last-snapshot-amd64-*'],
      label: 'Kali Linux',
    };
  }
  return {
    owners: ['amazon'],
    names: ['Windows_Server-2022-English-Full-Base-*'],
    label: 'Windows Server 2022',
  };
}

export async function resolveLabAmi(lab: LabDefinition) {
  const override = amiOverride(lab.osFamily);
  if (override) return override;

  const spec = imageSpec(lab);
  const response = await ec2.send(new DescribeImagesCommand({
    Owners: spec.owners,
    Filters: [
      { Name: 'name', Values: spec.names },
      { Name: 'architecture', Values: ['x86_64'] },
      { Name: 'root-device-type', Values: ['ebs'] },
      { Name: 'virtualization-type', Values: ['hvm'] },
      { Name: 'state', Values: ['available'] },
    ],
  }));

  const image = [...(response.Images || [])]
    .filter((item) => item.ImageId && item.CreationDate)
    .sort((a, b) => String(b.CreationDate).localeCompare(String(a.CreationDate)))[0];

  if (!image?.ImageId) throw new Error(`No current ${spec.label} AMI was found in ${REGION}`);
  return image.ImageId;
}

function linuxUserData(expiresAt: string) {
  const expiryCalendar = new Date(expiresAt)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, ' UTC');
  const debUrl = `https://s3.${REGION}.amazonaws.com/amazon-ssm-${REGION}/latest/debian_amd64/amazon-ssm-agent.deb`;
  const rpmUrl = `https://s3.${REGION}.amazonaws.com/amazon-ssm-${REGION}/latest/linux_amd64/amazon-ssm-agent.rpm`;

  return `#!/bin/bash
set -u

install_ssm_agent() {
  systemctl enable --now amazon-ssm-agent >/dev/null 2>&1 && return 0
  systemctl enable --now snap.amazon-ssm-agent.amazon-ssm-agent.service >/dev/null 2>&1 && return 0

  if command -v snap >/dev/null 2>&1; then
    snap list amazon-ssm-agent >/dev/null 2>&1 || snap install amazon-ssm-agent --classic || true
    systemctl enable --now snap.amazon-ssm-agent.amazon-ssm-agent.service >/dev/null 2>&1 || true
  elif command -v dpkg >/dev/null 2>&1; then
    if command -v curl >/dev/null 2>&1; then
      curl -fsSL '${debUrl}' -o /tmp/amazon-ssm-agent.deb || true
    elif command -v wget >/dev/null 2>&1; then
      wget -q '${debUrl}' -O /tmp/amazon-ssm-agent.deb || true
    fi
    if [ -s /tmp/amazon-ssm-agent.deb ]; then
      dpkg -i /tmp/amazon-ssm-agent.deb || true
    fi
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y '${rpmUrl}' || true
  elif command -v yum >/dev/null 2>&1; then
    yum install -y '${rpmUrl}' || true
  fi

  systemctl enable --now amazon-ssm-agent >/dev/null 2>&1 || true
  systemctl enable --now snap.amazon-ssm-agent.amazon-ssm-agent.service >/dev/null 2>&1 || true
}

install_ssm_agent || true

cat >/etc/systemd/system/oxsig-expiry.service <<'EOF'
[Unit]
Description=Terminate expired Oxsig cyber lab

[Service]
Type=oneshot
ExecStart=/sbin/shutdown -h now
EOF

cat >/etc/systemd/system/oxsig-expiry.timer <<'EOF'
[Unit]
Description=Oxsig cyber lab expiry timer

[Timer]
OnCalendar=${expiryCalendar}
Persistent=true
AccuracySec=1min

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now oxsig-expiry.timer
`;
}

function windowsUserData(expiresAt: string) {
  const expiryIso = new Date(expiresAt).toISOString();
  return `<powershell>
$ErrorActionPreference = 'Continue'
try {
  Set-Service -Name AmazonSSMAgent -StartupType Automatic
  Start-Service -Name AmazonSSMAgent
} catch {}

$expiry = [DateTimeOffset]::Parse('${expiryIso}').LocalDateTime
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\\System32\\shutdown.exe" -Argument '/s /t 0 /f'
$trigger = New-ScheduledTaskTrigger -Once -At $expiry
Register-ScheduledTask -TaskName 'OxsigExpiry' -Action $action -Trigger $trigger -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
</powershell>`;
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

export async function createLabVm(instanceId: string, ownerId: string, expiresAt: string, lab: LabDefinition) {
  const capabilities = await labCapabilities();
  if (!capabilities.configured || !SUBNET_ID || !SECURITY_GROUP_ID) {
    throw new Error(capabilities.reason || 'AWS lab runtime is unavailable');
  }
  if (!lab.available) {
    throw new Error(lab.availabilityNote || `${lab.name} is not enabled for this deployment`);
  }

  const imageId = await resolveLabAmi(lab);
  const instanceType = instanceTypeFor(lab);
  const userData = lab.platform === 'windows' ? windowsUserData(expiresAt) : linuxUserData(expiresAt);
  const tags = [
    { Key: 'Name', Value: `oxsig-${lab.osFamily}-${instanceId.slice(0, 8)}` },
    { Key: 'App', Value: 'Oxsig' },
    { Key: 'Purpose', Value: 'CyberLab' },
    { Key: 'LabInstanceId', Value: instanceId },
    { Key: 'LabSlug', Value: lab.slug },
    { Key: 'OsFamily', Value: lab.osFamily },
    { Key: 'OwnerId', Value: ownerId },
    { Key: 'ExpiresAt', Value: expiresAt },
  ];

  const response = await ec2.send(new RunInstancesCommand({
    ImageId: imageId,
    InstanceType: instanceType as _InstanceType,
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
  return {
    externalId,
    imageId,
    region: REGION,
    instanceType,
    osFamily: lab.osFamily,
    platform: lab.platform,
  };
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
  await assertDisposableInstances(ec2, [instanceId]);
  await ec2.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
}

export async function startInteractiveLabSession(instanceId: string) {
  assertAwsInstanceId(instanceId);
  if (!INSTANCE_PROFILE) throw new Error('SSM terminal support is not configured for this deployment');

  const result = await ssm.send(new StartSessionCommand({
    Target: instanceId,
    Reason: 'Oxsig interactive browser terminal',
  }));
  if (!result.SessionId || !result.StreamUrl || !result.TokenValue) {
    throw new Error('AWS Session Manager did not return a complete interactive session');
  }

  return {
    sessionId: result.SessionId,
    streamUrl: result.StreamUrl,
    tokenValue: result.TokenValue,
    region: REGION,
  };
}

export async function terminateInteractiveLabSession(instanceId: string, sessionId: string) {
  assertAwsInstanceId(instanceId);
  if (!sessionId || sessionId.length > 128) throw new Error('Invalid Session Manager session identifier');

  const described = await ssm.send(new DescribeSessionsCommand({
    State: 'Active',
    Filters: [{ key: 'SessionId', value: sessionId }],
    MaxResults: 10,
  }));
  const session = described.Sessions?.find((item) => item.SessionId === sessionId);
  if (!session) return { terminated: false, alreadyEnded: true };
  if (session.Target !== instanceId) throw new Error('Session Manager session does not belong to this lab runtime');

  await ssm.send(new TerminateSessionCommand({ SessionId: sessionId }));
  return { terminated: true, alreadyEnded: false };
}

export async function executeLabCommand(instanceId: string, command: string, platform: 'linux' | 'windows' = 'linux') {
  assertAwsInstanceId(instanceId);
  if (!INSTANCE_PROFILE) throw new Error('SSM terminal support is not configured for this deployment');
  if (!command.trim() || command.length > 1000 || command.includes('\0')) throw new Error('Command must contain 1 to 1000 characters');

  const sent = await ssm.send(new SendCommandCommand({
    InstanceIds: [instanceId],
    DocumentName: platform === 'windows' ? 'AWS-RunPowerShellScript' : 'AWS-RunShellScript',
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
