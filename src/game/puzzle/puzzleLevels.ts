import { GAME_CONFIG } from '../../config/gameConfig';
import type { Direction, Point } from '../types';

export type PuzzleTarget = Point & {
  direction: Direction;
};

export type PuzzleStart = Point & {
  direction: Direction;
};

export type PuzzleLevel = {
  id: string;
  name: string;
  tip: string;
  optimalSteps?: number;
  columns: number;
  rows: number;
  start: PuzzleStart;
  targets: PuzzleTarget[];
  walls: Point[];
};

type BasePuzzleLevel = Omit<PuzzleLevel, 'columns' | 'rows'> & {
  columns: number;
  rows: number;
};

const BASE_LEVELS: BasePuzzleLevel[] = [
  {
    id: 'puzzle-01',
    name: '先认方向',
    tip: '先学会按指定方向吃掉目标。',
    optimalSteps: 6,
    columns: 11,
    rows: 11,
    start: { x: 2, y: 9, direction: 'up' },
    targets: [{ x: 2, y: 6, direction: 'up' }],
    walls: [],
  },
  {
    id: 'puzzle-02',
    name: '外圈绕行',
    tip: '第二关开始就该读路线了，但先别把它做成拼手速。',
    optimalSteps: 37,
    columns: 11,
    rows: 11,
    start: { x: 2, y: 9, direction: 'right' },
    targets: [
      { x: 6, y: 9, direction: 'right' },
      { x: 8, y: 6, direction: 'up' },
      { x: 4, y: 4, direction: 'left' },
    ],
    walls: [
      ...vertical(3, 1, 8),
      ...vertical(7, 3, 9),
      ...horizontal(5, 3, 7),
    ],
  },
  {
    id: 'puzzle-03',
    name: '双门切换',
    tip: '你有自由空间，但顺序一错，后面角度就不对了。',
    optimalSteps: 46,
    columns: 11,
    rows: 11,
    start: { x: 1, y: 8, direction: 'right' },
    targets: [
      { x: 4, y: 8, direction: 'right' },
      { x: 8, y: 7, direction: 'down' },
      { x: 8, y: 3, direction: 'up' },
      { x: 3, y: 3, direction: 'left' },
    ],
    walls: [
      ...vertical(5, 1, 6),
      ...vertical(5, 8, 9),
      ...horizontal(6, 2, 5),
      ...horizontal(4, 5, 8),
    ],
  },
  {
    id: 'puzzle-04',
    name: '回字拐角',
    tip: '目标开始变多，但你仍然应该感到是在解路线，不是在卡时机。',
    optimalSteps: 58,
    columns: 11,
    rows: 11,
    start: { x: 1, y: 9, direction: 'right' },
    targets: [
      { x: 5, y: 9, direction: 'right' },
      { x: 8, y: 8, direction: 'down' },
      { x: 8, y: 4, direction: 'up' },
      { x: 5, y: 2, direction: 'left' },
      { x: 2, y: 4, direction: 'down' },
    ],
    walls: [
      ...vertical(3, 2, 7),
      ...vertical(7, 3, 8),
      ...horizontal(3, 3, 7),
      ...horizontal(7, 3, 6),
    ],
  },
  {
    id: 'puzzle-05',
    name: '长身压力',
    tip: '从这关开始，蛇身长度才真正参与解谜。',
    columns: 11,
    rows: 11,
    start: { x: 1, y: 9, direction: 'right' },
    targets: [
      { x: 4, y: 9, direction: 'right' },
      { x: 8, y: 9, direction: 'right' },
      { x: 8, y: 6, direction: 'up' },
      { x: 4, y: 6, direction: 'left' },
      { x: 2, y: 3, direction: 'up' },
      { x: 6, y: 3, direction: 'right' },
    ],
    walls: [
      ...vertical(5, 2, 5),
      ...vertical(5, 7, 9),
      ...horizontal(5, 5, 8),
      ...horizontal(7, 2, 5),
      ...vertical(8, 3, 5),
    ],
  },
  {
    id: 'puzzle-06',
    name: '三段回路',
    tip: '你会看到多块区域，但只有正确顺序能把它们串起来。',
    columns: 11,
    rows: 11,
    start: { x: 2, y: 9, direction: 'up' },
    targets: [
      { x: 2, y: 6, direction: 'up' },
      { x: 5, y: 6, direction: 'right' },
      { x: 8, y: 8, direction: 'down' },
      { x: 8, y: 4, direction: 'up' },
      { x: 5, y: 2, direction: 'left' },
      { x: 2, y: 2, direction: 'left' },
    ],
    walls: [
      ...vertical(4, 1, 8),
      ...vertical(7, 3, 9),
      ...horizontal(5, 1, 4),
      ...horizontal(7, 4, 7),
    ],
  },
  {
    id: 'puzzle-07',
    name: '交错通道',
    tip: '这关开始，近路会变成陷阱，远一点反而是正解。',
    columns: 11,
    rows: 11,
    start: { x: 1, y: 8, direction: 'right' },
    targets: [
      { x: 4, y: 8, direction: 'right' },
      { x: 8, y: 8, direction: 'right' },
      { x: 8, y: 5, direction: 'up' },
      { x: 5, y: 5, direction: 'left' },
      { x: 5, y: 2, direction: 'up' },
      { x: 2, y: 2, direction: 'left' },
      { x: 2, y: 5, direction: 'down' },
    ],
    walls: [
      ...vertical(3, 1, 6),
      ...vertical(6, 4, 9),
      ...horizontal(4, 3, 8),
      ...horizontal(7, 1, 5),
      ...vertical(8, 2, 4),
    ],
  },
  {
    id: 'puzzle-08',
    name: '折返环',
    tip: '路线已经比较长了，但应该难在读图，不该难在细碎微操。',
    columns: 11,
    rows: 11,
    start: { x: 1, y: 9, direction: 'right' },
    targets: [
      { x: 4, y: 9, direction: 'right' },
      { x: 7, y: 9, direction: 'right' },
      { x: 9, y: 7, direction: 'up' },
      { x: 7, y: 5, direction: 'left' },
      { x: 9, y: 3, direction: 'up' },
      { x: 5, y: 1, direction: 'left' },
      { x: 2, y: 3, direction: 'down' },
    ],
    walls: [
      ...vertical(3, 2, 8),
      ...vertical(6, 1, 6),
      ...vertical(8, 4, 9),
      ...horizontal(4, 3, 7),
      ...horizontal(7, 1, 5),
    ],
  },
  {
    id: 'puzzle-09',
    name: '路线锁',
    tip: '到这里才开始明显收紧，前面的宽松感会慢慢消失。',
    columns: 11,
    rows: 11,
    start: { x: 1, y: 9, direction: 'right' },
    targets: [
      { x: 3, y: 9, direction: 'right' },
      { x: 6, y: 9, direction: 'right' },
      { x: 8, y: 7, direction: 'up' },
      { x: 8, y: 4, direction: 'up' },
      { x: 5, y: 4, direction: 'left' },
      { x: 5, y: 1, direction: 'up' },
      { x: 2, y: 1, direction: 'left' },
      { x: 2, y: 4, direction: 'down' },
    ],
    walls: [
      ...vertical(4, 2, 9),
      ...vertical(7, 1, 7),
      ...horizontal(3, 4, 8),
      ...horizontal(6, 1, 6),
      ...vertical(2, 5, 8),
    ],
  },
  {
    id: 'puzzle-10',
    name: '首章终点',
    tip: '首章终关要有路线感、顺序感和身体压力，但仍然不该靠拼手速。',
    columns: 11,
    rows: 11,
    start: { x: 1, y: 9, direction: 'right' },
    targets: [
      { x: 4, y: 9, direction: 'right' },
      { x: 8, y: 9, direction: 'right' },
      { x: 8, y: 6, direction: 'up' },
      { x: 5, y: 6, direction: 'left' },
      { x: 5, y: 3, direction: 'up' },
      { x: 8, y: 3, direction: 'right' },
      { x: 8, y: 1, direction: 'up' },
      { x: 2, y: 1, direction: 'left' },
      { x: 2, y: 5, direction: 'down' },
    ],
    walls: [
      ...vertical(3, 2, 8),
      ...vertical(6, 2, 9),
      ...vertical(9, 2, 7),
      ...horizontal(4, 3, 6),
      ...horizontal(7, 1, 5),
      ...horizontal(2, 6, 8),
    ],
  },
];

