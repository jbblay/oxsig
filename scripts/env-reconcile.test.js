import { describe, expect, it } from 'vitest';
import {
  parseEnvExample,
  reconcileContents,
  validateEnvironment,
} from './env-reconcile-lib.mjs';

const EXAMPLE = `# Identity\nNEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=\nCLERK_SECRET_KEY=\nDATABASE_URL=\n\n# AWS\nLAB_AWS_ENABLED=false\nLAB_AWS_REGION=eu-central-1\nLAB_AWS_SUBNET_ID=\nLAB_AWS_SECURITY_GROUP_ID=\nLAB_AWS_OPERATION_SECURITY_GROUP_ID=\nLAB_AWS_INSTANCE_PROFILE=\n# LAB_AWS_WINDOWS_INSTANCE_TYPE=t3.small\n\n# Production security\nCRON_SECRET=\nSTORAGE_BUCKET=\nSTORAGE_REGION=eu-central-1\nOXSIG_TERMINAL_BRIDGE_SECRET=\nAWS_PROFILE=\n`;

describe('environment reconciliation', () => {
  it('preserves existing local values exactly and appends only missing keys', () => {
    const local = `# valuable local configuration\nDATABASE_URL="postgresql://local/db?sslmode=require"\nNEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_existing\nCLERK_SECRET_KEY=sk_test_existing\nLAB_AWS_ENABLED=true\n`;

    const result = reconcileContents({ exampleContent: EXAMPLE, localContent: local });

    expect(result.nextLocalContent.startsWith(local)).toBe(true);
    expect(result.nextLocalContent).toContain('DATABASE_URL="postgresql://local/db?sslmode=require"');
    expect(result.nextLocalContent.match(/^DATABASE_URL=/gm)).toHaveLength(1);
    expect(result.nextLocalContent).toContain('LAB_AWS_OPERATION_SECURITY_GROUP_ID=');
    expect(result.addedLocalKeys).toContain('LAB_AWS_OPERATION_SECURITY_GROUP_ID');
  });

  it('never fills an existing blank local key with a template or generated value', () => {
    const local = `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_existing\nCLERK_SECRET_KEY=sk_test_existing\nDATABASE_URL=\nLAB_AWS_REGION=\n`;
    const result = reconcileContents({ exampleContent: EXAMPLE, localContent: local });

    expect(result.nextLocalContent.match(/^DATABASE_URL=/gm)).toHaveLength(1);
    expect(result.localValues.get('DATABASE_URL')?.value).toBe('');
    expect(result.localValues.get('LAB_AWS_REGION')?.value).toBe('');
  });

  it('copies reusable local values to production but leaves production-specific identity, data, and secrets blank', () => {
    const local = `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_local\nCLERK_SECRET_KEY=sk_test_local\nDATABASE_URL=postgresql://development/db\nLAB_AWS_ENABLED=true\nLAB_AWS_REGION=eu-central-1\nLAB_AWS_SUBNET_ID=subnet-local\nLAB_AWS_SECURITY_GROUP_ID=sg-local\nLAB_AWS_OPERATION_SECURITY_GROUP_ID=sg-operation\nLAB_AWS_INSTANCE_PROFILE=oxsig-instance\nCRON_SECRET=local-cron-secret\nSTORAGE_BUCKET=oxsig-shared\nSTORAGE_REGION=eu-central-1\nOXSIG_TERMINAL_BRIDGE_SECRET=local-terminal-secret\nAWS_PROFILE=oxsig-dev\n`;

    const result = reconcileContents({ exampleContent: EXAMPLE, localContent: local });

    expect(result.productionValues.get('DATABASE_URL')?.value).toBe('');
    expect(result.productionValues.get('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY')?.value).toBe('');
    expect(result.productionValues.get('CLERK_SECRET_KEY')?.value).toBe('');
    expect(result.productionValues.get('CRON_SECRET')?.value).toBe('');
    expect(result.productionValues.get('OXSIG_TERMINAL_BRIDGE_SECRET')?.value).toBe('');
    expect(result.productionValues.get('LAB_AWS_OPERATION_SECURITY_GROUP_ID')?.value).toBe('sg-operation');
    expect(result.productionValues.get('STORAGE_BUCKET')?.value).toBe('oxsig-shared');
    expect(result.productionValues.has('AWS_PROFILE')).toBe(false);
  });

  it('preserves existing production values and flags local-only keys without deleting them', () => {
    const production = `DATABASE_URL=postgresql://production/db\nAWS_PROFILE=should-be-removed\n`;
    const result = reconcileContents({
      exampleContent: EXAMPLE,
      localContent: '',
      productionContent: production,
    });

    expect(result.nextProductionContent.startsWith(production)).toBe(true);
    expect(result.productionValues.get('DATABASE_URL')?.value).toBe('postgresql://production/db');
    expect(result.localOnlyInProduction).toEqual(['AWS_PROFILE']);
  });

  it('treats commented optional assignments in .env.example as part of the contract', () => {
    const result = reconcileContents({ exampleContent: EXAMPLE });
    expect(result.contract.map((entry) => entry.key)).toContain('LAB_AWS_WINDOWS_INSTANCE_TYPE');
    expect(result.nextLocalContent).toContain('LAB_AWS_WINDOWS_INSTANCE_TYPE=t3.small');
  });

  it('treats reordered and regrouped env files as complete when all contract keys exist', () => {
    const local = parseEnvExample(EXAMPLE)
      .map((entry) => `${entry.key}=${entry.defaultValue}`)
      .reverse()
      .join('\n');

    const result = reconcileContents({ exampleContent: EXAMPLE, localContent: local });

    expect(result.addedLocalKeys).toEqual([]);
    expect(result.nextLocalContent).toBe(local);
  });

  it('requires the dedicated Operations security group whenever AWS labs are enabled', () => {
    const local = `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_existing\nCLERK_SECRET_KEY=sk_test_existing\nDATABASE_URL=postgresql://local/db\nLAB_AWS_ENABLED=true\nLAB_AWS_REGION=eu-central-1\nLAB_AWS_SUBNET_ID=subnet-1\nLAB_AWS_SECURITY_GROUP_ID=sg-ordinary\nLAB_AWS_INSTANCE_PROFILE=oxsig-instance\n`;
    const result = reconcileContents({ exampleContent: EXAMPLE, localContent: local });
    const validation = validateEnvironment(result.localValues);

    expect(validation.errors).toContain('LAB_AWS_OPERATION_SECURITY_GROUP_ID');
  });
});
