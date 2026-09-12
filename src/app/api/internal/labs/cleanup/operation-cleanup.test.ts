import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('scheduled Operation cleanup wiring', () => {
  it('includes Operation target tag recovery in the existing lab expiry endpoint', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/app/api/internal/labs/cleanup/route.ts'), 'utf8');
    expect(source).toContain('listExpiredTaggedOperationNodes');
    expect(source).toContain('UPDATE operation_nodes');
    expect(source).toContain('operationRunsReconciled');
    expect(source).toContain("NOT (metadata ? 'environmentId')");
    expect(source).toContain('run.environment_id IS NULL');
  });
});
