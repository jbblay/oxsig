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
    if (!this.running) {
      this.running = this.drain().finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  private async drain() {
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
  }
}
