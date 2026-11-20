# Bad Christmas Movie Bingo

Generate printable Christmas-movie bingo cards with exact sharing counts. Each card prints on one US Letter page. [Open the sample PDF](sample-bingo.pdf).

## Setup

Requires Node.js 24 or newer and npm.

```sh
npm ci
npm test
npm run check
npm run generate -- --config bingo.example.json
```

## Generate cards

```sh
npm run generate -- \
  --input cliches.json \
  --cards 4 \
  --universal 6 \
  --exclusive 6 \
  --seed 12345 \
  --output bingo.pdf
```

Use `--help` for all flags. Pass `--rows` and `--columns` for rectangular grids. The FREE square sits at the centre and requires odd dimensions. Use `--no-free` to fill every square or use even dimensions. When using a config file, paths are relative to the working directory and explicit flags override the file. Seed values in JSON are strings.

Without a seed, the CLI generates and prints one. Reuse it to reproduce the cards. Pass `--layout-seed` to change the arrangement while keeping the same `--seed` and membership. Changing the grid shape also preserves membership when the number of cliché slots and all sharing counts stay the same.

## Sharing rules

The default four cards each contain 24 clichés and a FREE square. Six clichés appear on all four cards. Each pair gets four additional clichés shared only by that pair. Each card gets six clichés of its own. Every pair overlaps on exactly ten cliché IDs, and the full set uses 54 distinct IDs.

For three or more cards, subtract universal and exclusive slots from the cliché slots on one card. The remaining slots must divide evenly by the number of other cards. The quotient is the number of additional clichés assigned to each unordered pair. Every assigned cliché comes from a distinct catalogue entry. With two cards, every shared cliché is universal. With one card, every cliché is exclusive.

## Add clichés

Edit `cliches.json` and append an object with a new positive integer ID and a short, unique phrase. Keep existing IDs stable when you edit or reorder entries.

```json
{ "id": 61, "text": "An ugly sweater wins a prize", "category": "Wardrobe", "rarity": "common" }
```

Category and rarity are optional metadata. All entries have equal selection weight. The built-in PDF fonts support Windows-1252 text, including common Western European accents and curly quotes. The CLI reports which selected label needs editing if it contains an unsupported character or cannot fit at 9 pt.

The generator in `src/bingo.ts` returns sets of IDs. The PDF renderer in `src/pdf.ts` shuffles each set independently as it lays out that card.
