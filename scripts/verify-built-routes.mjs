import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Inspect build output, not source presence: private App Router folders can
// contain valid route handlers and passing unit tests while emitting no route.
const requiredRoute = '/__oxsig/terminal-bridge';
try {
  const routes = JSON.parse(readFileSync('.next/app-path-routes-manifest.json', 'utf8'));
  const appPaths = JSON.parse(readFileSync('.next/server/app-paths-manifest.json', 'utf8'));
  const entry = Object.entries(routes).find(([key, pathname]) =>
    pathname === requiredRoute && key.endsWith('/route')
  );
  if (!entry || typeof appPaths[entry[0]] !== 'string' ||
      !existsSync(resolve('.next/server', appPaths[entry[0]]))) {
    throw new Error(`Missing compiled handler for ${requiredRoute}. Use src/app/%5F_oxsig, not the private folder src/app/__oxsig.`);
  }
  console.log(`[oxsig] Built route verified: ${requiredRoute}`);
} catch (error) {
  console.error('[oxsig] Built route check failed:', error.message);
  process.exitCode = 1;
}
