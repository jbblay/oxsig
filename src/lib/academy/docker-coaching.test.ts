import { describe, expect, it } from 'vitest';
import { coachingHint, commandPurpose, dockerCoaching } from './docker-coaching';

describe('Docker practice coaching', () => {
  it('offers diagnostic commands without exposing a ready-made deployment', () => {
    for (const mission of ['deploy', 'repair', 'persist'] as const) {
      for (const level of ['beginner', 'intermediate'] as const) {
        expect(dockerCoaching(mission, level).commands.length).toBeGreaterThan(0);
        expect(dockerCoaching(mission, level).commands.join(' ')).not.toMatch(/docker (run|rm|exec)/);
      }
      expect(dockerCoaching(mission, 'advanced').commands).toEqual([]);
      expect(dockerCoaching(mission, 'advanced').workedCommands.length).toBeGreaterThan(0);
    }
  });
  it('progresses hints at each level and bounds repeated requests', () => {
    for (const level of ['beginner', 'intermediate', 'advanced'] as const) {
      expect(coachingHint('deploy', level, 1)).not.toBe(coachingHint('deploy', level, 2));
      expect(coachingHint('deploy', level, 99)).toBe(coachingHint('deploy', level, 3));
      expect(coachingHint('deploy', level, 0)).toBe(coachingHint('deploy', level, 1));
    }
    expect(coachingHint('deploy', 'beginner', 1)).not.toBe(coachingHint('deploy', 'advanced', 1));
  });
  it('explains inspection commands and flags destructive examples', () => {
    expect(commandPurpose('docker info')).toMatch(/accessible/);
    expect(commandPurpose('docker rm -f oxsig-academy-web')).toMatch(/stops its service/);
  });
});
