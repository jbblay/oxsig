import 'server-only';

import {
  DescribeImagesCommand,
  DescribeInstancesCommand,
  DescribeSecurityGroupsCommand,
  EC2Client,
  RunInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand,
  type InstanceStateName,
  type _InstanceType,
} from '@aws-sdk/client-ec2';
import { DescribeInstanceInformationCommand, SSMClient } from '@aws-sdk/client-ssm';
import type { Pool } from 'pg';
import crypto from 'crypto';
import { awsClientConfig } from '@/lib/aws/client-config';
import { buildLabAccess, type LabAccess } from '@/lib/labs/access';
import { operationReadinessError, probeOperationNodeReadiness } from '@/lib/operations/readiness';
import { sealOperationAccessSecret } from '@/lib/operations/access-secret';
import { assertOperationRuntimeReady } from '@/lib/operations/config';
import { getOperation, type OperationMode } from '@/lib/operations/catalog';
import { stringifyPostgresJson } from '@/lib/db/postgres-safe';

const REGION = process.env.LAB_AWS_REGION || process.env.AWS_REGION || 'eu-central-1';
const SUBNET_ID = process.env.LAB_AWS_SUBNET_ID?.trim() || '';
const OPERATION_SECURITY_GROUP_ID = process.env.LAB_AWS_OPERATION_SECURITY_GROUP_ID?.trim() || '';
const INSTANCE_PROFILE = process.env.LAB_AWS_INSTANCE_PROFILE?.trim() || '';
const DEFAULT_LINUX_INSTANCE_TYPE = process.env.LAB_AWS_OPERATION_LINUX_INSTANCE_TYPE?.trim() || 't3.small';
const DEFAULT_WINDOWS_INSTANCE_TYPE = process.env.LAB_AWS_OPERATION_WINDOWS_INSTANCE_TYPE?.trim() || 't3.medium';
const DEFAULT_UBUNTU_IMAGE = process.env.LAB_AWS_UBUNTU_AMI?.trim() || '';
const DEFAULT_WINDOWS_IMAGE = process.env.LAB_AWS_WINDOWS_AMI?.trim() || '';
const ONE_LAB_INDEX = 'lab_instances_one_nonterminal_per_owner_idx';
const BLACK_DOMAIN_SLUG = 'black-domain';
const DOMAIN_NAME = 'blackdomain.local';
const DOMAIN_NETBIOS = 'BLACKDOMAIN';
const READINESS_VERSION = 1;

const ec2 = new EC2Client(awsClientConfig(REGION));
const ssm = new SSMClient(awsClientConfig(REGION));

export class OperationRuntimeError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 500, code?: string) {
    super(message);
    this.name = 'OperationRuntimeError';
    this.status = status;
    this.code = code;
  }
}

type NodeRecord = {
  id: string;
  nodeKey: string;
  label: string;
  role: string;
  osFamily: 'ubuntu' | 'windows';
  labInstanceId: string | null;
};

type LaunchedNode = {
  externalId: string;
  privateIp: string;
  imageId: string;
  instanceType: string;
};

function operationPublicIpEnabled() {
  return process.env.LAB_AWS_OPERATION_PUBLIC_IP === 'true';
}

function expiryMinutes(estimatedMinutes?: number) {
  const configured = Number(process.env.LAB_AWS_OPERATION_TTL_MINUTES || '');
  if (Number.isFinite(configured) && configured >= 30 && configured <= 24 * 60) return Math.floor(configured);
  return Math.max(90, Math.min(360, Math.ceil((estimatedMinutes || 90) * 1.5)));
}

function linuxInstanceType() {
  return DEFAULT_LINUX_INSTANCE_TYPE;
}

function windowsInstanceType() {
  return DEFAULT_WINDOWS_INSTANCE_TYPE;
}

function generatedPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const chars = Array.from(crypto.randomBytes(22), (byte) => alphabet[byte % alphabet.length]);
  return `A9!${chars.join('')}`;
}

function generatedWeakServicePassword() {
  // Deliberately weak only inside a short-lived, isolated training domain. Random
  // suffix prevents this from becoming a reusable credential across runs.
  return `Summer${new Date().getUTCFullYear()}!${crypto.randomBytes(2).toString('hex')}`;
}

