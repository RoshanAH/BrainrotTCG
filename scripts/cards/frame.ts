/**
 * Builds the SVG for a complete card: neon frame, title banner, art window,
 * caption box and set footer. The art itself is passed in as an image href
 * (data URI), so any art source (hand-made SVG, Gemini-app PNG, ...) gets the
 * same frame and the cards stay visually consistent.
 */
import opentype from 'opentype.js';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

export const CARD_WIDTH = 687;
export const CARD_HEIGHT = 1024;

/** Art window, in card coordinates. Art should be drawn for this aspect ratio. */
export const ART_BOX = { x: 100, y: 158, width: 487, height: 560 } as const;

export type Rarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'BRAINROT';

export interface CardFrameInput {
  id: string;
  title: string;
  caption: string;
  rarity: Rarity;
  setName: string;
  number: number;
  total: number;
  /** data: URI of the art image */
  artHref: string;
}

const fontsDir = fileURLToPath(new URL('./fonts/', import.meta.url));
const loadFont = (file: string) => {
  const buf = readFileSync(fontsDir + file);
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};
const titleFont = loadFont('LuckiestGuy-Regular.ttf');
const bodyFont = loadFont('LilitaOne-Regular.ttf');

const RARITY_COLORS: Record<Rarity, string> = {
  COMMON: '#c8c8d0',
  UNCOMMON: '#2bff6a',
  RARE: '#2e8bff',
  EPIC: '#b44dff',
  LEGENDARY: '#ff9d1a',
  BRAINROT: 'url(#frame-rainbow)',
};

const INK = '#12002a';

/** Small deterministic PRNG so each card gets its own decoration layout. */
const seededRandom = (seed: string) => {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
};

const fmt = (n: number) => Number(n.toFixed(1));

const starPath = (cx: number, cy: number, points: number, outer: number, inner: number, rot: number) => {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (Math.PI * i) / points;
    pts.push(`${fmt(cx + r * Math.sin(a))},${fmt(cy - r * Math.cos(a))}`);
  }
  return `M${pts.join('L')}Z`;
};

const bolt = (x: number, y: number, s: number, rot: number) =>
  `<path transform="translate(${fmt(x)} ${fmt(y)}) rotate(${fmt(rot)}) scale(${fmt(s)})" d="M2-14L-7 2L-1 2L-4 14L8-4L1-4L5-14Z" fill="#ffe14d" stroke="${INK}" stroke-width="${fmt(2 / s)}" stroke-linejoin="round"/>`;

const heart = (x: number, y: number, s: number, rot: number) =>
  `<path transform="translate(${fmt(x)} ${fmt(y)}) rotate(${fmt(rot)}) scale(${fmt(s)})" d="M0 6C-9-1-10-8-5-10C-2-11 0-8 0-7C0-8 2-11 5-10C10-8 9-1 0 6Z" fill="#ff4fd8" stroke="${INK}" stroke-width="${fmt(1.6 / s)}"/>`;

const skull = (x: number, y: number, s: number, rot: number) =>
  `<g transform="translate(${fmt(x)} ${fmt(y)}) rotate(${fmt(rot)}) scale(${fmt(s)})" stroke="${INK}" stroke-width="${fmt(1.4 / s)}">` +
  `<path d="M-8 2C-10-8-4-12 0-12C4-12 10-8 8 2L5 4L5 8L-5 8L-5 4Z" fill="#fff"/>` +
  `<circle cx="-3.5" cy="-2" r="2.6" fill="${INK}"/><circle cx="3.5" cy="-2" r="2.6" fill="${INK}"/></g>`;

