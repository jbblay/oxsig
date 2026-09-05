import 'server-only';

import { getPool } from '@/lib/db/pool';
import { labTopologySchema, type LabTopology } from './topology-schema';

export type PersistedLabTopology = {
  topology: LabTopology;
  updatedAt: string;
};

export async function getLabTopology(ownerId: string): Promise<PersistedLabTopology | null> {
  const result = await getPool().query(
    `SELECT topology, updated_at
       FROM lab_topologies
      WHERE owner_id = $1`,
    [ownerId]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    topology: labTopologySchema.parse(row.topology),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function saveLabTopology(ownerId: string, topology: LabTopology): Promise<PersistedLabTopology> {
  const validated = labTopologySchema.parse(topology);
  const result = await getPool().query(
    `INSERT INTO lab_topologies (owner_id, topology)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (owner_id)
     DO UPDATE SET topology = EXCLUDED.topology, updated_at = NOW()
     RETURNING topology, updated_at`,
    [ownerId, JSON.stringify(validated)]
  );

  const row = result.rows[0];
  return {
    topology: labTopologySchema.parse(row.topology),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
