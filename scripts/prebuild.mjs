import { spawnSync } from 'node:child_process';

// CI and ordinary local builds do not need access to a real database.
// When Vercel/another deployment environment provides a PostgreSQL URL, make
// sure the small authentication schema exists before Next.js builds the app.
// Vercel's managed Neon integration calls its pooled URL
// DATABASE_POSTGRES_URL, so it must not require a duplicate manual secret.
if (!process.env.DATABASE_URL && !process.env.DATABASE_POSTGRES_URL) {
  console.log('Auth database bootstrap skipped: no supported database URL is configured.');
  process.exit(0);
}

console.log('Database URL detected; verifying OXSIG authentication schema...');

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
