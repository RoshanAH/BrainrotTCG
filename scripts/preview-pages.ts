/**
 * Link previews for shared pulls (see src/game/previewLinks.ts): after `vite build`, writes into
 * dist/p/ a 1200x630 preview image and a tiny page for every hand each set's cards can make: the
 * cards that make it face up, the rest of the pack face down. Opening a page forwards to the pull
 * in its '#'. The one-card pages earlier Full House and Two Pair links went to are kept.
 *
 *   npx tsx scripts/preview-pages.ts        (part of `npm run build`)
 *
 * Drawing them all takes a couple of minutes, so they're kept between builds in .cache/previews/
 * (CI caches it too), named by a hash of everything that decides them, and only new or changed ones
 * are drawn.
 *
 * SITE_URL (the site's absolute address, for the image) and BASE_PATH (its path) default to the
 * GitHub Pages address, like vite.config.ts. After a move, the deploy also writes the pages (without
 * images, OUT_DIR=<dir> PAGES_ONLY=1) for the old address, where they forward through its redirect
 * page, so old shared links keep their preview.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ALL_SET_VERSIONS } from '../src/content/sets/index.ts';
import { POKER_HANDS, type HandKey } from '../src/engine/index.ts';
import { cardPreviewPath, PREVIEW_COPIES, previewImagePath, previewPath, previewTitle, singleCardImagePath, type Preview } from '../src/game/previewLinks.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIST = process.env.OUT_DIR ? `${process.env.OUT_DIR.replace(/\/$/, '')}/` : `${ROOT}dist/`;
const PAGES_ONLY = process.env.PAGES_ONLY === '1';
const BASE = process.env.BASE_PATH ?? '/BrainrotTCG/';
const SITE = process.env.SITE_URL ?? `https://evanlin23.github.io${BASE}`;
const W = 1200;
const H = 630;
const CARD_H = 500;
const CARD_W = Math.round((CARD_H * 687) / 1024);
const PACK_SIZE = 5;
// Five cards in an overlapping row, the first one fully covered by none.
const MARGIN = 60;
const STEP = Math.round((W - 2 * MARGIN - CARD_W) / (PACK_SIZE - 1));
// The one-card picture of the earlier pages.
const SINGLE_H = 580;
const SINGLE_W = Math.round((SINGLE_H * 687) / 1024);
const RARITY_NAMES: Record<string, string> = { COMMON: 'Common', UNCOMMON: 'Uncommon', RARE: 'Rare', EPIC: 'Epic', LEGENDARY: 'Legendary', BRAINROT: 'Brainrot' };

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const page = (title: string, description: string, image: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · Brainrot TCG</title>
<meta name="description" content="${escape(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Brainrot TCG">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:image" content="${escape(image)}">
<meta property="og:image:width" content="${W}">
<meta property="og:image:height" content="${H}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#121114">
<meta name="robots" content="noindex">
<script>location.replace(${JSON.stringify(BASE)} + (location.hash.indexOf('#/pull/') === 0 ? location.hash : ''));</script>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#121114;color:#f2efe9;font:16px system-ui,sans-serif}a{color:#ffd23f}</style>
</head>
<body><a href="${escape(BASE)}">Open Brainrot TCG</a></body>
</html>
`;

// Binder black, like the app (docs/DESIGN.md): the card brings the colour.
const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#121114"/></svg>`);

// Each set's cards, across its versions: old versions' pulls still verify and still get shared.
const sets = new Map<string, { name: string; cards: Map<string, { name: string; rarity: string }> }>();
for (const set of ALL_SET_VERSIONS) {
  const entry = sets.get(set.id) ?? { name: set.name, cards: new Map() };
  entry.name = set.name;
  for (const card of set.cards) entry.cards.set(card.id, { name: card.name, rarity: card.rarity });
  sets.set(set.id, entry);
}

/** Every hand a set's cards can make, by the cards that make it. */
const handsOf = (setId: string, ids: readonly string[]): Preview[] =>
  (Object.keys(POKER_HANDS) as HandKey[]).flatMap((hand): Preview[] => {
    if (hand === 'FULL_HOUSE') return ids.flatMap((a) => ids.filter((b) => b !== a).map((b) => ({ setId, cardIds: [a, b], hand })));
    if (hand === 'TWO_PAIR') return ids.flatMap((a, i) => ids.slice(i + 1).map((b) => ({ setId, cardIds: [a, b], hand })));
    return ids.map((a) => ({ setId, cardIds: [a], hand }));
  });

const art = (setId: string, cardId: string) => `${ROOT}src/content/sets/${setId}/cards/${cardId}.webp`;
const faces = new Map<string, Promise<Buffer>>();
const face = (file: string) => {
  if (!faces.has(file)) faces.set(file, sharp(file).resize(CARD_W, CARD_H).png().toBuffer());
  return faces.get(file)!;
};
const CARD_BACK = `${ROOT}src/assets/images/card_back.webp`;

