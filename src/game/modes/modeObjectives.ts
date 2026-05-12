import type { GameModeConfig } from '../../config/gameConfig';
import { V3_BALANCE } from '../../config/balance';
import type { PuzzleLevel } from '../puzzle/puzzleLevels';

export function hasReachedModeGoal(params: {
  mode: GameModeConfig;
  score: number;
  eliminated: number;
  foodsLeft: number;
  puzzleTargetsLeft?: number;
  dailyTargetScore?: number;
}): boolean {
  const { mode, score, eliminated } = params;

  if (mode.id === 'puzzle') return (params.puzzleTargetsLeft ?? params.foodsLeft) === 0;
  if (mode.id === 'rush') return Boolean(mode.targetScore && score >= mode.targetScore);
  if (mode.id === 'direction-color' || mode.id === 'timed-color') return Boolean(mode.targetScore && score >= mode.targetScore);
  if (mode.id === 'brawl') return Boolean(mode.targetScore && score >= mode.targetScore);
  if (mode.id === 'daily') return Boolean(params.dailyTargetScore && score >= params.dailyTargetScore);
  if (mode.id === 'standard') return Boolean(mode.targetScore && score >= mode.targetScore);
  if (mode.id === 'timed') {
    return Boolean(
      (mode.targetScore && score >= mode.targetScore)
      || (mode.targetEliminated && eliminated >= mode.targetEliminated),
    );
  }
  if (mode.id === 'steps') return Boolean(mode.targetEliminated && eliminated >= mode.targetEliminated);
  return false;
}

export function getModeObjectiveText(params: {
  mode: GameModeConfig;
  puzzleLevel?: PuzzleLevel;
  puzzleLevelIndex: number;
  puzzleLevelTotal: number;
  puzzleTargetsCleared: number;
  dailyTitle?: string;
  dailyTargetScore?: number;
}): string {
  const { mode } = params;

  if (mode.id === 'puzzle' && params.puzzleLevel) {
    return `第 ${params.puzzleLevelIndex + 1}/${params.puzzleLevelTotal} 关 · ${params.puzzleLevel.name} · ${params.puzzleTargetsCleared}/${params.puzzleLevel.targets.length}`;
  }
  if (mode.id === 'rush') return `目标：射击击穿核心围墙，45 秒内至少吃 ${V3_BALANCE.rush.requiredCores} 个核心并冲到 ${mode.targetScore ?? 1800} 分`;
  if (mode.id === 'direction-color') return `目标：75 秒内冲到 ${mode.targetScore ?? 1600} 分，蛇头只能吃同色食物`;
  if (mode.id === 'timed-color') return `目标：75 秒内冲到 ${mode.targetScore ?? 1600} 分，蛇头每 5 秒自动换色`;
  if (mode.id === 'brawl') return `目标：随机连续闯 5 个小关，完成冲刺、解谜、破阵和染色挑战`;
  if (mode.id === 'sprint') return '目标：90 秒内冲更高分，三消可以返时并解锁强化';
  if (mode.id === 'daily') return `今日挑战：${params.dailyTitle ?? '每日挑战'} · 达到 ${params.dailyTargetScore ?? 0} 分`;
  if (mode.id === 'standard') return `目标：达到 ${mode.targetScore} 分过关`;
  if (mode.id === 'endless') return '目标：穿墙循环，挑战更高分数';
  if (mode.id === 'timed') return `目标：${mode.timeLimitSeconds}s 内冲 ${mode.targetScore} 分或消除 ${mode.targetEliminated} 节`;
  if (mode.id === 'steps') return `目标：${mode.stepLimit} 步内消除 ${mode.targetEliminated} 节`;
  return `目标：${mode.stepLimit} 步结束时长度 = ${mode.targetLength}`;
}
