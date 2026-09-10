// Run with: node --experimental-vm-modules --test scripts/check-operation-access.mjs
// Executes the actual TypeScript modules with only their external boundaries mocked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { SourceTextModule, SyntheticModule } from 'node:vm';

async function load(path, dependencies) {
  const source = await readFile(new URL('../' + path, import.meta.url), 'utf8');
  const mod = new SourceTextModule(stripTypeScriptTypes(source, { mode: 'transform' }));
  await mod.link((name) => {
    assert.ok(Object.hasOwn(dependencies, name), `Missing mock for ${name}`);
    const values = dependencies[name];
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    });
  });
  await mod.evaluate();
  return mod.namespace;
}
const target = { instanceId: 'i-0123456789abcdef0', nodeKey: 'operator', osFamily: 'ubuntu' };
async function readiness(handler) {
  const calls = [];
  const sdk = {};
  for (const name of ['DescribeInstanceInformationCommand', 'SendCommandCommand', 'GetCommandInvocationCommand']) {
    sdk[name] = class { constructor(input) { this.input = input; this.kind = name; } };
  }
  sdk.SSMClient = class { async send(command) { calls.push(command); return handler(command); } };
  const mod = await load('src/lib/operations/readiness.ts', {
    'server-only': {}, '@aws-sdk/client-ssm': sdk,
    '@/lib/aws/client-config': { awsClientConfig: () => ({}) },
  });
  return { ...mod, calls };
}
function normal(command, invocation = { Status: 'Success', StandardOutputContent: 'OXSIG_READY' }) {
  if (command.kind === 'DescribeInstanceInformationCommand') return { InstanceInformationList: [{ PingStatus: 'Online' }] };
  if (command.kind === 'SendCommandCommand') {
    assert.ok(command.input.TimeoutSeconds >= 30);
    return { Command: { CommandId: 'cmd-1' } };
  }
  return invocation;
}

test('valid AWS timeout permits the readiness check to succeed', async () => {
  const r = await readiness(normal);
  assert.equal((await r.probeOperationNodeReadiness(target)).ready, true);
  assert.equal(r.calls[1].input.TimeoutSeconds, 60);
});
test('pending command is resumed, not resubmitted', async () => {
  let done = false;
  const r = await readiness(c => normal(c, done ? { Status: 'Success', StandardOutputContent: 'OXSIG_READY' } : { Status: 'InProgress' }));
  const pending = await r.probeOperationNodeReadiness(target);
  assert.equal(pending.reason, 'probe-pending');
  done = true;
  assert.equal((await r.probeOperationNodeReadiness({ ...target, commandId: pending.commandId })).ready, true);
  assert.equal(r.calls.filter(c => c.kind === 'SendCommandCommand').length, 1);
});
test('SSM propagation delay stays pending', async () => {
  const r = await readiness(c => {
    if (c.kind === 'GetCommandInvocationCommand') throw Object.assign(new Error('not propagated'), { name: 'InvocationDoesNotExist' });
    return normal(c);
  });
  assert.equal((await r.probeOperationNodeReadiness(target)).reason, 'probe-pending');
});
test('AWS rejection exposes stage and error category without raw secrets', async () => {
  const r = await readiness(c => {
    if (c.kind === 'SendCommandCommand') throw Object.assign(new Error('secret-payload'), { name: 'AccessDeniedException' });
    return normal(c);
  });
  const result = await r.probeOperationNodeReadiness(target);
  assert.equal(result.reason, 'probe-failed');
  assert.match(result.error, /SendCommand.*AccessDeniedException/);
  assert.doesNotMatch(result.error, /secret-payload/);
});
test('offline SSM never submits a command', async () => {
  const r = await readiness(() => ({ InstanceInformationList: [] }));
  assert.equal((await r.probeOperationNodeReadiness(target)).reason, 'ssm-offline');
  assert.equal(r.calls.length, 1);
});
test('guest failure is distinct from command delivery failure', async () => {
  const r = await readiness(c => normal(c, { Status: 'Failed', ResponseCode: 2 }));
  assert.equal((await r.probeOperationNodeReadiness(target)).reason, 'marker-missing');
  const timeout = await readiness(c => normal(c, { Status: 'TimedOut' }));
  assert.equal((await timeout.probeOperationNodeReadiness(target)).reason, 'probe-failed');
});
test('concurrent readers share one probe', async () => {
  const r = await readiness(normal);
  await Promise.all([r.probeOperationNodeReadiness(target), r.probeOperationNodeReadiness(target)]);
  assert.equal(r.calls.filter(c => c.kind === 'SendCommandCommand').length, 1);
});
test('an overdue pending command has a bounded deadline', async () => {
  const r = await readiness(normal);
  const result = await r.probeOperationNodeReadiness({ ...target, commandId: 'old', commandStartedAt: new Date(Date.now() - 181000).toISOString() });
  assert.equal(result.reason, 'probe-failed');
  assert.equal(result.commandId, undefined);
});

