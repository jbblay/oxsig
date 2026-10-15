import { describe, expect, it } from 'vitest';
import { CURATED_LEARNING_PATHS } from '@/lib/learning/curated-paths';
import { MENTOR_SPECIALIZATIONS, MENTOR_SPECIALIZATION_IDS } from './specializations';

describe('mentor specialization catalog', () => {
  it('has unique ids', () => {
    expect(new Set(MENTOR_SPECIALIZATION_IDS).size).toBe(MENTOR_SPECIALIZATION_IDS.length);
  });

  it('only references curated paths and capabilities that exist', () => {
    for (const specialization of MENTOR_SPECIALIZATIONS) {
      if (!specialization.academyEvidence) continue;
      const path = CURATED_LEARNING_PATHS.find((item) => item.id === specialization.academyEvidence!.pathId);
      expect(path, `${specialization.id} references a missing path`).toBeDefined();
      const capabilityIds = new Set(path!.capabilities.map((item) => item.id));
      for (const id of specialization.academyEvidence.capabilityIds) {
        expect(capabilityIds.has(id), `${specialization.id} references missing capability ${id}`).toBe(true);
      }
      expect(specialization.academyEvidence.minimumDemonstrated).toBeGreaterThan(0);
      expect(specialization.academyEvidence.minimumDemonstrated).toBeLessThanOrEqual(specialization.academyEvidence.capabilityIds.length);
    }
  });
});
