import { describe, expect, it } from 'vitest';
import {
  getOperation,
  operationHasAutomatedRuntime,
  operationSupportsWarRoomRuntime,
} from './catalog';

describe('automated Operation topology metadata', () => {
  it('describes Black Domain without coupling the product promise to one operator image', () => {
    const operation = getOperation('black-domain');
    expect(operation).not.toBeNull();
    expect(operation?.topology).toEqual(['Operator terminal', 'Windows workstation', 'Domain controller']);
    expect(operation?.modes).toContain('warroom');
    expect(operation?.runtime).toEqual({ driver: 'black-domain-v1', automated: true, warroom: true });
    expect(operation && operationHasAutomatedRuntime(operation)).toBe(true);
    expect(operation && operationSupportsWarRoomRuntime(operation)).toBe(true);
  });

  it('keeps planned Operations out of live runtime surfaces until a driver is registered', () => {
    const operation = getOperation('ghost-shell');
    expect(operation).not.toBeNull();
    expect(operation && operationHasAutomatedRuntime(operation)).toBe(false);
    expect(operation && operationSupportsWarRoomRuntime(operation)).toBe(false);
  });
});
