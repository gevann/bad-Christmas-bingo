import PDFDocument from 'pdfkit';
import { placeCard } from './bingo.ts';
import type { Cliche, Grid } from './bingo.ts';

const ink = '#242b27';
const green = '#275040';
const berry = '#863e44';
const border = '#9caaa1';
const pageWidth = 612;
const inset = 40;
const width = pageWidth - inset * 2;
const gridTop = 163;
const gridHeight = 553;
const padding = 7;
const minimumFontSize = 9;
const winAnsi = new Set(new TextDecoder('windows-1252').decode(
  Uint8Array.from({ length: 128 }, (_, index) => index + 128),
).replace(/[\u0080-\u009f\ufffd]/gu, ''));

export async function renderPdf(
  cards: readonly ReadonlySet<number>[], catalogue: readonly Cliche[],
  grid: Grid, layoutSeed: string,
): Promise<Buffer> {
  const doc = new PDFDocument({
    autoFirstPage: false, size: 'LETTER', margin: 0,
    info: { Title: 'Bad Christmas Movie Bingo', CreationDate: new Date(0) },
  });
  const labels = new Map(catalogue.map(({ id, text }) => [id, text]));
  const cellWidth = width / grid.columns;
  const cellHeight = gridHeight / grid.rows;
  const textWidth = cellWidth - 2 * padding;
  const textHeight = cellHeight - 2 * padding;
  if (textWidth < minimumFontSize || textHeight < 12) {
    throw new Error('The grid is too dense for readable text on US Letter. Use fewer rows or columns.');
  }

  const fitted = new Map<number | null, { lines: string[]; font: string; size: number; lineHeight: number }>();
  const used = new Set<number | null>(cards.flatMap(card => [...card]));
  if (grid.free) used.add(null);
  // Measure every selected label before writing pages. Keep all cells readable at 9 pt or larger.
  for (const id of used) {
    const text = id === null ? 'FREE' : labels.get(id);
    if (text === undefined) throw new Error(`No catalogue text for cliché ID ${id}.`);
    if ([...text].some(character => !/^[ -~]$/u.test(character) && !winAnsi.has(character))) {
      throw new Error(`Cliché ${id} contains a character outside the PDF font's Windows-1252 alphabet.`);
    }
    const font = id === null ? 'Helvetica-Bold' : 'Helvetica';
    doc.font(font);
    let fit;
    for (let size = id === null ? 17 : 14; size >= minimumFontSize; size -= 0.5) {
      doc.fontSize(size);
      const words = text.split(/\s+/u);
      if (words.some(word => doc.widthOfString(word) > textWidth)) continue;
      const lines: string[] = [];
      let line = words[0];
      for (const word of words.slice(1)) {
        const next = `${line} ${word}`;
        if (doc.widthOfString(next) <= textWidth) {
          line = next;
        } else {
          lines.push(line);
          line = word;
        }
      }
      lines.push(line);
      const lineHeight = doc.currentLineHeight(true) + 2;
      if (lines.length * lineHeight <= textHeight) {
        fit = { lines, font, size, lineHeight };
        break;
      }
    }
    if (!fit) throw new Error(`Cliché ${id ?? 'FREE'} cannot fit at 9 pt. Shorten its text or use a less dense grid.`);
    fitted.set(id, fit);
  }

  for (const [index, card] of cards.entries()) {
    doc.addPage();
    doc.rect(inset, 43, 30, 3).fill(berry);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(berry)
      .text('CHRISTMAS MOVIE NIGHT', inset, 57, { lineBreak: false });
    doc.font('Times-Bold').fontSize(39).fillColor(green)
      .text('Bad Christmas Movie Bingo', inset, 74, { lineBreak: false });
    doc.font('Helvetica').fontSize(11).fillColor(ink)
      .text('Mark a square when you spot the cliché.', inset, 126, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(10)
      .text(`CARD ${index + 1} / ${cards.length}`, inset, 126, { width, align: 'right' });

    const cells = placeCard(card, grid, layoutSeed, index);
    for (const [position, id] of cells.entries()) {
      const x = inset + (position % grid.columns) * cellWidth;
      const y = gridTop + Math.floor(position / grid.columns) * cellHeight;
      if (id === null) doc.rect(x, y, cellWidth, cellHeight).fill('#eef3ed');
      const fit = fitted.get(id)!;
      doc.font(fit.font).fontSize(fit.size).fillColor(id === null ? green : ink);
      const top = y + (cellHeight - fit.lines.length * fit.lineHeight) / 2;
      for (const [lineIndex, line] of fit.lines.entries()) {
        doc.text(line, x + (cellWidth - doc.widthOfString(line)) / 2,
          top + lineIndex * fit.lineHeight, { lineBreak: false });
      }
    }
    doc.lineWidth(0.7).strokeColor(border);
    for (let col = 1; col < grid.columns; col++) {
      const x = inset + col * cellWidth;
      doc.moveTo(x, gridTop).lineTo(x, gridTop + gridHeight);
    }
    for (let row = 1; row < grid.rows; row++) {
      const y = gridTop + row * cellHeight;
      doc.moveTo(inset, y).lineTo(inset + width, y);
    }
    doc.stroke();
    doc.lineWidth(1.1).strokeColor(green).rect(inset, gridTop, width, gridHeight).stroke();
    doc.font('Helvetica').fontSize(10).fillColor(green)
      .text(grid.rows === grid.columns
        ? 'Complete a row, column, or corner-to-corner diagonal.'
        : 'Complete a row or column.', inset, 733,
        { width, align: 'center' });
  }
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}
