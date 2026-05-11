import type { FoodType } from '../../config/gameConfig';
import type { MissionId, MissionState } from '../types';

export type MissionReward = { score?: number; seconds?: number };

export type MissionDefinition = {
  id: MissionId;
  title: string;
  target: number;
  rewardText: string;
  reward: MissionReward;
};

export const MISSION_POOL: MissionDefinition[] = [
  { id: 'score_300', title: '拿到 300 分', target: 300, rewardText: '+120 分', reward: { score: 120 } },
  { id: 'score_600', title: '拿到 600 分', target: 600, rewardText: '+6 秒', reward: { seconds: 6 } },
  { id: 'combo_2', title: '打出 2 Combo', target: 1, rewardText: '+8 秒', reward: { seconds: 8 } },
  { id: 'combo_3', title: '打出 3 Combo', target: 1, rewardText: '+220 分', reward: { score: 220 } },
  { id: 'eat_rainbow', title: '吃到 1 个彩虹块', target: 1, rewardText: '+150 分', reward: { score: 150 } },
  { id: 'eat_bomb', title: '吃到 1 个炸弹块', target: 1, rewardText: '+5 秒', reward: { seconds: 5 } },
  { id: 'eliminate_6', title: '累计消除 6 节', target: 6, rewardText: '+180 分', reward: { score: 180 } },
  { id: 'eliminate_9', title: '累计消除 9 节', target: 9, rewardText: '+7 秒', reward: { seconds: 7 } },
];

export function createMissionStates(
  nextRandom: () => number,
  missionOffset?: number,
): MissionState[] {
  const offset = missionOffset ?? Math.floor(nextRandom() * MISSION_POOL.length);
  const pool = Array.from({ length: 2 }, (_, index) => MISSION_POOL[(offset + index) % MISSION_POOL.length]);
  return pool.map((mission) => ({
    id: mission.id,
    title: mission.title,
    progress: 0,
    target: mission.target,
    completed: false,
    rewardText: mission.rewardText,
  }));
}

export function getMissionDefinition(id: MissionId): MissionDefinition | undefined {
  return MISSION_POOL.find((item) => item.id === id);
}

export function getMissionProgress(
  id: MissionId,
  previous: number,
  state: { score: number; maxCombo: number; eliminated: number },
  event: { foodType?: FoodType; elimination?: boolean },
): number {
  if (id === 'score_300') return Math.min(300, state.score);
  if (id === 'score_600') return Math.min(600, state.score);
  if (id === 'combo_2') return state.maxCombo >= 2 ? 1 : previous;
  if (id === 'combo_3') return state.maxCombo >= 3 ? 1 : previous;
  if (id === 'eat_rainbow') return event.foodType === 'rainbow' ? 1 : previous;
  if (id === 'eat_bomb') return event.foodType === 'bomb' ? 1 : previous;
  if (id === 'eliminate_6') return Math.min(6, state.eliminated);
  return Math.min(9, state.eliminated);
}
