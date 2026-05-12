export type V4ChallengeKind = 'tail' | 'puzzle' | 'color';
export type V4ColorRule = 'direction' | 'timed';
export type V4ChallengeTrack = 'tail' | 'puzzle' | 'color';

export type V4ChallengeLevel = {
  kind: V4ChallengeKind;
  name: string;
  tip: string;
  target: number;
  timeLimitSeconds?: number;
  puzzleLevelIndex?: number;
  colorRule?: V4ColorRule;
  targetScore?: number;
};

export const V4_CHALLENGES: Record<V4ChallengeTrack, V4ChallengeLevel[]> = {
  tail: [
    { kind: 'tail', name: '尾巴入门', tip: '完成 2 次蛇尾三连消除', target: 2, timeLimitSeconds: 90 },
    { kind: 'tail', name: '颜色增加', tip: '完成 3 次蛇尾三连消除', target: 3, timeLimitSeconds: 85 },
    { kind: 'tail', name: '少量提示', tip: '完成 4 次蛇尾三连消除', target: 4, timeLimitSeconds: 80 },
    { kind: 'tail', name: '时间压力', tip: '完成 5 次蛇尾三连消除', target: 5, timeLimitSeconds: 75 },
    { kind: 'tail', name: '消消乐终局', tip: '完成 6 次蛇尾三连消除', target: 6, timeLimitSeconds: 70 },
  ],
  puzzle: [
    { kind: 'puzzle', name: '箭头入门', tip: '按方向吃掉 2 个目标', target: 2, puzzleLevelIndex: 0 },
    { kind: 'puzzle', name: '折返路线', tip: '按方向吃掉 2 个目标', target: 2, puzzleLevelIndex: 2 },
    { kind: 'puzzle', name: '补色辅助', tip: '按方向吃掉 3 个目标', target: 3, puzzleLevelIndex: 4 },
    { kind: 'puzzle', name: '绕墙观察', tip: '按方向吃掉 3 个目标', target: 3, puzzleLevelIndex: 6 },
    { kind: 'puzzle', name: '首章精选', tip: '按方向吃掉 4 个目标', target: 4, puzzleLevelIndex: 8 },
  ],
  color: [
    { kind: 'color', name: '转向认色', tip: '方向换色，吃 5 个同色食物', target: 5, colorRule: 'direction', timeLimitSeconds: 75 },
    { kind: 'color', name: '连续匹配', tip: '方向换色，吃 8 个同色食物', target: 8, colorRule: 'direction', timeLimitSeconds: 75 },
    { kind: 'color', name: '定时变色', tip: '5 秒变色，吃 8 个同色食物', target: 8, colorRule: 'timed', timeLimitSeconds: 75 },
    { kind: 'color', name: '抢色路线', tip: '5 秒变色，吃 12 个同色食物', target: 12, colorRule: 'timed', timeLimitSeconds: 70 },
    { kind: 'color', name: '同色终局', tip: '吃 12 个同色食物并达到 900 分', target: 12, colorRule: 'timed', timeLimitSeconds: 70, targetScore: 900 },
  ],
};

export function getV4ChallengeLevels(track: V4ChallengeTrack): V4ChallengeLevel[] {
  return V4_CHALLENGES[track];
}
