import { describe, expect, it } from 'vitest';
import {
  DOCKER_FAULT_COMMAND, DOCKER_MISSIONS, DOCKER_VERIFY_COMMAND,
  MISSION_IDS, assessDockerMission,
} from './docker-missions';

describe('Docker Academy mission definitions', () => {
  const common = 'engine=ready\nrunning=ok\nport=ok\nhttp=ok\n';

  it('defines exactly three ordered, unique missions', () => {
    expect(DOCKER_MISSIONS.map(m => m.id)).toEqual(MISSION_IDS);
    expect(new Set(MISSION_IDS).size).toBe(3);
  });

  it('rejects incomplete real-world outcome checks', () => {
    expect(assessDockerMission('deploy', 'engine=ready\nrunning=ok\n').passed).toBe(false);
    expect(assessDockerMission('deploy', common).passed).toBe(true);
    expect(assessDockerMission('repair', 'engine=ready\nrunning=ok\nport=ok\n').passed).toBe(false);
  });

  it('requires persistent content, not merely an attached volume', () => {
    expect(assessDockerMission('persist', common + 'volume=ok\n').passed).toBe(false);
    expect(assessDockerMission('persist', common + 'volume=ok\ncontent=ok\n').passed).toBe(true);
  });

  it('does not count similar-looking text as a passed check', () => {
    expect(assessDockerMission('deploy', 'running=okay\nport=okay\nhttp=okay').passed).toBe(false);
    expect(assessDockerMission('deploy', common.replace('http=ok', 'http=not-ok')).passed).toBe(false);
  });

  it('keeps server-owned SSM commands short, fixed and Academy-scoped', () => {
    expect(DOCKER_VERIFY_COMMAND.length).toBeLessThanOrEqual(1000);
    expect(DOCKER_FAULT_COMMAND.length).toBeLessThanOrEqual(1000);
    expect(DOCKER_VERIFY_COMMAND).toContain('curl -m 4');
    expect(DOCKER_VERIFY_COMMAND).toContain('oxsig-academy-web');
    expect(DOCKER_FAULT_COMMAND).toContain('docker rm -f oxsig-academy-web');
    expect(DOCKER_FAULT_COMMAND).not.toContain('docker system prune');
  });
});
