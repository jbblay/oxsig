// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { closePool, getPool, transaction } from './pool';
import { InvalidPostgresJsonKeyError, stringifyPostgresJson } from './postgres-safe';

// Explicit opt-in prevents these tests from touching an application's database.
const databaseUrl = process.env.OXSIG_TEST_DATABASE_URL;
const text = String.raw`{ "n": 9007199254740993, "n": 2, "example": "\\u0000" }`;

describe.skipIf(!databaseUrl)('PostgreSQL parameter boundary', () => {
  beforeAll(() => vi.stubEnv('DATABASE_URL', databaseUrl!));
  afterAll(async () => { await closePool(); vi.unstubAllEnvs(); });

  it('round-trips text, explicit JSON, text arrays, and binary through pool.query', async () => {
    const binary = Buffer.from([0, 1, 2, 255]);
    const result = await getPool().query(
      'SELECT $1::text AS text, $2::jsonb AS json, $3::bytea AS binary, $4::text[] AS items',
      [text, stringifyPostgresJson({ nested: ['a\u0000b'] }), binary, ['a\u0000b', text]],
    );
    expect(result.rows[0]).toEqual({
      text, json: { nested: ['a\\0b'] }, binary, items: ['a\\0b', text],
    });
  });

  it('preserves serialized numeric tokens when explicitly passed as JSON', async () => {
    const serialized = String.raw`{"n":9007199254740993,"example":"\\u0000"}`;
    const result = await getPool().query("SELECT $1::jsonb->>'n' AS n", [serialized]);
    expect(result.rows[0].n).toBe('9007199254740993');
  });

  it('supports query config objects and checked-out clients, including reuse', async () => {
    for (let i = 0; i < 2; i++) {
      const client = await getPool().connect();
      try {
        const result = await client.query({ text: 'SELECT $1::text AS value', values: ['a\u0000b'] });
        expect(result.rows[0].value).toBe('a\\0b');
      } finally { client.release(); }
    }
    const result = await getPool().query({ text: 'SELECT $1::text AS value', values: [text] });
    expect(result.rows[0].value).toBe(text);
  });

  it('supports callback pool queries and callback connect/client queries', async () => {
    const result = await new Promise<any>((resolve, reject) => {
      getPool().query('SELECT $1::text AS value', ['a\u0000b'], (error, result) => {
        if (error) reject(error); else resolve(result);
      });
    });
    expect(result.rows[0].value).toBe('a\\0b');
    const value = await new Promise<string>((resolve, reject) => {
      getPool().connect((error, client, release) => {
        if (error || !client) { reject(error); return; }
        client.query({ text: 'SELECT $1::text AS value', values: [text] }, (queryError, result) => {
          release();
          if (queryError) reject(queryError); else resolve(result.rows[0].value);
        });
      });
    });
    expect(value).toBe(text);
  });

  it('sanitizes transaction parameters and releases the client after rollback', async () => {
    const result = await transaction(client => client.query('SELECT $1::text AS value', ['a\u0000b']));
    expect(result.rows[0].value).toBe('a\\0b');
    await expect(transaction(client => client.query('SELECT 1 / 0'))).rejects.toThrow();
    expect((await getPool().query('SELECT 1 AS value')).rows[0].value).toBe(1);
    expect(getPool().idleCount).toBe(getPool().totalCount);
  });

  it('rejects NUL keys and keeps the pool usable', async () => {
    await expect(transaction(client => client.query('SELECT $1::jsonb', [{ ['bad\u0000key']: 1 }])))
      .rejects.toBeInstanceOf(InvalidPostgresJsonKeyError);
    expect((await getPool().query('SELECT 1 AS value')).rows[0].value).toBe(1);
  });
});
