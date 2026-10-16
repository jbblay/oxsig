import { describe, expect, it } from 'vitest';
import { ACADEMY_ROADMAPS, completedModuleCount, DOCKER_LEARNING_MODULES, getCareerRoadmap, getSkillRoadmapState, type AcademyCareer } from './roadmap-catalog';

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
    expect(completedModuleCount(DOCKER_LEARNING_MODULES, new Set<string>())).toBe(0);
    expect(completedModuleCount(DOCKER_LEARNING_MODULES, new Set<string>(['deploy']))).toBe(1);
    expect(completedModuleCount(DOCKER_LEARNING_MODULES, new Set<string>(['deploy', 'repair']))).toBe(2);
    expect(completedModuleCount(DOCKER_LEARNING_MODULES, new Set<string>(['deploy', 'repair', 'persist']))).toBe(3);
    expect(completedModuleCount(ACADEMY_ROADMAPS.devops.skills[0].modules, new Set<string>(['deploy', 'repair', 'persist']))).toBe(0);
  });
  it('unlocks each live skill only after the preceding live skill is verified', () => {
    const career: AcademyCareer = {
      id: 'devops', title: 'Test roadmap', subtitle: 'test',
      skills: [
        { id: 'planned-intro', title: 'Planned', summary: 'preview', availability: 'planned', modules: [{ id: 'preview', title: 'Preview', summary: 'Not live' }] },
        { id: 'first', title: 'First', summary: 'test', availability: 'live', href: '/academy/learn/first', modules: [{ id: 'one', title: 'One', summary: 'task', missionIds: ['mission-one'] }] },
        { id: 'second', title: 'Second', summary: 'test', availability: 'live', href: '/academy/learn/second', modules: [{ id: 'two', title: 'Two', summary: 'task', missionIds: ['mission-two'] }] },
      ],
    };
    expect(getSkillRoadmapState(career, 'planned-intro', new Set<string>())).toBe('planned');
    expect(getSkillRoadmapState(career, 'first', new Set<string>())).toBe('active');
    expect(getSkillRoadmapState(career, 'second', new Set<string>())).toBe('locked');
    expect(getSkillRoadmapState(career, 'first', new Set<string>(['mission-one']))).toBe('complete');
    expect(getSkillRoadmapState(career, 'second', new Set<string>(['mission-one']))).toBe('active');
    expect(getSkillRoadmapState(career, 'second', new Set<string>(['mission-one', 'mission-two']))).toBe('complete');
  });

});
