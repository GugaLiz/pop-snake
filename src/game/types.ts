import type { FoodType, GameModeId, SnakeColor } from '../config/gameConfig';

export type Direction = 'up' | 'down' | 'left' | 'right';

export type Point = {
  x: number;
  y: number;
};

export type Arrow = Point & {
  direction: Direction;
};

export type Segment = Point & {
  color: SnakeColor;
};

export type Food = Point & {
  color: SnakeColor;
  type: FoodType;
};

export type GameSnapshot = {
  mode: GameModeId;
  objectiveText: string;
  score: number;
  length: number;
  combo: number;
  maxCombo: number;
  eliminated: number;
  eaten: number;
  stepsUsed: number;
  stepsLeft?: number;
  remainingSeconds?: number;
  survivalSeconds: number;
  bestScore: number;
  bestSurvivalSeconds: number;
  bestCombo: number;
  isDanger: boolean;
  isSlowed: boolean;
  arrowsCleared: number;
  skillCooldownRemainingMs: number;
  skillReady: boolean;
  objectiveCompleted: boolean;
  status: 'ready' | 'playing' | 'paused' | 'gameover';
};

export type GameResult = GameSnapshot & {
  finalLength: number;
};

export type GameEvent =
  | { type: 'start' }
  | { type: 'eat'; color: SnakeColor; foodType: FoodType }
  | { type: 'arrow-eat'; direction: Direction }
  | { type: 'eliminate'; count: number; combo: number }
  | { type: 'powerup'; foodType: Exclude<FoodType, 'normal'> }
  | { type: 'skill-fire'; hit: boolean }
  | { type: 'gameover'; objectiveCompleted: boolean };

export const DIRECTIONS: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function isOpposite(a: Direction, b: Direction): boolean {
  return (
    (a === 'up' && b === 'down') ||
    (a === 'down' && b === 'up') ||
    (a === 'left' && b === 'right') ||
    (a === 'right' && b === 'left')
  );
}

export function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}
