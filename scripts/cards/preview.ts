/**
 * Build one set folder's cards and write a contact sheet, without registering the set.
 * Usage: npx tsx scripts/cards/preview.ts <set-id> <contact-sheet.png> [--force]
 */
import { readFileSync } from 'node:fs';
import { validateSet } from '../../src/engine/index.ts';
import { buildSetCards, contactSheet, SETS_DIR } from './lib.ts';

const [setId, outPath] = process.argv.slice(2);
if (!setId || !outPath) {
  console.error('Usage: npx tsx scripts/cards/preview.ts <set-id> <contact-sheet.png> [--force]');
  process.exit(2);
}
const set = validateSet(JSON.parse(readFileSync(`${SETS_DIR}/${setId}/set.json`, 'utf8')));
const result = await buildSetCards(set, [], process.argv.includes('--force'));
result.built.forEach((b) => console.log(`built ${b}`));
if (result.missing.length) console.log(`missing art: ${result.missing.join(', ')}`);
await contactSheet(set, outPath);
console.log(`contact sheet: ${outPath}`);
