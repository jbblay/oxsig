import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import { spawnSync } from 'node:child_process';

// Exercise actual server adapters with provider/DB boundaries replaced, without
// requiring cloud credentials, package installation, or a live database.
const root = new URL('../../', import.meta.url);
async function moduleAt(path, imports = {}) {
  const source = await readFile(new URL(path, root), 'utf8');
  const mod = new SourceTextModule(stripTypeScriptTypes(source, { mode: 'transform' }));
  await mod.link(async name => {
    const exports = imports[name];
    assert.ok(exports, `Unexpected dependency: ${name}`);
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    });
  });
  await mod.evaluate();
  return mod.namespace;
}
const readiness = await moduleAt('src/lib/academy/docker-readiness.ts');
const missions = await moduleAt('src/lib/academy/docker-missions.ts');
const lab = { status: 'running', runtime_provider: 'aws-ec2', runtime_external_id: 'i-123456', slug: 'ubuntu-security-lab', expires_at: '2099-01-01' };
async function adapter({ ownedLab = lab, state = 'ready', active = [], answerFails = false, prepareFails = false } = {}) {
  const queries = [], commands = [];
  const query = async (sql, values) => {
    queries.push({ sql, values });
    if (sql.includes('SELECT instance.id')) return { rows: ownedLab ? [ownedLab] : [] };
    if (sql.includes('SELECT d.slug')) return { rows: [{ slug: ownedLab?.slug }] };
    if (sql.includes('SELECT id FROM academy_mission_runs')) return { rows: active };
    return { rows: [] };
  };
  const api = await moduleAt('src/lib/academy/mission-control.ts', {
    'server-only': {}, '@/lib/db/pool': { getPool: () => ({ query }), transaction: fn => fn({ query }) },
    '@/lib/labs/aws-runtime': { executeLabCommand: async (id, command) => {
      commands.push({ id, command });
      return { status: 'Success', exitCode: prepareFails && command === readiness.DOCKER_PREPARE_COMMAND ? 1 : 0, stdout: state };
    } },
    '@/lib/labs/catalog': { LAB_CATALOG: [{ slug: 'ubuntu-security-lab', platform: 'linux' }, { slug: 'amazon-linux-cloud-lab', platform: 'linux' }] },
    '@/lib/academy/server': { answerAcademyQuestion: async () => {
      if (answerFails) throw Error('offline');
      return { answer: 'Containers share the host kernel.', suggestedAction: 'Explain process isolation.' };
    } },
    './docker-readiness': { ...readiness }, './docker-missions': { ...missions },
  });
  return { api, queries, commands };
}

