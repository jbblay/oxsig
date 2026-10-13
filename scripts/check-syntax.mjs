// Syntax-check every server-side ES module that is not compiled by Next.js.
// Replaces a hand-maintained `node --check a && node --check b ...` list that
// silently skipped new scripts (migrate.mjs, readiness-check.mjs, ...).
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function collect(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules') continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...collect(path));
    else if (entry.endsWith('.mjs')) files.push(path);
  }
  return files;
}

const targets = [join(root, 'server.mjs'), ...collect(join(root, 'scripts'))].sort();
const failures = [];
for (const file of targets) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) failures.push(`${relative(root, file)}\n${result.stderr.trim()}`);
}

for (const entry of [join(root, 'scripts', 'dev-up.sh'), join(root, 'scripts', 'ci', 'provision-postgres.sh')]) {
  const result = spawnSync('bash', ['-n', entry], { encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') break; // bash unavailable: nothing to check with
  if (result.status !== 0) failures.push(`${relative(root, entry)}\n${result.stderr.trim()}`);
}

if (failures.length) {
  console.error(`Syntax check failed for ${failures.length} file(s):\n\n${failures.join('\n\n')}`);
  process.exit(1);
}
console.log(`Syntax OK: ${targets.length} ES modules and shell scripts checked.`);
