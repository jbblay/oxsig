import 'server-only';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { LabRuntimeCapabilities } from './types';

const runFile = promisify(execFile);
const INSTANCE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KALI_IMAGE = process.env.LAB_KALI_IMAGE || 'kalilinux/kali-rolling:latest';
const MAX_OUTPUT = 64 * 1024;

function assertInstanceId(instanceId: string) {
  if (!INSTANCE_ID.test(instanceId)) throw new Error('Invalid lab instance identifier');
}

function containerName(instanceId: string) {
  assertInstanceId(instanceId);
  return `oxsig-lab-${instanceId}`;
}

async function docker(args: string[], timeout = 30_000) {
  const result = await runFile('docker', args, { timeout, maxBuffer: MAX_OUTPUT, encoding: 'utf8' });
  return { stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

async function assertManaged(instanceId: string) {
  const name = containerName(instanceId);
  const result = await docker(['inspect', '--format', '{{ index .Config.Labels "oxsig.lab.instance" }}', name]);
  if (result.stdout !== instanceId) throw new Error('Container is not managed by OXSIG');
}

export async function labCapabilities(): Promise<LabRuntimeCapabilities & { reason?: string }> {
  if (process.env.LAB_DOCKER_ENABLED !== 'true') return { provider: 'unconfigured', configured: false, supportsContainers: false, supportsVMs: false, supportsTerminal: false, supportsReset: false, reason: 'Docker labs are disabled on this deployment.' };
  try {
    await docker(['info', '--format', '{{.ServerVersion}}'], 5_000);
    return { provider: 'docker', configured: true, supportsContainers: true, supportsVMs: false, supportsTerminal: true, supportsReset: true };
  } catch {
    return { provider: 'unconfigured', configured: false, supportsContainers: false, supportsVMs: false, supportsTerminal: false, supportsReset: false, reason: 'The Docker runtime is not reachable from this server.' };
  }
}

export async function createLabContainer(instanceId: string) {
  const capabilities = await labCapabilities();
  if (!capabilities.configured) throw new Error(capabilities.reason || 'Docker lab runtime is unavailable');
  const name = containerName(instanceId);
  await docker([
    'run', '-d', '--name', name,
    '--label', `oxsig.lab.instance=${instanceId}`,
    '--network', 'none', '--memory', '512m', '--cpus', '0.5', '--pids-limit', '128',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--read-only',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m', '--tmpfs', '/root:rw,nosuid,size=64m',
    KALI_IMAGE, 'sleep', 'infinity',
  ], 120_000);
  return name;
}

export async function stopLabContainer(instanceId: string) {
  await assertManaged(instanceId);
  await docker(['stop', '--time', '5', containerName(instanceId)]);
}

export async function startLabContainer(instanceId: string) {
  await assertManaged(instanceId);
  await docker(['start', containerName(instanceId)]);
}

export async function destroyLabContainer(instanceId: string) {
  await assertManaged(instanceId);
  await docker(['rm', '-f', containerName(instanceId)]);
}

export async function resetLabContainer(instanceId: string) {
  await destroyLabContainer(instanceId);
  return createLabContainer(instanceId);
}

export async function executeLabCommand(instanceId: string, command: string) {
  if (!command.trim() || command.length > 1000 || command.includes('\0')) throw new Error('Command must contain 1 to 1000 characters');
  await assertManaged(instanceId);
  return docker(['exec', '--user', '65534:65534', containerName(instanceId), 'sh', '-lc', command], 15_000);
}
