import type { GameResult } from '../game/types';

const BEST_SCORE_KEY = 'pop_snake_best_score';
const BEST_SURVIVAL_KEY = 'pop_snake_best_survival_seconds';
const BEST_COMBO_KEY = 'pop_snake_best_combo';
const SETTINGS_KEY = 'pop_snake_settings';
const TUTORIAL_COMPLETED_KEY = 'pop_snake_tutorial_completed';

export type PlayerSettings = {
  sfxEnabled: boolean;
  screenShakeEnabled: boolean;
  virtualPadEnabled: boolean;
};

const defaultSettings: PlayerSettings = {
  sfxEnabled: true,
  screenShakeEnabled: true,
  virtualPadEnabled: true,
};

function readNumber(key: string): number {
  const value = window.localStorage.getItem(key);
  return value ? Number(value) || 0 : 0;
}

export function getBestScore(): number {
  return readNumber(BEST_SCORE_KEY);
}

export function getBestSurvivalSeconds(): number {
  return readNumber(BEST_SURVIVAL_KEY);
}

export function getBestCombo(): number {
  return readNumber(BEST_COMBO_KEY);
}

export function getSettings(): PlayerSettings {
  const raw = window.localStorage.getItem(SETTINGS_KEY);
  if (!raw) return defaultSettings;

  try {
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: PlayerSettings): void {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function hasTutorialCompleted(): boolean {
  return window.localStorage.getItem(TUTORIAL_COMPLETED_KEY) === 'true';
}

export function markTutorialCompleted(): void {
  window.localStorage.setItem(TUTORIAL_COMPLETED_KEY, 'true');
}

export function saveResult(result: GameResult): number {
  const bestScore = Math.max(getBestScore(), result.score);
  const bestSurvival = Math.max(readNumber(BEST_SURVIVAL_KEY), result.survivalSeconds);
  const bestCombo = Math.max(readNumber(BEST_COMBO_KEY), result.maxCombo);

  window.localStorage.setItem(BEST_SCORE_KEY, String(bestScore));
  window.localStorage.setItem(BEST_SURVIVAL_KEY, String(bestSurvival));
  window.localStorage.setItem(BEST_COMBO_KEY, String(bestCombo));

  return bestScore;
}
