import { readFileSync } from 'node:fs';

export function emojiArtwork(emoji: string): string {
  // Twemoji keeps variation selectors in joined sequences but omits them on single symbols.
  const sequence = emoji.includes('\u200d') ? emoji : emoji.replaceAll('\ufe0f', '');
  const code = [...sequence].map(character => character.codePointAt(0)!.toString(16)).join('-');
  try {
    return readFileSync(new URL(import.meta.resolve(`@twemoji/svg/${code}.svg`)), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    throw new Error(`No artwork for "${emoji}". Choose a Twemoji 15 emoji or omit the emoji field.`);
  }
}
