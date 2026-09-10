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
  osFamily: 'ubuntu' | 'windows';
};

export type OperationReadinessResult = {
  ready: boolean;
  reason: 'ready' | 'ssm-offline' | 'marker-missing' | 'probe-failed';
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
    command: `test -s /opt/oxsig/operation.env && test -s /opt/oxsig/README && command -v nmap >/dev/null && command -v smbclient >/dev/null && command -v ldapsearch >/dev/null && command -v python3 >/dev/null && printf '%s\\n' '${READY_SENTINEL}'`,
  };
}

export async function probeOperationNodeReadiness(target: OperationReadinessTarget): Promise<OperationReadinessResult> {
  if (!INSTANCE_ID.test(target.instanceId)) throw new Error('Invalid AWS Operation instance identifier.');

  const infoResponse = await ssm.send(new DescribeInstanceInformationCommand({
    Filters: [{ Key: 'InstanceIds', Values: [target.instanceId] }],
  }));
  if (infoResponse.InstanceInformationList?.[0]?.PingStatus !== 'Online') {
    return { ready: false, reason: 'ssm-offline' };
  }

  const probe = operationReadinessCommand(target);
  const sent = await ssm.send(new SendCommandCommand({
    InstanceIds: [target.instanceId],
    DocumentName: probe.documentName,
    Parameters: { commands: [probe.command] },
    TimeoutSeconds: 20,
  }));
  const commandId = sent.Command?.CommandId;
  if (!commandId) return { ready: false, reason: 'probe-failed' };

  // SSM can report the node Online before a freshly submitted command has an
  // invocation record. Give that hand-off enough time instead of surfacing a
  // false probe failure during normal boot.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 750));
    try {
      const invocation = await ssm.send(new GetCommandInvocationCommand({
        CommandId: commandId,
        InstanceId: target.instanceId,
      }));
      if (['Pending', 'InProgress', 'Delayed'].includes(invocation.Status || '')) continue;
      if (invocation.Status === 'Success' && (invocation.StandardOutputContent || '').includes(READY_SENTINEL)) {
        return { ready: true, reason: 'ready' };
      }
      return { ready: false, reason: 'marker-missing' };
    } catch (error: any) {
      if (error?.name === 'InvocationDoesNotExist') continue;
      return { ready: false, reason: 'probe-failed' };
    }
  }
  return { ready: false, reason: 'probe-failed' };
}
