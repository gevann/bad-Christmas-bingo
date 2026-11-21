import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { defaults, generateMembership, parseCatalogue, placeCard, plan } from '../src/bingo.ts';
import { renderPdf } from '../src/pdf.ts';

const catalogue = parseCatalogue(JSON.parse(readFileSync(new URL('../cliches.json', import.meta.url), 'utf8')));
const seed = '12345';

test('default allocation has 54 distinct IDs and exactly 10 shared by each pair', () => {
  const cards = generateMembership(catalogue, defaults, seed);
  assert.equal(cards.length, 4);
  assert.deepEqual(plan(defaults), { slots: 24, perPair: 4, required: 54 });
  const occurrences = new Map<number, number>();
  for (const card of cards) {
    assert.equal(card.size, 24);
    for (const id of card) occurrences.set(id, (occurrences.get(id) ?? 0) + 1);
  }
  assert.equal(occurrences.size, 54);
  assert.deepEqual(
    [1, 2, 3, 4].map(count => [...occurrences.values()].filter(value => value === count).length),
    [24, 24, 0, 6],
  );
  for (const [index, card] of cards.entries()) {
    assert.equal([...card].filter(id => occurrences.get(id) === 4).length, 6);
    assert.equal([...card].filter(id => occurrences.get(id) === 2).length, 12);
    assert.equal([...card].filter(id => occurrences.get(id) === 1).length, 6);
    for (const other of cards.slice(index + 1)) {
      const shared = [...card].filter(id => other.has(id));
      assert.equal(shared.length, 10);
      assert.equal(shared.filter(id => occurrences.get(id) === 2).length, 4);
    }
  }
});

test('placement preserves membership, is seeded per card, and centres FREE', () => {
  const [card] = generateMembership(catalogue, defaults, seed);
  const original = new Set(card);
  const cells = placeCard(card, defaults, seed, 0);
  assert.equal(cells.length, 25);
  assert.equal(cells[12], null);
  for (const layout of [cells, placeCard(card, defaults, 'other', 0), placeCard(card, defaults, seed, 1)]) {
    assert.deepEqual(new Set(layout.filter(id => id !== null)), original);
  }
  assert.deepEqual(card, original);
  assert.deepEqual(cells, placeCard(card, defaults, seed, 0));
  assert.notDeepEqual(cells, placeCard(card, defaults, 'other', 0));
  assert.notDeepEqual(cells, placeCard(card, defaults, seed, 1));
});

test('membership is reproducible across catalogue order and equivalent grid shapes', () => {
  const cards = generateMembership(catalogue, defaults, seed);
  assert.deepEqual(cards, generateMembership([...catalogue].reverse(), defaults, seed));
  const rectangle = { ...defaults, rows: 4, columns: 6, free: false };
  assert.deepEqual(cards, generateMembership(catalogue, rectangle, seed));
  assert.ok(!placeCard(cards[0], rectangle, seed, 0).includes(null));
  assert.notDeepEqual(cards, generateMembership(catalogue, defaults, 'another seed'));
});

test('supports one card, two cards, and balanced non-default card counts', () => {
  const grid = { rows: 2, columns: 3, free: false };
  for (const [cards, universal, exclusive, perPair] of [[1, 0, 6, 0], [2, 2, 4, 0], [3, 1, 1, 2], [5, 1, 1, 1]]) {
    const config = { ...grid, cards, universal, exclusive };
    const memberships = generateMembership(catalogue, config, seed);
    assert.equal(memberships.length, cards);
    assert.equal(plan(config).perPair, perPair);
    for (const [index, card] of memberships.entries()) {
      assert.equal(card.size, 6);
      for (const other of memberships.slice(index + 1)) {
        assert.equal([...card].filter(id => other.has(id)).length, universal + perPair);
      }
    }
  }
});

test('rejects invalid configurations and insufficient catalogues', () => {
  assert.throws(() => plan({ ...defaults, universal: 7 }), /Cannot divide 11/);
  assert.throws(() => plan({ ...defaults, cards: 2 }), /every shared cliché is universal/);
  assert.throws(() => plan({ ...defaults, cards: 1 }), /every|With one card/);
  assert.throws(() => plan({ ...defaults, cards: 0 }), /cards must be an integer/);
  assert.throws(() => plan({ ...defaults, rows: 4 }), /requires odd rows and columns/);
  assert.throws(() => plan({ ...defaults, exclusive: 24 }), /exceed the 24/);
  assert.throws(() => generateMembership(catalogue.slice(0, 53), defaults, seed), /needs 54 distinct clichés.*53/);
});

test('rejects duplicate catalogue IDs, duplicate labels and blank text', () => {
  assert.throws(() => parseCatalogue([{ id: 1, text: 'Lights' }, { id: 1, text: 'Tree' }]), /unique positive integer/);
  assert.throws(() => parseCatalogue([{ id: 1, text: 'Lights' }, { id: 2, text: ' lights ' }]), /duplicates another label/);
  assert.throws(() => parseCatalogue([{ id: 1, text: ' ' }]), /nonempty text/);
});

test('oversized labels fail before a PDF can be saved', async () => {
  await assert.rejects(renderPdf([new Set([1])], [{ id: 1, text: 'word '.repeat(2000) }],
    { rows: 1, columns: 1, free: false }, seed), /cannot fit at 9 pt/);
});

test('CLI writes a reproducible four-page Letter PDF and rejects invalid flags', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bingo-'));
  const output = join(directory, 'sample.pdf');
  const args = ['src/cli.ts', '--config', 'bingo.example.json', '--output', output];
  try {
    const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const pdf = readFileSync(output);
    assert.ok(pdf.toString('latin1').startsWith('%PDF-'));
    assert.equal([...pdf.toString('latin1').matchAll(/\/Type \/Page\b/g)].length, 4);
    assert.equal([...pdf.toString('latin1').matchAll(/\/MediaBox \[0 0 612 792\]/g)].length, 4);
    const rerun = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(rerun.status, 0, rerun.stderr);
    assert.deepEqual(readFileSync(output), pdf);
    const failure = spawnSync(process.execPath, [...args, '--universal', '7'], { encoding: 'utf8' });
    assert.equal(failure.status, 1);
    assert.match(failure.stderr, /Cannot divide 11/);
    assert.deepEqual(readFileSync(output), pdf);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('all catalogue entries retain a printable emoji, including joined sequences', async () => {
  const { emojiArtwork } = await import('../src/emoji.ts');
  for (const entry of catalogue) {
    assert.ok(entry.emoji, entry.text);
    assert.match(emojiArtwork(entry.emoji), /<svg/);
  }
  assert.throws(() => emojiArtwork('not an emoji'), /No artwork/);
  assert.equal(parseCatalogue([{ id: 1, text: 'Snow' }])[0].emoji, undefined);
});
