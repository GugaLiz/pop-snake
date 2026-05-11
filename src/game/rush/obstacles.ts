import type { Direction, Point } from '../types';
import { DIRECTIONS, samePoint } from '../types';

type GenerateRushObstacleClustersParams = {
  count: number;
  columns: number;
  rows: number;
  snakeHead: Point;
  snakeBody: Point[];
  foods: Point[];
  existing: Point[];
  nextRandom: () => number;
  randomInt: (min: number, max: number) => number;
};

type ClearRushLineParams = {
  origin: Point;
  direction: Direction;
  obstacles: Point[];
  columns: number;
  rows: number;
};

export function generateRushObstacleClusters(params: GenerateRushObstacleClustersParams): Point[] {
  const {
    count,
    columns,
    rows,
    snakeHead,
    snakeBody,
    foods,
    existing,
    nextRandom,
    randomInt,
  } = params;
  const spawned: Point[] = [];
  let attempts = 0;

  while (spawned.length < count && attempts < 420) {
    attempts += 1;
    const horizontal = nextRandom() > 0.45;
    const length = Math.min(count - spawned.length, randomInt(2, 4));
    const anchor = getRushObstacleAnchor(horizontal, length, snakeHead, columns, rows, randomInt);
    const cluster: Point[] = [];

    for (let index = 0; index < length; index += 1) {
      const point = horizontal
        ? { x: anchor.x + index, y: anchor.y }
        : { x: anchor.x, y: anchor.y + index };

      if (!isRushObstacleFree(point, {
        snakeHead,
        snakeBody,
        foods,
        existing: [...existing, ...spawned, ...cluster],
      })) {
        cluster.length = 0;
        break;
      }

      cluster.push(point);
    }

    if (cluster.length === 0) continue;
    spawned.push(...cluster);
  }

  return spawned;
}

export function clearRushLine(params: ClearRushLineParams): { cleared: Point[]; beamEnd: Point } {
  const { origin, direction, obstacles, columns, rows } = params;
  const vector = DIRECTIONS[direction];
  const cleared: Point[] = [];
  let cursor = { x: origin.x + vector.x, y: origin.y + vector.y };

  while (!isPointOutOfBounds(cursor, columns, rows)) {
    const hit = obstacles.find((obstacle) => samePoint(obstacle, cursor));
    if (hit) cleared.push(hit);
    cursor = { x: cursor.x + vector.x, y: cursor.y + vector.y };
  }

  return {
    cleared,
    beamEnd: cursor,
  };
}

function getRushObstacleAnchor(
  horizontal: boolean,
  length: number,
  snakeHead: Point,
  columns: number,
  rows: number,
  randomInt: (min: number, max: number) => number,
): Point {
  const aheadMin = Math.min(columns - 1, snakeHead.x + 2);
  const aheadMax = Math.min(columns - 1, snakeHead.x + 14);
  const biasedX = aheadMin <= aheadMax
    ? randomInt(aheadMin, aheadMax)
    : randomInt(0, columns - 1);

  return horizontal
    ? {
      x: Math.max(0, Math.min(columns - length, biasedX)),
      y: randomInt(1, rows - 2),
    }
    : {
      x: Math.max(0, Math.min(columns - 1, biasedX)),
      y: randomInt(1, Math.max(1, rows - length - 1)),
    };
}

function isRushObstacleFree(
  point: Point,
  params: {
    snakeHead: Point;
    snakeBody: Point[];
    foods: Point[];
    existing: Point[];
  },
): boolean {
  const { snakeHead, snakeBody, foods, existing } = params;
  if (existing.some((obstacle) => samePoint(obstacle, point))) return false;
  if (snakeBody.some((segment) => samePoint(segment, point))) return false;
  if (foods.some((food) => samePoint(food, point))) return false;

  const safeRadius = 2;
  if (Math.abs(point.x - snakeHead.x) <= safeRadius && Math.abs(point.y - snakeHead.y) <= safeRadius) return false;

  return true;
}

function isPointOutOfBounds(point: Point, columns: number, rows: number): boolean {
  return point.x < 0 || point.y < 0 || point.x >= columns || point.y >= rows;
}
