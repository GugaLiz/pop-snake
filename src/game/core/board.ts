import type { Point } from '../types';

export type BoardLayout = {
  cellSize: number;
  origin: Point;
  pixelWidth: number;
  pixelHeight: number;
};

export function isPointOutOfBounds(
  point: Point,
  columns: number,
  rows: number,
): boolean {
  return point.x < 0 || point.y < 0 || point.x >= columns || point.y >= rows;
}

export function wrapBoardPoint(
  point: Point,
  columns: number,
  rows: number,
): Point {
  return {
    x: (point.x + columns) % columns,
    y: (point.y + rows) % rows,
  };
}

export function calculateBoardLayout(
  width: number,
  height: number,
  columns: number,
  rows: number,
  padding = 2,
): BoardLayout {
  const cellSize = Math.floor(
    Math.min((width - padding) / columns, (height - padding) / rows),
  );
  const pixelWidth = cellSize * columns;
  const pixelHeight = cellSize * rows;

  return {
    cellSize,
    origin: {
      x: Math.floor((width - pixelWidth) / 2),
      y: Math.floor((height - pixelHeight) / 2),
    },
    pixelWidth,
    pixelHeight,
  };
}
