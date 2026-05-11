import {
  BASIC_COLOR_IDS,
  GAME_CONFIG,
  getRandomBasicColor,
  type BasicSnakeColor,
  type FoodType,
} from '../../config/gameConfig';
import { DIRECTIONS, samePoint, type Direction, type Food, type Segment } from '../types';

export function isCellFree(
  point: { x: number; y: number },
  snake: Segment[],
  foods: Food[],
): boolean {
  return !snake.some((segment) => samePoint(segment, point)) && !foods.some((food) => samePoint(food, point));
}

export function createFoodCandidate(params: {
  columns: number;
  rows: number;
  nextRandom: () => number;
  pickType: () => FoodType;
  pickColor: () => BasicSnakeColor;
}): Food {
  const { columns, rows, nextRandom, pickType, pickColor } = params;
  const type = pickType();

  return {
    x: Math.floor(nextRandom() * columns),
    y: Math.floor(nextRandom() * rows),
    type,
    color: type === 'rainbow' ? 'rainbow' : pickColor(),
  };
}

export function refillFoodsToTarget(params: {
  foods: Food[];
  targetCount: number;
  maxAttempts: number;
  createCandidate: () => Food;
  isCellFree: (point: { x: number; y: number }, foods: Food[]) => boolean;
}): Food[] {
  const { foods, targetCount, maxAttempts, createCandidate, isCellFree } = params;
  const nextFoods = [...foods];
  let guard = 0;

  while (nextFoods.length < targetCount && guard < maxAttempts) {
    guard += 1;
    const food = createCandidate();
    if (isCellFree(food, nextFoods)) nextFoods.push(food);
  }

  return nextFoods;
}

export function pickFoodType(params: {
  foods: Food[];
  eaten: number;
  nextRandom: () => number;
  specialSpawnBonus?: number;
  rainbowLuckBonus: number;
}): FoodType {
  const { foods, eaten, nextRandom, specialSpawnBonus, rainbowLuckBonus } = params;

  if (foods.some((food) => food.type !== 'normal')) return 'normal';

  const spawnChance = GAME_CONFIG.specialSpawnChance + (specialSpawnBonus ?? 0);
  if (eaten < 4 || nextRandom() > spawnChance) return 'normal';

  const rainbowWeight = Math.min(0.28, rainbowLuckBonus);
  const roll = nextRandom();
  if (roll < 0.34) return 'bomb';
  if (roll < 0.64 + rainbowWeight) return 'rainbow';
  return 'slow';
}

export function getTailTargetColor(
  snake: Segment[],
  nextRandom: () => number,
): BasicSnakeColor | undefined {
  const tail = snake.slice(-(GAME_CONFIG.eliminateThreshold - 1));
  if (tail.length < GAME_CONFIG.eliminateThreshold - 1) return undefined;

  const normalColors = tail
    .filter((segment) => segment.color !== 'rainbow')
    .map((segment) => segment.color as BasicSnakeColor);

  if (normalColors.length === 0) {
    return BASIC_COLOR_IDS[Math.floor(nextRandom() * BASIC_COLOR_IDS.length)];
  }

  return normalColors.every((color) => color === normalColors[0]) ? normalColors[0] : undefined;
}

export function getTailTargetWeight(params: {
  lastEliminateAt: number;
  timeNow: number;
  survivalSeconds: number;
  targetWeightBonus: number;
  isSprintLike: boolean;
}): number {
  const {
    lastEliminateAt,
    timeNow,
    survivalSeconds,
    targetWeightBonus,
    isSprintLike,
  } = params;

  const secondsSinceEliminate = lastEliminateAt
    ? (timeNow - lastEliminateAt) / 1000
    : survivalSeconds;
  const bonus = targetWeightBonus + (isSprintLike ? 0.08 : 0);

  if (secondsSinceEliminate > 18) return Math.min(0.9, 0.72 + bonus);
  if (secondsSinceEliminate > 10) return Math.min(0.86, 0.58 + bonus);
  return Math.min(0.8, 0.42 + bonus);
}

