/**
 * Builds every registered card image into `src/content/sets/<set>/cards/<card>.webp`,
 * then each set's pack wrapper into `src/content/sets/<set>/pack.webp`.
 * Usage: npm run cards [-- --force] [-- --set <id>]
 */
import { ALL_SET_VERSIONS, SETS } from '../../src/content/sets/index.ts';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { buildSetCards, SETS_DIR } from './lib.ts';
import { buildSetPack } from './pack.ts';
import { buildFinishMask } from './finish-mask.ts';
import { buildSetFinishThumbs } from './finish-thumbs.ts';

await buildFinishMask();

const args = process.argv.slice(2);
const force = args.includes('--force');
const onlySet = args.includes('--set') ? args[args.indexOf('--set') + 1] : undefined;

let built = 0;
let skipped = 0;
const missing: string[] = [];
for (const set of SETS) {
  if (onlySet && set.id !== onlySet) continue;
  const older = ALL_SET_VERSIONS.filter((s) => s.id === set.id && s !== set).flatMap((s) => s.cards);
  const result = await buildSetCards(set, older, force);
  result.built.forEach((b) => console.log(`built ${b}`));
  result.removed.forEach((r) => console.log(`removed ${r} (no longer in the set)`));
  built += result.built.length;
  skipped += result.skipped;
  missing.push(...result.missing);
  if (result.missing.length) continue;
  const thumbs = await buildSetFinishThumbs(set.id, force);
  built += thumbs.built;
  skipped += thumbs.skipped;
  if (thumbs.built) console.log(`built ${thumbs.built} ${set.id} finish thumbnails`);
  const manifestPath = `${SETS_DIR}/${set.id}/cards/.manifest.json`;
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
  if (await buildSetPack(set, manifest, force)) {
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`built ${set.id}/pack`);
    built++;
  } else skipped++;
}
console.log(`${built} built, ${skipped} up to date`);
if (missing.length) {
  console.error(`Missing art for ${missing.length} card(s):\n  ${missing.join('\n  ')}`);
  process.exit(1);
}
