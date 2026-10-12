/**
 * Builds every registered card image into `src/content/sets/<set>/cards/<card>.webp`.
 * Usage: npm run cards [-- --force] [-- --set <id>]
 */
import { ALL_SET_VERSIONS, SETS } from '../../src/content/sets/index.ts';
import { buildSetCards } from './lib.ts';

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
  built += result.built.length;
  skipped += result.skipped;
  missing.push(...result.missing);
}
console.log(`${built} built, ${skipped} up to date`);
if (missing.length) {
  console.error(`Missing art for ${missing.length} card(s):\n  ${missing.join('\n  ')}`);
  process.exit(1);
}
