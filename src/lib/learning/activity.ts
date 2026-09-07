import 'server-only';

import { getPool } from '@/lib/db/pool';

export type LearningActivityKind = 'academy' | 'lab';

/**
 * Record one learner-facing activity pulse for the current UTC day.
 *
 * Analytics must never make Academy or Cyber Lab unusable. The production
 * database may also temporarily lag the application during a migration rollout,
 * so this helper is intentionally best-effort and returns false on failure.
 */
export async function recordLearningActivity(
  ownerId: string,
  kind: LearningActivityKind
): Promise<boolean> {
  const academyIncrement = kind === 'academy' ? 1 : 0;
  const labIncrement = kind === 'lab' ? 1 : 0;

  try {
    await getPool().query(
      `INSERT INTO learning_activity_days (
         owner_id, activity_date, academy_actions, lab_actions, updated_at
       ) VALUES ($1, (NOW() AT TIME ZONE 'UTC')::date, $2, $3, NOW())
       ON CONFLICT (owner_id, activity_date) DO UPDATE
       SET academy_actions = learning_activity_days.academy_actions + EXCLUDED.academy_actions,
           lab_actions = learning_activity_days.lab_actions + EXCLUDED.lab_actions,
           updated_at = NOW()`,
      [ownerId, academyIncrement, labIncrement]
    );
    return true;
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code !== '42P01') {
      console.error('Learning activity rollup could not be recorded', { kind, code });
    }
    return false;
  }
}
