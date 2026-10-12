/**
 * Link previews for shared pulls (see src/game/previewLinks.ts): after `vite build`, writes into
 * dist/p/ a 1200x630 preview image per card and a tiny page per card and hand whose preview is that
 * card. Opening a page forwards to the pull in its '#'.
 *
 *   npx tsx scripts/preview-pages.ts        (part of `npm run build`)
 *
 * SITE_URL (the site's absolute address, for the image) and BASE_PATH (its path) default to the
 * GitHub Pages address, like vite.config.ts.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ALL_SET_VERSIONS } from '../src/content/sets/index.ts';
import { POKER_HANDS, type HandKey } from '../src/engine/index.ts';
import { previewImagePath, previewPath, previewTitle } from '../src/game/previewLinks.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIST = `${ROOT}dist/`;
const BASE = process.env.BASE_PATH ?? '/BrainrotTCG/';
const SITE = process.env.SITE_URL ?? `https://evanlin23.github.io${BASE}`;
const W = 1200;
const H = 630;
const CARD_H = 580;
const CARD_W = Math.round((CARD_H * 687) / 1024);
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
<script>location.replace(${JSON.stringify(BASE)} + location.hash);</script>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#121114;color:#f2efe9;font:16px system-ui,sans-serif}a{color:#ffd23f}</style>
</head>
<body><a href="${escape(BASE)}">Open Brainrot TCG</a></body>
</html>
`;

// Binder black, like the app (docs/DESIGN.md): the card brings the colour.
const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#121114"/></svg>`);

// Every card of every set version, old ones included: their pulls still verify and still get shared.
const cards = new Map<string, { setId: string; setName: string; cardId: string; name: string; rarity: string }>();
for (const set of ALL_SET_VERSIONS) {
  for (const card of set.cards) cards.set(`${set.id}/${card.id}`, { setId: set.id, setName: set.name, cardId: card.id, name: card.name, rarity: card.rarity });
}

let pages = 0;
const written = new Map<string, string>();
for (const card of cards.values()) {
  const imagePath = previewImagePath(card.setId, card.cardId);
  mkdirSync(`${DIST}${imagePath.replace(/[^/]+$/, '')}`, { recursive: true });
  const art = await sharp(`${ROOT}src/content/sets/${card.setId}/cards/${card.cardId}.webp`).resize(CARD_W, CARD_H).toBuffer();
  await sharp(background)
    .composite([{ input: art, left: Math.round((W - CARD_W) / 2), top: Math.round((H - CARD_H) / 2) }])
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(`${DIST}${imagePath}`);

  const description = `${card.name} (${RARITY_NAMES[card.rarity] ?? card.rarity}). Open the link to re-check this exact pack on your own device.`;
  for (const hand of Object.keys(POKER_HANDS) as HandKey[]) {
    const path = previewPath(card.setId, card.cardId, hand);
    const what = `${card.setId}/${card.cardId}/${hand}`;
    if (written.has(path)) throw new Error(`Preview code collision: ${what} and ${written.get(path)} both map to ${path}`);
    written.set(path, what);
    mkdirSync(`${DIST}${path.replace(/[^/]+$/, '')}`, { recursive: true });
    writeFileSync(`${DIST}${path}`, page(previewTitle(hand, card.setName), description, `${SITE}${imagePath}`));
    pages++;
  }
}
console.log(`${cards.size} preview images and ${pages} preview pages in dist/p/ (images at ${SITE}p/img/)`);
