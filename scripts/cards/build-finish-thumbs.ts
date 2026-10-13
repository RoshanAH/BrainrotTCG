import { SETS } from '../../src/content/sets/index.ts';
import { buildSetFinishThumbs } from './finish-thumbs.ts';

const args = process.argv.slice(2);
const force = args.includes('--force');
const onlySet = args.includes('--set') ? args[args.indexOf('--set') + 1] : undefined;
let built = 0;
let skipped = 0;
for (const set of SETS) {
  if (onlySet && set.id !== onlySet) continue;
  const result = await buildSetFinishThumbs(set.id, force);
  built += result.built;
  skipped += result.skipped;
  console.log(`${set.id}: ${result.built} finish thumbnails built, ${result.skipped} up to date`);
}
console.log(`${built} built, ${skipped} up to date`);
