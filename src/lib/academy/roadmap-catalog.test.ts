import { describe, expect, it } from 'vitest';
import { ACADEMY_ROADMAPS, completedModuleCount, DOCKER_LEARNING_MODULES, getCareerRoadmap } from './roadmap-catalog';
import type { DockerMissionId } from './docker-missions';

describe('Academy shared skill roadmap', () => {
  it('defines every career and keeps only genuinely playable skills navigable', () => {
    for (const career of Object.values(ACADEMY_ROADMAPS)) {
      expect(career.skills.length).toBeGreaterThan(0);
      expect(new Set(career.skills.map(skill => skill.id)).size).toBe(career.skills.length);
      for (const skill of career.skills) {
        expect(skill.modules.length).toBeGreaterThan(0);
        if (skill.availability === 'live') expect(skill.href).toMatch(/^\/academy\/learn\//);
        else expect(skill.href).toBeUndefined();
      }
    }
    expect(getCareerRoadmap('devops')?.title).toBe('DevOps & Cloud');
    expect(getCareerRoadmap('__proto__')).toBeNull();
    expect(getCareerRoadmap('invalid')).toBeNull();
  });

  it('preserves the vertical DevOps sequence without inventing Linux progress', () => {
    expect(ACADEMY_ROADMAPS.devops.skills.map(skill => skill.id)).toEqual([
      'linux-fundamentals', 'networking', 'docker', 'kubernetes',
    ]);
    expect(ACADEMY_ROADMAPS.devops.skills[0].availability).toBe('planned');
    expect(ACADEMY_ROADMAPS.devops.skills[2].availability).toBe('live');
  });

  it('counts verified Docker modules only when their real missions are verified', () => {
    expect(completedModuleCount(DOCKER_LEARNING_MODULES, new Set<DockerMissionId>())).toBe(0);
    expect(completedModuleCount(DOCKER_LEARNING_MODULES, new Set<DockerMissionId>(['deploy']))).toBe(1);
    expect(completedModuleCount(DOCKER_LEARNING_MODULES, new Set<DockerMissionId>(['deploy', 'repair']))).toBe(2);
    expect(completedModuleCount(DOCKER_LEARNING_MODULES, new Set<DockerMissionId>(['deploy', 'repair', 'persist']))).toBe(3);
    expect(completedModuleCount(ACADEMY_ROADMAPS.devops.skills[0].modules, new Set<DockerMissionId>(['deploy', 'repair', 'persist']))).toBe(0);
  });
});
