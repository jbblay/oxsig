import { describe, expect, it } from 'vitest';
import { getOperation } from './catalog';

describe('automated Operation topology metadata', () => {
  it('describes Black Domain without coupling the product promise to one operator image', () => {
    const operation = getOperation('black-domain');
    expect(operation).not.toBeNull();
    expect(operation?.topology).toEqual(['Operator terminal', 'Windows workstation', 'Domain controller']);
    expect(operation?.modes).toContain('warroom');
  });
});