const decorations = (rand: () => number) => {
  const out: string[] = [];
  const colors = ['#ffe14d', '#29f0ff', '#ff4fd8', '#b6ff3d', '#ffffff'];
  for (let i = 0; i < 110; i++) {
    const x = rand() * CARD_WIDTH;
    const y = rand() * CARD_HEIGHT;
    const kind = rand();
    const rot = rand() * 360;
    if (kind < 0.3) {
      const r = 18 + rand() * 34;
      const color = colors[Math.floor(rand() * 3)];
      out.push(`<path d="${starPath(x, y, 8 + Math.floor(rand() * 5), r, r * 0.5, rot)}" fill="${color}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`);
    } else if (kind < 0.55) {
      const r = 6 + rand() * 9;
      out.push(`<path d="${starPath(x, y, 5, r, r * 0.45, rot)}" fill="${colors[Math.floor(rand() * colors.length)]}" stroke="${INK}" stroke-width="1.5"/>`);
    } else if (kind < 0.72) {
      out.push(bolt(x, y, 1.6 + rand() * 1.6, rot / 4 - 45));
    } else if (kind < 0.86) {
      out.push(heart(x, y, 1 + rand() * 1.3, rot / 6 - 30));
    } else if (kind < 0.95) {
      out.push(skull(x, y, 1 + rand() * 0.9, rot / 8 - 22));
    } else {
      out.push(`<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(3 + rand() * 6)}" fill="${colors[Math.floor(rand() * colors.length)]}" stroke="${INK}" stroke-width="1.5"/>`);
    }
  }
  return out.join('');
};

/** Big accents drawn on top of the panels at fixed anchors, like the busy Genesis frames. */
const accents = (rand: () => number) => {
  const { x, y, width, height } = ART_BOX;
  const out: string[] = [];
  const burstColors = ['#29f0ff', '#ff3df2', '#ffe14d', '#b6ff3d'];
  const corners = [[x + 4, y + 4], [x + width - 4, y + 4], [x + 4, y + height - 4], [x + width - 4, y + height - 4]];
  corners.forEach(([cx, cy], i) => {
    const r = 52 + rand() * 14;
    out.push(`<path d="${starPath(cx, cy, 10 + Math.floor(rand() * 4), r, r * 0.52, rand())}" fill="${burstColors[(i + Math.floor(rand() * 4)) % 4]}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`);
    out.push(`<path d="${starPath(cx, cy, 5, r * 0.38, r * 0.17, rand())}" fill="#ffffff" stroke="${INK}" stroke-width="2"/>`);
  });
  out.push(bolt(50, y + height * 0.36, 3.4, -20), bolt(637, y + height * 0.62, 3.4, 20));
  out.push(bolt(52, y + height * 0.78, 2.4, 15), bolt(635, y + height * 0.2, 2.4, -15));
  out.push(heart(52, y + height * 0.57, 2.4, -15), heart(635, y + height * 0.42, 2.4, 15));
  out.push(skull(50, y + height * 0.15, 2, -12), skull(637, y + height * 0.84, 2, 12));
  ['skull', 'bolt', 'heart', 'bolt', 'skull'].forEach((kind, i) => {
    const sx = 160 + i * 92;
    if (kind === 'skull') out.push(skull(sx, 742, 1.9, 0));
    else if (kind === 'bolt') out.push(bolt(sx, 742, 1.6, 0));
    else out.push(heart(sx, 742, 1.8, 0));
  });
  out.push(`<path d="${starPath(88, 778, 9, 34, 17, 0.3)}" fill="#ffe14d" stroke="${INK}" stroke-width="3"/>`);
  out.push(`<path d="${starPath(599, 874, 9, 34, 17, 0.1)}" fill="#29f0ff" stroke="${INK}" stroke-width="3"/>`);
  return out.join('');
};

/**
 * Serialise opentype path commands ourselves: opentype.js 2.0 sometimes leaves a
 * quadratic control point's x undefined (TrueType "same x as previous point"),
 * which its own toPathData() prints as NaN and truncates the path.
 */
