import type { GameResult } from '../game/types';

const BEST_SCORE_KEY = 'pop_snake_best_score';
const BEST_SURVIVAL_KEY = 'pop_snake_best_survival_seconds';
const BEST_COMBO_KEY = 'pop_snake_best_combo';
const SETTINGS_KEY = 'pop_snake_settings';
const TUTORIAL_COMPLETED_KEY = 'pop_snake_tutorial_completed';
const DAILY_CHALLENGE_PREFIX = 'pop_snake_daily_challenge_';
const STICKER_COLLECTION_KEY = 'pop_snake_sticker_collection';

export type PlayerSettings = {
  sfxEnabled: boolean;
  screenShakeEnabled: boolean;
  virtualPadEnabled: boolean;
};

export type DailyChallengeStatus = {
  completed: boolean;
  bestScore: number;
};

export type StickerId = 'balance_day' | 'rainbow_day' | 'bomb_day' | 'combo_day';

export type StickerDefinition = {
  id: StickerId;
  name: string;
  shortLabel: string;
};

const STICKER_DEFINITIONS: StickerDefinition[] = [
  { id: 'balance_day', name: '补色日贴纸', shortLabel: '补色' },
  { id: 'rainbow_day', name: '彩虹日贴纸', shortLabel: '彩虹' },
  { id: 'bomb_day', name: '炸弹日贴纸', shortLabel: '炸弹' },
  { id: 'combo_day', name: '热手日贴纸', shortLabel: '热手' },
];

const defaultSettings: PlayerSettings = {
  sfxEnabled: true,
  screenShakeEnabled: true,
  virtualPadEnabled: true,
};

function normalizeSettings(input: unknown): PlayerSettings {
  const parsed = (input && typeof input === 'object') ? input as Partial<PlayerSettings> : {};
  return {
    sfxEnabled: typeof parsed.sfxEnabled === 'boolean' ? parsed.sfxEnabled : defaultSettings.sfxEnabled,
    screenShakeEnabled: typeof parsed.screenShakeEnabled === 'boolean' ? parsed.screenShakeEnabled : defaultSettings.screenShakeEnabled,
    virtualPadEnabled: typeof parsed.virtualPadEnabled === 'boolean' ? parsed.virtualPadEnabled : defaultSettings.virtualPadEnabled,
  };
}

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
  if (!raw) {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(defaultSettings));
    return defaultSettings;
  }

  try {
    const normalized = normalizeSettings(JSON.parse(raw));
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(defaultSettings));
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

export function getDailyChallengeStatus(challengeKey: string): DailyChallengeStatus {
  const raw = window.localStorage.getItem(`${DAILY_CHALLENGE_PREFIX}${challengeKey}`);
  if (!raw) return { completed: false, bestScore: 0 };

  try {
    const parsed = JSON.parse(raw) as Partial<DailyChallengeStatus>;
    return {
      completed: parsed.completed === true,
      bestScore: typeof parsed.bestScore === 'number' ? parsed.bestScore : 0,
    };
  } catch {
    return { completed: false, bestScore: 0 };
  }
}

export function saveDailyChallengeStatus(challengeKey: string, score: number, completed: boolean): DailyChallengeStatus {
  const previous = getDailyChallengeStatus(challengeKey);
  const next = {
    completed: previous.completed || completed,
    bestScore: Math.max(previous.bestScore, score),
  };
  window.localStorage.setItem(`${DAILY_CHALLENGE_PREFIX}${challengeKey}`, JSON.stringify(next));
  return next;
}

export function getStickerDefinitions(): StickerDefinition[] {
  return STICKER_DEFINITIONS;
}

export function getStickerCollection(): StickerId[] {
  const raw = window.localStorage.getItem(STICKER_COLLECTION_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is StickerId => STICKER_DEFINITIONS.some((definition) => definition.id === item));
  } catch {
    return [];
  }
}

export function unlockSticker(stickerId: StickerId): { newlyUnlocked: boolean; collection: StickerId[] } {
  const current = getStickerCollection();
  if (current.includes(stickerId)) {
    return { newlyUnlocked: false, collection: current };
  }

  const next = [...current, stickerId];
  window.localStorage.setItem(STICKER_COLLECTION_KEY, JSON.stringify(next));
  return { newlyUnlocked: true, collection: next };
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
