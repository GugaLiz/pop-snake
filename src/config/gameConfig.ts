export const GAME_CONFIG = {
  boardColumns: 34,
  boardRows: 24,
  initialLength: 3,
  targetFoodCount: 28,
  eliminateThreshold: 3,
  moveIntervalMs: 145,
  comboWindowMs: 2000,
  scorePerFood: 10,
  scorePerSegment: 50,
  comboBonusBase: 90,
  comboBonusGrowth: 2,
  cellGap: 4,
  specialSpawnChance: 0.1,
  slowDurationMs: 5000,
  bombRemoveCount: 3,
  sprintBaseSeconds: 90,
  sprintBonusSecondsPerEliminate: 2,
  upgradeTriggerEvery: 2,
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
export type GameModeId =
  | 'sprint'
  | 'daily'
  | 'standard'
  | 'endless'
  | 'timed'
  | 'steps'
  | 'precision'
  | 'puzzle'
  | 'rush'
  | 'direction-color'
  | 'timed-color'
  | 'brawl';

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
  sprint: {
    id: 'sprint',
    name: '蛇尾消消乐',
    description: '吃色块，凑蛇尾三连消除，90 秒内冲高分。',
    timeLimitSeconds: GAME_CONFIG.sprintBaseSeconds,
  },
  daily: {
    id: 'daily',
    name: '每日挑战',
    description: '每天一套固定规则和任务，试试今天能冲多高。',
    timeLimitSeconds: 75,
  },
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
  puzzle: {
    id: 'puzzle',
    name: '箭头解谜蛇',
    description: '方向匹配、读图规划、逐关推进。',
  },
  rush: {
    id: 'rush',
    name: '箭蛇破阵',
    description: '三消装颜色子弹，射穿同色围墙，吃核心续命。',
    timeLimitSeconds: 45,
    targetScore: 1800,
  },
  'direction-color': {
    id: 'direction-color',
    name: '同色匹配蛇',
    description: '蛇头按固定色序循环，只能吃同色食物。',
    timeLimitSeconds: 75,
    targetScore: 1600,
  },
  'timed-color': {
    id: 'timed-color',
    name: '5秒同色蛇',
    description: '蛇头每 5 秒自动换色，只能吃当前同色食物。',
    timeLimitSeconds: 75,
    targetScore: 1600,
  },
  brawl: {
    id: 'brawl',
    name: '大乱斗',
    description: '按递进顺序连续闯完整玩法小关，适合比赛展示。',
    timeLimitSeconds: 180,
    targetScore: 2200,
  },
};

export function getColorFill(color: SnakeColor): number {
  return GAME_COLORS.find((item) => item.id === color)?.fill ?? GAME_COLORS[0].fill;
}

export function getRandomBasicColor(): BasicSnakeColor {
  return BASIC_COLOR_IDS[Math.floor(Math.random() * BASIC_COLOR_IDS.length)];
}
