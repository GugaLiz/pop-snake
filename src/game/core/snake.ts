import {
  DIRECTIONS,
  isOpposite,
  type Direction,
  type Point,
  type Segment,
} from '../types';

export function resolveQueuedDirection(
  currentDirection: Direction,
  queuedDirection: Direction,
): { direction: Direction; nextDirection: Direction } {
  if (!isOpposite(currentDirection, queuedDirection)) {
    return {
      direction: queuedDirection,
      nextDirection: queuedDirection,
    };
  }

  return {
    direction: currentDirection,
    nextDirection: currentDirection,
  };
}

export function getNextHeadPoint(
  head: Point,
  direction: Direction,
): Point {
  const vector = DIRECTIONS[direction];
  return {
    x: head.x + vector.x,
    y: head.y + vector.y,
  };
}

export function advanceSnake(
  snake: Segment[],
  nextHead: Segment,
): Segment[] {
  return snake.map((segment, index) => {
    if (index === 0) return { ...segment, x: nextHead.x, y: nextHead.y };
    const previousSegment = snake[index - 1];
    return { ...segment, x: previousSegment.x, y: previousSegment.y };
  });
}
