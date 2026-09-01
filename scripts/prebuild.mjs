import { spawnSync } from 'node:child_process';

// CI and ordinary local builds do not need access to a real database.
// When Vercel/another deployment environment provides DATABASE_URL, make sure
// the small authentication schema exists before Next.js builds the app.
if (!process.env.DATABASE_URL) {
  console.log('Auth database bootstrap skipped: DATABASE_URL is not configured for this build.');
  process.exit(0);
}

console.log('DATABASE_URL detected; verifying OXSIG authentication schema...');

const result = spawnSync(process.execPath, ['scripts/migrate-auth.mjs'], {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error('Unable to start authentication database bootstrap:', result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
