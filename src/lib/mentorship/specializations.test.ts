import { describe, expect, it } from 'vitest';
import { CURATED_LEARNING_PATHS } from '@/lib/learning/curated-paths';
import { DOCKER_MISSIONS } from '@/lib/academy/docker-missions';
import { ENGINEERING_MISSIONS } from '@/lib/academy/mission-engine-policy';
import { MENTOR_SPECIALIZATIONS, MENTOR_SPECIALIZATION_IDS } from './specializations';

describe('mentor specialization catalog', () => {
  it('has unique ids', () => {
    expect(new Set(MENTOR_SPECIALIZATION_IDS).size).toBe(MENTOR_SPECIALIZATION_IDS.length);
  });

  it('references real server-verifiable missions with a bounded qualifying threshold', () => {
    const docker = new Set(DOCKER_MISSIONS.map((item) => item.id));
    const engineering = new Set(ENGINEERING_MISSIONS.map((item) => item.id));
    for (const specialization of MENTOR_SPECIALIZATIONS) {
      if (!specialization.missionEvidence) continue;
      const evidence = specialization.missionEvidence;
      expect(evidence.missionIds.every((id) => docker.has(id as typeof DOCKER_MISSIONS[number]['id']))).toBe(true);
      expect(evidence.engineeringTemplateIds.every((id) => engineering.has(id as typeof ENGINEERING_MISSIONS[number]['id']))).toBe(true);
      const tokens = [
        ...evidence.missionIds.map((id) => `mission:${id}`),
        ...evidence.engineeringTemplateIds.map((id) => `engineering:${id}`),
      ];
      expect(new Set(tokens).size).toBe(tokens.length);
      expect(evidence.minimumDemonstrated).toBe(tokens.length);
    }
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
