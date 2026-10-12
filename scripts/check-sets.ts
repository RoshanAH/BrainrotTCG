/**
 * Guards released sets. A pull proof only stays valid if its set@version never
 * changes, so this hashes everything that affects pack contents and compares
 * it to `src/content/sets.lock.json`.
 *
 *   npx tsx scripts/check-sets.ts            check (CI)
 *   npx tsx scripts/check-sets.ts --update   lock new set versions
 *
 * Names, captions, flavor text and art can change freely; card ids/order,
 * rarities, odds and pack size cannot (bump the set version instead).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALL_SET_VERSIONS } from '../src/content/sets/index.ts';
import { setKey, TICKET_VERSION, type SetDefinition } from '../src/engine/index.ts';
import { findArt } from './cards/lib.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const LOCK_PATH = `${ROOT}src/content/sets.lock.json`;
const update = process.argv.includes('--update');

const packHash = (set: SetDefinition) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        ticket: TICKET_VERSION,
        id: set.id,
        version: set.version,
        packSize: set.packSize,
        odds: set.odds,
        holoOdds: set.holoOdds,
        cards: set.cards.map((c) => [c.id, c.rarity]),
      }),
    )
    .digest('hex');

const lock: Record<string, string> = existsSync(LOCK_PATH) ? JSON.parse(readFileSync(LOCK_PATH, 'utf8')) : {};
const errors: string[] = [];
let added = 0;

for (const set of ALL_SET_VERSIONS) {
  const key = setKey(set);
  const hash = packHash(set);
  if (!lock[key]) {
    if (update) {
      lock[key] = hash;
      added++;
      console.log(`locked ${key}`);
    } else {
      errors.push(`${key} is not locked yet. Run: npm run check:sets -- --update`);
    }
  } else if (lock[key] !== hash) {
    errors.push(`${key} changed after release (cards, order, rarities, odds or pack size). Bump its version instead; old proofs depend on it.`);
  }
  if (!set.draft && !set.archivedAt && !existsSync(`${ROOT}src/content/sets/${set.id}/pack.webp`)) {
    errors.push(`${key}: no pack wrapper. Run: npm run cards`);
  }
  for (const card of set.cards) {
    if (!existsSync(`${ROOT}src/content/sets/${set.id}/cards/${card.id}.webp`)) {
      errors.push(`${key}: no built image for "${card.id}". Run: npm run cards`);
    }
    // Released sets show real meme images only (see docs/ART_STYLE.md).
    if (!set.draft && findArt(set.id, card.id)?.kind === 'svg') {
      errors.push(`${key}: "${card.id}" still has placeholder SVG art; released sets need the real image (or swap the card).`);
    }
  }
}
for (const key of Object.keys(lock)) {
  if (!ALL_SET_VERSIONS.some((s) => setKey(s) === key)) errors.push(`${key} is locked but missing from the registry; old proofs need it.`);
}

if (update && added) writeFileSync(LOCK_PATH, JSON.stringify(Object.fromEntries(Object.entries(lock).sort()), null, 2) + '\n');
if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log(`✓ ${ALL_SET_VERSIONS.length} set version(s) OK`);
