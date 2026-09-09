#!/usr/bin/env node
import process from 'node:process';
import { reconcileEnvFiles, validateEnvironment } from './env-reconcile-lib.mjs';

const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');
const productionStrict = args.has('--production');

function list(label, keys) {
  if (!keys.length) return;
  console.log(`[oxsig] ${label}:`);
  for (const key of keys) console.log(`  - ${key}`);
}

try {
  const result = await reconcileEnvFiles({ write: !checkOnly });

  if (checkOnly) {
    console.log('[oxsig] Environment key coverage check (no files changed).');
    if (productionStrict) {
      list('Missing from .env.production', result.addedProductionKeys);
    } else {
      list('Missing from .env.local', result.addedLocalKeys);
    }
  } else {
    console.log('[oxsig] Environment files reconciled without overwriting existing values.');
    list('Added to .env.local', result.addedLocalKeys);
    list('Added to .env.production', result.addedProductionKeys);
  }

  if ((!checkOnly || productionStrict) && result.localOnlyInProduction.length) {
    console.warn('[oxsig] Local-only variables found in .env.production; remove them before Vercel import:');
    for (const key of result.localOnlyInProduction) console.warn(`  - ${key}`);
  }

  const localValidation = validateEnvironment(result.localValues);
  if (!productionStrict) {
    if (localValidation.errors.length) {
      console.error('[oxsig] Local configuration is missing values required before startup/migrations:');
      for (const key of localValidation.errors) console.error(`  - ${key}`);
    } else {
      console.log('[oxsig] Local startup configuration is complete.');
    }

    if (result.missingLocalValues.length) {
      console.log(`[oxsig] ${result.missingLocalValues.length} optional/unused local contract value(s) are blank. This does not block startup.`);
      list('Blank local values', result.missingLocalValues.filter((key) => !localValidation.errors.includes(key)));
    }
  }

  const productionValidation = validateEnvironment(result.productionValues, { production: true });
  if (productionStrict) {
    if (productionValidation.errors.length) {
      console.error('[oxsig] Production configuration is missing required values:');
      for (const key of productionValidation.errors) console.error(`  - ${key}`);
    } else {
      console.log('[oxsig] Required production environment values are present.');
    }

    if (result.missingProductionValues.length) {
      console.log(`[oxsig] ${result.missingProductionValues.length} production contract value(s) are currently blank.`);
    }
  } else if (!checkOnly && productionValidation.errors.length) {
    console.log('[oxsig] Production is not complete yet. Required values still to supply:');
    for (const key of productionValidation.errors) console.log(`  - ${key}`);
  }

  const shouldFail = checkOnly
    ? productionStrict
      ? result.addedProductionKeys.length > 0 ||
        productionValidation.errors.length > 0 ||
        result.localOnlyInProduction.length > 0
      : result.addedLocalKeys.length > 0 || localValidation.errors.length > 0
    : localValidation.errors.length > 0;

  if (shouldFail) process.exit(1);
} catch (error) {
  console.error(`[oxsig] Environment reconciliation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