async function route(kind, changes = {}, diagnosticChanges = {}, desktopFailure = false) {
  let started = 0;
  const row = {
    id: 'node-1', label: 'Machine', status: 'provisioning', runtime_provider: 'aws-ec2',
    runtime_external_id: target.instanceId, os_family: 'windows',
    expires_at: new Date(Date.now() + 60000).toISOString(), run_status: 'provisioning', run_metadata: {}, ...changes,
  };
  const schema = { uuid() { return this; }, min() { return this; }, max() { return this; }, regex() { return this; }, strict() { return this; }, safeParse(value) { return { success: true, data: value }; } };
  const session = async () => { started++; return { sessionId: 'session-1', streamUrl: 'wss://example.test', tokenValue: 'token', region: 'eu-central-1' }; };
  const deps = {
    'next/server': { NextRequest: class {}, NextResponse: { json: (body, options) => ({ body, status: options.status }) } },
    zod: { z: { string: () => schema, object: () => schema } },
    '@/lib/auth/middleware': { requireAuth: (req, fn) => fn(req, { id: 'owner-1' }) },
    '@/lib/security/csrf': { validateCsrfToken: async () => true },
    '@/lib/security/rate-limit': { checkRateLimit: async () => null },
    '@/lib/db/pool': { getPool: () => ({ query: async (_sql, args) => { assert.deepEqual(args, ['run-1', 'node-1', 'owner-1']); return { rows: changes.missing ? [] : [row] }; } }) },
    '@/lib/labs/aws-runtime': { startInteractiveLabSession: session, terminateInteractiveLabSession: async () => ({}) },
    '@/lib/labs/terminal-bridge-ticket.js': { createTerminalBridgeTicket: () => 'ticket', terminalBridgeTicketTtlMs: () => 60000 },
    '@/lib/labs/terminal-observability': { getLabTerminalDiagnostics: async () => ({ ec2State: 'running', instanceProfileConfigured: true, ssmRegistered: true, ssmPingStatus: 'Online', ...diagnosticChanges }) },
    '@/lib/audit/logger': { AUDIT_ACTIONS: { LAB_SESSION_START: 'start' }, getRequestMetadata: () => ({}), logAudit: async () => {} },
    '@/lib/labs/desktop-runtime': { ensureDesktopRuntime: async () => { if (desktopFailure) throw new Error('bootstrap failed'); return { ready: true }; }, inspectDesktopService: async () => ({ ready: true }), startDesktopPortSession: session },
  };
  const mod = await load(`src/app/api/operations/runs/[id]/nodes/[nodeId]/${kind}/route.ts`, deps);
  const response = await mod.POST({}, { params: Promise.resolve({ id: 'run-1', nodeId: 'node-1' }) });
  return { ...response, started };
}
for (const kind of ['session', 'desktop/session']) {
  test(`${kind}: unfinished exercise can open a live session`, async () => {
    const r = await route(kind);
    assert.equal(r.status, 200);
    assert.equal(r.started, 1);
    assert.equal(r.body.target, target.instanceId);
  });
  for (const [label, changes, diagnostics, status] of [
    ['paused', { run_metadata: { lifecycleState: 'paused' } }, {}, 409],
    ['expired', { expires_at: '2000-01-01' }, {}, 410],
    ['failed node', { status: 'failed' }, {}, 409],
    ['destroyed run', { run_status: 'destroyed' }, {}, 409],
    ['unowned node', { missing: true }, {}, 404],
    ['stopped EC2', {}, { ec2State: 'stopped' }, 409],
    ['offline SSM', {}, { ssmPingStatus: 'Offline' }, kind === 'session' ? 503 : 425],
  ]) {
    test(`${kind}: ${label} cannot start a session`, async () => {
      const r = await route(kind, changes, diagnostics);
      assert.equal(r.status, status);
      assert.equal(r.started, 0);
    });
  }
}
test('desktop bootstrap errors return a structured failure', async () => {
  const r = await route('desktop/session', {}, {}, true);
  assert.equal(r.status, 503);
  assert.equal(r.started, 0);
  assert.equal(r.body.stage, 'desktop-service');
});
test('Ubuntu keeps terminal access without offering a desktop route', async () => {
  const r = await route('desktop/session', { os_family: 'ubuntu' });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'DESKTOP_NOT_SUPPORTED');
});

