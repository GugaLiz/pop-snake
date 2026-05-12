import { GAME_CONFIG } from './gameConfig';

export const V3_BALANCE = {
  sprint: {
    earlyEliminateBonusCount: 2,
    earlyEliminateBonusSeconds: 1,
    combo2BonusSeconds: 2,
    combo4BonusSeconds: 3,
  },
  combo: {
    bannerDurationMs: 1800,
  },
  rush: {
    foodCount: 16,
    initialObstacleCount: 30,
    refillObstacleCount: 30,
    postSkillObstacleCount: 26,
    skillCooldownMs: 2600,
    obstacleScore: 30,
    coreScore: 450,
    coreBonusSeconds: 30,
    requiredCores: 0,
    offColorHitsToBreak: 3,
    waveObstacleCount: 30,
    waveRandomObstacleCount: 10,
    minimumMoveIntervalMs: 122,
  },
  brawl: {
    stageCount: 5,
    sprintEatTarget: 5,
    colorEatTarget: 4,
    puzzleTargetCount: 2,
    rushRequiredCores: 1,
    stageScore: 350,
  },
  movement: {
    minimumMoveIntervalMs: 135,
  },
  daily: {
    requiredRuleCount: 6,
  },
} as const;

export const LEGACY_BALANCE = {
  comboWindowMs: GAME_CONFIG.comboWindowMs,
  scorePerFood: GAME_CONFIG.scorePerFood,
  scorePerSegment: GAME_CONFIG.scorePerSegment,
  comboBonusBase: GAME_CONFIG.comboBonusBase,
  comboBonusGrowth: GAME_CONFIG.comboBonusGrowth,
  sprintBonusSecondsPerEliminate: GAME_CONFIG.sprintBonusSecondsPerEliminate,
  upgradeTriggerEvery: GAME_CONFIG.upgradeTriggerEvery,
} as const;
