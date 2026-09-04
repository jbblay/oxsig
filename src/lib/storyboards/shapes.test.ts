import { describe, expect, it } from 'vitest';
import { createStoryboardShapeSegments } from './shapes';

const start = { x: 0.2, y: 0.25 };
const end = { x: 0.8, y: 0.75 };

describe('createStoryboardShapeSegments', () => {
  it('creates one segment for a line', () => {
    expect(createStoryboardShapeSegments('line', start, end)).toEqual([{ from: start, to: end }]);
  });

  it('creates a closed rectangle', () => {
    const segments = createStoryboardShapeSegments('rectangle', start, end);
    expect(segments).toHaveLength(4);
    expect(segments[0].from).toEqual(start);
    expect(segments.at(-1)?.to).toEqual(start);
  });

  it('creates a closed ellipse from replayable line segments', () => {
    const segments = createStoryboardShapeSegments('ellipse', start, end);
    expect(segments).toHaveLength(40);
    expect(segments.at(-1)?.to.x).toBeCloseTo(segments[0].from.x, 8);
    expect(segments.at(-1)?.to.y).toBeCloseTo(segments[0].from.y, 8);
  });

  it('creates a shaft and two arrowhead segments', () => {
    const segments = createStoryboardShapeSegments('arrow', start, end);
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ from: start, to: end });
    expect(segments[1].from).toEqual(end);
    expect(segments[2].from).toEqual(end);
  });

  it('keeps generated points inside normalized canvas bounds', () => {
    const segments = createStoryboardShapeSegments(
      'arrow',
      { x: 0.95, y: 0.95 },
      { x: 1, y: 1 }
    );
    for (const segment of segments) {
      for (const value of [segment.from.x, segment.from.y, segment.to.x, segment.to.y]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
});
