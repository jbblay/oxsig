import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { describeSchemaParity, inspectSchemaParity } from './schema-parity-lib.mjs';

const { Client } = pg;

async function loadEnvValue(filename, key) {
  try {
    const text = await fs.readFile(path.resolve(process.cwd(), filename), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*(.*)\\s*$`));
      if (!match) continue;

      let value = match[1].trim();
      if (
        value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'")))
      ) {
        value = value.slice(1, -1);
      }
      return value;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return undefined;
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    (await loadEnvValue('.env.local', 'DATABASE_URL')) ||
    (await loadEnvValue('.env', 'DATABASE_URL'));
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required. Add it to .env.local or export it in the shell.');
  process.exit(1);
}

const client = new Client({ connectionString });

async function main() {
  await client.connect();
  const result = await inspectSchemaParity(client);
  console.log(describeSchemaParity(result));
  if (!result.ready) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('Schema parity check failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end().catch(() => undefined);
  });
