import { loadOxsigEnvFiles } from './env-loader.mjs';

await loadOxsigEnvFiles();

// The E2E identity bypass skips Clerk entirely. Refuse to boot a production
// server with it enabled instead of failing every request at runtime.
if (process.env.OXSIG_E2E_AUTH_ENABLED === 'true') {
  console.error('[oxsig] OXSIG_E2E_AUTH_ENABLED=true is forbidden for production servers. Refusing to start.');
  process.exit(1);
}

await import('../server.mjs');
