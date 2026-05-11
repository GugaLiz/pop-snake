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
  avoidDirection?: Direction;
  nextRandom: () => number;
  randomInt: (min: number, max: number) => number;
};

type GenerateRushWaveObstaclesParams = {
  core: Point;
  wave: number;
  columns: number;
  rows: number;
  snakeHead: Point;
  snakeBody: Point[];
  foods: Point[];
  avoidDirection?: Direction;
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
    avoidDirection,
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
        avoidDirection,
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
  const useLocalBand = randomInt(0, 99) < 78;
  const localXMin = Math.max(0, snakeHead.x - 14);
  const localXMax = Math.min(columns - 1, snakeHead.x + 14);
  const localYMin = Math.max(0, snakeHead.y - 9);
  const localYMax = Math.min(rows - 1, snakeHead.y + 9);
  const anchorX = useLocalBand && localXMin <= localXMax
    ? randomInt(localXMin, localXMax)
    : randomInt(0, columns - 1);
  const anchorY = useLocalBand && localYMin <= localYMax
    ? randomInt(localYMin, localYMax)
    : randomInt(1, rows - 2);

  return horizontal
    ? {
      x: Math.max(0, Math.min(columns - length, anchorX)),
      y: Math.max(1, Math.min(rows - 2, anchorY)),
    }
    : {
      x: Math.max(0, Math.min(columns - 1, anchorX)),
      y: Math.max(1, Math.min(Math.max(1, rows - length - 1), anchorY)),
    };
}

export function generateRushWaveObstacles(params: GenerateRushWaveObstaclesParams): Point[] {
  const pattern = params.wave % 5;
  const variant =
    pattern === 0
      ? generateGatePattern(params)
      : pattern === 1
        ? generateCrossPattern(params)
        : pattern === 2
          ? generateRingPattern(params)
          : pattern === 3
            ? generateDiagonalPattern(params)
            : generateTwinGatePattern(params);
  const base = [
    ...generateCoreFortressPattern(params),
    ...variant,
  ];

  const filtered = dedupePoints(base).filter((point) =>
    isRushObstacleFree(point, {
      snakeHead: params.snakeHead,
      snakeBody: params.snakeBody,
      foods: [...params.foods, params.core],
      existing: [],
      avoidDirection: params.avoidDirection,
    }),
  );

  return [
    ...filtered,
    ...generateRushObstacleClusters({
      count: 8,
      columns: params.columns,
      rows: params.rows,
      snakeHead: params.snakeHead,
      snakeBody: params.snakeBody,
      foods: [...params.foods, params.core],
      existing: filtered,
      avoidDirection: params.avoidDirection,
      nextRandom: params.nextRandom,
      randomInt: params.randomInt,
    }),
  ];
}

function generateGatePattern(params: GenerateRushWaveObstaclesParams): Point[] {
  const points: Point[] = [];
  const radius = 4;
  const gapSide = params.randomInt(0, 3);

  for (let x = params.core.x - radius; x <= params.core.x + radius; x += 1) {
    for (let y = params.core.y - radius; y <= params.core.y + radius; y += 1) {
      const onRing = x === params.core.x - radius || x === params.core.x + radius || y === params.core.y - radius || y === params.core.y + radius;
      if (!onRing) continue;
      const isGap =
        (gapSide === 0 && y === params.core.y - radius && Math.abs(x - params.core.x) <= 1)
        || (gapSide === 1 && x === params.core.x + radius && Math.abs(y - params.core.y) <= 1)
        || (gapSide === 2 && y === params.core.y + radius && Math.abs(x - params.core.x) <= 1)
        || (gapSide === 3 && x === params.core.x - radius && Math.abs(y - params.core.y) <= 1);
      if (!isGap) points.push({ x, y });
    }
  }

  return clampPoints(points, params.columns, params.rows);
}

function generateCoreFortressPattern(params: GenerateRushWaveObstaclesParams): Point[] {
  const points: Point[] = [];
  for (let x = params.core.x - 2; x <= params.core.x + 2; x += 1) {
    for (let y = params.core.y - 2; y <= params.core.y + 2; y += 1) {
      const onWall = x === params.core.x - 2 || x === params.core.x + 2 || y === params.core.y - 2 || y === params.core.y + 2;
      if (onWall) points.push({ x, y });
    }
  }
  return clampPoints(points, params.columns, params.rows);
}