const toPathData = (commands: opentype.PathCommand[]) => {
  let px = 0;
  const num = (v: number | undefined, fallback: number) => fmt(Number.isFinite(v) ? (v as number) : fallback);
  return commands
    .map((c) => {
      switch (c.type) {
        case 'M':
        case 'L':
          px = num(c.x, px);
          return `${c.type}${px} ${fmt(c.y)}`;
        case 'Q': {
          const x1 = num(c.x1, px);
          px = num(c.x, x1);
          return `Q${x1} ${fmt(c.y1)} ${px} ${fmt(c.y)}`;
        }
        case 'C': {
          const x1 = num(c.x1, px);
          const x2 = num(c.x2, x1);
          px = num(c.x, x2);
          return `C${x1} ${fmt(c.y1)} ${x2} ${fmt(c.y2)} ${px} ${fmt(c.y)}`;
        }
        default:
          return 'Z';
      }
    })
    .join('');
};

/** Convert text to an outlined path, centred on (cx, baseline). */
const textPath = (font: opentype.Font, text: string, cx: number, baseline: number, size: number) => {
  const width = font.getAdvanceWidth(text, size);
  return toPathData(font.getPath(text, cx - width / 2, baseline, size).commands);
};

/** Largest font size (<= max) at which the text fits the width. */
const fitSize = (font: opentype.Font, text: string, maxWidth: number, max: number) => {
  const atMax = font.getAdvanceWidth(text, max);
  return atMax <= maxWidth ? max : Math.floor((max * maxWidth) / atMax);
};

/** Split a caption into one or two balanced lines. */
const captionLines = (font: opentype.Font, text: string, maxWidth: number) => {
  const oneLine = fitSize(font, text, maxWidth, 46);
  const words = text.split(/\s+/);
  if (oneLine >= 34 || words.length < 2) return { lines: [text], size: Math.max(oneLine, 20) };
  let best = { lines: [text], size: oneLine };
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    const size = Math.min(38, ...lines.map((l) => fitSize(font, l, maxWidth, 38)));
    if (size > best.size) best = { lines, size };
  }
  return best;
};

const outlinedText = (d: string, fill: string, stroke: string, strokeWidth: number) =>
  `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>` +
  `<path d="${d}" fill="${fill}"/>`;

