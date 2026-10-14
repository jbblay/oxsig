import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const contract = fileURLToPath(new URL('../production-check.mjs', import.meta.url));
const routeCheck = fileURLToPath(new URL('../verify-built-routes.mjs', import.meta.url));
const appRoot = fileURLToPath(new URL('../../src/app', import.meta.url));
const buildspec = fileURLToPath(new URL('../../buildspec.yml', import.meta.url));
const provisionPostgres = fileURLToPath(new URL('../ci/provision-postgres.sh', import.meta.url));
const packageJson = fileURLToPath(new URL('../../package.json', import.meta.url));
const baseEnv = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'test', CLERK_SECRET_KEY: 'test',
  DATABASE_URL: 'postgresql://localhost/test', CRON_SECRET: 'c'.repeat(24),
  STORAGE_BUCKET: 'test', STORAGE_REGION: 'eu-central-1',
  OXSIG_TERMINAL_BRIDGE_SECRET: 'b'.repeat(32), LAB_AWS_ENABLED: 'false',
};

for (const name of ['SENTRY_DSN', 'NEXT_PUBLIC_SENTRY_DSN']) {
  test(`${name}: accepts optional, hosted and self-hosted DSNs`, () => {
    for (const dsn of ['', 'https://publickey@o1.ingest.sentry.io/123', 'https://key@sentry.example.com/prefix/123']) {
      const result = spawnSync(process.execPath, [contract], { env: { ...baseEnv, [name]: dsn }, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    }
  });
  test(`${name}: rejects homepage and malformed DSNs without exposing values`, () => {
    for (const dsn of ['https://sentry.io', 'https://sentry.io/123', 'https://secretvalue@sentry.io/project', 'garbage']) {
      const result = spawnSync(process.execPath, [contract], { env: { ...baseEnv, [name]: dsn }, encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.ok(result.stderr.includes(`${name} must be a Sentry DSN`));
      assert.ok(!result.stderr.includes(dsn));
    }
  });
}

const awsEnv = {
  ...baseEnv,
  LAB_AWS_ENABLED: 'true',
  LAB_AWS_REGION: 'eu-central-1',
  LAB_AWS_SUBNET_ID: 'subnet-0123456789abcdef0',
  LAB_AWS_SECURITY_GROUP_ID: 'sg-0123456789abcdef0',
  LAB_AWS_INSTANCE_PROFILE: 'oxsig-lab-ssm-role',
};

const preparedBlackDomainEnv = {
  ...awsEnv,
  LAB_AWS_BLACK_DOMAIN_PREPARED: 'true',
  LAB_AWS_BLACK_DOMAIN_SLOT_KEY: 'black-domain-slot-01',
  LAB_AWS_BLACK_DOMAIN_DC_INSTANCE_ID: 'i-0123456789abcdef0',
  LAB_AWS_BLACK_DOMAIN_WORKSTATION_INSTANCE_ID: 'i-1123456789abcdef0',
  LAB_AWS_BLACK_DOMAIN_OPERATOR_INSTANCE_ID: 'i-2123456789abcdef0',
  LAB_AWS_BLACK_DOMAIN_DC_SNAPSHOT_ID: 'snap-0123456789abcdef0',
  LAB_AWS_BLACK_DOMAIN_WORKSTATION_SNAPSHOT_ID: 'snap-1123456789abcdef0',
  LAB_AWS_BLACK_DOMAIN_OPERATOR_SNAPSHOT_ID: 'snap-2123456789abcdef0',
  LAB_AWS_BLACK_DOMAIN_INITIAL_PASSWORD: 'test-only-password',
};

test('prepared Black Domain requires the complete reusable slot contract', () => {
  const incomplete = { ...preparedBlackDomainEnv };
  delete incomplete.LAB_AWS_BLACK_DOMAIN_WORKSTATION_SNAPSHOT_ID;
  const result = spawnSync(process.execPath, [contract], { env: incomplete, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes('LAB_AWS_BLACK_DOMAIN_WORKSTATION_SNAPSHOT_ID is required'));
});

test('prepared Black Domain accepts a complete reusable slot contract without legacy Operation SG settings', () => {
  const result = spawnSync(process.execPath, [contract], { env: preparedBlackDomainEnv, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stderr.includes('LAB_AWS_OPERATION_SECURITY_GROUP_ID'));
});

test('CodeBuild PostgreSQL provisioning and connection URL target the same database', () => {
  const spec = readFileSync(buildspec, 'utf8');
  const script = readFileSync(provisionPostgres, 'utf8');
  const url = spec.match(/^\s*OXSIG_CI_DATABASE_URL:\s*(\S+)\s*$/m)?.[1];
  assert.ok(url, 'buildspec.yml must declare OXSIG_CI_DATABASE_URL');
  const parsed = new URL(url);
  assert.equal(parsed.pathname.slice(1), script.match(/^DB_NAME="([^"]+)"/m)?.[1], 'database name must match provision-postgres.sh');
  assert.equal(parsed.username, script.match(/^DB_USER="([^"]+)"/m)?.[1], 'database user must match provision-postgres.sh');
  assert.equal(parsed.password, script.match(/^DB_PASSWORD="([^"]+)"/m)?.[1], 'database password must match provision-postgres.sh');
  assert.equal(parsed.port || '5432', script.match(/^PORT="([^"]+)"/m)?.[1], 'port must match provision-postgres.sh');
});

test('CodeBuild runs every verification gate, including schema verification against PostgreSQL', () => {
  const spec = readFileSync(buildspec, 'utf8');
  const scripts = JSON.parse(readFileSync(packageJson, 'utf8')).scripts;
  for (const gate of ['server:check', 'typecheck', 'audit:reachability', 'persistence:check', 'env:contract', 'test:run', 'db:verify', 'build']) {
    assert.ok(new RegExp(`^\\s*-\\s*pnpm ${gate}\\s*$`, 'm').test(spec), `buildspec.yml must run pnpm ${gate}`);
    assert.ok(scripts[gate], `package.json must define ${gate}`);
  }
  assert.ok(/provision-postgres\.sh/.test(spec), 'buildspec.yml must provision PostgreSQL before db:verify');
  assert.ok(scripts['test:run'].includes('scripts/tests/'), 'test:run must execute the node:test regression suites');
});

test('App Router has no conflicting sibling dynamic segment names', () => {
  const conflicts = [];
  const visit = (directory) => {
    const entries = readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    const dynamic = entries.filter((entry) => /^\[{1,2}\.?.*\]{1,2}$/.test(entry.name));
    if (dynamic.length > 1) conflicts.push(`${directory}: ${dynamic.map((entry) => entry.name).join(', ')}`);
    for (const entry of entries) visit(join(directory, entry.name));
  };
  visit(appRoot);
  assert.deepEqual(conflicts, [], `Conflicting Next.js dynamic route segments:\n${conflicts.join('\n')}`);
});

test('build gate requires the public bridge mapping and compiled handler', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'oxsig-routes-'));
  const run = () => spawnSync(process.execPath, [routeCheck], { cwd, encoding: 'utf8' });
  try {
    assert.equal(run().status, 1, 'missing manifests must fail');
    mkdirSync(join(cwd, '.next/server/app/%5F_oxsig/terminal-bridge'), { recursive: true });
    const routeKey = '/%5F_oxsig/terminal-bridge/route';
    const artifact = 'app/%5F_oxsig/terminal-bridge/route.js';
    writeFileSync(join(cwd, '.next/app-path-routes-manifest.json'), '{}');
    writeFileSync(join(cwd, '.next/server/app-paths-manifest.json'), JSON.stringify({ [routeKey]: artifact }));
    assert.equal(run().status, 1, 'a private or omitted route must fail');
    writeFileSync(join(cwd, '.next/app-path-routes-manifest.json'), JSON.stringify({ [routeKey]: '/__oxsig/terminal-bridge' }));
    assert.equal(run().status, 1, 'missing compiled artifact must fail');
    writeFileSync(join(cwd, '.next/server', artifact), '');
    assert.equal(run().status, 0, 'registered and compiled bridge must pass');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});