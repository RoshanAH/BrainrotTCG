import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { FINISHES_RAREST_FIRST } from '../../src/engine/types.ts';
import { recolorFrame } from '../../src/game/frameRecolor.ts';
import { SETS_DIR } from './lib.ts';

// Enough for collection tiles on high-density screens, without shipping full-size finished PNGs.
const WIDTH = 344;
const QUALITY = 84;
const MASK_PATH = fileURLToPath(new URL('../../src/assets/images/card-frame-mask.webp', import.meta.url));
const loadRenderData = async () => {
  const maskBytes = readFileSync(MASK_PATH);
  const { data, info } = await sharp(maskBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const designHash = createHash('sha256')
    .update(maskBytes)
    .update(readFileSync(new URL('../../src/game/frameRecolor.ts', import.meta.url)))
    .update(JSON.stringify({ width: WIDTH, quality: QUALITY }))
    .digest('hex');
  return { coverage: new Uint8ClampedArray(data), info, designHash };
};
let renderData: ReturnType<typeof loadRenderData> | undefined;

/** Static collection images; share the exact frame recolouring used by full-size views and exports. */
export const buildSetFinishThumbs = async (setId: string, force = false): Promise<{ built: number; skipped: number }> => {
  const cardsDir = `${SETS_DIR}/${setId}/cards`;
  const outDir = `${SETS_DIR}/${setId}/finish-thumbs`;
  mkdirSync(outDir, { recursive: true });
  const manifestPath = `${outDir}/.manifest.json`;
  const manifest: Record<string, string> = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
  const keep = new Set<string>();
  const { coverage, info: maskInfo, designHash } = await (renderData ??= loadRenderData());
  let built = 0;
  let skipped = 0;
  for (const file of readdirSync(cardsDir).filter((file) => file.endsWith('.webp')).sort()) {
    const id = file.slice(0, -5);
    const outputs = FINISHES_RAREST_FIRST.map((finish) => `${id}.${finish.toLowerCase()}.webp`);
    outputs.forEach((output) => keep.add(output));
    const source = readFileSync(`${cardsDir}/${file}`);
    const hash = createHash('sha256').update(source).update(designHash).digest('hex');
    if (!force && manifest[id] === hash && outputs.every((output) => existsSync(`${outDir}/${output}`))) {
      skipped += outputs.length;
      continue;
    }
    const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== maskInfo.width || info.height !== maskInfo.height) throw new Error(`Frame dimensions do not match ${setId}/${id}`);
    for (const finish of FINISHES_RAREST_FIRST) {
      const pixels = new Uint8ClampedArray(data);
      recolorFrame(pixels, coverage, finish);
      await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
        .resize({ width: WIDTH })
        .webp({ quality: QUALITY })
        .toFile(`${outDir}/${id}.${finish.toLowerCase()}.webp`);
      built++;
    }
    manifest[id] = hash;
  }
  for (const file of readdirSync(outDir)) {
    if (file.endsWith('.webp') && !keep.has(file)) rmSync(`${outDir}/${file}`);
  }
  for (const id of Object.keys(manifest)) {
    if (!keep.has(`${id}.silver.webp`)) delete manifest[id];
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return { built, skipped };
};
