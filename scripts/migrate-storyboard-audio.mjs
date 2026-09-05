import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const { Client } = pg;

async function loadEnvFile(filename) {
  try {
    const text = await fs.readFile(path.resolve(process.cwd(), filename), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      let value = match[2].trim();
      if (
        value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'")))
      ) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

await loadEnvFile('.env');
await loadEnvFile('.env.local');

const connectionString = process.env.DATABASE_URL;
const bucket = process.env.STORAGE_BUCKET;
const region = process.env.STORAGE_REGION || process.env.AWS_REGION || 'eu-central-1';

if (!connectionString) {
  console.error('DATABASE_URL is required. Add it to .env.local or export it in the shell.');
  process.exit(1);
}
if (!bucket) {
  console.error('STORAGE_BUCKET is required before migrating Storyboard audio.');
  process.exit(1);
}

const client = new Client({ connectionString });
const s3 = new S3Client({ region });

function etag(value) {
  return value ? String(value).replace(/^"|"$/g, '') : null;
}

async function assertSchemaReady() {
  const result = await client.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_name = 'storyboard_sessions'
       AND column_name = 'audio_storage_key'
     LIMIT 1`
  );
  if (!result.rowCount) {
    throw new Error('Migration 026_storyboard_audio_storage.sql must be applied first (run pnpm db:migrate).');
  }
}

async function purgeDeletedLegacyAudio() {
  const result = await client.query(
    `UPDATE storyboard_sessions
     SET audio_data = NULL,
         audio_mime_type = CASE WHEN audio_storage_key IS NULL THEN NULL ELSE audio_mime_type END,
         audio_size = CASE WHEN audio_storage_key IS NULL THEN NULL ELSE audio_size END,
         updated_at = NOW()
     WHERE deleted_at IS NOT NULL AND audio_data IS NOT NULL`
  );
  if (result.rowCount) console.log(`purged legacy audio from ${result.rowCount} deleted Storyboard(s)`);
}

async function migrateBatch() {
  const result = await client.query(
    `SELECT id, owner_id, audio_data, audio_mime_type, audio_size
     FROM storyboard_sessions
     WHERE deleted_at IS NULL
       AND audio_data IS NOT NULL
       AND audio_storage_key IS NULL
     ORDER BY created_at ASC
     LIMIT 25`
  );

  for (const row of result.rows) {
    const key = `storyboards/audio/${row.owner_id}/legacy-${row.id}`;
    const contentType = row.audio_mime_type || 'application/octet-stream';
    const put = await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: row.audio_data,
      ContentType: contentType,
      CacheControl: 'private, no-store',
    }));

    const updated = await client.query(
      `UPDATE storyboard_sessions
       SET audio_storage_key = $1,
           audio_storage_etag = $2,
           audio_stored_at = NOW(),
           audio_data = NULL,
           updated_at = NOW()
       WHERE id = $3
         AND audio_storage_key IS NULL
         AND audio_data IS NOT NULL`,
      [key, etag(put.ETag), row.id]
    );

    if (updated.rowCount) {
      console.log(`migrated Storyboard ${row.id} (${row.audio_size || row.audio_data.length} bytes)`);
    }
  }

  return result.rowCount;
}

async function main() {
  await client.connect();
  await assertSchemaReady();
  await purgeDeletedLegacyAudio();

  let total = 0;
  while (true) {
    const count = await migrateBatch();
    total += count;
    if (count < 25) break;
  }

  const remaining = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM storyboard_sessions
     WHERE deleted_at IS NULL AND audio_data IS NOT NULL AND audio_storage_key IS NULL`
  );
  const remainingCount = remaining.rows[0]?.count || 0;
  console.log(`Storyboard audio migration complete: ${total} processed, ${remainingCount} legacy row(s) remaining.`);
  if (remainingCount) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Storyboard audio migration failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await client.end().catch(() => undefined);
});