async function resolveImage(osFamily: 'ubuntu' | 'windows') {
  const configured = osFamily === 'ubuntu' ? DEFAULT_UBUNTU_IMAGE : DEFAULT_WINDOWS_IMAGE;
  if (configured) return configured;

  const response = await ec2.send(new DescribeImagesCommand({
    Owners: osFamily === 'ubuntu' ? ['099720109477'] : ['amazon'],
    Filters: osFamily === 'ubuntu'
      ? [
          { Name: 'name', Values: ['ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*'] },
          { Name: 'architecture', Values: ['x86_64'] },
          { Name: 'state', Values: ['available'] },
        ]
      : [
          { Name: 'name', Values: ['Windows_Server-2022-English-Full-Base-*'] },
          { Name: 'architecture', Values: ['x86_64'] },
          { Name: 'state', Values: ['available'] },
        ],
  }));
  const image = [...(response.Images || [])]
    .filter((item) => item.ImageId && item.CreationDate)
    .sort((a, b) => String(b.CreationDate).localeCompare(String(a.CreationDate)))[0];
  if (!image?.ImageId) {
    throw new OperationRuntimeError(`No ${osFamily} training image is available in ${REGION}.`, 503, 'OPERATION_IMAGE_NOT_FOUND');
  }
  return image.ImageId;
}

function windowsUserData(expiresAt: string, script: string) {
  return `<powershell>
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path 'C:\\ProgramData\\OXSIG' | Out-Null
Set-Content -Path 'C:\\ProgramData\\OXSIG\\expires-at.txt' -Value '${expiresAt}' -Encoding ASCII
${script}
</powershell>`;
}

function linuxUserData(expiresAt: string, script: string) {
  return `#!/bin/bash
set -u
mkdir -p /opt/oxsig
printf '%s\\n' '${expiresAt}' > /opt/oxsig/expires-at.txt
${script}
`;
}

function domainControllerBootstrap(args: { joinPassword: string; learnerPassword: string; servicePassword: string }) {
  return `
Install-WindowsFeature AD-Domain-Services,DNS,RSAT-AD-Tools -IncludeManagementTools | Out-Null
$domainReady = 'C:\\ProgramData\\OXSIG\\domain-ready.txt'
$stageTwo = @'
$ErrorActionPreference = 'Stop'
Import-Module ActiveDirectory
$joinSecure = ConvertTo-SecureString '${args.joinPassword}' -AsPlainText -Force
if (-not (Get-ADUser -Filter "SamAccountName -eq 'joinbot'" -ErrorAction SilentlyContinue)) {
  New-ADUser -Name 'Oxsig Join Bot' -SamAccountName 'joinbot' -UserPrincipalName 'joinbot@${DOMAIN_NAME}' -AccountPassword $joinSecure -Enabled $true -PasswordNeverExpires $true
}
$learnerSecure = ConvertTo-SecureString '${args.learnerPassword}' -AsPlainText -Force
if (-not (Get-ADUser -Filter "SamAccountName -eq 'labuser'" -ErrorAction SilentlyContinue)) {
  New-ADUser -Name 'Lab User' -SamAccountName 'labuser' -UserPrincipalName 'labuser@${DOMAIN_NAME}' -AccountPassword $learnerSecure -Enabled $true -PasswordNeverExpires $true
}
$serviceSecure = ConvertTo-SecureString '${args.servicePassword}' -AsPlainText -Force
if (-not (Get-ADUser -Filter "SamAccountName -eq 'svc_web'" -ErrorAction SilentlyContinue)) {
  New-ADUser -Name 'Legacy Web Service' -SamAccountName 'svc_web' -UserPrincipalName 'svc_web@${DOMAIN_NAME}' -AccountPassword $serviceSecure -Enabled $true -PasswordNeverExpires $true -ServicePrincipalNames 'HTTP/legacy.${DOMAIN_NAME}'
}
Set-Content -Path '$domainReady' -Value 'ready' -Encoding ASCII
Unregister-ScheduledTask -TaskName 'OxsigDomainFinalize' -Confirm:$false -ErrorAction SilentlyContinue
'@
Set-Content -Path 'C:\\ProgramData\\OXSIG\\finalize-domain.ps1' -Value $stageTwo -Encoding UTF8
$action = New-ScheduledTaskAction -Execute 'PowerShell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File C:\\ProgramData\\OXSIG\\finalize-domain.ps1'
$trigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName 'OxsigDomainFinalize' -Action $action -Trigger $trigger -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
$dsrm = ConvertTo-SecureString '${args.joinPassword}' -AsPlainText -Force
Install-ADDSForest -DomainName '${DOMAIN_NAME}' -DomainNetbiosName '${DOMAIN_NETBIOS}' -SafeModeAdministratorPassword $dsrm -InstallDNS -Force
`;
}

