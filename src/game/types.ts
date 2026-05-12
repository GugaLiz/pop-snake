import type { FoodType, GameModeId, SnakeColor } from '../config/gameConfig';

export type Direction = 'up' | 'down' | 'left' | 'right';

export type Point = {
  x: number;
  y: number;
};

export type Segment = Point & {
  color: SnakeColor;
};

export type Food = Point & {
  color: SnakeColor;
  type: FoodType;
  requiredDirection?: Direction;
  isPuzzleTarget?: boolean;
};

export type MissionId =
  | 'score_300'
  | 'score_600'
  | 'combo_2'
  | 'combo_3'
  | 'eat_rainbow'
  | 'eat_bomb'
  | 'eliminate_6'
  | 'eliminate_9';

export type UpgradeId =
  | 'time_plus'
  | 'time_chain'
  | 'score_food'
  | 'score_eliminate'
  | 'target_helper'
  | 'rainbow_luck'
  | 'bomb_boost'
  | 'combo_window'
  | 'overdrive';

export type UpgradeRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export type MissionState = {
  id: MissionId;
  title: string;
  progress: number;
  target: number;
  completed: boolean;
  rewardText: string;
};

export type UpgradeChoice = {
  id: UpgradeId;
  title: string;
  rarity: UpgradeRarity;
  rarityLabel: string;
  effectText: string;
  description: string;
};

export type GameSnapshot = {
  mode: GameModeId;
  objectiveText: string;
  dailyChallengeText?: string;
  dailyChallengeKey?: string;
  dailyStickerName?: string;
  puzzleOptimalSteps?: number;
  puzzleStepDelta?: number;
  comboRewardText?: string;
  directionColorCurrentLabel?: string;
  directionColorNextLabel?: string;
  rushSkillReady?: boolean;
  rushSkillCooldownSeconds?: number;
  rushClearedObstacles?: number;
  rushSkillUses?: number;
  rushCoresCollected?: number;
  rushRequiredCores?: number;
  rushWave?: number;
  rushBestLineClear?: number;
  rushImbueLabel?: string;
  brawlStageLabel?: string;
  brawlStageIndex?: number;
  brawlStageCount?: number;
  brawlStageProgress?: number;
  brawlStageTarget?: number;
  brawlStageIntro?: boolean;
  brawlStageHint?: string;
  resumeCountdownSeconds?: number;
  resumeCountdownProgress?: number;
  upgradeCharge?: number;
  upgradeChargeTarget?: number;
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
  objectiveCompleted: boolean;
  missionStates: MissionState[];
  selectedUpgrades: UpgradeChoice[];
  upgradeChoices: UpgradeChoice[];
  status: 'ready' | 'playing' | 'paused' | 'upgrade' | 'resume' | 'gameover';
};

export type GameResult = GameSnapshot & {
  finalLength: number;
  unlockedStickerLabel?: string;
};

export type GameEvent =
  | { type: 'start' }
  | { type: 'eat'; color: SnakeColor; foodType: FoodType }
  | { type: 'eliminate'; count: number; combo: number }
  | { type: 'powerup'; foodType: Exclude<FoodType, 'normal'> }
  | { type: 'upgrade' }
  | { type: 'mission' }
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