export const PUZZLE_LEVELS: PuzzleLevel[] = BASE_LEVELS.map((level) => stretchPuzzleLevel(level));

export function getPuzzleLevel(levelId: string): PuzzleLevel | undefined {
  return PUZZLE_LEVELS.find((level) => level.id === levelId);
}

function stretchPuzzleLevel(level: BasePuzzleLevel): PuzzleLevel {
  const marginX = 2;
  const marginY = 2;
  const scaleX = (GAME_CONFIG.boardColumns - marginX * 2 - 1) / Math.max(1, level.columns - 1);
  const scaleY = (GAME_CONFIG.boardRows - marginY * 2 - 1) / Math.max(1, level.rows - 1);
  const mapPoint = (point: Point) => ({
    x: marginX + Math.round(point.x * scaleX),
    y: marginY + Math.round(point.y * scaleY),
  });

  return {
    ...level,
    columns: GAME_CONFIG.boardColumns,
    rows: GAME_CONFIG.boardRows,
    start: { ...level.start, ...mapPoint(level.start) },
    targets: level.targets.map((target) => ({ ...target, ...mapPoint(target) })),
    walls: dedupePoints(level.walls.map((wall) => mapPoint(wall))),
  };
}

function dedupePoints(points: Point[]): Point[] {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function horizontal(y: number, x1: number, x2: number): Point[] {
  const points: Point[] = [];
  for (let x = x1; x <= x2; x += 1) points.push({ x, y });
  return points;
}

function vertical(x: number, y1: number, y2: number): Point[] {
  const points: Point[] = [];
  for (let y = y1; y <= y2; y += 1) points.push({ x, y });
  return points;
}
