import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { parseCatalogue } from '../src/catalogue.js';
import { generateMembership, planSharing } from '../src/membership.js';
import { gridSize, placeCard } from '../src/placement.js';
import { fitText } from '../src/pdf.js';

const grid = { rows: 5, columns: 5, free: true };
const defaults = { cards: 4, squares: 24, universal: 6, exclusive: 6 };
const ids = Array.from({ length: 60 }, (_, i) => i + 1);

for (const [settings, perPair, required] of [
  [defaults, 4, 54],
  [{ cards: 5, squares: 12, universal: 2, exclusive: 2 }, 2, 32],
  [{ cards: 2, squares: 6, universal: 2, exclusive: 4 }, 0, 10],
  [{ cards: 1, squares: 6, universal: 0, exclusive: 6 }, 0, 6],
] as const) {
  test(`sharing frequencies and overlaps with ${settings.cards} card(s)`, () => {
    const cards = generateMembership(ids, settings, '12345');
    assert.equal(cards.length, settings.cards);
    assert.equal(planSharing(settings).required, required);
    const used = new Set(cards.flatMap(card => [...card]));
    assert.equal(used.size, required);
    for (const [index, card] of cards.entries()) {
      assert.equal(card.size, settings.squares);
      const frequency = (id: number) => cards.filter(other => other.has(id)).length;
      assert.equal([...card].filter(id => frequency(id) === 1).length, settings.exclusive);
      if (cards.length > 1) {
        assert.equal([...card].filter(id => frequency(id) === cards.length).length, settings.universal);
      }
      if (cards.length > 2) {
        assert.equal([...card].filter(id => frequency(id) === 2).length, perPair * (cards.length - 1));
      }
      for (const other of cards.slice(index + 1)) {
        assert.equal([...card].filter(id => other.has(id)).length, settings.universal + perPair);
      }
    }
  });
}

test('placement preserves membership and reproduces independently across layouts', () => {
  const seed = '12345';
  const cards = generateMembership(ids, defaults, seed);
  assert.deepEqual(generateMembership([...ids].reverse(), defaults, seed), cards);
  const rectangle = { rows: 4, columns: 6, free: false };
  assert.equal(gridSize(rectangle), defaults.squares);
  for (const [index, card] of cards.entries()) {
    const placed = placeCard(card, grid, seed, index);
    assert.equal(placed.length, 25);
    assert.equal(placed[12], null);
    assert.deepEqual(placed, placeCard(card, grid, seed, index));
    assert.deepEqual(new Set(placed.filter(id => id !== null)), card);
    assert.deepEqual(placeCard(card, rectangle, seed, index), placed.filter(id => id !== null));
    assert.notDeepEqual(placeCard(card, grid, seed, index + 1), placed);
  }
  assert.deepEqual(cards, generateMembership(ids, defaults, seed));
});

test('rejects insufficient catalogues and impossible configurations', () => {
  assert.throws(() => generateMembership(ids.slice(0, 53), defaults, 's'), /needs 54.*Found 53/);
  assert.throws(() => planSharing({ ...defaults, exclusive: 7 }), /Cannot share 11 squares evenly/);
  assert.throws(() => planSharing({ ...defaults, exclusive: 25 }), /exceed/);
  assert.throws(() => planSharing({ ...defaults, cards: 2 }), /must fill/);
  assert.throws(() => planSharing({ ...defaults, cards: 0 }), /cards must be/);
  assert.throws(() => gridSize({ ...grid, rows: 4 }), /FREE centre needs odd/);
  assert.throws(() => parseCatalogue([{ id: 1, text: 'Snow' }, { id: 1, text: 'Pie' }]), /Duplicate/);
  assert.throws(() => parseCatalogue([{ id: '1', text: 'Snow' }]), /integer ID/);
});

test('text wraps long words and rejects copy that cannot fit', async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const text = 'Supercalifragilisticexpialidocious';
  const fit = fitText(text, font, 50, 75, 15);
  assert.ok(fit.lines.length > 1);
  assert.ok(fit.lines.every(line => font.widthOfTextAtSize(line, fit.size) <= 50));
  assert.equal(fit.lines.join(''), text);
  assert.ok(fit.total <= 75);
  assert.throws(() => fitText(text.repeat(40), font, 50, 50, 15), /will not fit/);
});

test('CLI writes a reproducible four-page Letter PDF from the example config', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'bingo-test-'));
  try {
    const output = join(directory, 'bingo.pdf');
    const args = ['dist/src/cli.js', '--config', 'bingo.example.json', '--output', output];
    execFileSync(process.execPath, args);
    const first = readFileSync(output);
    const pdf = await PDFDocument.load(first);
    assert.equal(pdf.getPageCount(), 4);
    for (const page of pdf.getPages()) assert.deepEqual(page.getSize(), { width: 612, height: 792 });
    execFileSync(process.execPath, args);
    assert.deepEqual(readFileSync(output), first);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
