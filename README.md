# Bad Christmas Movie Bingo

Generate printable bingo cards from an editable list of Christmas movie clichés. Each card prints on its own US Letter page.

## Setup

Requires Node.js 22 or newer. From the repository root:

```sh
npm ci
npm test
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

Use `--rows N` and `--columns N` to change the grid. Use `--no-free` to fill every cell with a cliché, or `--free` to enable a FREE centre on a grid with odd dimensions. If you omit `--seed`, the CLI prints a random seed you can reuse. Use `--help` to see all options.

The [sample PDF](sample.pdf) was generated with the [example configuration](bingo.example.json):

```sh
npm run generate -- --config bingo.example.json
```

Configuration values override defaults, and CLI flags override configuration values. Input and output paths are relative to the working directory. Print the PDF on Letter paper at actual size.

## Sharing rules

The default four cards use a 5 × 5 grid with a FREE centre. Each card has 24 clichés: 6 universal, 4 shared with each of its 3 partners, and 6 exclusive. Every pair has 10 clichés in common, and the full set needs 54 distinct catalogue entries.

For three or more cards, subtract the universal and exclusive counts from the number of cliché cells. Divide the remainder by the number of other cards. The quotient must be a whole number because every pair gets exactly that many clichés of its own. The catalogue must have enough IDs for one universal pool, one exclusive pool per card, and one shared pool per pair. With two cards, shared IDs are universal, so universal and exclusive counts must fill the grid. With one card, set the universal count to zero and make every cliché cell exclusive.

Membership is generated from the seed, catalogue IDs, card count, cliché cell count, and sharing counts. The placement step shuffles a copy of each card's IDs using a stream specific to that card. Changing grid shape while keeping the same number of cliché cells preserves membership. For example, `--rows 4 --columns 6 --no-free` uses the same memberships as the default grid when the other settings and seed match.

## Edit the catalogue

Edit `cliches.json` or pass your own JSON array with `--input`. Add each cliché with a new unique integer ID and keep existing IDs stable when updating wording. Optional string fields `category` and `rarity` are descriptive metadata.

```json
{ "id": 61, "text": "The mayor judges a pie contest", "category": "baking", "rarity": "common" }
```

Keep the text short for print. The PDF uses standard fonts with WinAnsi characters, including common Western European accents and punctuation. Generation reports the cliché ID if its text contains an unsupported character or cannot fit at a readable size.
