export interface Cliche {
  id: number;
  text: string;
  category?: string;
  rarity?: string;
}

export function parseCatalogue(data: unknown): Map<number, Cliche> {
  if (!Array.isArray(data)) throw new Error('Catalogue must be a JSON array.');
  const catalogue = new Map<number, Cliche>();
  for (const [index, item] of data.entries()) {
    if (!item || !Number.isSafeInteger(item.id) ||
        typeof item.text !== 'string' || !item.text.trim()) {
      throw new Error(`Catalogue entry ${index + 1} needs an integer ID and nonempty text.`);
    }
    if (catalogue.has(item.id)) throw new Error(`Duplicate cliché ID ${item.id}.`);
    for (const key of ['category', 'rarity']) {
      if (key in item && typeof item[key] !== 'string') {
        throw new Error(`Cliché ${item.id}: ${key} must be a string.`);
      }
    }
    catalogue.set(item.id, item);
  }
  return catalogue;
}
