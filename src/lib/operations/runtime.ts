import 'server-only';

import { randomBytes, randomInt } from 'node:crypto';
import {
  AuthorizeSecurityGroupIngressCommand,
  CreateSecurityGroupCommand,
  DeleteSecurityGroupCommand,
  DescribeImagesCommand,
  DescribeInstancesCommand,
  DescribeSecurityGroupsCommand,
  DescribeSubnetsCommand,
  EC2Client,
  RunInstancesCommand,
  TerminateInstancesCommand,
  type _InstanceType,
} from '@aws-sdk/client-ec2';
import type { Pool } from 'pg';
import { awsClientConfig } from '@/lib/aws/client-config';
import { assertDisposableInstances } from '@/lib/labs/termination-guard';
import { stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { getOperation, type OperationMode } from '@/lib/operations/catalog';
import { sealOperationAccessSecret } from '@/lib/operations/access-secret';
import { probeOperationNodeReadiness, operationReadinessError, type OperationReadinessResult } from '@/lib/operations/readiness';
import { advancePreparedEnvironmentReset, beginPreparedEnvironmentReset } from '@/lib/operations/environment-reset';

const REGION = process.env.LAB_AWS_REGION || process.env.AWS_REGION || 'eu-central-1';
const SUBNET_ID = process.env.LAB_AWS_SUBNET_ID;
const OPERATION_SECURITY_GROUP_ID = process.env.LAB_AWS_OPERATION_SECURITY_GROUP_ID;
const INSTANCE_PROFILE = process.env.LAB_AWS_INSTANCE_PROFILE;
const ec2 = new EC2Client(awsClientConfig(REGION));

const BLACK_DOMAIN_SLUG = 'black-domain';
const DOMAIN_NAME = 'blackdomain.local';
const DOMAIN_NETBIOS = 'BLACKDOMAIN';
const ONE_LAB_INDEX = 'idx_lab_instances_one_nonterminal_per_owner';
const READINESS_VERSION = 1;
const READINESS_RETRY_MS = 30_000;

const WEAK_SERVICE_WORDS = ['Winter', 'Spring', 'Welcome', 'Password'] as const;

type OperationNodeRole = 'operator' | 'target' | 'infrastructure';
type NodeRecord = {
  id: string;
  nodeKey: string;
  label: string;
  role: OperationNodeRole;
  osFamily: 'ubuntu' | 'windows';
  labInstanceId: string | null;
};

type LaunchedNode = {
  externalId: string;
  privateIp: string;
  imageId: string;
  instanceType: string;
};

type OperationNodeMetadata = {
  bootstrapReadyAt?: string;
  readinessCheckedAt?: string;
  readinessReason?: string;
  [key: string]: unknown;
};

export class OperationRuntimeError extends Error {
  constructor(message: string, readonly status = 409, readonly code = 'OPERATION_RUNTIME_CONFLICT') {
    super(message);
    this.name = 'OperationRuntimeError';
  }
}

function generatedPassword() {
  return `${randomBytes(14).toString('hex')}Aa1!`;
}

function generatedWeakServicePassword() {
  const word = WEAK_SERVICE_WORDS[randomInt(WEAK_SERVICE_WORDS.length)];
  return `${word}${randomInt(1000, 10_000)}!`;
}

function expiryMinutes(estimatedMinutes: number) {
  return Math.min(180, Math.max(60, estimatedMinutes + 30));
}

function linuxInstanceType() {
  return process.env.LAB_AWS_OPERATION_LINUX_INSTANCE_TYPE
    || process.env.LAB_AWS_UBUNTU_INSTANCE_TYPE
    || process.env.LAB_AWS_INSTANCE_TYPE
    || 't3.small';
}

function windowsInstanceType() {
  return process.env.LAB_AWS_OPERATION_WINDOWS_INSTANCE_TYPE
    || process.env.LAB_AWS_WINDOWS_INSTANCE_TYPE
    || 't3.medium';
}

export function operationPublicIpEnabled() {
  // The current OXSIG VPC uses public subnets plus an internet gateway and has no
  // NAT gateway/VPC endpoints. Preserve outbound SSM/bootstrap connectivity unless
  // an operator explicitly opts into private addressing after providing egress.
  return process.env.LAB_AWS_OPERATION_PUBLIC_IP !== 'false';
}

async function resolveImage(osFamily: 'ubuntu' | 'windows') {
  const override = osFamily === 'ubuntu'
    ? process.env.LAB_AWS_UBUNTU_AMI_ID || process.env.LAB_AWS_AMI_ID
    : process.env.LAB_AWS_WINDOWS_AMI_ID;
  if (override) return override;

  const spec = osFamily === 'ubuntu'
    ? {
        owners: ['099720109477'],
        names: ['ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*'],
        label: 'Ubuntu 24.04',
      }
    : {
        owners: ['amazon'],
        names: ['Windows_Server-2022-English-Full-Base-*'],
        label: 'Windows Server 2022',
      };

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
  if (!image?.ImageId) throw new OperationRuntimeError(`No current ${spec.label} AMI was found in ${REGION}.`, 503, 'OPERATION_IMAGE_UNAVAILABLE');
  return image.ImageId;
}

export async function assertOperationRuntimeReady() {
  if (process.env.LAB_AWS_ENABLED !== 'true') {
    throw new OperationRuntimeError('AWS lab provisioning is disabled on this deployment.', 503, 'OPERATION_AWS_DISABLED');
  }
  if (!SUBNET_ID || !OPERATION_SECURITY_GROUP_ID || !INSTANCE_PROFILE) {
    throw new OperationRuntimeError(
      'Multi-node Operations require LAB_AWS_SUBNET_ID, a dedicated LAB_AWS_OPERATION_SECURITY_GROUP_ID, and LAB_AWS_INSTANCE_PROFILE.',
      503,
      'OPERATION_AWS_CONFIGURATION_INCOMPLETE'
    );
  }

  const [subnetResponse, securityGroupResponse] = await Promise.all([
    ec2.send(new DescribeSubnetsCommand({ SubnetIds: [SUBNET_ID] })),
    ec2.send(new DescribeSecurityGroupsCommand({ GroupIds: [OPERATION_SECURITY_GROUP_ID] })),
  ]);
  const subnet = subnetResponse.Subnets?.[0];
  const securityGroup = securityGroupResponse.SecurityGroups?.[0];
  if (!subnet?.VpcId || !securityGroup?.GroupId || securityGroup.VpcId !== subnet.VpcId) {
    throw new OperationRuntimeError('The Operation subnet and security group must belong to the same VPC.', 503, 'OPERATION_NETWORK_MISMATCH');
  }

  const permitsInternalTraffic = (securityGroup.IpPermissions || []).some((permission) => {
    if (permission.IpProtocol !== '-1') return false;
    return (permission.UserIdGroupPairs || []).some((pair) => pair.GroupId === securityGroup.GroupId);
  });
  if (!permitsInternalTraffic) {
    throw new OperationRuntimeError(
      'The dedicated Operation security group must allow all-protocol traffic from itself so AD, DNS, Kerberos and SMB can communicate without exposing ordinary labs.',
      503,
      'OPERATION_INTERNAL_NETWORK_BLOCKED'
    );
  }

  const permitsDirectIngress = (securityGroup.IpPermissions || []).some((permission) =>
    Boolean(permission.IpRanges?.length || permission.Ipv6Ranges?.length || permission.PrefixListIds?.length)
  );
  if (permitsDirectIngress) {
    throw new OperationRuntimeError(
      'The dedicated Operation security group must not expose CIDR, IPv6, or prefix-list ingress. Use SSM and same-group private traffic only.',
      503,
      'OPERATION_EXTERNAL_INGRESS_FORBIDDEN'
    );
  }

  return {
    subnetId: SUBNET_ID,
    securityGroupId: OPERATION_SECURITY_GROUP_ID,
    vpcId: subnet.VpcId,
    publicIpEnabled: operationPublicIpEnabled(),
  };
}

function awsErrorName(error: unknown) {
  return error && typeof error === 'object' && 'name' in error
    ? String((error as { name?: unknown }).name || '')
    : '';
}

function isSecurityGroupDependencyViolation(error: unknown) {
  return awsErrorName(error) === 'DependencyViolation';
}

export async function createDisposableOperationSecurityGroup(args: {
  vpcId: string;
  runId: string;
  ownerId: string;
  expiresAt: string;
}) {
  const created = await ec2.send(new CreateSecurityGroupCommand({
    GroupName: `oxsig-operation-${args.runId}`,
    Description: 'OXSIG disposable Operation run network',
    VpcId: args.vpcId,
    TagSpecifications: [{
      ResourceType: 'security-group',
      Tags: [
        { Key: 'Name', Value: `oxsig-operation-${args.runId.slice(0, 8)}` },
        { Key: 'App', Value: 'Oxsig' },
        { Key: 'Purpose', Value: 'OperationRun' },
        { Key: 'Lifecycle', Value: 'Disposable' },
        { Key: 'OperationRunId', Value: args.runId },
        { Key: 'OwnerId', Value: args.ownerId },
        { Key: 'ExpiresAt', Value: args.expiresAt },
      ],
    }],
  }));
  const groupId = created.GroupId;
  if (!groupId) {
    throw new OperationRuntimeError(
      'AWS did not return a security group id for the disposable Operation network.',
      503,
      'OPERATION_NETWORK_CREATE_FAILED',
    );
  }

  try {
    await ec2.send(new AuthorizeSecurityGroupIngressCommand({
      GroupId: groupId,
      IpPermissions: [{
        IpProtocol: '-1',
        UserIdGroupPairs: [{
          GroupId: groupId,
          Description: 'OXSIG same-run east-west traffic only',
        }],
      }],
    }));
  } catch (error) {
    await ec2.send(new DeleteSecurityGroupCommand({ GroupId: groupId })).catch(() => undefined);
    throw new OperationRuntimeError(
      error instanceof Error ? `Could not isolate the disposable Operation network: ${error.message}` : 'Could not isolate the disposable Operation network.',
      503,
      'OPERATION_NETWORK_CREATE_FAILED',
    );
  }
  return groupId;
}

async function deleteDisposableOperationSecurityGroup(groupId: string) {
  await ec2.send(new DeleteSecurityGroupCommand({ GroupId: groupId }));
}

async function cleanupDisposableOperationSecurityGroup(pool: Pool, runId: string, metadata: unknown) {
  const runMetadata = metadataObject(metadata);
  const groupId = typeof runMetadata.operationSecurityGroupId === 'string'
    ? runMetadata.operationSecurityGroupId
    : null;
  if (!groupId) return false;

  try {
    await deleteDisposableOperationSecurityGroup(groupId);
    await pool.query(
      `UPDATE operation_runs SET metadata=metadata - 'operationSecurityGroupId',updated_at=NOW() WHERE id=$1`,
      [runId],
    );
    return true;
  } catch (error) {
    if (!isSecurityGroupDependencyViolation(error)) {
      console.warn('[oxsig] Disposable Operation security-group cleanup deferred:', error);
    }
    return false;
  }
}

function linuxUserData(expiresAt: string, extra: string) {
  const calendar = new Date(expiresAt).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
  const ssmDeb = `https://s3.${REGION}.amazonaws.com/amazon-ssm-${REGION}/latest/debian_amd64/amazon-ssm-agent.deb`;
  return `#!/bin/bash
set -u
export DEBIAN_FRONTEND=noninteractive

if ! systemctl enable --now amazon-ssm-agent >/dev/null 2>&1; then
  apt-get update -y || true
  apt-get install -y curl ca-certificates || true
  curl -fsSL '${ssmDeb}' -o /tmp/amazon-ssm-agent.deb || true
  dpkg -i /tmp/amazon-ssm-agent.deb || true
  systemctl enable --now amazon-ssm-agent >/dev/null 2>&1 || true
fi

cat >/etc/systemd/system/oxsig-expiry.service <<'EOF'
[Unit]
Description=Terminate expired OXSIG Operation node
[Service]
Type=oneshot
ExecStart=/sbin/shutdown -h now
EOF
cat >/etc/systemd/system/oxsig-expiry.timer <<'EOF'
[Unit]
Description=OXSIG Operation expiry timer
[Timer]
OnCalendar=${calendar}
Persistent=true
AccuracySec=1min
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now oxsig-expiry.timer

${extra}
`;
}

function windowsUserData(expiresAt: string, extra: string) {
  const expiryIso = new Date(expiresAt).toISOString();
  return `<powershell>
$ErrorActionPreference = 'Continue'
try { Set-Service AmazonSSMAgent -StartupType Automatic; Start-Service AmazonSSMAgent } catch {}
$expiry = [DateTimeOffset]::Parse('${expiryIso}').LocalDateTime
$expiryAction = New-ScheduledTaskAction -Execute "$env:SystemRoot\\System32\\shutdown.exe" -Argument '/s /t 0 /f'
$expiryTrigger = New-ScheduledTaskTrigger -Once -At $expiry
Register-ScheduledTask -TaskName 'OxsigExpiry' -Action $expiryAction -Trigger $expiryTrigger -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
${extra}
</powershell>`;
}

function domainControllerBootstrap(args: { joinPassword: string; learnerPassword: string; servicePassword: string }) {
  return String.raw`
New-Item -ItemType Directory -Path 'C:\ProgramData\OXSIG' -Force | Out-Null
$post = @'
$ErrorActionPreference = "Stop"
Import-Module ActiveDirectory
$domainReady = $false
for ($i=0; $i -lt 60; $i++) {
  try {
    Get-ADDomain -Identity "${DOMAIN_NAME}" -ErrorAction Stop | Out-Null
    $domainReady = $true
    break
  } catch { Start-Sleep -Seconds 10 }
}
if (-not $domainReady) { throw "OXSIG domain controller did not become ready before the bootstrap deadline." }
function Ensure-LabUser($name, $password, $description) {
  if (-not (Get-ADUser -Filter "SamAccountName -eq '$name'" -ErrorAction SilentlyContinue)) {
    $secure = ConvertTo-SecureString $password -AsPlainText -Force
    New-ADUser -Name $name -SamAccountName $name -UserPrincipalName "$name@${DOMAIN_NAME}" -AccountPassword $secure -Enabled $true -PasswordNeverExpires $true -Description $description
  }
}
Ensure-LabUser "joinbot" "${args.joinPassword}" "OXSIG ephemeral domain join account"
Ensure-LabUser "labuser" "${args.learnerPassword}" "OXSIG low privilege starting identity"
Ensure-LabUser "svc_web" "${args.servicePassword}" "OXSIG intentionally weak service identity"
& setspn.exe -S "HTTP/web.${DOMAIN_NAME}" "${DOMAIN_NETBIOS}\svc_web" | Out-Null
if (-not (Get-ADUser -Identity 'labuser' -ErrorAction SilentlyContinue)) { throw "OXSIG lab user was not created." }
if (-not (Get-ADUser -Identity 'svc_web' -ErrorAction SilentlyContinue)) { throw "OXSIG service user was not created." }
"ready" | Set-Content 'C:\ProgramData\OXSIG\domain-ready.txt'
Unregister-ScheduledTask -TaskName 'OxsigDomainPostConfig' -Confirm:$false -ErrorAction SilentlyContinue
'@
Set-Content -Path 'C:\ProgramData\OXSIG\post-domain.ps1' -Value $post -Encoding UTF8
$action = New-ScheduledTaskAction -Execute 'PowerShell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File C:\ProgramData\OXSIG\post-domain.ps1'
$trigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName 'OxsigDomainPostConfig' -Action $action -Trigger $trigger -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
Install-WindowsFeature AD-Domain-Services -IncludeManagementTools | Out-Null
$dsrm = ConvertTo-SecureString '${generatedPassword()}' -AsPlainText -Force
Install-ADDSForest -DomainName '${DOMAIN_NAME}' -DomainNetbiosName '${DOMAIN_NETBIOS}' -InstallDns -SafeModeAdministratorPassword $dsrm -Force
`;
}

function workstationBootstrap(args: { dcIp: string; joinPassword: string }) {
  return String.raw`
New-Item -ItemType Directory -Path 'C:\ProgramData\OXSIG' -Force | Out-Null
$postJoin = @'
$ErrorActionPreference = "Stop"
$domainJoined = $false
for ($i=0; $i -lt 60; $i++) {
  try {
    if ((Get-CimInstance Win32_ComputerSystem).Domain -eq "${DOMAIN_NAME}") {
      $domainJoined = $true
      break
    }
  } catch {}
  Start-Sleep -Seconds 10
}
if (-not $domainJoined) { throw "OXSIG workstation did not join ${DOMAIN_NAME} before the bootstrap deadline." }
try { Add-LocalGroupMember -Group 'Administrators' -Member '${DOMAIN_NETBIOS}\svc_web' -ErrorAction Stop } catch {
  if (-not (Get-LocalGroupMember -Group 'Administrators' -ErrorAction SilentlyContinue | Where-Object Name -eq '${DOMAIN_NETBIOS}\svc_web')) { throw }
}
if ((Get-CimInstance Win32_ComputerSystem).Domain -ne "${DOMAIN_NAME}") { throw "OXSIG workstation domain verification failed." }
"ready" | Set-Content 'C:\ProgramData\OXSIG\workstation-ready.txt'
Unregister-ScheduledTask -TaskName 'OxsigWorkstationPostJoin' -Confirm:$false -ErrorAction SilentlyContinue
'@
Set-Content -Path 'C:\ProgramData\OXSIG\post-join.ps1' -Value $postJoin -Encoding UTF8
$action = New-ScheduledTaskAction -Execute 'PowerShell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File C:\ProgramData\OXSIG\post-join.ps1'
$trigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName 'OxsigWorkstationPostJoin' -Action $action -Trigger $trigger -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
Get-NetAdapter | Where-Object Status -eq 'Up' | Set-DnsClientServerAddress -ServerAddresses '${args.dcIp}'
$secure = ConvertTo-SecureString '${args.joinPassword}' -AsPlainText -Force
$credential = New-Object System.Management.Automation.PSCredential('${DOMAIN_NETBIOS}\joinbot', $secure)
for ($i=0; $i -lt 80; $i++) {
  if (Test-NetConnection -ComputerName '${args.dcIp}' -Port 389 -InformationLevel Quiet) {
    try { Add-Computer -DomainName '${DOMAIN_NAME}' -Credential $credential -Force -Restart -ErrorAction Stop; break } catch {}
  }
  Start-Sleep -Seconds 15
}
`;
}

function operatorBootstrap(args: { dcIp: string; workstationIp: string; learnerPassword: string; mode: OperationMode }) {
  const passwordLine = `INITIAL_PASSWORD='${args.learnerPassword}'`;
  return `apt-get update -y || true
apt-get install -y nmap ldap-utils smbclient krb5-user python3-impacket netcat-openbsd dnsutils || true
mkdir -p /opt/oxsig
cat >/etc/hosts <<'EOF'
127.0.0.1 localhost
${args.dcIp} dc.${DOMAIN_NAME} dc
${args.workstationIp} ws01.${DOMAIN_NAME} ws01
EOF
cat >/etc/krb5.conf <<'EOF'
[libdefaults]
 default_realm = ${DOMAIN_NAME.toUpperCase()}
 dns_lookup_realm = false
 dns_lookup_kdc = false
 rdns = false
[realms]
 ${DOMAIN_NAME.toUpperCase()} = {
  kdc = dc.${DOMAIN_NAME}
  admin_server = dc.${DOMAIN_NAME}
 }
[domain_realm]
 .${DOMAIN_NAME} = ${DOMAIN_NAME.toUpperCase()}
 ${DOMAIN_NAME} = ${DOMAIN_NAME.toUpperCase()}
EOF
cat >/opt/oxsig/operation.env <<'EOF'
OPERATION='black-domain'
MODE='${args.mode}'
DOMAIN='${DOMAIN_NAME}'
DOMAIN_CONTROLLER='${args.dcIp}'
WORKSTATION='${args.workstationIp}'
INITIAL_USER='${DOMAIN_NETBIOS}\\labuser'
${passwordLine}
EOF
chmod 0640 /opt/oxsig/operation.env
printf '%s\
' 'Operation Black Domain' 'Use /opt/oxsig/operation.env for scope and starting access.' > /opt/oxsig/README
`;
}

async function launchNode(args: {
  idForTag: string;
  operationRunId: string;
  nodeId: string;
  nodeKey: string;
  label: string;
  ownerId: string;
  operationSlug: string;
  expiresAt: string;
  osFamily: 'ubuntu' | 'windows';
  imageId: string;
  instanceType: string;
  userData: string;
  securityGroupId: string;
  purpose: 'CyberLab' | 'OperationNode';
  labInstanceId?: string;
}) : Promise<LaunchedNode> {
  if (!SUBNET_ID || !args.securityGroupId) throw new OperationRuntimeError('Operation network configuration disappeared.', 503);
  const tags = [
    { Key: 'Name', Value: `oxsig-${args.operationSlug}-${args.nodeKey}-${args.idForTag.slice(0, 8)}` },
    { Key: 'App', Value: 'Oxsig' },
    { Key: 'Purpose', Value: args.purpose },
    { Key: 'OperationRunId', Value: args.operationRunId },
    { Key: 'OperationNodeId', Value: args.nodeId },
    { Key: 'OperationSlug', Value: args.operationSlug },
    { Key: 'OperationNodeKey', Value: args.nodeKey },
    { Key: 'OwnerId', Value: args.ownerId },
    { Key: 'ExpiresAt', Value: args.expiresAt },
    ...(args.labInstanceId ? [{ Key: 'LabInstanceId', Value: args.labInstanceId }] : []),
  ];
  const response = await ec2.send(new RunInstancesCommand({
    ImageId: args.imageId,
    InstanceType: args.instanceType as _InstanceType,
    MinCount: 1,
    MaxCount: 1,
    NetworkInterfaces: [{
      DeviceIndex: 0,
      SubnetId: SUBNET_ID,
      Groups: [args.securityGroupId],
      AssociatePublicIpAddress: operationPublicIpEnabled(),
      DeleteOnTermination: true,
    }],
    IamInstanceProfile: INSTANCE_PROFILE ? { Name: INSTANCE_PROFILE } : undefined,
    MetadataOptions: { HttpEndpoint: 'enabled', HttpTokens: 'required' },
    InstanceInitiatedShutdownBehavior: 'terminate',
    UserData: Buffer.from(args.userData, 'utf8').toString('base64'),
    TagSpecifications: [
      { ResourceType: 'instance', Tags: tags },
      { ResourceType: 'volume', Tags: tags.filter((tag) => tag.Key !== 'Name') },
    ],
  }));
  const instance = response.Instances?.[0];
  const externalId = instance?.InstanceId;
  if (!externalId) throw new OperationRuntimeError(`AWS did not return an instance id for ${args.label}.`, 503, 'OPERATION_NODE_CREATE_FAILED');

  let privateIp = instance.PrivateIpAddress;
  if (!privateIp) {
    const described = await ec2.send(new DescribeInstancesCommand({ InstanceIds: [externalId] }));
    privateIp = described.Reservations?.[0]?.Instances?.[0]?.PrivateIpAddress;
  }
  if (!privateIp) {
    await ec2.send(new TerminateInstancesCommand({ InstanceIds: [externalId] })).catch(() => undefined);
    throw new OperationRuntimeError(`AWS did not allocate a private address for ${args.label}.`, 503, 'OPERATION_NODE_NETWORK_FAILED');
  }
  return { externalId, privateIp, imageId: args.imageId, instanceType: args.instanceType };
}

async function updateNodeRuntime(pool: Pool, node: NodeRecord, launched: LaunchedNode) {
  await pool.query(
    `UPDATE operation_nodes
        SET runtime_external_id=$1, private_ip=$2::inet,
            metadata=metadata || $3::jsonb, updated_at=NOW()
      WHERE id=$4`,
    [launched.externalId, launched.privateIp, stringifyPostgresJson({ imageId: launched.imageId, instanceType: launched.instanceType, region: REGION }), node.id]
  );
}

export async function provisionOperationRun(args: { pool: Pool; ownerId: string; slug: string; mode: OperationMode }) {
  const operation = getOperation(args.slug);
  if (!operation) throw new OperationRuntimeError('Operation not found.', 404, 'OPERATION_NOT_FOUND');
  if (operation.slug !== BLACK_DOMAIN_SLUG) {
    throw new OperationRuntimeError('This Operation does not have an automated multi-node runtime yet.', 409, 'OPERATION_RUNTIME_NOT_AUTOMATED');
  }

  const network = await assertOperationRuntimeReady();
  const [ubuntuImageId, windowsImageId] = await Promise.all([resolveImage('ubuntu'), resolveImage('windows')]);
  const expiresAt = new Date(Date.now() + expiryMinutes(operation.estimatedMinutes) * 60_000).toISOString();
  const joinPassword = generatedPassword();
  const learnerPassword = generatedPassword();
  // This account is intentionally crackable inside the disposable scenario, but
  // its value is randomized per run so the weakness never becomes a shared secret.
  const servicePassword = generatedWeakServicePassword();
  const initialUsername = `${DOMAIN_NETBIOS}\\labuser`;
  const client = await args.pool.connect();

  let runId = '';
  let operatorLabInstanceId = '';
  let nodes: NodeRecord[] = [];
  try {
    await client.query('BEGIN');
    const active = await client.query(
      `SELECT 1 FROM lab_instances
        WHERE owner_id=$1 AND status NOT IN ('destroying','destroyed','failed')
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1`,
      [args.ownerId]
    );
    if (active.rowCount) {
      throw new OperationRuntimeError('Stop or destroy your current Cyber Lab before starting a multi-node Operation.', 409, 'OPERATION_LAB_SLOT_OCCUPIED');
    }

    const definition = await client.query(
      `INSERT INTO lab_definitions (slug,name,category,description,difficulty,runtime_kind,definition,enabled)
       VALUES ($1,$2,$3,$4,$5,'vm',$6::jsonb,true)
       ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, category=EXCLUDED.category,
         description=EXCLUDED.description, difficulty=EXCLUDED.difficulty,
         definition=EXCLUDED.definition, enabled=true, updated_at=NOW()
       RETURNING id`,
      [
        'operation-black-domain-operator',
        'Black Domain Operator',
        'Active Directory',
        'Managed Ubuntu operator for Operation Black Domain.',
        'advanced',
        stringifyPostgresJson({ operationSlug: operation.slug, role: 'operator', osFamily: 'ubuntu', accessModes: ['terminal'] }),
      ]
    );

    const run = await client.query(
      `INSERT INTO operation_runs (owner_id,operation_slug,mode,status,expires_at,metadata)
       VALUES ($1,$2,$3,'provisioning',$4,$5::jsonb)
       RETURNING id`,
      [args.ownerId, operation.slug, args.mode, expiresAt, stringifyPostgresJson({
        domain: DOMAIN_NAME,
        domainNetbios: DOMAIN_NETBIOS,
        initialAccess: { username: initialUsername },
        readinessVersion: READINESS_VERSION,
        scenario: 'active-directory',
        network: { publicIp: operationPublicIpEnabled() },
      })]
    );
    runId = run.rows[0].id;
    const passwordSecret = sealOperationAccessSecret({ ownerId: args.ownerId, runId, password: learnerPassword });
    await client.query(
      `UPDATE operation_runs SET metadata=metadata || $1::jsonb, updated_at=NOW() WHERE id=$2 AND owner_id=$3`,
      [stringifyPostgresJson({ initialAccess: { username: initialUsername, passwordSecret } }), runId, args.ownerId]
    );

    const operatorLab = await client.query(
      `INSERT INTO lab_instances (definition_id,owner_id,status,runtime_provider,expires_at,metadata)
       VALUES ($1,$2,'provisioning','aws-ec2',$3,$4::jsonb)
       RETURNING id`,
      [definition.rows[0].id, args.ownerId, expiresAt, stringifyPostgresJson({
        accessMode: 'terminal', operationRunId: runId, operationSlug: operation.slug,
        operationNodeKey: 'operator', managedByOperation: true,
      })]
    );
    operatorLabInstanceId = operatorLab.rows[0].id;

    const nodeRows = await client.query(
      `INSERT INTO operation_nodes (run_id,node_key,label,role,os_family,lab_instance_id,metadata)
       VALUES
         ($1,'dc','Domain Controller','infrastructure','windows',NULL,'{}'::jsonb),
         ($1,'workstation','Windows Workstation','target','windows',NULL,'{}'::jsonb),
         ($1,'operator','Operator Terminal','operator','ubuntu',$2,'{}'::jsonb)
       RETURNING id,node_key,label,role,os_family,lab_instance_id`,
      [runId, operatorLabInstanceId]
    );
    nodes = nodeRows.rows.map((row) => ({
      id: row.id, nodeKey: row.node_key, label: row.label, role: row.role,
      osFamily: row.os_family, labInstanceId: row.lab_instance_id || null,
    }));
    await client.query(`UPDATE operation_runs SET operator_lab_instance_id=$1, updated_at=NOW() WHERE id=$2`, [operatorLabInstanceId, runId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    const dbError = error as { code?: string; constraint?: string } | null;
    if (dbError?.code === '23505' && dbError.constraint === ONE_LAB_INDEX) {
      throw new OperationRuntimeError(
        'A lab allocation already exists for this account. Wait for cleanup or destroy it before starting the Operation.',
        409,
        'OPERATION_LAB_SLOT_OCCUPIED'
      );
    }
    throw error;
  } finally {
    client.release();
  }

  const createdExternalIds: string[] = [];
  const dc = nodes.find((node) => node.nodeKey === 'dc')!;
  const workstation = nodes.find((node) => node.nodeKey === 'workstation')!;
  const operator = nodes.find((node) => node.nodeKey === 'operator')!;
  let operationSecurityGroupId = '';

  try {
    operationSecurityGroupId = await createDisposableOperationSecurityGroup({
      vpcId: network.vpcId,
      runId,
      ownerId: args.ownerId,
      expiresAt,
    });
    await args.pool.query(
      `UPDATE operation_runs SET metadata=metadata || $1::jsonb,updated_at=NOW() WHERE id=$2 AND owner_id=$3`,
      [stringifyPostgresJson({ operationSecurityGroupId }), runId, args.ownerId],
    );

    const dcRuntime = await launchNode({
      idForTag: dc.id, operationRunId: runId, nodeId: dc.id, nodeKey: dc.nodeKey,
      label: dc.label, ownerId: args.ownerId, operationSlug: operation.slug, expiresAt,
      osFamily: 'windows', imageId: windowsImageId, instanceType: windowsInstanceType(),
      userData: windowsUserData(expiresAt, domainControllerBootstrap({ joinPassword, learnerPassword, servicePassword })),
      securityGroupId: operationSecurityGroupId,
      purpose: 'OperationNode',
    });
    createdExternalIds.push(dcRuntime.externalId);
    await updateNodeRuntime(args.pool, dc, dcRuntime);

    const workstationRuntime = await launchNode({
      idForTag: workstation.id, operationRunId: runId, nodeId: workstation.id, nodeKey: workstation.nodeKey,
      label: workstation.label, ownerId: args.ownerId, operationSlug: operation.slug, expiresAt,
      osFamily: 'windows', imageId: windowsImageId, instanceType: windowsInstanceType(),
      userData: windowsUserData(expiresAt, workstationBootstrap({ dcIp: dcRuntime.privateIp, joinPassword })),
      securityGroupId: operationSecurityGroupId,
      purpose: 'OperationNode',
    });
    createdExternalIds.push(workstationRuntime.externalId);
    await updateNodeRuntime(args.pool, workstation, workstationRuntime);

    const operatorRuntime = await launchNode({
      idForTag: operatorLabInstanceId, operationRunId: runId, nodeId: operator.id, nodeKey: operator.nodeKey,
      label: operator.label, ownerId: args.ownerId, operationSlug: operation.slug, expiresAt,
      osFamily: 'ubuntu', imageId: ubuntuImageId, instanceType: linuxInstanceType(),
      userData: linuxUserData(expiresAt, operatorBootstrap({
        dcIp: dcRuntime.privateIp,
        workstationIp: workstationRuntime.privateIp,
        learnerPassword,
        mode: args.mode,
      })),
      securityGroupId: operationSecurityGroupId,
      purpose: 'CyberLab', labInstanceId: operatorLabInstanceId,
    });
    createdExternalIds.push(operatorRuntime.externalId);
    await updateNodeRuntime(args.pool, operator, operatorRuntime);
    await args.pool.query(
      `UPDATE lab_instances
          SET runtime_external_id=$1,
              metadata=metadata || $2::jsonb,
              last_error=NULL, updated_at=NOW()
        WHERE id=$3 AND owner_id=$4`,
      [operatorRuntime.externalId, stringifyPostgresJson({
        region: REGION, imageId: ubuntuImageId, instanceType: operatorRuntime.instanceType,
        osFamily: 'ubuntu', platform: 'linux', shell: 'bash', accessMode: 'terminal',
      }), operatorLabInstanceId, args.ownerId]
    );
    await args.pool.query(
      `UPDATE operation_runs SET metadata=metadata || $1::jsonb, last_error=NULL, updated_at=NOW() WHERE id=$2`,
      [stringifyPostgresJson({
        topology: {
          operator: { privateIp: operatorRuntime.privateIp, labInstanceId: operatorLabInstanceId },
          dc: { privateIp: dcRuntime.privateIp, hostname: `dc.${DOMAIN_NAME}` },
          workstation: { privateIp: workstationRuntime.privateIp, hostname: `ws01.${DOMAIN_NAME}` },
        },
      }), runId]
    );
    return { runId, operatorLabInstanceId, expiresAt, status: 'provisioning' as const };
  } catch (error) {
    if (createdExternalIds.length) {
      await ec2.send(new TerminateInstancesCommand({ InstanceIds: createdExternalIds })).catch(() => undefined);
    }
    if (operationSecurityGroupId) {
      await deleteDisposableOperationSecurityGroup(operationSecurityGroupId).catch(() => undefined);
    }
    const message = error instanceof Error ? error.message.slice(0, 800) : 'Operation provisioning failed';
    await Promise.all([
      args.pool.query(`UPDATE operation_runs SET status='failed',last_error=$1,updated_at=NOW() WHERE id=$2`, [message, runId]),
      args.pool.query(`UPDATE operation_nodes SET status='failed',last_error=$1,updated_at=NOW() WHERE run_id=$2`, [message, runId]),
      args.pool.query(`UPDATE lab_instances SET status='failed',last_error=$1,updated_at=NOW() WHERE id=$2 AND owner_id=$3`, [message, operatorLabInstanceId, args.ownerId]),
    ]);
    throw error instanceof OperationRuntimeError ? error : new OperationRuntimeError(message, 503, 'OPERATION_PROVISION_FAILED');
  }
}

function mapEc2State(value?: string) {
  if (value === 'running') return 'running';
  if (value === 'terminated' || value === 'shutting-down') return 'destroyed';
  return 'provisioning';
}

function metadataObject(value: unknown): OperationNodeMetadata {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as OperationNodeMetadata
    : {};
}

function readinessCheckDue(metadata: OperationNodeMetadata) {
  if (!metadata.readinessCheckedAt) return true;
  const checkedAt = Date.parse(metadata.readinessCheckedAt);
  return !Number.isFinite(checkedAt) || Date.now() - checkedAt >= (metadata.readinessReason === 'probe-pending' ? 5_000 : READINESS_RETRY_MS);
}

function publicOperationMetadata(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const metadata = { ...(value as Record<string, unknown>) };
  delete metadata.operationSecurityGroupId;
  const rawAccess = metadata.initialAccess;
  if (rawAccess && typeof rawAccess === 'object' && !Array.isArray(rawAccess)) {
    const access = rawAccess as Record<string, unknown>;
    const username = typeof access.username === 'string' ? access.username : undefined;
    const available = typeof access.passwordSecret === 'string' || typeof access.password === 'string';
    metadata.initialAccess = {
      ...(username ? { username } : {}),
      available,
    };
  }
  return metadata;
}

export async function getOperationRun(args: { pool: Pool; runId: string; ownerId: string }) {
  const runResult = await args.pool.query(
    `SELECT id,operation_slug,mode,status,operator_lab_instance_id,environment_id,expires_at,metadata,last_error,created_at,updated_at
       FROM operation_runs WHERE id=$1 AND owner_id=$2 LIMIT 1`,
    [args.runId, args.ownerId]
  );
  const run = runResult.rows[0];
  if (!run) throw new OperationRuntimeError('Operation run not found.', 404, 'OPERATION_RUN_NOT_FOUND');
  const nodeResult = await args.pool.query(
    `SELECT id,node_key,label,role,os_family,status,runtime_external_id,private_ip::text,lab_instance_id,metadata,last_error
       FROM operation_nodes WHERE run_id=$1 ORDER BY CASE role WHEN 'operator' THEN 0 WHEN 'target' THEN 1 ELSE 2 END,node_key`,
    [args.runId]
  );
  const externalIds = nodeResult.rows
    .map((node) => node.runtime_external_id as string | null)
    .filter((value): value is string => Boolean(value));
  const states = new Map<string, string>();
  if (externalIds.length) {
    try {
      const response = await ec2.send(new DescribeInstancesCommand({ InstanceIds: externalIds }));
      // A successful DescribeInstances response that omits a requested id means
      // that runtime is no longer present. Seed requested ids as terminated and
      // overwrite the entries AWS actually returns. If the request itself fails,
      // the catch below preserves durable stored state instead.
      for (const externalId of externalIds) states.set(externalId, 'terminated');
      for (const reservation of response.Reservations || []) {
        for (const instance of reservation.Instances || []) if (instance.InstanceId) states.set(instance.InstanceId, instance.State?.Name || 'pending');
      }
    } catch {
      states.clear();
      // Preserve stored state if EC2 reconciliation is temporarily unavailable.
    }
  }

  const runMetadata = metadataObject(run.metadata);
  const readinessRequired = Number(runMetadata.readinessVersion || 0) >= READINESS_VERSION;
  const readinessByNode = new Map<string, OperationReadinessResult>();

  if (readinessRequired && !['failed', 'destroying', 'destroyed'].includes(run.status) && runMetadata.lifecycleState !== 'paused') {
    const candidates = nodeResult.rows.filter((node) => {
      if (!node.runtime_external_id || !states.has(node.runtime_external_id)) return false;
      if (mapEc2State(states.get(node.runtime_external_id)) !== 'running') return false;
      if (node.status === 'failed' || node.status === 'destroying') return false;
      const metadata = metadataObject(node.metadata);
      if (metadata.bootstrapReadyAt) {
        readinessByNode.set(node.id, { ready: true, reason: 'ready' });
        return false;
      }
      if (!readinessCheckDue(metadata)) {
        readinessByNode.set(node.id, { ready: false, reason: (metadata.readinessReason || 'probe-pending') as OperationReadinessResult['reason'], error: typeof metadata.readinessError === 'string' ? metadata.readinessError : undefined });
        return false;
      }
      return true;
    });

    const checkedAt = new Date().toISOString();
    const results = await Promise.all(candidates.map(async (node) => {
      try {
        const result = await probeOperationNodeReadiness({
          instanceId: node.runtime_external_id,
          nodeKey: node.node_key,
          osFamily: node.os_family,
          commandStartedAt: typeof node.metadata?.readinessCommandStartedAt === 'string' ? node.metadata.readinessCommandStartedAt : undefined,
          commandId: typeof node.metadata?.readinessCommandId === 'string' ? node.metadata.readinessCommandId : undefined,
        });
        return { node, result };
      } catch (error) {
        return { node, result: { ready: false, reason: 'probe-failed' as const, error: operationReadinessError(error, 'probe') } as OperationReadinessResult };
      }
    }));

    await Promise.all(results.map(async ({ node, result }) => {
      const patch = result.ready
        ? { readinessCheckedAt: checkedAt, readinessReason: result.reason, bootstrapReadyAt: checkedAt }
        : { readinessCheckedAt: checkedAt, readinessReason: result.reason };
      await args.pool.query(
        `UPDATE operation_nodes
            SET status=CASE WHEN $1::boolean THEN 'running' ELSE status END,
                metadata=metadata || $2::jsonb,
                updated_at=NOW()
          WHERE id=$3 AND run_id=$4`,
        [result.ready, stringifyPostgresJson({ ...patch, readinessCommandId: result.commandId || null, readinessCommandStartedAt: result.commandId ? node.metadata?.readinessCommandStartedAt || checkedAt : null, readinessError: result.error || null }), node.id, args.runId]
      );
      readinessByNode.set(node.id, result);
    }));
  }

  const nodes = nodeResult.rows.map((node) => {
    const externalId = node.runtime_external_id as string | null;
    const hasFreshComputeState = Boolean(externalId && states.has(externalId));
    const computeStatus = hasFreshComputeState ? mapEc2State(states.get(externalId!)) : node.status;
    const metadata = metadataObject(node.metadata);
    const knownReady = Boolean(metadata.bootstrapReadyAt) || readinessByNode.get(node.id)?.ready === true;

    let status = node.status as string;
    if (node.status === 'destroyed') {
      status = 'destroyed';
    } else if (hasFreshComputeState) {
      if (computeStatus === 'destroyed') status = 'destroyed';
      else if (node.status === 'failed') status = 'failed';
      else if (node.status === 'destroying') status = 'destroying';
      else if (computeStatus !== 'running') status = 'provisioning';
      else if (!readinessRequired || knownReady) status = 'running';
      else status = 'provisioning';
    }

    const readiness = !readinessRequired
      ? 'legacy'
      : status === 'destroyed' || status === 'failed' || status === 'destroying'
        ? 'unavailable'
        : knownReady
          ? 'ready'
          : readinessByNode.get(node.id)?.reason || metadata.readinessReason || 'bootstrapping';

    return {
      id: node.id,
      key: node.node_key,
      label: node.label,
      role: node.role,
      osFamily: node.os_family,
      status,
      computeStatus,
      readiness,
      readinessError: readinessByNode.has(node.id) ? readinessByNode.get(node.id)?.error || null : metadata.readinessError || null,
      privateIp: node.private_ip || null,
      labInstanceId: node.lab_instance_id || null,
      lastError: node.last_error || null,
    };
  });
  const allRunning = nodes.length > 0 && nodes.every((node) => node.status === 'running');
  const allDestroyed = nodes.length > 0 && nodes.every((node) => node.status === 'destroyed');
  const nextStatus = run.status === 'destroyed' || run.status === 'failed'
    ? run.status
    : allDestroyed
      ? 'destroyed'
      : allRunning
        ? 'running'
        : run.status === 'destroying'
          ? 'destroying'
          : 'provisioning';
  if (nextStatus !== run.status) {
    await args.pool.query(`UPDATE operation_runs SET status=$1,updated_at=NOW() WHERE id=$2 AND owner_id=$3`, [nextStatus, args.runId, args.ownerId]);
  }
  if (run.operator_lab_instance_id) {
    const operatorNode = nodes.find((node) => node.role === 'operator');
    if (operatorNode?.status === 'running') {
      await args.pool.query(`UPDATE lab_instances SET status='running',started_at=COALESCE(started_at,NOW()),updated_at=NOW() WHERE id=$1 AND owner_id=$2 AND status='provisioning'`, [run.operator_lab_instance_id, args.ownerId]);
    }
  }
  if (!run.environment_id && (nextStatus === 'destroyed' || nextStatus === 'failed')) {
    await cleanupDisposableOperationSecurityGroup(args.pool, args.runId, run.metadata);
  }
  return {
    id: run.id,
    operationSlug: run.operation_slug,
    mode: run.mode,
    status: nextStatus,
    operatorLabInstanceId: run.operator_lab_instance_id,
    expiresAt: run.expires_at,
    metadata: publicOperationMetadata(run.metadata),
    lastError: run.last_error || null,
    nodes,
  };
}

export async function destroyOperationRun(args: { pool: Pool; runId: string; ownerId: string }) {
  const run = await args.pool.query(
    `SELECT id,status,operator_lab_instance_id,environment_id,metadata FROM operation_runs WHERE id=$1 AND owner_id=$2 LIMIT 1`,
    [args.runId, args.ownerId]
  );
  if (!run.rows[0]) throw new OperationRuntimeError('Operation run not found.', 404, 'OPERATION_RUN_NOT_FOUND');
  if (run.rows[0].status === 'destroyed') {
    const environmentId = run.rows[0].environment_id as string | null;
    if (environmentId) {
      const reset = await advancePreparedEnvironmentReset({ pool: args.pool, environmentId });
      return { destroyed: true, alreadyDestroyed: true, reusableEnvironment: true, reset };
    }
    await cleanupDisposableOperationSecurityGroup(args.pool, args.runId, run.rows[0].metadata);
    return { destroyed: true, alreadyDestroyed: true };
  }
  const nodes = await args.pool.query(`SELECT runtime_external_id FROM operation_nodes WHERE run_id=$1 AND runtime_external_id IS NOT NULL`, [args.runId]);
  const externalIds = [...new Set(nodes.rows.map((row) => row.runtime_external_id as string).filter(Boolean))];
  if (!run.rows[0].environment_id) await assertDisposableInstances(ec2, externalIds);
  await args.pool.query(`UPDATE operation_runs SET status='destroying',updated_at=NOW() WHERE id=$1 AND owner_id=$2`, [args.runId, args.ownerId]);
  await args.pool.query(`UPDATE operation_nodes SET status='destroying',updated_at=NOW() WHERE run_id=$1 AND status NOT IN ('destroyed','failed')`, [args.runId]);
  if (run.rows[0].operator_lab_instance_id) {
    await args.pool.query(`UPDATE lab_instances SET status='destroying',updated_at=NOW() WHERE id=$1 AND owner_id=$2 AND status NOT IN ('destroyed','failed')`, [run.rows[0].operator_lab_instance_id, args.ownerId]);
  }

  const environmentId = run.rows[0].environment_id as string | null;
  if (environmentId) {
    const client = await args.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE operation_environments
            SET status='resetting',assigned_run_id=NULL,
                metadata=metadata || $1::jsonb,updated_at=NOW()
          WHERE id=$2 AND assigned_run_id=$3`,
        [stringifyPostgresJson({ resetRequired: true, resetAfterRunId: args.runId }), environmentId, args.runId],
      );
      await client.query(`UPDATE operation_runs SET status='destroyed',updated_at=NOW() WHERE id=$1 AND owner_id=$2`, [args.runId, args.ownerId]);
      await client.query(`UPDATE operation_nodes SET status='destroyed',updated_at=NOW() WHERE run_id=$1`, [args.runId]);
      if (run.rows[0].operator_lab_instance_id) {
        await client.query(
          `UPDATE lab_instances SET status='destroyed',stopped_at=NOW(),updated_at=NOW() WHERE id=$1 AND owner_id=$2`,
          [run.rows[0].operator_lab_instance_id, args.ownerId],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    const reset = await beginPreparedEnvironmentReset({ pool: args.pool, environmentId, runId: args.runId });
    return {
      destroyed: true,
      alreadyDestroyed: false,
      reusableEnvironment: true,
      reset,
    };
  }

  if (externalIds.length) await ec2.send(new TerminateInstancesCommand({ InstanceIds: externalIds }));
  await cleanupDisposableOperationSecurityGroup(args.pool, args.runId, run.rows[0].metadata);
  return { destroyed: true, alreadyDestroyed: false, terminating: externalIds.length };
}
