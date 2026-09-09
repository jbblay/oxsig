#!/usr/bin/env node
import process from 'node:process';
import { reconcileEnvFiles, validateEnvironment } from './env-reconcile-lib.mjs';

const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');

function list(label, keys) {
  if (!keys.length) return;
  console.log(`[oxsig] ${label}:`);
  for (const key of keys) console.log(`  - ${key}`);
}

try {
  const result = await reconcileEnvFiles({ write: !checkOnly });
  const localValidation = validateEnvironment(result.localValues);
  const productionValidation = validateEnvironment(result.productionValues, { production: true });

  if (checkOnly) {
    console.log('[oxsig] Checking .env.example, .env.local, and .env.production (read-only).');

    list('Missing from .env.local', result.addedLocalKeys);
    list('Missing from .env.production', result.addedProductionKeys);

    if (localValidation.errors.length) {
      console.error('[oxsig] Local required values are missing:');
      for (const key of localValidation.errors) console.error(`  - ${key}`);
    }

    if (productionValidation.errors.length) {
      console.error('[oxsig] Production required values are missing:');
      for (const key of productionValidation.errors) console.error(`  - ${key}`);
    }

    if (result.localOnlyInProduction.length) {
      console.error('[oxsig] Local-only keys must not exist in .env.production:');
      for (const key of result.localOnlyInProduction) console.error(`  - ${key}`);
    }

    const shouldFail =
      result.addedLocalKeys.length > 0 ||
      result.addedProductionKeys.length > 0 ||
      localValidation.errors.length > 0 ||
      productionValidation.errors.length > 0 ||
      result.localOnlyInProduction.length > 0;

    if (shouldFail) process.exit(1);

    console.log('[oxsig] Environment check passed. Key coverage and required values are valid.');
    process.exit(0);
  }

  console.log('[oxsig] Environment files reconciled without overwriting existing values.');
  list('Added to .env.local', result.addedLocalKeys);
  list('Added to .env.production', result.addedProductionKeys);

  if (result.localOnlyInProduction.length) {
    console.warn('[oxsig] Local-only variables found in .env.production; remove them before Vercel import:');
    for (const key of result.localOnlyInProduction) console.warn(`  - ${key}`);
  }

  if (localValidation.errors.length) {
    console.error('[oxsig] Local configuration is missing values required before startup/migrations:');
    for (const key of localValidation.errors) console.error(`  - ${key}`);
    process.exit(1);
  }

  console.log('[oxsig] Reconciliation complete. Run `pnpm env:check` for the full read-only validation.');
} catch (error) {
  console.error(`[oxsig] Environment operation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
