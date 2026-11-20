import { createHash } from 'node:crypto';

export type Cliche = { id: number; text: string; category?: string; rarity?: string | number };
export type Grid = { rows: number; columns: number; free: boolean };
export type Config = Grid & { cards: number; universal: number; exclusive: number };

export const defaults: Config = { cards: 4, rows: 5, columns: 5, free: true, universal: 6, exclusive: 6 };

export function plan(config: Config) {
  const { cards, rows, columns, free, universal, exclusive } = config;
  for (const [name, value] of Object.entries({ cards, rows, columns, universal, exclusive })) {
    const minimum = name === 'universal' || name === 'exclusive' ? 0 : 1;
    if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`${name} must be an integer ≥ ${minimum}.`);
  }
  if (typeof free !== 'boolean') throw new Error('free must be true or false.');
  if (free && (rows % 2 === 0 || columns % 2 === 0)) {
    throw new Error('A FREE centre requires odd rows and columns. Use --no-free for even dimensions.');
  }
  const slots = rows * columns - Number(free);
  if (!Number.isSafeInteger(slots) || slots < 1) throw new Error('The grid must have a valid number of cliché squares (at least one).');
  const remaining = slots - universal - exclusive;
  if (remaining < 0) throw new Error(`Universal and exclusive counts exceed the ${slots} cliché squares per card.`);
  if (cards === 1 && (universal !== 0 || remaining !== 0)) {
    throw new Error('With one card, use --universal 0 and set --exclusive to the number of cliché squares.');
  }
  if (cards === 2 && remaining !== 0) {
    throw new Error('With two cards, every shared cliché is universal. Set universal plus exclusive to the number of cliché squares.');
  }
  if (cards > 1 && remaining % (cards - 1) !== 0) {
    throw new Error(`Cannot divide ${remaining} pair-shared squares evenly among ${cards - 1} other cards. Adjust the grid, universal count, or exclusive count.`);
  }
  const perPair = cards === 1 ? 0 : remaining / (cards - 1);
  const required = universal + cards * exclusive + (cards * remaining) / 2;
  if (!Number.isSafeInteger(required)) throw new Error('The configuration requires too many distinct clichés.');
  return { slots, perPair, required };
}

export function parseCatalogue(value: unknown): Cliche[] {
  if (!Array.isArray(value)) throw new Error('Catalogue must be a JSON array.');
  const ids = new Set<number>();
  const labels = new Set<string>();
  return value.map((entry: unknown, index) => {
    if (typeof entry !== 'object' || entry === null || !('id' in entry) || !('text' in entry)) {
      throw new Error(`Catalogue entry ${index + 1} needs an id and text.`);
    }
    const { id, text } = entry;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1 || ids.has(id)) {
      throw new Error(`Catalogue entry ${index + 1} needs a unique positive integer ID (received ${id}).`);
    }
    if (typeof text !== 'string' || !text.trim()) throw new Error(`Cliché ${id} needs nonempty text.`);
    const label = text.trim().replace(/\s+/gu, ' ');
    const key = label.normalize('NFKC').toLowerCase();
    if (labels.has(key)) throw new Error(`Cliché ${id} duplicates another label: "${label}".`);
    ids.add(id);
    labels.add(key);
    const category = 'category' in entry ? entry.category : undefined;
    const rarity = 'rarity' in entry ? entry.rarity : undefined;
    if (category !== undefined && typeof category !== 'string') throw new Error(`Cliché ${id}: category must be a string.`);
    if (rarity !== undefined && typeof rarity !== 'string' && typeof rarity !== 'number') {
      throw new Error(`Cliché ${id}: rarity must be a string or number.`);
    }
    return { id, text: label, category, rarity };
  });
}

function shuffle<T>(items: T[], seed: string, purpose: string): T[] {
  let state = createHash('sha256').update(JSON.stringify([seed, purpose])).digest().readUInt32LE();
  for (let index = items.length - 1; index > 0; index--) {
    // Mulberry32. Separate purpose strings isolate membership and each card's placement.
    state = (state + 0x6d2b79f5) >>> 0;
    let bits = Math.imul(state ^ (state >>> 15), state | 1);
    bits ^= bits + Math.imul(bits ^ (bits >>> 7), bits | 61);
    const fraction = ((bits ^ (bits >>> 14)) >>> 0) / 2 ** 32;
    const other = Math.floor(fraction * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

export function generateMembership(catalogue: readonly Cliche[], config: Config, seed: string): Set<number>[] {
  const { perPair, required } = plan(config);
  const ids = [...new Set(catalogue.map(({ id }) => id))].sort((a, b) => a - b);
  if (ids.length < required) throw new Error(`Configuration needs ${required} distinct clichés, but the catalogue has ${ids.length}.`);
  shuffle(ids, seed, 'membership');
  let next = config.universal;
  const universal = ids.slice(0, next);
  const cards = Array.from({ length: config.cards }, () => new Set(universal));
  if (perPair > 0) {
    for (let left = 0; left < cards.length; left++) {
      for (let right = left + 1; right < cards.length; right++) {
        for (const id of ids.slice(next, next + perPair)) {
          cards[left].add(id);
          cards[right].add(id);
        }
        next += perPair;
      }
    }
  }
  for (const card of cards) {
    for (const id of ids.slice(next, next + config.exclusive)) card.add(id);
    next += config.exclusive;
  }
  return cards;
}

export function placeCard(ids: ReadonlySet<number>, grid: Grid, seed: string, cardIndex: number): (number | null)[] {
  if (ids.size !== grid.rows * grid.columns - Number(grid.free)) {
    throw new Error('Card membership does not fit the requested grid.');
  }
  if (grid.free && (grid.rows % 2 === 0 || grid.columns % 2 === 0)) {
    throw new Error('A FREE centre requires odd rows and columns.');
  }
  const cells: (number | null)[] = shuffle([...ids].sort((a, b) => a - b), seed, `placement:${cardIndex}`);
  if (grid.free) cells.splice(Math.floor(cells.length / 2), 0, null);
  return cells;
}
