import { describe, expect, it } from 'vitest';
import {
  defaultRuntimeProfileSelection,
  getRuntimeProfileAvailability,
  inspectRuntimeProfileSelection,
} from './runtime-profile';

describe('runtime profile contract', () => {
  it('builds a deterministic default selection from a known profile', () => {
    expect(defaultRuntimeProfileSelection('ubuntu-24-04')).toEqual({
      profileId: 'ubuntu-24-04',
      architecture: 'x86_64',
      resourceClass: 'lab-small',
      accessMode: 'terminal',
    });
  });

  it('uses the live lab catalog as the execution availability truth source', () => {
    expect(getRuntimeProfileAvailability('ubuntu-24-04')).toMatchObject({
      mapped: true,
      available: true,
      labSlug: 'ubuntu-security-lab',
    });
    expect(getRuntimeProfileAvailability('rocky-linux-9')).toMatchObject({
      mapped: true,
      available: false,
      labSlug: 'rocky-linux-rhcsa-lab',
    });
  });

  it('rejects profile and access combinations that do not match the node intent', () => {
    const selection = defaultRuntimeProfileSelection('windows-server-2022');
    expect(selection).toBeDefined();
    const inspection = inspectRuntimeProfileSelection('client', selection);
    expect(inspection.valid).toBe(false);
    expect(inspection.errors.join(' ')).toContain('not compatible with a client');
  });

  it('keeps an unmapped profile expressible while clearly marking it unavailable', () => {
    const selection = defaultRuntimeProfileSelection('windows-11');
    expect(selection).toBeDefined();
    const inspection = inspectRuntimeProfileSelection('client', selection);
    expect(inspection.valid).toBe(true);
    expect(inspection.warnings.join(' ')).toContain('No controlled OXSIG runtime adapter');
  });
});