function generateCrossPattern(params: GenerateRushWaveObstaclesParams): Point[] {
  const points: Point[] = [];
  for (let offset = -5; offset <= 5; offset += 1) {
    if (Math.abs(offset) <= 1) continue;
    points.push({ x: params.core.x + offset, y: params.core.y });
    points.push({ x: params.core.x, y: params.core.y + offset });
  }
  return clampPoints(points, params.columns, params.rows);
}

function generateRingPattern(params: GenerateRushWaveObstaclesParams): Point[] {
  const points: Point[] = [];
  for (let angleIndex = 0; angleIndex < 16; angleIndex += 1) {
    const angle = (Math.PI * 2 * angleIndex) / 16;
    points.push({
      x: Math.round(params.core.x + Math.cos(angle) * 4),
      y: Math.round(params.core.y + Math.sin(angle) * 3),
    });
  }
  return clampPoints(points, params.columns, params.rows);
}

function generateDiagonalPattern(params: GenerateRushWaveObstaclesParams): Point[] {
  const points: Point[] = [];
  for (let offset = -5; offset <= 5; offset += 1) {
    if (Math.abs(offset) <= 1) continue;
    points.push({ x: params.core.x + offset, y: params.core.y + offset });
    points.push({ x: params.core.x + offset, y: params.core.y - offset });
  }
  return clampPoints(points, params.columns, params.rows);
}

function generateTwinGatePattern(params: GenerateRushWaveObstaclesParams): Point[] {
  const points: Point[] = [];
  const gateOffset = params.randomInt(0, 1) === 0 ? -4 : 4;
  for (let y = params.core.y - 5; y <= params.core.y + 5; y += 1) {
    if (Math.abs(y - params.core.y) <= 1) continue;
    points.push({ x: params.core.x - 3, y });
    points.push({ x: params.core.x + 3, y });
  }
  for (let x = params.core.x - 6; x <= params.core.x + 6; x += 1) {
    if (Math.abs(x - params.core.x - gateOffset) <= 1) continue;
    points.push({ x, y: params.core.y - 3 });
    points.push({ x, y: params.core.y + 3 });
  }
  return clampPoints(points, params.columns, params.rows);
}

function clampPoints(points: Point[], columns: number, rows: number): Point[] {
  return points.filter((point) => !isPointOutOfBounds(point, columns, rows));
}

function dedupePoints(points: Point[]): Point[] {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isRushObstacleFree(
  point: Point,
  params: {
    snakeHead: Point;
    snakeBody: Point[];
    foods: Point[];
    existing: Point[];
    avoidDirection?: Direction;
  },
): boolean {
  const { snakeHead, snakeBody, foods, existing, avoidDirection } = params;
  if (existing.some((obstacle) => samePoint(obstacle, point))) return false;
  if (snakeBody.some((segment) => samePoint(segment, point))) return false;
  if (foods.some((food) => samePoint(food, point))) return false;

  const safeRadius = 4;
  if (Math.abs(point.x - snakeHead.x) <= safeRadius && Math.abs(point.y - snakeHead.y) <= safeRadius) return false;
  if (avoidDirection && isPointInForwardSafetyLane(point, snakeHead, avoidDirection)) return false;

  return true;
}

function isPointInForwardSafetyLane(point: Point, head: Point, direction: Direction): boolean {
  const laneLength = 10;
  const laneHalfWidth = 1;
  if (direction === 'right') {
    return point.x > head.x && point.x <= head.x + laneLength && Math.abs(point.y - head.y) <= laneHalfWidth;
  }
  if (direction === 'left') {
    return point.x < head.x && point.x >= head.x - laneLength && Math.abs(point.y - head.y) <= laneHalfWidth;
  }
  if (direction === 'down') {
    return point.y > head.y && point.y <= head.y + laneLength && Math.abs(point.x - head.x) <= laneHalfWidth;
  }
  return point.y < head.y && point.y >= head.y - laneLength && Math.abs(point.x - head.x) <= laneHalfWidth;
}

function isPointOutOfBounds(point: Point, columns: number, rows: number): boolean {
  return point.x < 0 || point.y < 0 || point.x >= columns || point.y >= rows;
}
