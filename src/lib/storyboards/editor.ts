import type { StoryboardPoint } from './types';

export const STORYBOARD_GRID_COLUMNS = 24;
export const STORYBOARD_GRID_ROWS = 14;
export const STORYBOARD_MIN_ZOOM = 0.5;
export const STORYBOARD_MAX_ZOOM = 2;

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function snapStoryboardPoint(
  point: StoryboardPoint,
  enabled: boolean,
  columns = STORYBOARD_GRID_COLUMNS,
  rows = STORYBOARD_GRID_ROWS
): StoryboardPoint {
  const bounded = { x: clampUnit(point.x), y: clampUnit(point.y) };
  if (!enabled) return bounded;

  return {
    x: clampUnit(Math.round(bounded.x * columns) / columns),
    y: clampUnit(Math.round(bounded.y * rows) / rows),
  };
}

export function clampStoryboardZoom(value: number): number {
  return Math.min(STORYBOARD_MAX_ZOOM, Math.max(STORYBOARD_MIN_ZOOM, value));
}
