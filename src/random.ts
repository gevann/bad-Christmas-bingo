import { createHash } from 'node:crypto';

export function shuffle<T>(items: Iterable<T>, seed: string, scope: string): T[] {
  const result = Array.from(items);
  let state = createHash('sha256').update(JSON.stringify([seed, scope])).digest().readUInt32LE();
  for (let i = result.length - 1; i > 0; i--) {
    // Mulberry32 generates a repeatable stream for this scope.
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    const j = Math.floor(((value ^ (value >>> 14)) >>> 0) / 2 ** 32 * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