test('fixed preparation and observation commands fit the existing SSM limit and parse as shell', () => {
  for (const command of [readiness.DOCKER_PREPARE_COMMAND, readiness.DOCKER_READINESS_COMMAND]) {
    assert.ok(command.length <= 1000);
    assert.equal(spawnSync('bash', ['-n', '-c', command], { timeout: 5000 }).status, 0);
  }
  assert.ok(!readiness.DOCKER_PREPARE_COMMAND.includes('docker rm'));
});
test('readiness never treats arbitrary output as ready', () => {
  assert.equal(readiness.dockerReadiness('ready\n'), 'ready');
  assert.equal(readiness.dockerReadiness('ready\nfailed'), 'missing');
});
test('no owned lab means no cloud commands', async () => {
  const { api, commands } = await adapter({ ownedLab: null });
  await assert.rejects(api.prepareDockerWorkspace('owner', 'other-lab', true), { code: 'LAB_NOT_FOUND' });
  assert.equal(commands.length, 0);
});
test('expired and starting labs cannot install Docker', async () => {
  for (const ownedLab of [{ ...lab, expires_at: '2000-01-01' }, { ...lab, status: 'provisioning' }]) {
    const { api, commands } = await adapter({ ownedLab });
    await assert.rejects(api.prepareDockerWorkspace('owner', 'lab', true), { code: 'LAB_NOT_RUNNING' });
    assert.equal(commands.length, 0);
  }
});
test('unsupported platform never receives Linux commands', async () => {
  const { api, commands } = await adapter({ ownedLab: { ...lab, slug: 'windows-server-security-lab' } });
  await assert.rejects(api.prepareDockerWorkspace('owner', 'lab', true), { code: 'LAB_UNSUPPORTED' });
  assert.equal(commands.length, 0);
});
test('ready Docker is reused without installation', async () => {
  const { api, commands, queries } = await adapter();
  assert.equal((await api.prepareDockerWorkspace('owner', 'lab', true)).state, 'ready');
  assert.equal(commands.length, 1);
  assert.deepEqual(queries[0].values, ['lab', 'owner']);
});
test('an in-progress installation is not restarted', async () => {
  const { api, commands } = await adapter({ state: 'preparing' });
  assert.equal((await api.prepareDockerWorkspace('owner', 'lab', true)).state, 'preparing');
  assert.equal(commands.length, 1);
});
test('observation cannot install Docker without explicit action', async () => {
  const { api, commands } = await adapter({ state: 'missing' });
  assert.equal((await api.prepareDockerWorkspace('owner', 'lab', false)).state, 'missing');
  assert.equal(commands.length, 1);
});
test('Ubuntu preparation selects only the bounded server command', async () => {
  const { api, commands } = await adapter({ state: 'missing' });
  assert.equal((await api.prepareDockerWorkspace('owner', 'lab', true)).state, 'preparing');
  assert.equal(commands[1].command, readiness.DOCKER_PREPARE_COMMAND);
});
test('existing other Linux profiles are validated but never modified', async () => {
  const { api, commands } = await adapter({ state: 'missing', ownedLab: { ...lab, slug: 'amazon-linux-cloud-lab' } });
  await assert.rejects(api.prepareDockerWorkspace('owner', 'lab', true), { code: 'DOCKER_PREPARE_UNSUPPORTED' });
  assert.equal(commands.length, 1);
});
test('preparation failure supplies a recovery error', async () => {
  const { api } = await adapter({ state: 'failed', prepareFails: true });
  await assert.rejects(api.prepareDockerWorkspace('owner', 'lab', true), { code: 'DOCKER_PREPARE_FAILED' });
});
test('active engineering run blocks workspace attachment and incident replacement', async () => {
  const { api, commands } = await adapter({ active: [{ id: 'active-run' }] });
  await assert.rejects(api.prepareDockerWorkspace('owner', 'lab', true), { code: 'LAB_RUN_CONFLICT' });
  await assert.rejects(api.prepareRepairMission('owner', 'lab'), { code: 'LAB_RUN_CONFLICT' });
  assert.equal(commands.length, 0);
});
test('concept explanation survives unavailable AI and never awards technical proof', async () => {
  const { api, queries, commands } = await adapter({ answerFails: true });
  const result = await api.reviewDockerConcept('owner', 'Containers share a kernel.');
  assert.equal(result.saved, true);
  assert.equal(result.feedback, null);
  assert.equal(queries.length, 1);
  assert.ok(queries[0].sql.includes('concept_answer'));
  assert.ok(!queries[0].sql.includes('verified_at'));
  assert.equal(commands.length, 0);
});
test('concept feedback is bound to the explanation still stored for its owner', async () => {
  const { api, queries } = await adapter();
  await api.reviewDockerConcept('owner', 'My explanation');
  assert.deepEqual(queries[1].values.slice(0, 2), ['owner', 'My explanation']);
  assert.match(queries[1].sql, /concept_answer=\$2/);
});
test('live mission completion still requires all trusted checks', () => {
  assert.equal(missions.assessDockerMission('deploy', 'engine=ready\nrunning=ok\nport=ok').passed, false);
  assert.equal(missions.assessDockerMission('deploy', 'engine=ready\nrunning=ok\nport=ok\nhttp=ok').passed, true);
});

for (const action of ['start', 'fork']) {
  test(`a competing engineering run prevents ${action} on the same lab`, async () => {
    const query = async sql => ({ rows:
      sql.includes('SELECT * FROM academy_mission_runs') ? [{ id: 'run', revision: 1, template_id: 'docker', template_version: 1, lab_instance_id: 'lab' }]
        : sql.includes('SELECT id FROM lab_instances') ? [{ id: 'lab' }]
          : sql.includes('SELECT id FROM academy_mission_runs') ? [{ id: 'competing' }] : []
    });
    const api = await moduleAt('src/lib/academy/mission-engine.ts', {
      'server-only': {}, '@/lib/db/pool': { getPool: () => ({ query }), transaction: fn => fn({ query }) },
      './mission-control': { MissionControlError: class extends Error {}, observeDockerMission: () => assert.fail('No verification expected'), seedDockerIncident: () => assert.fail('No seeding expected') },
      './mission-engine-policy': { ENGINEERING_MISSIONS: [], engineeringTemplate: () => ({ id: 'docker', version: 1 }), templateUnlocked: () => true, engineCommandSchema: {} },
    });
    await assert.rejects(api.commandMission('owner', { action, runId: 'run', revision: 1, labInstanceId: 'lab', templateId: 'docker', mode: 'practice' }), /active run/);
  });
}
