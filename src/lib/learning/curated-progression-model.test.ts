import { describe, expect, it } from 'vitest';
import { computeCuratedProgress } from './curated-progression-model';

const capabilities = ['one', 'two', 'three'];

describe('computeCuratedProgress', () => {
  it('does not advance on practice evidence alone', () => {
    expect(computeCuratedProgress(capabilities, [
      { capabilityId: 'one', sourceType: 'academy-practice', result: 'demonstrated' },
    ])).toEqual({
      demonstratedCapabilityIds: [],
      nextCapabilityId: 'one',
      completed: false,
    });
  });

  it('advances after demonstrated practice and reflection', () => {
    expect(computeCuratedProgress(capabilities, [
      { capabilityId: 'one', sourceType: 'academy-practice', result: 'demonstrated' },
      { capabilityId: 'one', sourceType: 'academy-reflection', result: 'demonstrated' },
    ])).toEqual({
      demonstratedCapabilityIds: ['one'],
      nextCapabilityId: 'two',
      completed: false,
    });
  });

  it('accepts a demonstrated assessment and ignores attempted evidence', () => {
    expect(computeCuratedProgress(capabilities, [
      { capabilityId: 'one', sourceType: 'assessment', result: 'demonstrated' },
      { capabilityId: 'two', sourceType: 'assessment', result: 'attempted' },
    ])).toEqual({
      demonstratedCapabilityIds: ['one'],
      nextCapabilityId: 'two',
      completed: false,
    });
  });

  it('marks the journey completed only when every capability is demonstrated', () => {
    expect(computeCuratedProgress(capabilities, capabilities.map((capabilityId) => ({
      capabilityId,
      sourceType: 'assessment' as const,
      result: 'demonstrated' as const,
    })))).toEqual({
      demonstratedCapabilityIds: capabilities,
      nextCapabilityId: null,
      completed: true,
    });
  });
});
