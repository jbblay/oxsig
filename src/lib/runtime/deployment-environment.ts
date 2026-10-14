/**
 * Hosting-independent deployment environment.
 *
 * OXSIG historically relied on Vercel's VERCEL_ENV to tell production from
 * preview. Off Vercel (for example AWS ECS) that variable does not exist, so
 * production guards would silently degrade to NODE_ENV alone. OXSIG_DEPLOY_ENV
 * is the explicit, provider-neutral override; VERCEL_ENV remains honoured.
 *
 * Fail-closed rule: any production build (NODE_ENV=production) that does not
 * explicitly declare itself as preview/staging/development is production.
 *
 * Edge-safe: reads environment variables only (used by middleware).
 */
export type DeploymentEnvironment = 'production' | 'preview' | 'development' | 'test';

const KNOWN: Record<string, DeploymentEnvironment> = {
  production: 'production',
  prod: 'production',
  preview: 'preview',
  staging: 'preview',
  development: 'development',
  dev: 'development',
  test: 'test',
};

export function deploymentEnvironment(env: Record<string, string | undefined> = process.env): DeploymentEnvironment {
  const explicit = env.OXSIG_DEPLOY_ENV?.trim().toLowerCase();
  if (explicit) {
    const mapped = KNOWN[explicit];
    // Unknown explicit values are treated as production rather than guessed.
    return mapped ?? 'production';
  }

  const vercel = env.VERCEL_ENV?.trim().toLowerCase();
  if (vercel && KNOWN[vercel]) return KNOWN[vercel];

  if (env.NODE_ENV === 'test') return 'test';
  return env.NODE_ENV === 'production' ? 'production' : 'development';
}

export function isProductionDeployment(env: Record<string, string | undefined> = process.env): boolean {
  // Belt and braces: an explicit production marker anywhere wins.
  if (env.VERCEL_ENV === 'production') return true;
  return deploymentEnvironment(env) === 'production';
}

/** Label used for error-tracking environments (Sentry). */
export function deploymentEnvironmentLabel(env: Record<string, string | undefined> = process.env): string {
  return deploymentEnvironment(env);
}
