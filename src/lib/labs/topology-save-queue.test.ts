import { describe, expect, it, vi } from 'vitest';
import { LabTopologySaveQueue } from './topology-save-queue';
import type { LabTopology } from './topology-schema';

function topology(label: string): LabTopology {
  return {
    nodes: [{
      id: `machine-${label}`,
      type: 'machine',
      position: { x: 10, y: 20 },
      data: { slug: 'ubuntu-security-lab', label },
    }],
    edges: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('LabTopologySaveQueue', () => {
  it('persists the final A after an in-flight A -> B -> A transition', async () => {
    const stateA = topology('A');
    const stateB = topology('B');
    const firstSave = deferred<LabTopology>();
    const saves: LabTopology[] = [];
    const save = vi.fn(async (value: LabTopology) => {
      saves.push(value);
      if (saves.length === 1) return firstSave.promise;
      return value;
    });
    const reportError = vi.fn();
    const queue = new LabTopologySaveQueue(save, reportError);
    queue.setConfirmed(stateA);

    const savingB = queue.enqueue(stateB);
    expect(save).toHaveBeenCalledTimes(1);

    const savingFinalA = queue.enqueue(stateA);
    expect(save).toHaveBeenCalledTimes(1);

    firstSave.resolve(stateB);
    await Promise.all([savingB, savingFinalA]);

    expect(saves).toEqual([stateB, stateA]);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('publishes the worker before the first save can re-enter the queue', async () => {
    const stateA = topology('A');
    const stateB = topology('B');
    const stateC = topology('C');
    const firstSave = deferred<LabTopology>();
    const saves: LabTopology[] = [];
    let queue!: LabTopologySaveQueue;

    const save = vi.fn((value: LabTopology) => {
      saves.push(value);
      if (saves.length === 1) {
        void queue.enqueue(stateC);
        return firstSave.promise;
      }
      return Promise.resolve(value);
    });

    queue = new LabTopologySaveQueue(save, vi.fn());
    queue.setConfirmed(stateA);

    const saving = queue.enqueue(stateB);
    expect(save).toHaveBeenCalledTimes(1);

    firstSave.resolve(stateB);
    await saving;

    expect(saves).toEqual([stateB, stateC]);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('coalesces multiple queued changes to the latest desired graph', async () => {
    const stateA = topology('A');
    const stateB = topology('B');
    const stateC = topology('C');
    const stateD = topology('D');
    const firstSave = deferred<LabTopology>();
    const saves: LabTopology[] = [];
    const save = vi.fn(async (value: LabTopology) => {
      saves.push(value);
      if (saves.length === 1) return firstSave.promise;
      return value;
    });
    const queue = new LabTopologySaveQueue(save, vi.fn());
    queue.setConfirmed(stateA);

    const first = queue.enqueue(stateB);
    void queue.enqueue(stateC);
    void queue.enqueue(stateD);
    firstSave.resolve(stateB);
    await first;

    expect(saves).toEqual([stateB, stateD]);
  });

  it('reports a failed save without falsely advancing confirmed state', async () => {
    const stateA = topology('A');
    const stateB = topology('B');
    const error = new Error('save failed');
    const save = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(stateB);
    const reportError = vi.fn();
    const queue = new LabTopologySaveQueue(save, reportError);
    queue.setConfirmed(stateA);

    await queue.enqueue(stateB);
    expect(reportError).toHaveBeenCalledWith(error);

    await queue.enqueue(stateB);
    expect(save).toHaveBeenCalledTimes(2);
  });
});
