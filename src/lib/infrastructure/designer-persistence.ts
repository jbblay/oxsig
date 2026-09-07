import 'server-only';

import { getPool } from '@/lib/db/pool';
import { stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { infrastructureDesignSchema, type InfrastructureDesign } from './designer-schema';

export type PersistedInfrastructureDesign = {
  design: InfrastructureDesign;
  updatedAt: string;
};

export async function getInfrastructureDesign(ownerId: string): Promise<PersistedInfrastructureDesign | null> {
  const result = await getPool().query(
    `SELECT design, updated_at
       FROM infrastructure_designs
      WHERE owner_id = $1`,
    [ownerId]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    design: infrastructureDesignSchema.parse(row.design),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function saveInfrastructureDesign(ownerId: string, design: InfrastructureDesign): Promise<PersistedInfrastructureDesign> {
  const validated = infrastructureDesignSchema.parse(design);
  const result = await getPool().query(
    `INSERT INTO infrastructure_designs (owner_id, design)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (owner_id)
     DO UPDATE SET design = EXCLUDED.design, updated_at = NOW()
     RETURNING design, updated_at`,
    [ownerId, stringifyPostgresJson(validated)]
  );

  const row = result.rows[0];
  return {
    design: infrastructureDesignSchema.parse(row.design),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
