import type { BasicSnakeColor, GameModeId } from '../../config/gameConfig';

export const DIRECTION_COLOR_CYCLE: BasicSnakeColor[] = ['berry', 'mint', 'sun', 'leaf'];

export const DIRECTION_COLOR_LABELS: Record<BasicSnakeColor, string> = {
  sun: '黄',
  leaf: '绿',
  mint: '青',
  berry: '粉',
};

export function isDirectionColorMode(modeId: GameModeId): boolean {
  return modeId === 'direction-color';
}

export function getDirectionCycleColorByTurn(turnIndex: number): BasicSnakeColor {
  const index = ((turnIndex % DIRECTION_COLOR_CYCLE.length) + DIRECTION_COLOR_CYCLE.length) % DIRECTION_COLOR_CYCLE.length;
  return DIRECTION_COLOR_CYCLE[index];
}

export function getDirectionColorLabel(color: BasicSnakeColor): string {
  return DIRECTION_COLOR_LABELS[color];
}

export function getDirectionCycleLabels(turnIndex: number): { current: string; next: string } {
  return {
    current: getDirectionColorLabel(getDirectionCycleColorByTurn(turnIndex)),
    next: getDirectionColorLabel(getDirectionCycleColorByTurn(turnIndex + 1)),
  };
}

export function getDirectionColorGuideText(): string {
  return '粉 -> 青 -> 黄 -> 绿';
}