export function pickBalancedColor(
  foods: Food[],
  nextRandom: () => number,
): BasicSnakeColor {
  const counts = new Map<BasicSnakeColor, number>();

  foods.forEach((food) => {
    if (food.type === 'normal' && food.color !== 'rainbow') {
      counts.set(food.color as BasicSnakeColor, (counts.get(food.color as BasicSnakeColor) ?? 0) + 1);
    }
  });

  const min = Math.min(...BASIC_COLOR_IDS.map((color) => counts.get(color) ?? 0));
  const rare = BASIC_COLOR_IDS.filter((color) => (counts.get(color) ?? 0) === min);
  return rare[Math.floor(nextRandom() * rare.length)];
}

export function pickNextFoodColor(params: {
  snake: Segment[];
  foods: Food[];
  nextRandom: () => number;
  lastEliminateAt: number;
  timeNow: number;
  survivalSeconds: number;
  targetWeightBonus: number;
  isSprintLike: boolean;
}): BasicSnakeColor {
  const {
    snake,
    foods,
    nextRandom,
    lastEliminateAt,
    timeNow,
    survivalSeconds,
    targetWeightBonus,
    isSprintLike,
  } = params;

  const tailTarget = getTailTargetColor(snake, nextRandom);
  if (
    tailTarget &&
    nextRandom() <
      getTailTargetWeight({
        lastEliminateAt,
        timeNow,
        survivalSeconds,
        targetWeightBonus,
        isSprintLike,
      })
  ) {
    return tailTarget;
  }

  return pickBalancedColor(foods, nextRandom);
}

export function createRegeneratedTailColors(
  count: number,
  nextRandom: () => number,
): BasicSnakeColor[] {
  const shuffled = [...BASIC_COLOR_IDS].sort(() => nextRandom() - 0.5);
  while (shuffled.length < count) {
    shuffled.push(BASIC_COLOR_IDS[Math.floor(nextRandom() * BASIC_COLOR_IDS.length)]);
  }
  return shuffled.slice(0, count);
}

export function findTailSpawnPoint(params: {
  previous: Segment;
  direction: Direction;
  snake: Segment[];
  columns: number;
  rows: number;
}): { x: number; y: number } {
  const { previous, direction, snake, columns, rows } = params;
  const reverse = {
    x: -DIRECTIONS[direction].x,
    y: -DIRECTIONS[direction].y,
  };
  const preferred = {
    x: previous.x + reverse.x,
    y: previous.y + reverse.y,
  };

  if (canUseTailSpawnPoint(preferred, snake, columns, rows)) return preferred;

  const candidates = [
    { x: previous.x - 1, y: previous.y },
    { x: previous.x + 1, y: previous.y },
    { x: previous.x, y: previous.y - 1 },
    { x: previous.x, y: previous.y + 1 },
  ];

  return candidates.find((point) => canUseTailSpawnPoint(point, snake, columns, rows)) ?? previous;
}

export function regenerateTail(params: {
  snake: Segment[];
  direction: Direction;
  count: number;
  columns: number;
  rows: number;
  nextRandom: () => number;
}): Segment[] {
  const { snake, direction, count, columns, rows, nextRandom } = params;

  const head = snake[0] ?? {
    x: Math.floor(columns / 2),
    y: Math.floor(rows / 2),
    color: getRandomBasicColor(),
  };

  const nextSnake: Segment[] = [head];
  const colors = createRegeneratedTailColors(count, nextRandom);
  let previous = head;

  for (let index = 0; index < count; index += 1) {
    const nextPoint = findTailSpawnPoint({
      previous,
      direction,
      snake: nextSnake,
      columns,
      rows,
    });
    const segment = { ...nextPoint, color: colors[index] };
    nextSnake.push(segment);
    previous = segment;
  }

  return nextSnake;
}

function canUseTailSpawnPoint(
  point: { x: number; y: number },
  snake: Segment[],
  columns: number,
  rows: number,
): boolean {
  return (
    point.x >= 0 &&
    point.y >= 0 &&
    point.x < columns &&
    point.y < rows &&
    !snake.some((segment) => samePoint(segment, point))
  );
}
