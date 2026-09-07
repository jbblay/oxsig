import 'server-only';

import { z } from 'zod';
import { InvalidPostgresJsonKeyError, sanitizePostgresJsonValue } from '@/lib/db/postgres-safe';
import { VAULT_KINDS, type VaultItem } from './types';

const sourceTypes = ['manual', 'collaboration', 'board', 'lab'] as const;

const metadataSchema = z.record(z.string(), z.unknown()).superRefine((value, context) => {
  try {
    sanitizePostgresJsonValue(value);
  } catch (error) {
    if (!(error instanceof InvalidPostgresJsonKeyError)) throw error;
    context.addIssue({ code: z.ZodIssueCode.custom, message: error.message });
  }
});

export const vaultCreateSchema = z.object({
  kind: z.enum(VAULT_KINDS),
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().max(500).optional().default(''),
  body: z.string().max(100_000).optional().default(''),
  language: z.string().trim().max(64).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional().default([]),
  pinned: z.boolean().optional().default(false),
  sourceType: z.enum(sourceTypes).nullable().optional().default('manual'),
  sourceId: z.string().trim().max(255).nullable().optional(),
  metadata: metadataSchema.optional().default({}),
}).strict();

export const vaultUpdateSchema = z.object({
  kind: z.enum(VAULT_KINDS).optional(),
  title: z.string().trim().min(1).max(160).optional(),
  summary: z.string().trim().max(500).optional(),
  body: z.string().max(100_000).optional(),
  language: z.string().trim().max(64).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  sourceType: z.enum(sourceTypes).nullable().optional(),
  sourceId: z.string().trim().max(255).nullable().optional(),
  metadata: metadataSchema.optional(),
}).strict();

export function normalizeVaultTags(tags: string[]) {
  return Array.from(
    new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))
  ).slice(0, 12);
}

export function mapVaultRow(row: Record<string, any>): VaultItem {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    summary: row.summary || '',
    body: row.body || '',
    language: row.language || null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    pinned: !!row.pinned,
    archived: !!row.archived,
    sourceType: row.source_type || null,
    sourceId: row.source_id || null,
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
