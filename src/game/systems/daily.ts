import type { StickerId } from '../../storage/localStorage';
import type { UpgradeModifierState } from './upgrades';

export type DailyChallengeConfig = {
  key: string;
  title: string;
  description: string;
  timeLimitSeconds: number;
  targetScore: number;
  stickerId: StickerId;
  stickerName: string;
  modifiers: Partial<UpgradeModifierState>;
  missionOffset: number;
  specialSpawnBonus: number;
};

export function getDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createDailyChallenge(
  key: string,
  hashSeed: (source: string) => number,
): DailyChallengeConfig {
  const seed = hashSeed(`daily-${key}`);
  const variant = seed % 6;

  if (variant === 0) {
    return {
      key,
      title: '补色日',
      description: '更容易刷出尾巴需要的颜色，适合稳定冲分。',
      timeLimitSeconds: 75,
      targetScore: 1800,
      stickerId: 'balance_day',
      stickerName: '补色日贴纸',
      modifiers: { targetWeightBonus: 0.18 },
      missionOffset: 0,
      specialSpawnBonus: 0,
    };
  }

  if (variant === 1) {
    return {
      key,
      title: '彩虹日',
      description: '彩虹块更容易出现，适合做长连消。',
      timeLimitSeconds: 75,
      targetScore: 1700,
      stickerId: 'rainbow_day',
      stickerName: '彩虹日贴纸',
      modifiers: { rainbowLuckBonus: 0.18 },
      missionOffset: 2,
      specialSpawnBonus: 0.02,
    };
  }

  if (variant === 2) {
    return {
      key,
      title: '炸弹日',
      description: '炸弹块更常见，尾巴压力更低，但目标分更高。',
      timeLimitSeconds: 75,
      targetScore: 1850,
      stickerId: 'bomb_day',
      stickerName: '炸弹日贴纸',
      modifiers: { bombExtraRemove: 1 },
      missionOffset: 4,
      specialSpawnBonus: 0.04,
    };
  }

  if (variant === 3) {
    return {
      key,
      title: '热手日',
      description: 'Combo 窗口更长，连消返时更强。',
      timeLimitSeconds: 78,
      targetScore: 1750,
      stickerId: 'combo_day',
      stickerName: '热手日贴纸',
      modifiers: { comboWindowBonusMs: 900, extraSecondsPerEliminate: 1 },
      missionOffset: 6,
      specialSpawnBonus: 0,
    };
  }

  if (variant === 4) {
    return {
      key,
      title: '双倍日',
      description: '三消得分翻倍，适合追求一次漂亮爆分。',
      timeLimitSeconds: 72,
      targetScore: 2100,
      stickerId: 'double_day',
      stickerName: '双倍日贴纸',
      modifiers: { eliminateScoreMultiplier: 2 },
      missionOffset: 1,
      specialSpawnBonus: 0.01,
    };
  }

  return {
    key,
    title: '低容错日',
    description: '时间更短、目标更紧，靠稳定三消把节奏续住。',
    timeLimitSeconds: 62,
    targetScore: 1550,
    stickerId: 'pressure_day',
    stickerName: '低容错日贴纸',
    modifiers: { extraSecondsPerEliminate: 2, targetWeightBonus: 0.08 },
    missionOffset: 3,
    specialSpawnBonus: -0.01,
  };
}