function workstationBootstrap(args: { dcIp: string; joinPassword: string }) {
  return `
New-Item -ItemType Directory -Force -Path 'C:\\ProgramData\\OXSIG' | Out-Null
$postJoin = @'
$ErrorActionPreference = 'Stop'
$joined = $false
try { $joined = (Get-CimInstance Win32_ComputerSystem -ErrorAction Stop).Domain -ieq '${DOMAIN_NAME}' } catch {}
if (-not $joined) { exit 2 }
Set-Content -Path 'C:\\ProgramData\\OXSIG\\workstation-ready.txt' -Value 'ready' -Encoding ASCII
Unregister-ScheduledTask -TaskName 'OxsigWorkstationPostJoin' -Confirm:$false -ErrorAction SilentlyContinue
'@
Set-Content -Path 'C:\\ProgramData\\OXSIG\\post-join.ps1' -Value $postJoin -Encoding UTF8
$action = New-ScheduledTaskAction -Execute 'PowerShell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File C:\\ProgramData\\OXSIG\\post-join.ps1'
$trigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName 'OxsigWorkstationPostJoin' -Action $action -Trigger $trigger -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
Get-NetAdapter | Where-Object Status -eq 'Up' | Set-DnsClientServerAddress -ServerAddresses '${args.dcIp}'
$secure = ConvertTo-SecureString '${args.joinPassword}' -AsPlainText -Force
$credential = New-Object System.Management.Automation.PSCredential('${DOMAIN_NETBIOS}\\joinbot', $secure)
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
cat >/usr/local/bin/oxsig-get-user-spns <<'EOF'
#!/bin/bash
set -e
if command -v impacket-GetUserSPNs >/dev/null 2>&1; then exec impacket-GetUserSPNs "$@"; fi
if command -v GetUserSPNs.py >/dev/null 2>&1; then exec GetUserSPNs.py "$@"; fi
if [ -r /usr/share/doc/python3-impacket/examples/GetUserSPNs.py ]; then exec python3 /usr/share/doc/python3-impacket/examples/GetUserSPNs.py "$@"; fi
echo 'GetUserSPNs is unavailable: python3-impacket did not install a supported entry point.' >&2
exit 127
EOF
chmod 0755 /usr/local/bin/oxsig-get-user-spns
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
printf '%s\n' 'Operation Black Domain' 'Use /opt/oxsig/operation.env for scope and starting access.' > /opt/oxsig/README
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
  purpose: 'CyberLab' | 'OperationNode';
  labInstanceId?: string;
}) : Promise<LaunchedNode> {
  if (!SUBNET_ID || !OPERATION_SECURITY_GROUP_ID) throw new OperationRuntimeError('Operation network configuration disappeared.', 503);
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
      Groups: [OPERATION_SECURITY_GROUP_ID],
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

async function markRuntimeFailure(pool: Pool, runId: string, message: string, operatorLabInstanceId?: string) {
  await pool.query(
    `UPDATE operation_runs SET status='failed', last_error=$1, updated_at=NOW() WHERE id=$2`,
    [message.slice(0, 1500), runId]
  );
  if (operatorLabInstanceId) {
    await pool.query(
      `UPDATE lab_instances SET status='failed', updated_at=NOW(), metadata=metadata || $1::jsonb WHERE id=$2`,
      [stringifyPostgresJson({ lastError: message.slice(0, 1500) }), operatorLabInstanceId]
    );
  }
}

async function terminateExternalInstances(instanceIds: string[]) {
  const unique = Array.from(new Set(instanceIds.filter((id) => /^i-[0-9a-f]+$/i.test(id))));
  if (!unique.length) return;
  await ec2.send(new TerminateInstancesCommand({ InstanceIds: unique }));
}

function toEc2State(value?: string | null): InstanceStateName | undefined {
  if (!value) return undefined;
  if (['pending', 'running', 'shutting-down', 'terminated', 'stopping', 'stopped'].includes(value)) {
    return value as InstanceStateName;
  }
  return undefined;
}

function mapRunStatusFromInstances(states: Array<InstanceStateName | undefined>) {
  const real = states.filter(Boolean) as InstanceStateName[];
  if (!real.length) return null;
  if (real.every((state) => state === 'terminated')) return 'destroyed';
  if (real.some((state) => state === 'shutting-down')) return 'destroying';
  if (real.some((state) => state === 'stopping')) return 'running';
  if (real.every((state) => state === 'stopped')) return 'running';
  if (real.every((state) => state === 'running')) return 'running';
  if (real.some((state) => state === 'pending')) return 'provisioning';
  return 'running';
}

function publicNodeMetadata(row: any) {
  const metadata = row.metadata || {};
  return {
    id: row.id,
    key: row.node_key,
    label: row.label,
    role: row.role,
    osFamily: row.os_family,
    status: row.status,
    privateIp: row.private_ip || null,
    labInstanceId: row.lab_instance_id || null,
    runtime: row.runtime_external_id ? {
      externalId: row.runtime_external_id,
      region: metadata.region || REGION,
      instanceType: metadata.instanceType || null,
      imageId: metadata.imageId || null,
    } : null,
    readiness: metadata.readiness || null,
  };
}

function cleanRunMetadata(metadata: Record<string, any>) {
  const clone = JSON.parse(JSON.stringify(metadata || {})) as Record<string, any>;
  if (clone.initialAccess && typeof clone.initialAccess === 'object') {
    delete clone.initialAccess.passwordSecret;
  }
  return clone;
}

export async function provisionOperationRun(args: { pool: Pool; ownerId: string; slug: string; mode: OperationMode }) {
  const operation = getOperation(args.slug);
  if (!operation) throw new OperationRuntimeError('Operation not found.', 404, 'OPERATION_NOT_FOUND');
  if (operation.slug !== BLACK_DOMAIN_SLUG) {
    throw new OperationRuntimeError('This Operation does not have an automated multi-node runtime yet.', 409, 'OPERATION_RUNTIME_NOT_AUTOMATED');
  }

  await assertOperationRuntimeReady();
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

  try {
    const dcRuntime = await launchNode({
      idForTag: dc.id, operationRunId: runId, nodeId: dc.id, nodeKey: dc.nodeKey,
      label: dc.label, ownerId: args.ownerId, operationSlug: operation.slug, expiresAt,
      osFamily: 'windows', imageId: windowsImageId, instanceType: windowsInstanceType(),
      userData: windowsUserData(expiresAt, domainControllerBootstrap({ joinPassword, learnerPassword, servicePassword })),
      purpose: 'OperationNode',
    });
    createdExternalIds.push(dcRuntime.externalId);
    await updateNodeRuntime(args.pool, dc, dcRuntime);

    const workstationRuntime = await launchNode({
      idForTag: workstation.id, operationRunId: runId, nodeId: workstation.id, nodeKey: workstation.nodeKey,
      label: workstation.label, ownerId: args.ownerId, operationSlug: operation.slug, expiresAt,
      osFamily: 'windows', imageId: windowsImageId, instanceType: windowsInstanceType(),
      userData: windowsUserData(expiresAt, workstationBootstrap({ dcIp: dcRuntime.privateIp, joinPassword })),
      purpose: 'OperationNode',
    });
    createdExternalIds.push(workstationRuntime.externalId);
    await updateNodeRuntime(args.pool, workstation, workstationRuntime);

    const operatorRuntime = await launchNode({
      idForTag: operator.id, operationRunId: runId, nodeId: operator.id, nodeKey: operator.nodeKey,
      label: operator.label, ownerId: args.ownerId, operationSlug: operation.slug, expiresAt,
      osFamily: 'ubuntu', imageId: ubuntuImageId, instanceType: linuxInstanceType(),
      userData: linuxUserData(expiresAt, operatorBootstrap({
        dcIp: dcRuntime.privateIp,
        workstationIp: workstationRuntime.privateIp,
        learnerPassword,
        mode: args.mode,
      })),
      purpose: 'OperationNode', labInstanceId: operatorLabInstanceId,
    });
    createdExternalIds.push(operatorRuntime.externalId);
    await updateNodeRuntime(args.pool, operator, operatorRuntime);
    await args.pool.query(
      `UPDATE lab_instances
          SET runtime_external_id=$1, region=$2, status='provisioning',
              metadata=metadata || $3::jsonb, updated_at=NOW()
        WHERE id=$4 AND owner_id=$5`,
      [operatorRuntime.externalId, REGION, stringifyPostgresJson({
        imageId: operatorRuntime.imageId,
        instanceType: operatorRuntime.instanceType,
        privateIp: operatorRuntime.privateIp,
      }), operatorLabInstanceId, args.ownerId]
    );
    await args.pool.query(
      `UPDATE operation_nodes SET status='provisioning', updated_at=NOW() WHERE run_id=$1`,
      [runId]
    );
    return getOperationRun({ pool: args.pool, runId, ownerId: args.ownerId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Operation provisioning failed';
    await terminateExternalInstances(createdExternalIds).catch(() => undefined);
    await markRuntimeFailure(args.pool, runId, message, operatorLabInstanceId).catch(() => undefined);
    throw error instanceof OperationRuntimeError ? error : new OperationRuntimeError(message, 503, 'OPERATION_PROVISION_FAILED');
  }
}

async function resolveRunRows(pool: Pool, runId: string, ownerId: string) {
  const result = await pool.query(
    `SELECT r.id,r.owner_id,r.operation_slug,r.mode,r.status,r.expires_at,r.operator_lab_instance_id,
            r.metadata,r.last_error,r.created_at,r.updated_at,
            n.id AS node_id,n.node_key,n.label,n.role,n.os_family,n.status AS node_status,
            n.lab_instance_id,n.runtime_external_id,n.private_ip,n.metadata AS node_metadata
       FROM operation_runs r
       LEFT JOIN operation_nodes n ON n.run_id=r.id
      WHERE r.id=$1 AND r.owner_id=$2
      ORDER BY CASE n.node_key WHEN 'dc' THEN 0 WHEN 'workstation' THEN 1 ELSE 2 END`,
    [runId, ownerId]
  );
  if (!result.rows.length) throw new OperationRuntimeError('Operation run not found.', 404, 'OPERATION_RUN_NOT_FOUND');
  return result.rows;
}

async function reconcileRun(pool: Pool, rows: any[]) {
  const run = rows[0];
  const instanceIds = rows.map((row) => row.runtime_external_id).filter(Boolean);
  if (!instanceIds.length) return;
  const described = await ec2.send(new DescribeInstancesCommand({ InstanceIds: instanceIds }));
  const states = new Map<string, InstanceStateName | undefined>();
  for (const reservation of described.Reservations || []) {
    for (const instance of reservation.Instances || []) {
      if (instance.InstanceId) states.set(instance.InstanceId, toEc2State(instance.State?.Name));
    }
  }
  const nextStatus = mapRunStatusFromInstances(instanceIds.map((id) => states.get(id)));
  if (nextStatus && nextStatus !== run.status) {
    await pool.query(`UPDATE operation_runs SET status=$1, updated_at=NOW() WHERE id=$2`, [nextStatus, run.id]);
  }
  for (const row of rows) {
    const state = row.runtime_external_id ? states.get(row.runtime_external_id) : undefined;
    if (!state) continue;
    const nextNodeStatus = state === 'terminated'
      ? 'destroyed'
      : state === 'shutting-down'
        ? 'destroying'
        : state === 'running'
          ? 'running'
          : 'provisioning';
    if (nextNodeStatus !== row.node_status) {
      await pool.query(`UPDATE operation_nodes SET status=$1, updated_at=NOW() WHERE id=$2`, [nextNodeStatus, row.node_id]);
    }
  }
  const operatorRow = rows.find((row) => row.node_key === 'operator');
  if (operatorRow?.lab_instance_id && operatorRow.runtime_external_id) {
    const operatorState = states.get(operatorRow.runtime_external_id);
    const labStatus = operatorState === 'terminated'
      ? 'destroyed'
      : operatorState === 'shutting-down'
        ? 'destroying'
        : operatorState === 'running'
          ? 'running'
          : 'provisioning';
    await pool.query(
      `UPDATE lab_instances SET status=$1, updated_at=NOW() WHERE id=$2 AND owner_id=$3`,
      [labStatus, operatorRow.lab_instance_id, run.owner_id]
    );
  }
}

async function refreshNodeReadiness(pool: Pool, rows: any[]) {
  for (const row of rows) {
    if (row.status !== 'running' || !row.runtime_external_id) continue;
    if (row.node_metadata?.readiness?.ready === true && row.node_metadata?.readiness?.version === READINESS_VERSION) continue;

    const previousCommandId = typeof row.node_metadata?.readiness?.commandId === 'string'
      ? row.node_metadata.readiness.commandId
      : undefined;
    const previousCommandStartedAt = typeof row.node_metadata?.readiness?.commandStartedAt === 'string'
      ? row.node_metadata.readiness.commandStartedAt
      : undefined;
    const result = await probeOperationNodeReadiness({
      instanceId: row.runtime_external_id,
      nodeKey: row.node_key,
      commandId: previousCommandId,
      commandStartedAt: previousCommandStartedAt,
      osFamily: row.os_family,
    });
    const readiness = result.ready
      ? { ready: true, version: READINESS_VERSION, checkedAt: new Date().toISOString() }
      : {
          ready: false,
          version: READINESS_VERSION,
          reason: result.reason,
          ...(result.commandId ? {
            commandId: result.commandId,
            commandStartedAt: previousCommandId === result.commandId && previousCommandStartedAt
              ? previousCommandStartedAt
              : new Date().toISOString(),
          } : {}),
          ...(result.error ? { error: result.error } : {}),
        };
    await pool.query(
      `UPDATE operation_nodes
          SET metadata=metadata || $1::jsonb, updated_at=NOW()
        WHERE id=$2`,
      [stringifyPostgresJson({ readiness }), row.node_id]
    );
    if (row.node_key === 'operator' && row.lab_instance_id) {
      if (result.ready) {
        await pool.query(
          `UPDATE lab_instances
              SET status='running', updated_at=NOW(), metadata=metadata - 'lastError'
            WHERE id=$1 AND owner_id=$2 AND status NOT IN ('destroying','destroyed','failed')`,
          [row.lab_instance_id, row.owner_id]
        );
      } else if (result.reason === 'probe-failed' && result.error) {
        await pool.query(
          `UPDATE lab_instances
              SET metadata=metadata || $1::jsonb, updated_at=NOW()
            WHERE id=$2 AND owner_id=$3 AND status NOT IN ('destroying','destroyed','failed')`,
          [stringifyPostgresJson({ lastError: result.error }), row.lab_instance_id, row.owner_id]
        );
      }
    }
  }
}

export async function getOperationRun(args: { pool: Pool; runId: string; ownerId: string }) {
  let rows = await resolveRunRows(args.pool, args.runId, args.ownerId);
  if (['provisioning', 'running', 'destroying'].includes(rows[0].status)) {
    try {
      await reconcileRun(args.pool, rows);
      rows = await resolveRunRows(args.pool, args.runId, args.ownerId);
      await refreshNodeReadiness(args.pool, rows);
      rows = await resolveRunRows(args.pool, args.runId, args.ownerId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Operation runtime reconciliation failed';
      await args.pool.query(
        `UPDATE operation_runs SET last_error=$1, updated_at=NOW() WHERE id=$2 AND owner_id=$3`,
        [message.slice(0, 1500), args.runId, args.ownerId]
      ).catch(() => undefined);
      throw error;
    }
  }
  const run = rows[0];
  const nodes = rows.filter((row) => row.node_id).map((row) => ({
    ...publicNodeMetadata({
      id: row.node_id,
      node_key: row.node_key,
      label: row.label,
      role: row.role,
      os_family: row.os_family,
      status: row.node_status,
      private_ip: row.private_ip,
      lab_instance_id: row.lab_instance_id,
      runtime_external_id: row.runtime_external_id,
      metadata: row.node_metadata,
    }),
  }));
  const ready = nodes.length === 3 && nodes.every((node) => node.status === 'running' && node.readiness?.ready === true);
  const metadata = cleanRunMetadata(run.metadata || {});
  return {
    runId: run.id,
    operationSlug: run.operation_slug,
    mode: run.mode,
    status: ready && run.status === 'running' ? 'running' : run.status === 'running' ? 'provisioning' : run.status,
    ready,
    expiresAt: run.expires_at,
    operatorLabInstanceId: run.operator_lab_instance_id,
    initialAccess: metadata.initialAccess || null,
    metadata,
    nodes,
    lastError: run.last_error,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
  };
}

export async function getOperationNodeAccess(args: { pool: Pool; runId: string; nodeId: string; ownerId: string }): Promise<LabAccess> {
  const run = await getOperationRun({ pool: args.pool, runId: args.runId, ownerId: args.ownerId });
  const node = run.nodes.find((item) => item.id === args.nodeId);
  if (!node) throw new OperationRuntimeError('Operation node not found.', 404, 'OPERATION_NODE_NOT_FOUND');
  if (run.status !== 'running' || node.status !== 'running' || node.readiness?.ready !== true) {
    throw new OperationRuntimeError('This Operation node is not ready for interactive access yet.', 409, 'OPERATION_NODE_NOT_READY');
  }
  if (!node.runtime?.externalId) throw new OperationRuntimeError('This Operation node has no active runtime.', 409, 'OPERATION_NODE_NOT_READY');
  if (node.osFamily === 'windows') {
    return buildLabAccess({
      accessMode: 'ssm-desktop',
      instanceId: node.runtime.externalId,
      region: node.runtime.region || REGION,
      privateIp: node.privateIp,
      username: initialUsernameForRun(run),
    });
  }
  return buildLabAccess({
    accessMode: 'terminal',
    instanceId: node.runtime.externalId,
    region: node.runtime.region || REGION,
  });
}

function initialUsernameForRun(run: Awaited<ReturnType<typeof getOperationRun>>) {
  const username = run.initialAccess && typeof run.initialAccess.username === 'string'
    ? run.initialAccess.username.trim()
    : '';
  return username || `${DOMAIN_NETBIOS}\\labuser`;
}

export async function updateOperationNodePower(args: {
  pool: Pool;
  runId: string;
  nodeId: string;
  ownerId: string;
  action: 'start' | 'stop' | 'restart';
}) {
  const rows = await resolveRunRows(args.pool, args.runId, args.ownerId);
  const run = rows[0];
  if (!['provisioning', 'running'].includes(run.status)) {
    throw new OperationRuntimeError('This Operation cannot be changed in its current state.', 409, 'OPERATION_LIFECYCLE_CONFLICT');
  }
  const row = rows.find((item) => item.node_id === args.nodeId);
  if (!row?.runtime_external_id) throw new OperationRuntimeError('Operation node runtime is unavailable.', 409, 'OPERATION_NODE_NOT_READY');
  const ids = [row.runtime_external_id];
  if (args.action === 'start') {
    await ec2.send(new StartInstancesCommand({ InstanceIds: ids }));
  } else if (args.action === 'stop') {
    await ec2.send(new StopInstancesCommand({ InstanceIds: ids }));
  } else {
    await ec2.send(new StopInstancesCommand({ InstanceIds: ids }));
    // Reconciliation will move this back to running after the caller polls and starts it.
    await ec2.send(new StartInstancesCommand({ InstanceIds: ids }));
  }
  await args.pool.query(
    `UPDATE operation_nodes SET status='provisioning', metadata=metadata - 'readiness', updated_at=NOW() WHERE id=$1`,
    [row.node_id]
  );
  if (row.lab_instance_id) {
    await args.pool.query(
      `UPDATE lab_instances SET status='provisioning', updated_at=NOW() WHERE id=$1 AND owner_id=$2`,
      [row.lab_instance_id, args.ownerId]
    );
  }
  return getOperationRun({ pool: args.pool, runId: args.runId, ownerId: args.ownerId });
}

export async function pauseOperationRun(args: { pool: Pool; runId: string; ownerId: string }) {
  const rows = await resolveRunRows(args.pool, args.runId, args.ownerId);
  const run = rows[0];
  if (!['provisioning', 'running'].includes(run.status)) {
    throw new OperationRuntimeError('Only active Operations can be paused.', 409, 'OPERATION_LIFECYCLE_CONFLICT');
  }
  const instanceIds = rows.map((row) => row.runtime_external_id).filter(Boolean);
  if (instanceIds.length) await ec2.send(new StopInstancesCommand({ InstanceIds: instanceIds }));
  await args.pool.query(
    `UPDATE operation_runs SET status='running', metadata=metadata || $1::jsonb, updated_at=NOW() WHERE id=$2 AND owner_id=$3`,
    [stringifyPostgresJson({ lifecycleState: 'paused' }), args.runId, args.ownerId]
  );
  await args.pool.query(
    `UPDATE operation_nodes SET status='provisioning', metadata=metadata - 'readiness', updated_at=NOW() WHERE run_id=$1`,
    [args.runId]
  );
  if (run.operator_lab_instance_id) {
    await args.pool.query(
      `UPDATE lab_instances SET status='provisioning', updated_at=NOW() WHERE id=$1 AND owner_id=$2`,
      [run.operator_lab_instance_id, args.ownerId]
    );
  }
  return getOperationRun({ pool: args.pool, runId: args.runId, ownerId: args.ownerId });
}

export async function resumeOperationRun(args: { pool: Pool; runId: string; ownerId: string }) {
  const rows = await resolveRunRows(args.pool, args.runId, args.ownerId);
  const run = rows[0];
  if (run.status !== 'running' || run.metadata?.lifecycleState !== 'paused') {
    throw new OperationRuntimeError('This Operation is not paused.', 409, 'OPERATION_LIFECYCLE_CONFLICT');
  }
  const instanceIds = rows.map((row) => row.runtime_external_id).filter(Boolean);
  if (instanceIds.length) await ec2.send(new StartInstancesCommand({ InstanceIds: instanceIds }));
  await args.pool.query(
    `UPDATE operation_runs SET metadata=metadata - 'lifecycleState', updated_at=NOW() WHERE id=$1 AND owner_id=$2`,
    [args.runId, args.ownerId]
  );
  await args.pool.query(
    `UPDATE operation_nodes SET status='provisioning', metadata=metadata - 'readiness', updated_at=NOW() WHERE run_id=$1`,
    [args.runId]
  );
  return getOperationRun({ pool: args.pool, runId: args.runId, ownerId: args.ownerId });
}

export async function destroyOperationRun(args: { pool: Pool; runId: string; ownerId: string }) {
  const rows = await resolveRunRows(args.pool, args.runId, args.ownerId);
  const run = rows[0];
  if (['destroyed', 'failed'].includes(run.status)) return getOperationRun(args);
  await args.pool.query(
    `UPDATE operation_runs SET status='destroying', updated_at=NOW() WHERE id=$1 AND owner_id=$2`,
    [args.runId, args.ownerId]
  );
  const instanceIds = rows.map((row) => row.runtime_external_id).filter(Boolean);
  if (instanceIds.length) await terminateExternalInstances(instanceIds);
  await args.pool.query(
    `UPDATE operation_nodes SET status='destroying', metadata=metadata - 'readiness', updated_at=NOW() WHERE run_id=$1`,
    [args.runId]
  );
  if (run.operator_lab_instance_id) {
    await args.pool.query(
      `UPDATE lab_instances SET status='destroying', updated_at=NOW() WHERE id=$1 AND owner_id=$2`,
      [run.operator_lab_instance_id, args.ownerId]
    );
  }
  return getOperationRun(args);
}
