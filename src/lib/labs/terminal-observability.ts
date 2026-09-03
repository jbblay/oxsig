import 'server-only';

import {
  DescribeInstanceInformationCommand,
  GetCommandInvocationCommand,
  SendCommandCommand,
  SSMClient,
} from '@aws-sdk/client-ssm';
import { describeLabVmStates } from './aws-runtime';

const REGION = process.env.LAB_AWS_REGION || process.env.AWS_REGION || 'eu-central-1';
const INSTANCE_PROFILE = process.env.LAB_AWS_INSTANCE_PROFILE;
const ssm = new SSMClient({ region: REGION });

const INSTANCE_ID = /^i-[0-9a-f]+$/i;

function assertAwsInstanceId(instanceId: string) {
  if (!INSTANCE_ID.test(instanceId)) throw new Error('Invalid AWS lab instance identifier');
}

export type LabTerminalDiagnostics = {
  region: string;
  instanceId: string;
  ec2State: string;
  instanceProfileConfigured: boolean;
  ssmRegistered: boolean;
  ssmPingStatus: string | null;
  ssmAgentVersion: string | null;
  platformName: string | null;
  platformVersion: string | null;
  ready: boolean;
};

export async function getLabTerminalDiagnostics(instanceId: string): Promise<LabTerminalDiagnostics> {
  assertAwsInstanceId(instanceId);
  const states = await describeLabVmStates([instanceId]);
  const ec2State = states.get(instanceId) || 'destroyed';

  let ssmRegistered = false;
  let ssmPingStatus: string | null = null;
  let ssmAgentVersion: string | null = null;
  let platformName: string | null = null;
  let platformVersion: string | null = null;

  if (ec2State === 'running' && INSTANCE_PROFILE) {
    const response = await ssm.send(new DescribeInstanceInformationCommand({
      Filters: [{ Key: 'InstanceIds', Values: [instanceId] }],
    }));
    const info = response.InstanceInformationList?.[0];
    if (info) {
      ssmRegistered = true;
      ssmPingStatus = info.PingStatus || null;
      ssmAgentVersion = info.AgentVersion || null;
      platformName = info.PlatformName || null;
      platformVersion = info.PlatformVersion || null;
    }
  }

  return {
    region: REGION,
    instanceId,
    ec2State,
    instanceProfileConfigured: Boolean(INSTANCE_PROFILE),
    ssmRegistered,
    ssmPingStatus,
    ssmAgentVersion,
    platformName,
    platformVersion,
    ready: ec2State === 'running' && Boolean(INSTANCE_PROFILE) && ssmPingStatus === 'Online',
  };
}

export async function executeObservedLabCommand(instanceId: string, command: string) {
  assertAwsInstanceId(instanceId);
  if (!INSTANCE_PROFILE) throw new Error('SSM terminal support is not configured for this deployment');
  if (!command.trim() || command.length > 1000 || command.includes('\0')) {
    throw new Error('Command must contain 1 to 1000 characters');
  }

  const startedAt = Date.now();
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
      const result = await ssm.send(new GetCommandInvocationCommand({
        CommandId: commandId,
        InstanceId: instanceId,
      }));
      if (['Pending', 'InProgress', 'Delayed'].includes(result.Status || '')) continue;
      return {
        commandId,
        status: result.Status || 'Unknown',
        stdout: result.StandardOutputContent || '',
        stderr: result.StandardErrorContent || '',
        exitCode: result.ResponseCode ?? (result.Status === 'Success' ? 0 : 1),
        durationMs: Date.now() - startedAt,
      };
    } catch (error: any) {
      if (error?.name === 'InvocationDoesNotExist') continue;
      throw error;
    }
  }

  throw new Error(`SSM command ${commandId} did not finish before the request timeout`);
}
