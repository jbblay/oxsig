import 'server-only';

import {
  DescribeInstanceInformationCommand,
  GetCommandInvocationCommand,
  SendCommandCommand,
  SSMClient,
} from '@aws-sdk/client-ssm';
import { awsClientConfig } from '@/lib/aws/client-config';

const REGION = process.env.LAB_AWS_REGION || process.env.AWS_REGION || 'eu-central-1';
const ssm = new SSMClient(awsClientConfig(REGION));
const INSTANCE_ID = /^i-[0-9a-f]+$/i;
const READY_SENTINEL = 'OXSIG_READY';

export type OperationReadinessTarget = {
  instanceId: string;
  nodeKey: string;
  commandId?: string;
  commandStartedAt?: string;
  osFamily: 'ubuntu' | 'windows';
};

export type OperationReadinessResult = {
  ready: boolean;
  reason: 'ready' | 'ssm-offline' | 'marker-missing' | 'probe-failed' | 'probe-pending';
  commandId?: string;
  error?: string;
};

export function operationReadinessCommand(target: Pick<OperationReadinessTarget, 'nodeKey' | 'osFamily'>) {
  if (target.osFamily === 'windows') {
    if (target.nodeKey === 'dc') {
      return {
        documentName: 'AWS-RunPowerShellScript',
        command: `$marker = (Test-Path 'C:\\ProgramData\\OXSIG\\domain-ready.txt') -and ((Get-Content 'C:\\ProgramData\\OXSIG\\domain-ready.txt' -ErrorAction SilentlyContinue | Select-Object -First 1) -eq 'ready'); $ntds = (Get-Service NTDS -ErrorAction SilentlyContinue).Status -eq 'Running'; $dns = (Get-Service DNS -ErrorAction SilentlyContinue).Status -eq 'Running'; $domain = $false; try { Import-Module ActiveDirectory -ErrorAction Stop; Get-ADDomain -Identity 'blackdomain.local' -ErrorAction Stop | Out-Null; $domain = $true } catch {}; if ($marker -and $ntds -and $dns -and $domain) { Write-Output '${READY_SENTINEL}' } else { exit 2 }`,
      };
    }
    if (target.nodeKey === 'workstation') {
      return {
        documentName: 'AWS-RunPowerShellScript',
        command: `$marker = (Test-Path 'C:\\ProgramData\\OXSIG\\workstation-ready.txt') -and ((Get-Content 'C:\\ProgramData\\OXSIG\\workstation-ready.txt' -ErrorAction SilentlyContinue | Select-Object -First 1) -eq 'ready'); $joined = $false; try { $joined = (Get-CimInstance Win32_ComputerSystem -ErrorAction Stop).Domain -ieq 'blackdomain.local' } catch {}; $dc = $false; try { & nltest.exe /dsgetdc:blackdomain.local | Out-Null; $dc = $LASTEXITCODE -eq 0 } catch {}; if ($marker -and $joined -and $dc) { Write-Output '${READY_SENTINEL}' } else { exit 2 }`,
      };
    }
    throw new Error(`Unsupported Windows Operation readiness target: ${target.nodeKey}`);
  }

  if (target.nodeKey !== 'operator') {
    throw new Error(`Unsupported Linux Operation readiness target: ${target.nodeKey}`);
  }
  return {
    documentName: 'AWS-RunShellScript',
    // Session Manager uses ssm-user by default. The operator VM is a disposable,
    // single-owner machine, so make its per-run scope/credential file readable by
    // the learner before declaring the node ready. Also gate readiness on every
    // external command used by the curated Active Directory practical sequence.
    command: `test -s /opt/oxsig/operation.env && chmod 0644 /opt/oxsig/operation.env && test -r /opt/oxsig/operation.env && test -s /opt/oxsig/README && command -v nmap >/dev/null && command -v smbclient >/dev/null && command -v ldapsearch >/dev/null && command -v dig >/dev/null && command -v kinit >/dev/null && command -v impacket-GetUserSPNs >/dev/null && command -v python3 >/dev/null && printf '%s\\n' '${READY_SENTINEL}'`,
  };
}

// Share concurrent reads from the topology and machine panels in this process.
const inFlight = new Map<string, Promise<OperationReadinessResult>>();

export function operationReadinessError(error: unknown, stage: string): string {
  // Preserve the AWS error category without returning credentials or command output.
  const name = error instanceof Error && /^[A-Za-z0-9_.-]{1,100}$/.test(error.name)
    ? error.name : 'UnknownError';
  return `Readiness check failed at ${stage} (${name}). Check the application AWS permissions and service logs.`;
}

export async function probeOperationNodeReadiness(target: OperationReadinessTarget): Promise<OperationReadinessResult> {
  if (!INSTANCE_ID.test(target.instanceId)) throw new Error('Invalid AWS Operation instance identifier.');
  const key = `${target.instanceId}:${target.nodeKey}:${target.osFamily}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const pending = probeNode(target);
  inFlight.set(key, pending);
  try { return await pending; } finally { inFlight.delete(key); }
}

async function probeNode(target: OperationReadinessTarget): Promise<OperationReadinessResult> {
  let stage = 'DescribeInstanceInformation';
  try {
    const infoResponse = await ssm.send(new DescribeInstanceInformationCommand({
      Filters: [{ Key: 'InstanceIds', Values: [target.instanceId] }],
    }));
    if (infoResponse.InstanceInformationList?.[0]?.PingStatus !== 'Online') {
      return { ready: false, reason: 'ssm-offline' };
    }

    if (target.commandId && target.commandStartedAt && Date.now() - Date.parse(target.commandStartedAt) > 180_000) {
      return { ready: false, reason: 'probe-failed', error: 'Readiness command exceeded its deadline. A fresh check will be attempted.' };
    }
    let commandId = target.commandId;
    if (!commandId) {
      const probe = operationReadinessCommand(target);
      stage = 'SendCommand';
      const sent = await ssm.send(new SendCommandCommand({
        InstanceIds: [target.instanceId],
        DocumentName: probe.documentName,
        Parameters: { commands: [probe.command], executionTimeout: ['60'] },
        // AWS SendCommand requires a delivery timeout of at least 30 seconds.
        TimeoutSeconds: 60,
      }));
      commandId = sent.Command?.CommandId;
      if (!commandId) return { ready: false, reason: 'probe-failed', error: 'AWS did not return a readiness command ID.' };
    }

    stage = 'GetCommandInvocation';
    try {
      const invocation = await ssm.send(new GetCommandInvocationCommand({
        CommandId: commandId,
        InstanceId: target.instanceId,
      }));
      if (['Pending', 'InProgress', 'Delayed'].includes(invocation.Status || '')) {
        return { ready: false, reason: 'probe-pending', commandId };
      }
      if (invocation.Status === 'Success' && (invocation.StandardOutputContent || '').includes(READY_SENTINEL)) {
        return { ready: true, reason: 'ready' };
      }
      if (invocation.Status === 'Failed' && [1, 2].includes(invocation.ResponseCode ?? -1)) {
        return { ready: false, reason: 'marker-missing' };
      }
      return { ready: false, reason: 'probe-failed', error: 'The readiness command did not complete successfully. Inspect its Systems Manager command history.' };
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'InvocationDoesNotExist') {
        return { ready: false, reason: 'probe-pending', commandId };
      }
      throw error;
    }
  } catch (error: unknown) {
    return { ready: false, reason: 'probe-failed', error: operationReadinessError(error, stage) };
  }
}
