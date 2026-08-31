import { z } from 'zod';

const MAX_METADATA_BYTES = 16 * 1024;

export const metadataSchema = z.record(z.string(), z.unknown()).refine(
  (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength <= MAX_METADATA_BYTES,
  'Metadata must be 16 KB or smaller',
);

export const uuidSchema = z.string().uuid();
