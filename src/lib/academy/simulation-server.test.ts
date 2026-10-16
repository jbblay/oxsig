import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/pool', () => ({
  getPool: () => ({ query: mocks.query }),
  transaction: (cb: (db: { query: typeof mocks.query }) => unknown) => cb({ query: mocks.query }),
}));
import { SimulationError, checkSimulationStage, evaluateSimulation, simulationState } from './simulation-server';

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const successful = {
  stage_id: 'container', attempts: 1,
  verified_at: '2026-10-15T00:00:00.000Z', sp_awarded: 25, checks: [],
};
let unlocked: string[] = [];
let stored: typeof successful[] = [];

beforeEach(() => {
  unlocked = [];
  stored = [];
  mocks.query.mockReset();
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT stage_id,verified_at FROM academy_simulation_progress')) {
      return { rows: unlocked.map(stage_id => ({ stage_id, verified_at: new Date() })) };
    }
    if (sql.includes('SELECT stage_id,attempts,verified_at,sp_awarded,checks')) return { rows: stored };
    return { rows: [] };
  });
});
describe('Docker simulator graded practice', () => {
  it('grades only exact server-defined configuration state', () => {
    expect(evaluateSimulation('container', {image:'nginx:alpine',name:'oxsig-academy-web'}).passed).toBe(true);
    expect(evaluateSimulation('network', {publish:'18080:80',url:'http://localhost:18080'}).passed).toBe(true);
    expect(evaluateSimulation('storage', {mount:'oxsig_academy_data:/usr/share/nginx/html',marker:'OXSIG Academy persistent'}).passed).toBe(true);
    expect(evaluateSimulation('network', {publish:'18081:80',url:'http://localhost:18080'}).passed).toBe(false);
    expect(evaluateSimulation('container', {image:'nginx:alpine',name:'oxsig-academy-web',admin:'true'}).passed).toBe(false);
  });
  it('refuses a locked stage before a database mutation', async () => {
    await expect(checkSimulationStage(owner, 'network', {publish:'18080:80',url:'http://localhost:18080'}))
      .rejects.toMatchObject({code:'SIMULATION_LOCKED', status:409} satisfies Partial<SimulationError>);
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO academy_simulation_progress'))).toBe(false);
  });
  it('binds score and unlock to the authenticated owner and only awards fixed 25 practice SP', async () => {
    const result = await checkSimulationStage(owner,'container',{image:'nginx:alpine',name:'oxsig-academy-web'});
    expect(result.passed).toBe(true);
    const insert = mocks.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO academy_simulation_progress'))!;
    expect(insert[1]).toEqual([owner,'docker','container',1,expect.any(String),true,25]);
    expect(insert[0]).toContain('pg_advisory_xact_lock'.replace('pg_advisory_xact_lock','GREATEST'));
    const ownerRead = mocks.query.mock.calls.find(([sql]) => String(sql).includes('SELECT stage_id,attempts,verified_at,sp_awarded,checks'));
    expect(ownerRead?.[1]).toEqual([owner,'docker',1]);
  });
  it('does not grant SP for failed inputs', async () => {
    const result = await checkSimulationStage(owner, 'container', {image:'redis:alpine',name:'oxsig-academy-web'});
    expect(result.passed).toBe(false);
    const insert = mocks.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO academy_simulation_progress'))!;
    expect(insert[1][5]).toBe(false);
    expect(result.state.practiceSp).toBe(0);
  });
  it('rechecking a finished station cannot overwrite or double-award a checkpoint', async () => {
    unlocked = ['container'];
    stored = [successful];
    const result = await checkSimulationStage(owner, 'container', {image:'nginx:alpine',name:'oxsig-academy-web'});
    expect(result.state.practiceSp).toBe(25);
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO academy_simulation_progress'))).toBe(false);
  });
  it('reads only the requested user account and computes practice SP separately', async () => {
    stored = [successful];
    const result = await simulationState(other);
    expect(result.practiceSp).toBe(25);
    expect(mocks.query.mock.calls[0][1]).toEqual([other,'docker',1]);
  });
});
