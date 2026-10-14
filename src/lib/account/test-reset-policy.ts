import { isProductionDeployment } from '@/lib/runtime/deployment-environment';

/**
 * Destructive test-account reset policy. Fail closed: the reset is never
 * available on a production deployment, even if OXSIG_TEST_RESET_ENABLED is
 * copied there by mistake (previously that flag enabled it in production).
 * Preview, development and test deployments keep it, as before.
 */
export function resetEnabled(env: Record<string, string | undefined> = process.env) {
  return !isProductionDeployment(env);
}