const CACHE = `${ROOT}.cache/previews/`;
const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const SCRIPT = sha(readFileSync(fileURLToPath(import.meta.url)));
const fileHashes = new Map<string, string>();
const fileHash = (file: string) => {
  if (!fileHashes.has(file)) fileHashes.set(file, sha(readFileSync(file)));
  return fileHashes.get(file)!;
};
const cacheUsed = new Set<string>();
let drawn = 0;

const writeImage = async (path: string, layers: { file: string; left: number; top: number; size?: [number, number] }[]) => {
  const name = `${sha([SCRIPT, ...layers.map((l) => `${fileHash(l.file)}@${l.left},${l.top},${l.size ?? ''}`)].join('|'))}.jpg`;
  cacheUsed.add(name);
  if (!existsSync(`${CACHE}${name}`)) {
    const inputs = await Promise.all(layers.map(async (l) => ({ input: l.size ? await sharp(l.file).resize(...l.size).toBuffer() : await face(l.file), left: l.left, top: l.top })));
    await sharp(background).composite(inputs).jpeg({ quality: 75, mozjpeg: true }).toFile(`${CACHE}${name}.tmp`);
    renameSync(`${CACHE}${name}.tmp`, `${CACHE}${name}`);
    drawn++;
  }
  mkdirSync(`${DIST}${path.replace(/[^/]+$/, '')}`, { recursive: true });
  copyFileSync(`${CACHE}${name}`, `${DIST}${path}`);
};

/** The pack as five cards: each face-up card as many times as the hand has it, then card backs. */
const packImage = (preview: Preview) => {
  const files = preview.cardIds.flatMap((id, i) => Array<string>(PREVIEW_COPIES[preview.hand][i]).fill(art(preview.setId, id)));
  while (files.length < PACK_SIZE) files.push(CARD_BACK);
  return writeImage(
    previewImagePath(preview),
    files.map((file, i) => ({ file, left: MARGIN + i * STEP, top: Math.round((H - CARD_H) / 2) })),
  );
};

const singleImage = (setId: string, cardId: string) =>
  writeImage(singleCardImagePath(setId, cardId), [
    { file: art(setId, cardId), left: Math.round((W - SINGLE_W) / 2), top: Math.round((H - SINGLE_H) / 2), size: [SINGLE_W, SINGLE_H] },
  ]);

const rarityName = (rarity: string) => RARITY_NAMES[rarity] ?? rarity;
const SEE = 'Open the link to see the whole pack and re-check it on your own device.';

const written = new Map<string, string>();
const writePage = (path: string, what: string, title: string, description: string, imagePath: string) => {
  if (written.has(path)) throw new Error(`Preview code collision: ${what} and ${written.get(path)} both map to ${path}`);
  written.set(path, what);
  mkdirSync(`${DIST}${path.replace(/[^/]+$/, '')}`, { recursive: true });
  writeFileSync(`${DIST}${path}`, page(title, description, `${SITE}${imagePath}`));
};

const images: (() => Promise<void>)[] = [];
for (const [setId, set] of sets) {
  const ids = [...set.cards.keys()].sort();
  for (const preview of handsOf(setId, ids)) {
    const cards = preview.cardIds.map((id) => set.cards.get(id)!);
    const description =
      preview.hand === 'NO_MATCH'
        ? `Best card: ${cards[0].name} (${rarityName(cards[0].rarity)}). ${SEE}`
        : `${cards.map((c, i) => `${PREVIEW_COPIES[preview.hand][i]}× ${c.name}`).join(' and ')}. ${SEE}`;
    writePage(previewPath(preview), `${setId}/${preview.cardIds.join('+')}/${preview.hand}`, previewTitle(preview.hand, set.name), description, previewImagePath(preview));
    images.push(() => packImage(preview));
  }
  for (const [cardId, card] of set.cards) {
    const image = singleCardImagePath(setId, cardId);
    // A card shared on its own.
    writePage(cardPreviewPath(setId, cardId), `${setId}/${cardId}`, `${card.name} from ${set.name}`, `${rarityName(card.rarity)}. Open the link to see the pack it came from and re-check it on your own device.`, image);
    // The one-card pages earlier Full House and Two Pair links point to (other hands' one-card
    // pages are the new ones, at the same address).
    for (const hand of ['FULL_HOUSE', 'TWO_PAIR'] as const) {
      writePage(previewPath({ setId, cardIds: [cardId], hand }), `${setId}/${cardId}/${hand}`, previewTitle(hand, set.name), `${card.name} (${rarityName(card.rarity)}). ${SEE}`, image);
    }
    images.push(() => singleImage(setId, cardId));
  }
}

if (!PAGES_ONLY) {
  mkdirSync(CACHE, { recursive: true });
  // A few at a time: each is quick, and sharp spreads one over the cores already.
  const queue = [...images];
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) await next();
  }));
  // Drop pictures nothing uses any more, so the cache doesn't grow forever.
  for (const name of readdirSync(CACHE)) if (!cacheUsed.has(name)) rmSync(`${CACHE}${name}`);
}
console.log(`${PAGES_ONLY ? 0 : `${images.length} (${drawn} drawn, the rest cached)`} preview images and ${written.size} preview pages in ${DIST}p/ (images at ${SITE}p/img/, forwarding to ${BASE})`);
