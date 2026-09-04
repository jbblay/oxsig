import type { StoryboardPoint } from './types';

export type StoryboardShapeTool = 'line' | 'arrow' | 'rectangle' | 'ellipse';

export type StoryboardShapeSegment = {
  from: StoryboardPoint;
  to: StoryboardPoint;
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));

function point(x: number, y: number): StoryboardPoint {
  return { x: clamp(x), y: clamp(y) };
}

function line(from: StoryboardPoint, to: StoryboardPoint): StoryboardShapeSegment {
  return { from: point(from.x, from.y), to: point(to.x, to.y) };
}

export function createStoryboardShapeSegments(
  tool: StoryboardShapeTool,
  start: StoryboardPoint,
  end: StoryboardPoint,
  canvasWidth = 1200,
  canvasHeight = 675
): StoryboardShapeSegment[] {
  if (tool === 'line') return [line(start, end)];

  if (tool === 'rectangle') {
    const topRight = point(end.x, start.y);
    const bottomLeft = point(start.x, end.y);
    return [
      line(start, topRight),
      line(topRight, end),
      line(end, bottomLeft),
      line(bottomLeft, start),
    ];
  }

  if (tool === 'ellipse') {
    const centerX = (start.x + end.x) / 2;
    const centerY = (start.y + end.y) / 2;
    const radiusX = Math.abs(end.x - start.x) / 2;
    const radiusY = Math.abs(end.y - start.y) / 2;
    const steps = 40;
    const points = Array.from({ length: steps + 1 }, (_, index) => {
      const angle = (index / steps) * Math.PI * 2;
      return point(
        centerX + Math.cos(angle) * radiusX,
        centerY + Math.sin(angle) * radiusY
      );
    });
    return points.slice(1).map((next, index) => line(points[index], next));
  }

  const dx = (end.x - start.x) * canvasWidth;
  const dy = (end.y - start.y) * canvasHeight;
  const length = Math.hypot(dx, dy);
  if (length < 1) return [line(start, end)];

  const angle = Math.atan2(dy, dx);
  const headLength = Math.min(34, Math.max(12, length * 0.22));
  const leftAngle = angle + Math.PI * 0.82;
  const rightAngle = angle - Math.PI * 0.82;
  const left = point(
    end.x + (Math.cos(leftAngle) * headLength) / canvasWidth,
    end.y + (Math.sin(leftAngle) * headLength) / canvasHeight
  );
  const right = point(
    end.x + (Math.cos(rightAngle) * headLength) / canvasWidth,
    end.y + (Math.sin(rightAngle) * headLength) / canvasHeight
  );

  return [line(start, end), line(end, left), line(end, right)];
}
