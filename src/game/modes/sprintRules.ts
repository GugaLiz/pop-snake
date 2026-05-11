import { GAME_CONFIG, type GameModeId } from '../../config/gameConfig';
import { LEGACY_BALANCE, V3_BALANCE } from '../../config/balance';

export type EliminationScoreResult = {
  baseScore: number;
  comboBonus: number;
  gainedScore: number;
};

export type SprintTimeAwardResult = {
  seconds: number;
  comboTimeBonus: number;
};

export function isSprintLikeMode(modeId: GameModeId): boolean {
  return modeId === 'sprint' || modeId === 'daily';
}

export function getEliminationScore(params: {
  removedCount: number;
  combo: number;
  eliminateScoreMultiplier: number;
}): EliminationScoreResult {
  const baseScore = params.removedCount * LEGACY_BALANCE.scorePerSegment;
  const comboBonus = params.combo > 1
    ? LEGACY_BALANCE.comboBonusBase * (LEGACY_BALANCE.comboBonusGrowth ** (params.combo - 2))
    : 0;

  return {
    baseScore,
    comboBonus,
    gainedScore: Math.round((baseScore + comboBonus) * params.eliminateScoreMultiplier),
  };
}

export function getSprintTimeAward(params: {
  successfulEliminations: number;
  combo: number;
  extraSecondsPerEliminate: number;
}): SprintTimeAwardResult {
  const earlyRunBonus = params.successfulEliminations <= V3_BALANCE.sprint.earlyEliminateBonusCount
    ? V3_BALANCE.sprint.earlyEliminateBonusSeconds
    : 0;
  const comboTimeBonus = params.combo >= 4
    ? V3_BALANCE.sprint.combo4BonusSeconds
    : params.combo >= 2
      ? V3_BALANCE.sprint.combo2BonusSeconds
      : 0;

  return {
    seconds: GAME_CONFIG.sprintBonusSecondsPerEliminate
      + params.extraSecondsPerEliminate
      + earlyRunBonus
      + comboTimeBonus,
    comboTimeBonus,
  };
}

export function getComboRewardText(params: {
  combo: number;
  comboBonus: number;
  comboTimeBonus: number;
  modeId: GameModeId;
}): string | undefined {
  if (params.combo <= 1) return undefined;

  const rewardParts = [`连消奖励 +${Math.round(params.comboBonus)}分`];
  if (isSprintLikeMode(params.modeId) && params.comboTimeBonus > 0) {
    rewardParts.push(`额外 +${params.comboTimeBonus}s`);
  }

  return `Combo x${params.combo} · ${rewardParts.join(' · ')}`;
}

export function shouldOfferUpgrade(params: {
  modeId: GameModeId;
  successfulEliminations: number;
}): boolean {
  return isSprintLikeMode(params.modeId)
    && params.successfulEliminations % LEGACY_BALANCE.upgradeTriggerEvery === 0;
}

export function getModeSpeedBonus(params: {
  modeId: GameModeId;
  score: number;
  stepsUsed: number;
  stepLimit?: number;
  timeLimitSeconds?: number;
  survivalSeconds: number;
  availableSeconds: number;
}): number {
  if (isSprintLikeMode(params.modeId)) {
    const elapsed = params.timeLimitSeconds ? params.survivalSeconds / Math.max(1, params.availableSeconds) : 0;
    return elapsed > 0.78 ? 14 : elapsed > 0.52 ? 6 : 0;
  }
  if (params.modeId === 'standard') return Math.min(24, Math.floor(params.score / 500) * 8);
  if (params.modeId === 'endless') return Math.min(35, Math.floor(params.score / 900) * 7);
  if (params.modeId === 'timed') {
    const elapsed = params.timeLimitSeconds ? params.survivalSeconds / params.timeLimitSeconds : 0;
    return elapsed > 0.72 ? 18 : elapsed > 0.45 ? 10 : 0;
  }
  if (params.modeId === 'steps') {
    const usedRatio = params.stepLimit ? params.stepsUsed / params.stepLimit : 0;
    return usedRatio > 0.75 ? 12 : 0;
  }
  if (params.modeId === 'rush') {
    const elapsed = params.timeLimitSeconds ? params.survivalSeconds / params.timeLimitSeconds : 0;
    return elapsed > 0.68 ? 24 : elapsed > 0.38 ? 14 : 6;
  }
  return 0;
}
