const previewDeployment = process.env.VERCEL_ENV === 'preview';
const databaseConfigured = Boolean(process.env.DATABASE_URL?.trim());

if (previewDeployment && databaseConfigured) {
  console.log('Applying database migrations for the Vercel Preview deployment.');
  await import('./migrate.mjs');
} else if (previewDeployment) {
  console.warn('Skipping Preview database migrations because DATABASE_URL is not configured.');
}
