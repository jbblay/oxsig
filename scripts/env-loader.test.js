import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadOxsigEnvFiles } from './env-loader.mjs';

const TEST_KEYS = [
  'OXSIG_ENV_LOADER_TEST_VALUE',
  'OXSIG_ENV_LOADER_TEST_SHELL',
];

afterEach(() => {
  for (const key of TEST_KEYS) delete process.env[key];
});

async function withTempEnvFiles(env, envLocal, callback) {
  const cwd = await mkdtemp(join(tmpdir(), 'oxsig-env-loader-'));
  try {
    if (env !== null) await writeFile(join(cwd, '.env'), env, 'utf8');
    if (envLocal !== null) await writeFile(join(cwd, '.env.local'), envLocal, 'utf8');
    await callback(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

describe('loadOxsigEnvFiles', () => {
  it('loads .env and lets .env.local override values loaded from it', async () => {
    await withTempEnvFiles(
      'OXSIG_ENV_LOADER_TEST_VALUE=from-env\n',
      'OXSIG_ENV_LOADER_TEST_VALUE=from-local\n',
      async (cwd) => {
        await loadOxsigEnvFiles({ cwd });
        expect(process.env.OXSIG_ENV_LOADER_TEST_VALUE).toBe('from-local');
      }
    );
  });

  it('preserves variables that were already exported by the shell', async () => {
    process.env.OXSIG_ENV_LOADER_TEST_SHELL = 'from-shell';

    await withTempEnvFiles(
      'OXSIG_ENV_LOADER_TEST_SHELL=from-env\n',
      'OXSIG_ENV_LOADER_TEST_SHELL=from-local\n',
      async (cwd) => {
        await loadOxsigEnvFiles({ cwd });
        expect(process.env.OXSIG_ENV_LOADER_TEST_SHELL).toBe('from-shell');
      }
    );
  });

  it('allows missing env files without failing startup', async () => {
    await withTempEnvFiles(null, null, async (cwd) => {
      await expect(loadOxsigEnvFiles({ cwd })).resolves.toBeUndefined();
    });
  });
});
