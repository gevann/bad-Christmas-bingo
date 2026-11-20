import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { parseCatalogue } from './catalogue.js';
import { generateMembership } from './membership.js';
import { gridSize } from './placement.js';
import { renderPdf } from './pdf.js';

const defaults = {
  cards: 4, rows: 5, columns: 5, free: true, universal: 6, exclusive: 6,
  input: 'cliches.json', output: 'bingo.pdf', seed: undefined as string | undefined,
};

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read JSON from ${path}. ${(error as Error).message}`);
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      config: { type: 'string' }, cards: { type: 'string' }, rows: { type: 'string' },
      columns: { type: 'string' }, universal: { type: 'string' }, exclusive: { type: 'string' },
      free: { type: 'boolean' }, 'no-free': { type: 'boolean' }, seed: { type: 'string' },
      input: { type: 'string' }, output: { type: 'string' }, help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(`Usage: npm run generate -- [options]

  --config PATH      Load settings from JSON (flags override settings)
  --input PATH       Cliché catalogue (default cliches.json)
  --output PATH      PDF destination (default bingo.pdf)
  --cards N          Number of cards (default 4)
  --rows N           Grid rows (default 5)
  --columns N        Grid columns (default 5)
  --free | --no-free Enable or disable FREE centre (enabled by default)
  --universal N      Clichés on every card (default 6)
  --exclusive N      Clichés unique to each card (default 6)
  --seed TEXT        Repeatable generation (a random seed is printed if omitted)
  --help, -h         Show this message`);
    return;
  }

  const config = { ...defaults };
  if (values.config !== undefined) {
    const data = await readJson(values.config);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Configuration must be a JSON object.');
    }
    for (const key of Object.keys(data)) {
      if (!Object.hasOwn(defaults, key)) throw new Error(`Unknown configuration setting ${key}.`);
    }
    Object.assign(config, data);
  }
  for (const key of ['cards', 'rows', 'columns', 'universal', 'exclusive'] as const) {
    const value = values[key];
    if (value !== undefined) {
      if (!/^\d+$/.test(value)) throw new Error(`--${key} must be a nonnegative integer.`);
      config[key] = Number(value);
    }
  }
  for (const key of ['input', 'output'] as const) {
    config[key] = values[key] ?? config[key];
    if (typeof config[key] !== 'string' || !config[key].trim()) {
      throw new Error(`${key} must be a nonempty string.`);
    }
  }
  config.seed = values.seed ?? config.seed;
  if (config.seed !== undefined && (typeof config.seed !== 'string' || !config.seed.trim())) {
    throw new Error('seed must be a nonempty string.');
  }
  if (values.free && values['no-free']) throw new Error('Choose either --free or --no-free.');
  if (values.free) config.free = true;
  if (values['no-free']) config.free = false;

  const squares = gridSize(config);
  if (resolve(config.input) === resolve(config.output)) throw new Error('Input and output paths must differ.');
  const catalogue = parseCatalogue(await readJson(config.input));
  const seed = config.seed ?? randomBytes(8).toString('hex');
  const membership = generateMembership(catalogue.keys(), { ...config, squares }, seed);
  const pdf = await renderPdf(catalogue, membership, config, seed);
  await writeFile(config.output, pdf);
  console.log(`Wrote ${membership.length} card(s) to ${config.output} (seed ${JSON.stringify(seed)}).`);
}

main().catch((error: Error) => {
  console.error(`Bingo: ${error.message}`);
  process.exitCode = 1;
});
