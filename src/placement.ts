import { shuffle } from './random.js';

export interface Grid {
  rows: number;
  columns: number;
  free: boolean;
}

export function gridSize({ rows, columns, free }: Grid): number {
  if (!Number.isSafeInteger(rows) || rows < 1 || !Number.isSafeInteger(columns) || columns < 1 ||
      !Number.isSafeInteger(rows * columns)) {
    throw new Error('Rows and columns must be positive integers with a supported grid area.');
  }
  if (typeof free !== 'boolean') throw new Error('Free must be true or false.');
  if (free && (rows % 2 === 0 || columns % 2 === 0)) {
    throw new Error('A FREE centre needs odd rows and columns. Use --no-free for even dimensions.');
  }
  return rows * columns - Number(free);
}

export function placeCard(card: ReadonlySet<number>, grid: Grid, seed: string, index: number): (number | null)[] {
  const size = gridSize(grid);
  if (card.size !== size) throw new Error(`Grid needs ${size} IDs. Card contains ${card.size}.`);
  const cells: (number | null)[] = shuffle(
    Array.from(card).sort((a, b) => a - b), seed, `placement:${index}`,
  );
  if (grid.free) cells.splice(Math.floor(size / 2), 0, null);
  return cells;
}
