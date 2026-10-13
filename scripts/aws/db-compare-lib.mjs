// Pure helpers for comparing two PostgreSQL databases after a copy (Neon -> RDS).

export const SNAPSHOT_SQL = {
  tables: `SELECT c.relname AS table_name
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
            ORDER BY 1`,
  sequences: `SELECT sequencename AS name, COALESCE(last_value, 0)::text AS last_value
                FROM pg_sequences WHERE schemaname = 'public' ORDER BY 1`,
  ledger: `SELECT filename, checksum FROM oxisg_schema_migrations ORDER BY filename`,
};

/** Quote an identifier that came from the catalog (defence in depth). */
export function quoteIdent(name) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Refusing unexpected table name: ${name}`);
  return `"${name}"`;
}

/** Order-independent content fingerprint of a table. */
export function tableFingerprintSql(table) {
  const ident = quoteIdent(table);
  return `SELECT COUNT(*)::bigint AS row_count,
                 COALESCE(md5(string_agg(md5(t::text), '' ORDER BY md5(t::text))), '') AS digest
            FROM public.${ident} t`;
}

export async function snapshotDatabase(client, { contentChecks = true } = {}) {
  const tables = (await client.query(SNAPSHOT_SQL.tables)).rows.map((row) => row.table_name);
  const snapshot = { tables: {}, sequences: {}, ledger: {} };
  for (const table of tables) {
    const { rows } = await client.query(
      contentChecks ? tableFingerprintSql(table) : `SELECT COUNT(*)::bigint AS row_count, '' AS digest FROM public.${quoteIdent(table)}`
    );
    snapshot.tables[table] = { rows: String(rows[0].row_count), digest: rows[0].digest };
  }
  for (const row of (await client.query(SNAPSHOT_SQL.sequences)).rows) snapshot.sequences[row.name] = row.last_value;
  const hasLedger = (await client.query(`SELECT to_regclass('public.oxisg_schema_migrations') AS t`)).rows[0]?.t;
  if (hasLedger) for (const row of (await client.query(SNAPSHOT_SQL.ledger)).rows) snapshot.ledger[row.filename] = row.checksum;
  return snapshot;
}

/**
 * Compare a source and target snapshot. Sequences on the target may be ahead
 * (never behind) of the source; everything else must match exactly.
 */
export function compareSnapshots(source, target) {
  const problems = [];
  const allTables = new Set([...Object.keys(source.tables), ...Object.keys(target.tables)]);
  for (const table of [...allTables].sort()) {
    const a = source.tables[table];
    const b = target.tables[table];
    if (!a) problems.push(`table ${table} exists only on target`);
    else if (!b) problems.push(`table ${table} missing on target`);
    else if (a.rows !== b.rows) problems.push(`table ${table} row count ${a.rows} (source) != ${b.rows} (target)`);
    else if (a.digest !== b.digest) problems.push(`table ${table} content differs`);
  }
  for (const [name, value] of Object.entries(source.sequences)) {
    const targetValue = target.sequences[name];
    if (targetValue === undefined) problems.push(`sequence ${name} missing on target`);
    else if (BigInt(targetValue) < BigInt(value)) problems.push(`sequence ${name} behind on target (${targetValue} < ${value})`);
  }
  const ledgerNames = new Set([...Object.keys(source.ledger), ...Object.keys(target.ledger)]);
  for (const name of [...ledgerNames].sort()) {
    if (source.ledger[name] !== target.ledger[name]) problems.push(`migration ledger differs for ${name}`);
  }
  return { ok: problems.length === 0, problems, tablesCompared: allTables.size };
}
