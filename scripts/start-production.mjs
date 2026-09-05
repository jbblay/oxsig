import { loadOxsigEnvFiles } from './env-loader.mjs';

await loadOxsigEnvFiles();
await import('../server.mjs');
