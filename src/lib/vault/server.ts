import 'server-only';

import { z } from 'zod';
import { InvalidPostgresJsonKeyError, sanitizePostgresJsonValue, sanitizePostgresText } from '@/lib/db/postgres-safe';
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

/**
 * Text is NUL-sanitized *before* length validation. Sanitizing expands each
 * NUL into two characters, so validating first could accept input that the
 * VARCHAR columns then reject with a 500 (Postgres 22001) instead of a 400.
 */
function storedText(options: { min?: number; max: number; trim?: boolean }) {
  let target = z.string();
  if (options.trim !== false) target = target.trim();
  if (options.min !== undefined) target = target.min(options.min);
  target = target.max(options.max);
  return z.string().transform(sanitizePostgresText).pipe(target);
}

const titleText = () => storedText({ min: 1, max: 160 });
const summaryText = () => storedText({ max: 500 });
const bodyText = () => storedText({ max: 100_000, trim: false });
const languageText = () => storedText({ max: 64 });
const tagText = () => storedText({ min: 1, max: 40 });
const sourceIdText = () => storedText({ max: 255 });

export const vaultCreateSchema = z.object({
  kind: z.enum(VAULT_KINDS),
  title: titleText(),
  summary: summaryText().optional().default(''),
  body: bodyText().optional().default(''),
  language: languageText().nullable().optional(),
  tags: z.array(tagText()).max(12).optional().default([]),
  pinned: z.boolean().optional().default(false),
  sourceType: z.enum(sourceTypes).nullable().optional().default('manual'),
  sourceId: sourceIdText().nullable().optional(),
  metadata: metadataSchema.optional().default({}),
}).strict();

export const vaultUpdateSchema = z.object({
  version: z.number().int().positive(),
  kind: z.enum(VAULT_KINDS).optional(),
  title: titleText().optional(),
  summary: summaryText().optional(),
  body: bodyText().optional(),
  language: languageText().nullable().optional(),
  tags: z.array(tagText()).max(12).optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  sourceType: z.enum(sourceTypes).nullable().optional(),
  sourceId: sourceIdText().nullable().optional(),
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
    version: Number(row.version || 1),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
