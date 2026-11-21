import drawSvg from 'svg-to-pdfkit';
import { emojiArtwork } from './emoji.ts';
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
    info: { Title: 'Bad Christmas Movie Bingo', CreationDate: new Date(0), Subject: 'Emoji artwork by Twitter and other contributors (Twemoji), https://twemoji.twitter.com/ — CC BY 4.0, https://creativecommons.org/licenses/by/4.0/' },
  });
  const labels = new Map(catalogue.map(entry => [entry.id, entry]));
  const cellWidth = width / grid.columns;
  const cellHeight = gridHeight / grid.rows;
  const textWidth = cellWidth - 2 * padding;
  const textHeight = cellHeight - 2 * padding;
  if (textWidth < minimumFontSize || textHeight < 12) {
    throw new Error('The grid is too dense for readable text on US Letter. Use fewer rows or columns.');
  }

  const fitted = new Map<number | null, { lines: string[]; font: string; size: number; lineHeight: number; artwork?: string; iconSize: number }>();
  const used = new Set<number | null>(cards.flatMap(card => [...card]));
  if (grid.free) used.add(null);
  // Measure every selected label before writing pages. Keep all cells readable at 9 pt or larger.
  for (const id of used) {
    const entry = id === null ? undefined : labels.get(id);
    const text = id === null ? 'FREE' : entry?.text;
    const emoji = id === null ? '🎄' : entry?.emoji;
    const artwork = emoji && emojiArtwork(emoji);
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
      const spareHeight = textHeight - lines.length * lineHeight;
      const iconSize = artwork ? Math.min(id === null ? 35 : 22, textWidth, spareHeight - 4) : 0;
      if (spareHeight >= 0 && (!artwork || iconSize >= 12 || size === minimumFontSize)) {
        fit = { lines, font, size, lineHeight, artwork, iconSize: iconSize >= 8 ? iconSize : 0 };
        break;
      }
    }
    if (!fit) throw new Error(`Cliché ${id ?? 'FREE'} cannot fit at 9 pt. Shorten its text or use a less dense grid.`);
    fitted.set(id, fit);
  }

  for (const [index, card] of cards.entries()) {
    doc.addPage();
    // A scalloped strand with alternating coloured bulbs spans the title block.
    const bulbColors = [berry, '#c48b33', green];
    for (let strand = 0; strand < 7; strand++) {
      const x = inset + strand * 76;
      doc.moveTo(x, 27).quadraticCurveTo(x + 38, 43, x + 76, 27).lineWidth(0.9).stroke(green);
      doc.rect(x + 36.5, 35, 3, 3).fill(green);
      doc.ellipse(x + 38, 41, 3, 4.5).fill(bulbColors[strand % bulbColors.length]);
    }
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
      const iconSpace = fit.iconSize ? fit.iconSize + 4 : 0;
      const blockTop = y + (cellHeight - fit.lines.length * fit.lineHeight - iconSpace) / 2;
      if (fit.artwork && fit.iconSize) {
        drawSvg(doc, fit.artwork, x + (cellWidth - fit.iconSize) / 2, blockTop,
          { width: fit.iconSize, height: fit.iconSize, assumePt: true });
      }
      const top = blockTop + iconSpace;
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
