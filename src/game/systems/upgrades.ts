import type { UpgradeChoice, UpgradeId, UpgradeRarity } from '../types';

export type UpgradeModifierState = {
  foodScoreBonus: number;
  eliminateScoreMultiplier: number;
  targetWeightBonus: number;
  rainbowLuckBonus: number;
  bombExtraRemove: number;
  comboWindowBonusMs: number;
  extraSecondsPerEliminate: number;
};

export const UPGRADE_POOL: UpgradeChoice[] = [
  {
    id: 'time_plus',
    title: '补时糖',
    rarity: 'common',
    rarityLabel: '普通',
    effectText: '+8 秒',
    description: '立刻获得额外时间，适合救场。',
  },
  {
    id: 'score_food',
    title: '贪吃加薪',
    rarity: 'common',
    rarityLabel: '普通',
    effectText: '吃块 +6 分',
    description: '之后每吃 1 块都会额外得分。',
  },
  {
    id: 'time_chain',
    title: '连消充能',
    rarity: 'rare',
    rarityLabel: '稀有',
    effectText: '每次三消 +1 秒',
    description: '连消越多，续航越稳。',
  },
  {
    id: 'target_helper',
    title: '补色导航',
    rarity: 'rare',
    rarityLabel: '稀有',
    effectText: '目标色更常见',
    description: '更容易刷出尾巴当前需要的颜色。',
  },
  {
    id: 'score_eliminate',
    title: '爆分尾巴',
    rarity: 'epic',
    rarityLabel: '史诗',
    effectText: '三消得分 +35%',
    description: '更适合冲分和挑战高目标。',
  },
  {
    id: 'rainbow_luck',
    title: '彩虹偏爱',
    rarity: 'epic',
    rarityLabel: '史诗',
    effectText: '彩虹块更常出现',
    description: '更容易拼出关键三消。',
  },
  {
    id: 'bomb_boost',
    title: '重装炸弹',
    rarity: 'legendary',
    rarityLabel: '传说',
    effectText: '炸弹额外多清 1 节',
    description: '压力大时更容易清掉尾巴。',
  },
  {
    id: 'combo_window',
    title: '热手延长',
    rarity: 'legendary',
    rarityLabel: '传说',
    effectText: 'Combo 窗口 +0.8 秒',
    description: '更容易接出高 Combo。',
  },
  {
    id: 'overdrive',
    title: '赤红超载',
    rarity: 'mythic',
    rarityLabel: '神话',
    effectText: '立刻 +12 秒，且三消再 +1 秒',
    description: '高稀有爆发强化，拿到后节奏会明显起飞。',
  },
];

export function createDefaultModifiers(): UpgradeModifierState {
  return {
    foodScoreBonus: 0,
    eliminateScoreMultiplier: 1,
    targetWeightBonus: 0,
    rainbowLuckBonus: 0,
    bombExtraRemove: 0,
    comboWindowBonusMs: 0,
    extraSecondsPerEliminate: 0,
  };
}

export function pickUpgradeChoices(
  count: number,
  nextRandom: () => number,
): UpgradeChoice[] {
  const pool = [...UPGRADE_POOL];
  const picks: UpgradeChoice[] = [];

  while (pool.length > 0 && picks.length < count) {
    const totalWeight = pool.reduce((sum, choice) => sum + getUpgradeWeight(choice.rarity), 0);
    let roll = nextRandom() * totalWeight;
    let pickedIndex = 0;

    for (let index = 0; index < pool.length; index += 1) {
      roll -= getUpgradeWeight(pool[index].rarity);
      if (roll <= 0) {
        pickedIndex = index;
        break;
      }
    }

    picks.push(pool[pickedIndex]);
    pool.splice(pickedIndex, 1);
  }

  return picks.sort((a, b) => getUpgradeOrder(b.rarity) - getUpgradeOrder(a.rarity));
}

export function applyUpgradeEffect(
  id: UpgradeId,
  modifiers: UpgradeModifierState,
  addSprintTime: (seconds: number, label: string) => void,
): void {
  if (id === 'time_plus') {
    addSprintTime(8, '+8s');
    return;
  }
  if (id === 'overdrive') {
    addSprintTime(12, '+12s');
    modifiers.extraSecondsPerEliminate += 1;
    return;
  }
  if (id === 'time_chain') modifiers.extraSecondsPerEliminate += 1;
  if (id === 'score_food') modifiers.foodScoreBonus += 6;
  if (id === 'score_eliminate') modifiers.eliminateScoreMultiplier += 0.35;
  if (id === 'target_helper') modifiers.targetWeightBonus += 0.16;
  if (id === 'rainbow_luck') modifiers.rainbowLuckBonus += 0.14;
  if (id === 'bomb_boost') modifiers.bombExtraRemove += 1;
  if (id === 'combo_window') modifiers.comboWindowBonusMs += 800;
}

function getUpgradeWeight(rarity: UpgradeRarity): number {
  if (rarity === 'common') return 32;
  if (rarity === 'rare') return 22;
  if (rarity === 'epic') return 14;
  if (rarity === 'legendary') return 7;
  return 2;
}

function getUpgradeOrder(rarity: UpgradeRarity): number {
  if (rarity === 'common') return 1;
  if (rarity === 'rare') return 2;
  if (rarity === 'epic') return 3;
  if (rarity === 'legendary') return 4;
  return 5;
}
