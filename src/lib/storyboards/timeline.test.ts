import { describe, expect, it } from 'vitest';
import {
  createStoryboardInitialFrame,
  getStoryboardEventCountAtTime,
  getStoryboardHistoryState,
  resolveStoryboardFrame,
} from './timeline';
import type { StoryboardEvent } from './types';

const draw = (
  id: string,
  t: number,
  strokeId = id
): StoryboardEvent => ({
  id,
  strokeId,
  type: 'draw',
  t,
  from: { x: 0, y: 0 },
  to: { x: 0.5, y: 0.5 },
  width: 4,
  color: '#000000',
  tool: 'pen',
});

describe('storyboard timeline', () => {
  it('reconstructs the board at a requested time', () => {
    const events = [draw('a', 100), draw('b', 300)];

    expect(resolveStoryboardFrame(events, 99)).toEqual([]);
    expect(resolveStoryboardFrame(events, 200).map((event) => event.id)).toEqual(['a']);
    expect(resolveStoryboardFrame(events, 300).map((event) => event.id)).toEqual(['a', 'b']);
  });

  it('treats every segment in one stroke as one undo action', () => {
    const events: StoryboardEvent[] = [
      draw('a-1', 100, 'stroke-a'),
      draw('a-2', 120, 'stroke-a'),
      { id: 'undo-a', type: 'undo', targetId: 'stroke-a', t: 200 },
      { id: 'redo-a', type: 'redo', targetId: 'stroke-a', t: 300 },
    ];

    expect(resolveStoryboardFrame(events, 199)).toHaveLength(2);
    expect(resolveStoryboardFrame(events, 250)).toHaveLength(0);
    expect(resolveStoryboardFrame(events, 350)).toHaveLength(2);
    expect(getStoryboardHistoryState(events)).toEqual({
      undoTarget: 'stroke-a',
      redoTarget: null,
    });
  });

  it('restores the previous board when a clear action is undone', () => {
    const events: StoryboardEvent[] = [
      draw('a', 100),
      { id: 'clear', type: 'clear', t: 200 },
      draw('b', 300),
      { id: 'undo-b', type: 'undo', targetId: 'b', t: 400 },
      { id: 'undo-clear', type: 'undo', targetId: 'clear', t: 500 },
    ];

    expect(resolveStoryboardFrame(events, 350).map((event) => event.id)).toEqual(['b']);
    expect(resolveStoryboardFrame(events, 450)).toEqual([]);
    expect(resolveStoryboardFrame(events, 550).map((event) => event.id)).toEqual(['a']);
    expect(getStoryboardHistoryState(events)).toEqual({
      undoTarget: 'a',
      redoTarget: 'clear',
    });
  });

  it('creates a time-zero initial frame from the visible board', () => {
    const events: StoryboardEvent[] = [
      draw('old', 50),
      { id: 'clear', type: 'clear', t: 100 },
      draw('visible', 150),
    ];

    const initial = createStoryboardInitialFrame(events);
    expect(initial).toHaveLength(1);
    expect(initial[0]).toMatchObject({ id: 'visible', type: 'draw', t: 0 });
  });

  it('counts events crossed by the playback clock', () => {
    const events = [draw('a', 0), draw('b', 50), draw('c', 100)];
    expect(getStoryboardEventCountAtTime(events, 0)).toBe(1);
    expect(getStoryboardEventCountAtTime(events, 75)).toBe(2);
    expect(getStoryboardEventCountAtTime(events, 100)).toBe(3);
  });
});