export const buildCardSvg = (card: CardFrameInput): string => {
  const rand = seededRandom(card.id);
  const rarityColor = RARITY_COLORS[card.rarity];
  const { x: ax, y: ay, width: aw, height: ah } = ART_BOX;

  const titleSize = fitSize(titleFont, card.title.toUpperCase(), 410, 50);
  const title = textPath(titleFont, card.title.toUpperCase(), CARD_WIDTH / 2, 88 + titleSize * 0.36, titleSize);

  const cap = captionLines(bodyFont, card.caption, 445);
  const capBox = { x: 96, y: 770, w: 495, h: 112 };
  const capMid = capBox.y + capBox.h / 2;
  const capPaths = cap.lines
    .map((line, i) => {
      const offset = (i - (cap.lines.length - 1) / 2) * cap.size * 1.08;
      return textPath(bodyFont, line, CARD_WIDTH / 2, capMid + offset + cap.size * 0.35, cap.size);
    })
    .join(' ');

  const footerText = `${card.setName.toUpperCase()}  ·  ${String(card.number).padStart(3, '0')}/${String(card.total).padStart(3, '0')}`;
  const footerSize = fitSize(bodyFont, footerText, 360, 24);
  const footer = textPath(bodyFont, footerText, CARD_WIDTH / 2, 978, footerSize);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
<defs>
  <linearGradient id="frame-bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#4a0f86"/><stop offset="0.5" stop-color="#2a0759"/><stop offset="1" stop-color="#14022f"/>
  </linearGradient>
  <radialGradient id="frame-glow-a" cx="0.15" cy="0.2" r="0.6"><stop offset="0" stop-color="#ff3df2" stop-opacity="0.55"/><stop offset="1" stop-color="#ff3df2" stop-opacity="0"/></radialGradient>
  <radialGradient id="frame-glow-b" cx="0.85" cy="0.8" r="0.6"><stop offset="0" stop-color="#29f0ff" stop-opacity="0.45"/><stop offset="1" stop-color="#29f0ff" stop-opacity="0"/></radialGradient>
  <linearGradient id="frame-neon" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ff3df2"/><stop offset="0.5" stop-color="#29f0ff"/><stop offset="1" stop-color="#ffe14d"/>
  </linearGradient>
  <linearGradient id="frame-rainbow" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ff004c"/><stop offset="0.2" stop-color="#ff9d1a"/><stop offset="0.4" stop-color="#ffe14d"/>
    <stop offset="0.6" stop-color="#2bff6a"/><stop offset="0.8" stop-color="#2e8bff"/><stop offset="1" stop-color="#b44dff"/>
  </linearGradient>
  <linearGradient id="frame-banner" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffc2f0"/><stop offset="1" stop-color="#ff5fd2"/>
  </linearGradient>
  <clipPath id="frame-art-clip"><rect x="${ax}" y="${ay}" width="${aw}" height="${ah}" rx="20"/></clipPath>
  <clipPath id="frame-card-clip"><rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="30"/></clipPath>
</defs>
<g clip-path="url(#frame-card-clip)">
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#frame-bg)"/>
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#frame-glow-a)"/>
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#frame-glow-b)"/>
  ${decorations(rand)}
</g>
<rect x="8" y="8" width="${CARD_WIDTH - 16}" height="${CARD_HEIGHT - 16}" rx="26" fill="none" stroke="${INK}" stroke-width="10"/>
<rect x="8" y="8" width="${CARD_WIDTH - 16}" height="${CARD_HEIGHT - 16}" rx="26" fill="none" stroke="url(#frame-neon)" stroke-width="6"/>
<rect x="24" y="24" width="${CARD_WIDTH - 48}" height="${CARD_HEIGHT - 48}" rx="18" fill="none" stroke="${rarityColor}" stroke-width="4" stroke-dasharray="18 10"/>

<rect x="${ax}" y="${ay}" width="${aw}" height="${ah}" rx="20" fill="#0b0018"/>
<image href="${card.artHref}" x="${ax}" y="${ay}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid slice" clip-path="url(#frame-art-clip)"/>
<rect x="${ax}" y="${ay}" width="${aw}" height="${ah}" rx="20" fill="none" stroke="${INK}" stroke-width="14"/>
<rect x="${ax}" y="${ay}" width="${aw}" height="${ah}" rx="20" fill="none" stroke="#29f0ff" stroke-width="7"/>
<rect x="${ax + 6}" y="${ay + 6}" width="${aw - 12}" height="${ah - 12}" rx="15" fill="none" stroke="#ffffff" stroke-opacity="0.7" stroke-width="2"/>
${accents(rand)}

<path d="M118 48H569L606 64L584 88L606 112L569 128H118L81 112L103 88L81 64Z" fill="#c23aa8" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
<path d="M60 70L104 60L100 116L60 106L76 88Z" fill="#29f0ff" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
<path d="M627 70L583 60L587 116L627 106L611 88Z" fill="#29f0ff" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
<rect x="118" y="44" width="451" height="88" rx="16" fill="url(#frame-banner)" stroke="${INK}" stroke-width="6"/>
<rect x="128" y="52" width="431" height="72" rx="11" fill="none" stroke="#ffffff" stroke-opacity="0.8" stroke-width="2.5"/>
${outlinedText(title, '#2a0845', '#ffffff', 9)}

<rect x="${capBox.x}" y="${capBox.y}" width="${capBox.w}" height="${capBox.h}" rx="18" fill="${INK}" stroke="${INK}" stroke-width="12"/>
<rect x="${capBox.x}" y="${capBox.y}" width="${capBox.w}" height="${capBox.h}" rx="18" fill="#fff0fa" stroke="#ff5fd2" stroke-width="6"/>
<path d="${capPaths}" fill="#2a0845"/>

<path d="M${CARD_WIDTH / 2} 894L${CARD_WIDTH / 2 + 22} 916L${CARD_WIDTH / 2} 938L${CARD_WIDTH / 2 - 22} 916Z" fill="${rarityColor}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
<rect x="${CARD_WIDTH / 2 - 200}" y="950" width="400" height="40" rx="20" fill="${INK}" fill-opacity="0.75"/>
${outlinedText(footer, '#ffffff', INK, 4)}
</svg>`;
};
