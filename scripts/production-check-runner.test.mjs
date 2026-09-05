import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const dir = await mkdtemp(join(tmpdir(), 'oxsig-prod-check-'));
await writeFile(join(dir, '.env'), 'TEST_ENV_VALUE=from-env\nSHARED_VALUE=from-env\n');
await writeFile(join(dir, '.env.local'), 'TEST_LOCAL_VALUE=from-local\nSHARED_VALUE=from-local\n');
await writeFile(join(dir, 'production-check.mjs'), "console.log(JSON.stringify({a:process.env.TEST_ENV_VALUE,b:process.env.TEST_LOCAL_VALUE,c:process.env.SHARED_VALUE,d:process.env.EXPORTED_VALUE}))\n");
await writeFile(join(dir, 'production-check-runner.mjs'), (await import('node:fs/promises')).readFile ? await (await import('node:fs/promises')).readFile(new URL('./production-check-runner.mjs', import.meta.url), 'utf8') : '');

const result = spawnSync(process.execPath, ['production-check-runner.mjs'], {
  cwd: dir,
  env: { ...process.env, SHARED_VALUE: 'from-process', EXPORTED_VALUE: 'from-process' },
  encoding: 'utf8',
});

assert.equal(result.status, 0, result.stderr);
const parsed = JSON.parse(result.stdout.trim());
assert.deepEqual(parsed, {
  a: 'from-env',
  b: 'from-local',
  c: 'from-process',
  d: 'from-process',
});
