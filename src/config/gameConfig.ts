export const GAME_CONFIG = {
  boardSize: 16,
  initialLength: 3,
  targetFoodCount: 24,
  eliminateThreshold: 3,
  moveIntervalMs: 165,
  comboWindowMs: 2000,
  scorePerFood: 10,
  scorePerSegment: 50,
  comboBonusBase: 5,
  comboBonusGrowth: 2,
  cellGap: 4,
  specialSpawnChance: 0.1,
  slowDurationMs: 5000,
  bombRemoveCount: 3,
} as const;

export const GAME_COLORS = [
  { id: 'sun', fill: 0xffc83d, css: '#ffc83d' },
  { id: 'leaf', fill: 0x83d64f, css: '#83d64f' },
  { id: 'mint', fill: 0x35d1b2, css: '#35d1b2' },
  { id: 'berry', fill: 0xff6f91, css: '#ff6f91' },
  { id: 'rainbow', fill: 0xffffff, css: '#ffffff' },
] as const;

export const BASIC_COLOR_IDS = ['sun', 'leaf', 'mint', 'berry'] as const;

export type SnakeColor = (typeof GAME_COLORS)[number]['id'];
export type BasicSnakeColor = (typeof BASIC_COLOR_IDS)[number];
export type FoodType = 'normal' | 'bomb' | 'rainbow' | 'slow';
export type GameModeId = 'standard' | 'endless' | 'timed' | 'steps' | 'precision';

export type GameModeConfig = {
  id: GameModeId;
  name: string;
  description: string;
  targetScore?: number;
  targetEliminated?: number;
  timeLimitSeconds?: number;
  stepLimit?: number;
  targetLength?: number;
};

export const GAME_MODES: Record<GameModeId, GameModeConfig> = {
  standard: {
    id: 'standard',
    name: '标准模式',
    description: '有边界限制，达到目标分数即可过关。',
    targetScore: 1500,
  },
  endless: {
    id: 'endless',
    name: '无尽模式',
    description: '无边界限制，穿墙循环，只在撞到身体时结束。',
  },
  timed: {
    id: 'timed',
    name: '限时模式',
    description: '60 秒内达到目标分数或消除数。',
    timeLimitSeconds: 60,
    targetScore: 1200,
    targetEliminated: 18,
  },
  steps: {
    id: 'steps',
    name: '限步模式',
    description: '80 步内完成指定消除数。',
    stepLimit: 80,
    targetEliminated: 15,
  },
  precision: {
    id: 'precision',
    name: '精准模式',
    description: '80 步结束时蛇长刚好达到目标值。',
    stepLimit: 80,
    targetLength: 9,
  },
};

export function getColorFill(color: SnakeColor): number {
  return GAME_COLORS.find((item) => item.id === color)?.fill ?? GAME_COLORS[0].fill;
}

export function getRandomBasicColor(): BasicSnakeColor {
  return BASIC_COLOR_IDS[Math.floor(Math.random() * BASIC_COLOR_IDS.length)];
}
