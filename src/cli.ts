import { randomBytes } from 'node:crypto';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { defaults, generateMembership, parseCatalogue, plan } from './bingo.ts';
import type { Config } from './bingo.ts';
import { renderPdf } from './pdf.ts';

const help = `Usage: npm run generate -- [options]

  --config PATH       JSON configuration file (flags override it)
  --input PATH        Catalogue (default: cliches.json)
  --output PATH       Output PDF (default: bingo.pdf)
  --cards N           Number of cards (default: 4)
  --rows N            Grid rows (default: 5)
  --columns N         Grid columns (default: 5)
  --free / --no-free  Enable or disable the centre square (default: enabled)
  --universal N       Clichés shared by all cards (default: 6)
  --exclusive N       Clichés unique to each card (default: 6)
  --seed TEXT         Membership and default placement seed
  --layout-seed TEXT  Override placement seed only
  --help              Show this message`;

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read JSON from ${path}: ${(error as Error).message}`);
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      config: { type: 'string' }, input: { type: 'string' }, output: { type: 'string' },
      cards: { type: 'string' }, rows: { type: 'string' }, columns: { type: 'string' },
      universal: { type: 'string' }, exclusive: { type: 'string' },
      free: { type: 'boolean' }, 'no-free': { type: 'boolean' }, seed: { type: 'string' },
      'layout-seed': { type: 'string' }, help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(help);
    return;
  }
  if (values.free && values['no-free']) throw new Error('Supply either --free or --no-free.');
  const file = values.config === undefined ? {} : await readJson(values.config);
  if (!file || typeof file !== 'object' || Array.isArray(file)) throw new Error('Config must be a JSON object.');
  const saved = file as Record<string, unknown>;
  const allowed = new Set([...Object.keys(defaults), 'input', 'output', 'seed', 'layoutSeed']);
  for (const key of Object.keys(saved)) {
    if (!allowed.has(key)) throw new Error(`Unknown config property "${key}".`);
  }
  const config: Config = { ...defaults };
  for (const key of ['cards', 'rows', 'columns', 'universal', 'exclusive'] as const) {
    const flag = values[key];
    const value = flag === undefined ? (key in saved ? saved[key] : defaults[key])
      : /^\d+$/u.test(flag) ? Number(flag) : NaN;
    if (typeof value !== 'number') throw new Error(`${key} must be a JSON number in the config.`);
    config[key] = value;
  }
  const free = values.free ? true : values['no-free'] ? false : 'free' in saved ? saved.free : defaults.free;
  if (typeof free !== 'boolean') throw new Error('free must be true or false.');
  config.free = free;
  const stringValue = (key: string, flag: string | undefined, fallback: string) => {
    const value = flag ?? (key in saved ? saved[key] : fallback);
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} must be a nonempty string.`);
    return value;
  };
  const input = stringValue('input', values.input, 'cliches.json');
  const output = stringValue('output', values.output, 'bingo.pdf');
  const seed = stringValue('seed', values.seed, randomBytes(8).toString('hex'));
  const layoutSeed = stringValue('layoutSeed', values['layout-seed'], seed);
  const { perPair, required } = plan(config);
  const outputTarget = await realpath(output).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
    return resolve(output);
  });
  for (const source of values.config === undefined ? [input] : [input, values.config]) {
    if (await realpath(source) === outputTarget) throw new Error('Output must be a different file from the catalogue and configuration.');
  }
  const catalogue = parseCatalogue(await readJson(input));
  const cards = generateMembership(catalogue, config, seed);
  await writeFile(output, await renderPdf(cards, catalogue, config, layoutSeed));
  console.log(`Wrote ${cards.length} cards to ${output} using ${required} clichés (${perPair} pair-specific per pair).`);
  console.log(`Seed: ${JSON.stringify(seed)} | Layout seed: ${JSON.stringify(layoutSeed)}`);
}

main().catch((error: Error) => {
  console.error(`Bingo: ${error.message}`);
  process.exitCode = 1;
});
