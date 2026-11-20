import { shuffle } from './random.js';

export interface Sharing {
  cards: number;
  squares: number;
  universal: number;
  exclusive: number;
}

export function planSharing({ cards, squares, universal, exclusive }: Sharing) {
  for (const [key, value] of Object.entries({ cards, squares, universal, exclusive })) {
    const minimum = key === 'cards' ? 1 : 0;
    if (!Number.isSafeInteger(value) || value < minimum) {
      throw new Error(`${key} must be an integer of at least ${minimum}.`);
    }
  }
  if (cards === 1 && universal !== 0) {
    throw new Error('With one card, every cliché is exclusive. Set universal to 0.');
  }
  const paired = squares - universal - exclusive;
  if (paired < 0) throw new Error('Universal and exclusive counts exceed the available cliché squares.');
  if (cards < 3 && paired !== 0) {
    throw new Error('For one or two cards, universal and exclusive counts must fill every cliché square.');
  }
  if (cards >= 3 && paired % (cards - 1) !== 0) {
    throw new Error(`Cannot share ${paired} squares evenly across ${cards - 1} other cards. Adjust the grid, universal count, or exclusive count.`);
  }
  const perPair = cards >= 3 ? paired / (cards - 1) : 0;
  const required = universal + cards * exclusive + cards * paired / 2;
  if (!Number.isSafeInteger(required)) throw new Error('Required catalogue size exceeds the supported range.');
  return { perPair, required };
}

export function generateMembership(ids: Iterable<number>, sharing: Sharing, seed: string): Set<number>[] {
  const { perPair, required } = planSharing(sharing);
  const distinct = Array.from(new Set(ids)).sort((a, b) => a - b);
  if (distinct.length < required) {
    throw new Error(`Catalogue needs ${required} distinct clichés for this configuration. Found ${distinct.length}.`);
  }
  const pool = shuffle(distinct, seed, 'membership');
  const { cards, universal, exclusive } = sharing;
  const shared = pool.slice(0, universal);
  const membership = Array.from({ length: cards }, () => new Set(shared));
  let next = universal;
  if (perPair > 0) {
    for (let first = 0; first < cards; first++) {
      for (let second = first + 1; second < cards; second++) {
        for (let slot = 0; slot < perPair; slot++) {
          const id = pool[next++];
          membership[first].add(id);
          membership[second].add(id);
        }
      }
    }
  }
  for (const card of membership) {
    for (let slot = 0; slot < exclusive; slot++) card.add(pool[next++]);
  }
  return membership;
}
