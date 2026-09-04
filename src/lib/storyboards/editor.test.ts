import { describe, expect, it } from 'vitest';
import {
  clampStoryboardZoom,
  snapStoryboardPoint,
  STORYBOARD_MAX_ZOOM,
  STORYBOARD_MIN_ZOOM,
} from './editor';

describe('storyboard editor helpers', () => {
  it('keeps unsnapped points bounded', () => {
    expect(snapStoryboardPoint({ x: -0.2, y: 1.4 }, false)).toEqual({ x: 0, y: 1 });
  });

  it('snaps points onto the configured grid', () => {
    expect(snapStoryboardPoint({ x: 0.51, y: 0.51 }, true, 10, 10)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('clamps zoom to the supported workspace range', () => {
    expect(clampStoryboardZoom(0.1)).toBe(STORYBOARD_MIN_ZOOM);
    expect(clampStoryboardZoom(1.25)).toBe(1.25);
    expect(clampStoryboardZoom(4)).toBe(STORYBOARD_MAX_ZOOM);
  });
});
