/**
 * Card image building, shared by `build.ts` (all registered sets) and
 * `preview.ts` (one set folder, used while drawing art).
 *
 * Art lookup in `src/content/sets/<set>/art/`, first match wins:
 *   <card>.card.{png,jpg,jpeg,webp}  a complete card (e.g. a full Gemini card), used as-is
 *   <card>.{png,jpg,jpeg,webp}       illustration only (e.g. from the Gemini app), framed by code
 *   <card>.svg                       hand-made SVG illustration, framed by code
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp, { type Sharp } from 'sharp';
import type { CardDefinition, SetDefinition } from '../../src/engine/index.ts';
import { CARD_HEIGHT, CARD_WIDTH, composeCard, rasteriseSvgArt } from './frame.ts';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const SETS_DIR = `${ROOT}src/content/sets`;
const FRAME_SOURCE_HASH = createHash('sha256')
  .update(readFileSync(new URL('./frame.ts', import.meta.url)))
  .update(readFileSync(new URL('./text.ts', import.meta.url)))
  .update(readFileSync(new URL('./templates/genesis-frame.png', import.meta.url)))
  .digest('hex');

type ArtSource = { kind: 'full' | 'raster' | 'svg'; path: string };

export const findArt = (setId: string, cardId: string): ArtSource | undefined => {
  const dir = `${SETS_DIR}/${setId}/art`;
  for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
    if (existsSync(`${dir}/${cardId}.card.${ext}`)) return { kind: 'full', path: `${dir}/${cardId}.card.${ext}` };
  }
  for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
    if (existsSync(`${dir}/${cardId}.${ext}`)) return { kind: 'raster', path: `${dir}/${cardId}.${ext}` };
  }
  if (existsSync(`${dir}/${cardId}.svg`)) return { kind: 'svg', path: `${dir}/${cardId}.svg` };
  return undefined;
};


export interface BuildResult {
  built: string[];
  skipped: number;
  missing: string[];
}

/**
 * Build the card images of one set. `extraCards` are cards that only exist in
 * older versions of the set; old proofs can still contain them.
 */
export const buildSetCards = async (set: SetDefinition, extraCards: CardDefinition[] = [], force = false): Promise<BuildResult> => {
  const outDir = `${SETS_DIR}/${set.id}/cards`;
  mkdirSync(outDir, { recursive: true });
  const manifestPath = `${outDir}/.manifest.json`;
  const manifest: Record<string, string> = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
  const result: BuildResult = { built: [], skipped: 0, missing: [] };

  for (const card of [...set.cards, ...extraCards.filter((c) => !set.cards.some((s) => s.id === c.id))]) {
    const art = findArt(set.id, card.id);
    if (!art) {
      result.missing.push(`${set.id}/${card.id}`);
      continue;
    }
    const meta = { title: card.name, caption: card.caption ?? '' };
    const inputHash = createHash('sha256')
      .update(readFileSync(art.path))
      .update(JSON.stringify({ kind: art.kind, meta: art.kind === 'full' ? null : meta, frame: art.kind === 'full' ? null : FRAME_SOURCE_HASH }))
      .digest('hex');
    const outPath = `${outDir}/${card.id}.webp`;
    if (!force && manifest[card.id] === inputHash && existsSync(outPath)) {
      result.skipped++;
      continue;
    }

    let image: Sharp;
    if (art.kind === 'full') {
      image = sharp(art.path).resize(CARD_WIDTH, CARD_HEIGHT, { fit: 'cover' });
    } else {
      const source = art.kind === 'svg' ? rasteriseSvgArt(readFileSync(art.path)) : readFileSync(art.path);
      image = sharp(await composeCard(source, card.name, card.caption ?? ''));
    }
    await image.webp({ quality: 84 }).toFile(outPath);
    manifest[card.id] = inputHash;
    result.built.push(`${set.id}/${card.id} (${art.kind})`);
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return result;
};

/** Grid of a set's built cards, for reviewing art. */
export const contactSheet = async (set: SetDefinition, outPath: string, columns = 6) => {
  const w = 343;
  const h = 512;
  const gap = 12;
  const files = set.cards.map((c) => `${SETS_DIR}/${set.id}/cards/${c.id}.webp`).filter((f) => existsSync(f));
  const rows = Math.ceil(files.length / columns);
  const tiles = await Promise.all(files.map((f) => sharp(f).resize(w, h).png().toBuffer()));
  await sharp({ create: { width: columns * (w + gap) + gap, height: rows * (h + gap) + gap, channels: 4, background: '#0d0221' } })
    .composite(tiles.map((input, i) => ({ input, left: gap + (i % columns) * (w + gap), top: gap + Math.floor(i / columns) * (h + gap) })))
    .png()
    .toFile(outPath);
};