async function runtimeFixture(probeResults) {
  const node = { id: 'node-1', node_key: 'operator', role: 'operator', label: 'Ubuntu', os_family: 'ubuntu', status: 'provisioning', runtime_external_id: target.instanceId, metadata: {}, lab_instance_id: 'lab-1' };
  const run = { id: 'run-1', status: 'provisioning', operation_slug: 'black-domain', metadata: { readinessVersion: 1 }, operator_lab_instance_id: 'lab-1' };
  const probes = [];
  const sdk = {};
  for (const name of ['DescribeImagesCommand', 'DescribeInstancesCommand', 'DescribeSecurityGroupsCommand', 'DescribeSubnetsCommand', 'RunInstancesCommand', 'TerminateInstancesCommand']) sdk[name] = class {};
  sdk.EC2Client = class { async send() { return { Reservations: [{ Instances: [{ InstanceId: target.instanceId, State: { Name: 'running' } }] }] }; } };
  const pool = { async query(sql, args) {
    if (sql.includes('FROM operation_runs')) return { rows: [structuredClone(run)] };
    if (sql.includes('FROM operation_nodes')) return { rows: [structuredClone(node)] };
    if (sql.includes('UPDATE operation_nodes')) {
      Object.assign(node.metadata, JSON.parse(args[1]));
      if (args[0]) node.status = 'running';
    }
    if (sql.includes('UPDATE operation_runs')) run.status = args[0];
    return { rows: [] };
  } };
  const crypto = await import('node:crypto');
  const mod = await load('src/lib/operations/runtime.ts', {
    'server-only': {}, 'node:crypto': { randomBytes: crypto.randomBytes, randomInt: crypto.randomInt },
    '@aws-sdk/client-ec2': sdk, '@/lib/aws/client-config': { awsClientConfig: () => ({}) },
    '@/lib/db/postgres-safe': { stringifyPostgresJson: JSON.stringify },
    '@/lib/operations/catalog': { getOperation: () => ({}) },
    '@/lib/operations/access-secret': { sealOperationAccessSecret: () => '' },
    '@/lib/operations/readiness': {
      probeOperationNodeReadiness: async args => { probes.push(args); return probeResults.shift(); },
      operationReadinessError: () => 'probe error',
    },
  });
  return { node, run, probes, read: () => mod.getOperationRun({ pool, runId: 'run-1', ownerId: 'owner-1' }) };
}
test('runtime persists pending command, reuses it, and clears it on success', async () => {
  const f = await runtimeFixture([{ ready: false, reason: 'probe-pending', commandId: 'cmd-1' }, { ready: true, reason: 'ready' }]);
  assert.equal((await f.read()).nodes[0].readiness, 'probe-pending');
  assert.equal(f.node.metadata.readinessCommandId, 'cmd-1');
  f.node.metadata.readinessCheckedAt = new Date(Date.now() - 6000).toISOString();
  assert.equal((await f.read()).nodes[0].status, 'running');
  assert.equal(f.probes[1].commandId, 'cmd-1');
  assert.equal(f.node.metadata.readinessCommandId, null);
  assert.equal(f.node.metadata.readinessError, null);
});
test('runtime surfaces fresh and cached errors and clears them after recovery', async () => {
  const f = await runtimeFixture([{ ready: false, reason: 'probe-failed', error: 'SendCommand (AccessDeniedException)' }, { ready: true, reason: 'ready' }]);
  assert.match((await f.read()).nodes[0].readinessError, /AccessDeniedException/);
  assert.match((await f.read()).nodes[0].readinessError, /AccessDeniedException/);
  assert.equal(f.probes.length, 1);
  f.node.metadata.readinessCheckedAt = new Date(Date.now() - 31000).toISOString();
  assert.equal((await f.read()).nodes[0].readinessError, null);
});
test('paused operations do not submit readiness probes', async () => {
  const f = await runtimeFixture([]);
  f.run.metadata.lifecycleState = 'paused';
  await f.read();
  assert.equal(f.probes.length, 0);
});
