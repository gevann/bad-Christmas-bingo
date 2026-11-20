import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { placeCard, type Grid } from './placement.js';
import type { Cliche } from './catalogue.js';

const letter: [number, number] = [612, 792];
const left = 36;
const bottom = 74;
const top = 634;
const gridWidth = letter[0] - 2 * left;
const gridHeight = top - bottom;
const ink = rgb(0.13, 0.18, 0.15);
const evergreen = rgb(0.13, 0.29, 0.23);
const cranberry = rgb(0.54, 0.16, 0.21);
const border = rgb(0.45, 0.51, 0.47);
const minimumSize = 9;

function centred(page: PDFPage, font: PDFFont, text: string, size: number,
  centre: number, baseline: number, color = ink) {
  page.drawText(text, {
    font, size, x: centre - font.widthOfTextAtSize(text, size) / 2, y: baseline, color,
  });
}

function wrap(text: string, fits: (line: string) => boolean): string[] | undefined {
  const lines: string[] = [];
  let line = '';
  for (const word of text.trim().split(/\s+/u)) {
    const joined = line ? `${line} ${word}` : word;
    if (fits(joined)) {
      line = joined;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    if (fits(word)) {
      line = word;
      continue;
    }
    for (const character of word) {
      if (!fits(character)) return undefined;
      if (line && !fits(line + character)) {
        lines.push(line);
        line = '';
      }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function fitText(text: string, font: PDFFont, width: number, height: number, maximum: number) {
  for (let size = maximum; size >= minimumSize; size -= 0.5) {
    const lines = wrap(text, line => font.widthOfTextAtSize(line, size) <= width);
    const ascent = font.heightAtSize(size, { descender: false });
    const step = size * 1.18;
    const total = lines && font.heightAtSize(size) + (lines.length - 1) * step;
    if (lines && total !== undefined && total <= height) return { lines, size, ascent, step, total };
  }
  throw new Error(`Text will not fit at ${minimumSize} pt. Shorten it or use a larger cell.`);
}

export async function renderPdf(
  catalogue: ReadonlyMap<number, Cliche>, membership: readonly ReadonlySet<number>[],
  grid: Grid, seed: string,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create({ updateMetadata: false });
  pdf.setTitle('Bad Christmas Movie Bingo');
  const serif = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = gridWidth / grid.columns;
  const height = gridHeight / grid.rows;
  const padding = 8;
  const centre = letter[0] / 2;

  for (const [index, card] of membership.entries()) {
    const cells = placeCard(card, grid, seed, index);
    const page = pdf.addPage(letter);
    centred(page, bold, 'CHRISTMAS MOVIE NIGHT', 10, centre, 745, cranberry);
    centred(page, serif, 'Bad Christmas Movie Bingo', 32, centre, 702, evergreen);
    centred(page, bold, `CARD ${index + 1} OF ${membership.length}`, 11, centre, 667, cranberry);
    centred(page, regular, 'Mark each cliché as it happens.', 10, centre, 46);

    for (const [position, id] of cells.entries()) {
      const x = left + (position % grid.columns) * width;
      const y = top - (Math.floor(position / grid.columns) + 1) * height;
      const cliche = id === null ? undefined : catalogue.get(id);
      if (id !== null && !cliche) throw new Error(`Unknown cliché ID ${id}.`);
      const font = cliche ? regular : bold;
      try {
        const label = cliche?.text ?? 'FREE';
        // Validate the character set before measuring or drawing with the standard fonts.
        font.encodeText(label.trim().replace(/\s+/gu, ' '));
        const { lines, size, ascent, total, step } = fitText(
          label, font, width - 2 * padding, height - 2 * padding, cliche ? 15 : 20,
        );
        if (id === null) page.drawRectangle({ x, y, width, height, color: rgb(0.91, 0.95, 0.91) });
        const baseline = y + (height + total) / 2 - ascent;
        for (const [lineIndex, line] of lines.entries()) {
          centred(page, font, line, size, x + width / 2, baseline - lineIndex * step, cliche ? ink : evergreen);
        }
      } catch (error) {
        throw new Error(`${id === null ? 'FREE square' : `Cliché ${id}`}: ${(error as Error).message}`);
      }
    }

    page.drawRectangle({ x: left, y: bottom, width: gridWidth, height: gridHeight,
      borderColor: evergreen, borderWidth: 1.4 });
    for (let col = 1; col < grid.columns; col++) {
      const x = left + col * width;
      page.drawLine({ start: { x, y: bottom }, end: { x, y: top }, thickness: 0.65, color: border });
    }
    for (let row = 1; row < grid.rows; row++) {
      const y = top - row * height;
      page.drawLine({ start: { x: left, y }, end: { x: left + gridWidth, y }, thickness: 0.65, color: border });
    }
  }
  return pdf.save();
}
