import type { LabTopology } from './topology-schema';

type SaveTopology = (topology: LabTopology) => Promise<LabTopology>;
type ReportError = (error: unknown) => void;

type PendingTopology = {
  topology: LabTopology;
  serialized: string;
};

function pending(topology: LabTopology): PendingTopology {
  return {
    topology,
    serialized: JSON.stringify(topology),
  };
}

/**
 * Serializes topology writes while tracking the latest desired graph separately
 * from the last server-confirmed graph.
 *
 * That distinction is required for A -> B -> A races: while B is in flight, A
 * must still become the desired state even though A equals the state that was
 * confirmed before B started. Once B completes, the queue observes that the
 * desired graph is A and persists A again.
 */
export class LabTopologySaveQueue {
  private confirmedSerialized: string | null = null;
  private desired: PendingTopology | null = null;
  private running: Promise<void> | null = null;

  constructor(
    private readonly save: SaveTopology,
    private readonly reportError: ReportError
  ) {}

  setConfirmed(topology: LabTopology) {
    const value = pending(topology);
    this.confirmedSerialized = value.serialized;
    this.desired = value;
  }

  enqueue(topology: LabTopology): Promise<void> {
    this.desired = pending(topology);
    return this.ensureRunning();
  }

  private ensureRunning(): Promise<void> {
    if (this.running) return this.running;

    let resolveWorker!: () => void;
    let rejectWorker!: (error: unknown) => void;
    const worker = new Promise<void>((resolve, reject) => {
      resolveWorker = resolve;
      rejectWorker = reject;
    });

    // Publish the worker before starting the drain. That removes the settled-
    // promise/finalizer window where a new desired graph could observe a stale
    // non-null running promise and then be left without a worker.
    this.running = worker;
    void this.drain().then(resolveWorker, rejectWorker);
    return worker;
  }

  private async drain() {
    try {
      while (this.desired && this.desired.serialized !== this.confirmedSerialized) {
        const candidate = this.desired;
        try {
          await this.save(candidate.topology);
          // The authenticated PUT accepted this exact desired topology. Use the
          // submitted representation as the ordering token so harmless server
          // normalization cannot create an endless resave loop.
          this.confirmedSerialized = candidate.serialized;
        } catch (error) {
          this.reportError(error);
          return;
        }
      }
    } finally {
      // No await occurs between the final desired/confirmed comparison above
      // and clearing running here, so JavaScript cannot interleave an enqueue in
      // a state where the old worker is both logically finished and still owns
      // the queue. Any later enqueue observes running === null and starts a new
      // worker immediately.
      this.running = null;
    }
  }
}
