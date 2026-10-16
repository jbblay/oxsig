import { describe, expect, it } from 'vitest';
import { DOCKER_SIMULATION_STAGES, simulationStageIdSchema, simulatorCommandSchema, stageIsUnlocked } from './simulation-policy';

describe('reusable Academy simulator contract', () => {
  it('offers three uniquely identified sequential stations', () => {
    expect(DOCKER_SIMULATION_STAGES.map(x => x.id)).toEqual(['container', 'network', 'storage']);
    for (const stage of DOCKER_SIMULATION_STAGES) {
      expect(new Set(stage.slots.map(slot => slot.id)).size).toBe(stage.slots.length);
      for (const slot of stage.slots) expect(new Set(slot.options.map(x => x.value)).size).toBe(slot.options.length);
    }
  });
  it('does not unlock later stations from a browser hint or SP total', () => {
    expect(stageIsUnlocked('container', new Set())).toBe(true);
    expect(stageIsUnlocked('network', new Set())).toBe(false);
    expect(stageIsUnlocked('storage', new Set(['container']))).toBe(false);
    expect(stageIsUnlocked('network', new Set(['container']))).toBe(true);
    expect(stageIsUnlocked('storage', new Set(['container', 'network']))).toBe(true);
  });
  it('rejects forged extra fields, oversized payloads and unknown stages', () => {
    expect(simulationStageIdSchema.safeParse('runtime-admin').success).toBe(false);
    expect(simulatorCommandSchema.safeParse({stageId:'container', selections:{image:'nginx:alpine'}, passed:true, sp:100000}).success).toBe(false);
    expect(simulatorCommandSchema.safeParse({stageId:'container', selections:{a:'1',b:'2',c:'3',d:'4'}}).success).toBe(false);
    expect(simulatorCommandSchema.safeParse({stageId:'container', selections:{image:'x'.repeat(200)}}).success).toBe(false);
  });
});
