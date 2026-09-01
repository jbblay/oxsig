import type {
  StoryboardDrawEvent,
  StoryboardEvent,
} from './types';

type StoryboardActionEvent = Extract<StoryboardEvent, { type: 'draw' | 'clear' }>;

export type StoryboardHistoryState = {
  undoTarget: string | null;
  redoTarget: string | null;
};

export function getStoryboardActionId(event: StoryboardActionEvent): string {
  return event.type === 'draw' ? event.strokeId || event.id : event.id;
}

function eventsThrough(events: StoryboardEvent[], timeMs: number): StoryboardEvent[] {
  if (!Number.isFinite(timeMs)) return events;
  return events.filter((event) => event.t <= Math.max(0, timeMs));
}

/**
 * Resolves the visible pen/eraser segments at one point on the session timeline.
 * Undo and redo are timeline events, so seeking before an undo still shows the
 * original mark and seeking after it shows the corrected board.
 */
export function resolveStoryboardFrame(
  events: StoryboardEvent[],
  timeMs = Number.POSITIVE_INFINITY
): StoryboardDrawEvent[] {
  const available = eventsThrough(events, timeMs);
  const actions: StoryboardActionEvent[] = [];
  const knownActions = new Set<string>();
  const activeActions = new Map<string, boolean>();

  for (const event of available) {
    if (event.type === 'draw' || event.type === 'clear') {
      const actionId = getStoryboardActionId(event);
      actions.push(event);
      if (!knownActions.has(actionId)) {
        knownActions.add(actionId);
        activeActions.set(actionId, true);
      }
      continue;
    }

    if (knownActions.has(event.targetId)) {
      activeActions.set(event.targetId, event.type === 'redo');
    }
  }

  let lastClearIndex = -1;
  actions.forEach((event, index) => {
    if (
      event.type === 'clear' &&
      activeActions.get(getStoryboardActionId(event)) !== false
    ) {
      lastClearIndex = index;
    }
  });

  return actions.slice(lastClearIndex + 1).filter((event): event is StoryboardDrawEvent => {
    return (
      event.type === 'draw' &&
      activeActions.get(getStoryboardActionId(event)) !== false
    );
  });
}

/** Returns the next editor actions without discarding the recorded timeline. */
export function getStoryboardHistoryState(
  events: StoryboardEvent[],
  timeMs = Number.POSITIVE_INFINITY
): StoryboardHistoryState {
  const undoStack: string[] = [];
  const redoStack: string[] = [];
  const knownActions = new Set<string>();

  for (const event of eventsThrough(events, timeMs)) {
    if (event.type === 'draw' || event.type === 'clear') {
      const actionId = getStoryboardActionId(event);
      if (!knownActions.has(actionId)) {
        knownActions.add(actionId);
        undoStack.push(actionId);
        redoStack.length = 0;
      }
      continue;
    }

    if (event.type === 'undo') {
      const index = undoStack.lastIndexOf(event.targetId);
      if (index >= 0) {
        undoStack.splice(index, 1);
        redoStack.push(event.targetId);
      }
      continue;
    }

    const index = redoStack.lastIndexOf(event.targetId);
    if (index >= 0) {
      redoStack.splice(index, 1);
      undoStack.push(event.targetId);
    }
  }

  return {
    undoTarget: undoStack.at(-1) || null,
    redoTarget: redoStack.at(-1) || null,
  };
}

export function getStoryboardEventCountAtTime(
  events: StoryboardEvent[],
  timeMs: number
): number {
  const boundedTime = Math.max(0, timeMs);
  let count = 0;
  while (count < events.length && events[count].t <= boundedTime) count += 1;
  return count;
}

export function getStoryboardTimelineDuration(events: StoryboardEvent[]): number {
  return events.reduce((duration, event) => Math.max(duration, event.t), 0);
}

/**
 * Flattens the current board into time zero so it can be used as the initial
 * state for a new recording without carrying over the previous audio timeline.
 */
export function createStoryboardInitialFrame(
  events: StoryboardEvent[]
): StoryboardEvent[] {
  return resolveStoryboardFrame(events).map((event) => ({ ...event, t: 0 }));
}
