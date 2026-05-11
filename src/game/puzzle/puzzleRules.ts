import { samePoint, type Direction, type Point } from '../types';
import type { PuzzleLevel, PuzzleTarget } from './puzzleLevels';

export function isPuzzleWall(
  level: PuzzleLevel,
  point: Point,
): boolean {
  return level.walls.some((wall) => samePoint(wall, point));
}

export function findPuzzleTarget(
  level: PuzzleLevel,
  point: Point,
): PuzzleTarget | undefined {
  return level.targets.find((target) => samePoint(target, point));
}

export function canConsumePuzzleTarget(
  target: PuzzleTarget,
  direction: Direction,
): boolean {
  return target.direction === direction;
}

export function isPuzzleLevelCleared(
  level: PuzzleLevel,
  clearedTargets: Point[],
): boolean {
  return level.targets.every((target) =>
    clearedTargets.some((point) => samePoint(point, target)),
  );
}

export function isPuzzlePointOutOfBounds(
  level: PuzzleLevel,
  point: Point,
): boolean {
  return point.x < 0 || point.y < 0 || point.x >= level.columns || point.y >= level.rows;
}
