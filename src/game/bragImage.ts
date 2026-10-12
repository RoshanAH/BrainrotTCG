/**
 * A 1080×1920 (9:16) "pull poster" for TikTok, Reels, Shorts and Stories:
 * the five cards, the hand and value, who pulled it, and a QR code that opens
 * the verifiable pull. Drawn on a canvas from same-origin card images.
 */
import qrcode from 'qrcode-generator';
import type { PackScore } from '../engine';

interface PosterCard {
  image: string;
  name: string;
  isHolo: boolean;
}

interface PosterInput {
  cards: PosterCard[];
  score: PackScore;
  setName: string;
  playerName: string;
  fingerprint: string;
  url: string;
  /** Printed on the label like a grading cert, e.g. "SOS #42". */
  cert?: string;
  /** The set's colour, for its code chip. */
  setColor?: string;
}

const W = 1080;
const H = 1920;

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  // Older browsers (e.g. Firefox before 112) have no roundRect.
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const drawCard = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, card: PosterCard, cx: number, cy: number, w: number, angle: number) => {
  const h = (w * 1024) / 687;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  roundRect(ctx, -w / 2, -h / 2, w, h, 14);
  ctx.clip();
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  if (card.isHolo) {
    // Foil: the only gradient on the poster, as in the app.
    const shine = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    ['#ff7ac8', '#ffd23f', '#6ff2c6', '#7ab8ff', '#d38bff', '#ff7ac8'].forEach((c, i) => shine.addColorStop(i / 5, c));
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = shine;
    ctx.fillRect(-w / 2, -h / 2, w, h);
  }
  ctx.restore();
};

const drawQr = (ctx: CanvasRenderingContext2D, url: string, x: number, y: number, size: number) => {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 3;
  const cell = size / (n + quiet * 2);
  ctx.fillStyle = '#f3efe6';
  roundRect(ctx, x, y, size, size, 6);
  ctx.fill();
  ctx.fillStyle = '#121114';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(x + (c + quiet) * cell, y + (r + quiet) * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }
};

/** Set ctx.font to the largest size (<= size) at which the text fits. */
const fitFont = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, weight: string, family: string) => {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (ctx.measureText(text).width > maxWidth && s > 20) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${family}`;
  }
};

const INK = '#121114';
const PAPER = '#f3efe6';
const MUTED = '#b6b0ba';
const YELLOW = '#ffd23f';
const GREEN = '#5fd38d';
const LOGO_FONT = '"RubikGlitch", system-ui, sans-serif';
const DISPLAY_FONT = '"Lilita One", system-ui, sans-serif';
const BODY_FONT = '"Archivo Variable", system-ui, -apple-system, "Segoe UI", sans-serif';

/** A binder-black 1080x1920 canvas with the app's fonts loaded. */
const newCanvas = async () => {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  await Promise.all([
    document.fonts?.load('110px "RubikGlitch"'),
    document.fonts?.load('96px "Lilita One"'),
    document.fonts?.load('800 40px "Archivo Variable"'),
  ]).catch(() => undefined);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';
  return { canvas, ctx };
};

/** The logo (card-stock white with a hard yellow misprint offset), then the set's code and name. */
const drawHeader = (ctx: CanvasRenderingContext2D, setName: string, code: string, setColor?: string) => {
  ctx.textAlign = 'center';
  ctx.font = `104px ${LOGO_FONT}`;
  ctx.fillStyle = YELLOW;
  ctx.fillText('BRAINROT TCG', W / 2 + 8, 168);
  ctx.fillStyle = PAPER;
  ctx.fillText('BRAINROT TCG', W / 2, 160);

  ctx.font = `700 44px ${BODY_FONT}`;
  const nameWidth = ctx.measureText(setName).width;
  ctx.font = `800 30px ${BODY_FONT}`;
  const codeWidth = code ? ctx.measureText(code).width + 24 : 0;
  let x = (W - (codeWidth + (code ? 18 : 0) + nameWidth)) / 2;
  ctx.textAlign = 'left';
  if (code) {
    ctx.fillStyle = setColor ?? MUTED;
    roundRect(ctx, x, 200, codeWidth, 46, 6);
    ctx.fill();
    ctx.fillStyle = '#111111';
    ctx.fillText(code, x + 12, 234);
    x += codeWidth + 18;
  }
  ctx.fillStyle = PAPER;
  ctx.font = `700 44px ${BODY_FONT}`;
  ctx.fillText(setName, x, 238);
};

/** A graded-card label: what it is, who, the cert, and (when there's a link) the QR that re-checks it. */
const drawLabel = (
  ctx: CanvasRenderingContext2D,
  label: { kind: string; verified: boolean; name: string; cert: string; hint: string; url?: string },
) => {
  const x = 70;
  const y = 1570;
  const w = W - 140;
  const h = 290;
  ctx.strokeStyle = label.verified ? GREEN : MUTED;
  ctx.lineWidth = 4;
  roundRect(ctx, x, y, w, h, 6);
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.fillStyle = label.verified ? GREEN : MUTED;
  ctx.font = `800 30px ${BODY_FONT}`;
  ctx.fillText(label.kind.toUpperCase(), x + 40, y + 64);
  const textWidth = label.url ? 520 : w - 80;
  ctx.fillStyle = PAPER;
  fitFont(ctx, label.name, textWidth, 52, '800', BODY_FONT);
  ctx.fillText(label.name, x + 40, y + 134);
  ctx.fillStyle = MUTED;
  ctx.font = `600 32px ${BODY_FONT}`;
  ctx.fillText(label.cert, x + 40, y + 186);
  ctx.font = `500 28px ${BODY_FONT}`;
  ctx.fillText(label.hint, x + 40, y + 242);
  if (label.url) drawQr(ctx, label.url, x + w - 40 - 230, y + 30, 230);
};

const toPng = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), 'image/png'));

/** The whole pack: five cards, the hand and score, and a label that links to the verifiable pull. */
export const renderPoster = async (input: PosterInput): Promise<Blob> => {
  const { canvas, ctx } = await newCanvas();
  const code = (input.cert ?? '').split(' ')[0];
  drawHeader(ctx, input.setName, code, input.setColor);

  // Cards: three on top, two below, slightly fanned.
  const images = await Promise.all(input.cards.map((c) => loadImage(c.image)));
  const slots = [
    { x: 215, y: 620, a: -0.06 },
    { x: 540, y: 600, a: 0 },
    { x: 865, y: 620, a: 0.06 },
    { x: 380, y: 1070, a: -0.04 },
    { x: 700, y: 1070, a: 0.04 },
  ];
  input.cards.forEach((card, i) => {
    const slot = slots[i] ?? slots[slots.length - 1];
    drawCard(ctx, images[i], card, slot.x, slot.y, 300, slot.a);
  });

  const { hand, score } = input.score;
  ctx.textAlign = 'center';
  ctx.fillStyle = PAPER;
  fitFont(ctx, hand.name, W - 120, 104, 'normal', DISPLAY_FONT);
  ctx.fillText(hand.name, W / 2, 1430);
  ctx.fillStyle = MUTED;
  ctx.font = `600 40px ${BODY_FONT}`;
  ctx.fillText(`${score.toLocaleString('en-US')} Brainrot Score`, W / 2, 1500);

  drawLabel(ctx, {
    kind: 'Verifiable pull',
    verified: true,
    name: input.playerName,
    cert: `Cert ${input.fingerprint}${input.cert ? ` · ${input.cert}` : ''}`,
    hint: 'Scan to re-open this exact pack.',
    url: input.url,
  });
  return toPng(canvas);
};

export interface CardPosterInput {
  card: PosterCard & { rarityName: string; raritySymbol: string; rarityColor: string; number: string };
  setName: string;
  setCode: string;
  setColor?: string;
  playerName: string;
  fingerprint: string;
  /** The verifiable pull this card came from, if this device has one. */
  url?: string;
  cert?: string;
}

/** One card, big: its name, rarity and collector number, and the pull it came from when there is one. */
export const renderCardPoster = async (input: CardPosterInput): Promise<Blob> => {
  const { canvas, ctx } = await newCanvas();
  drawHeader(ctx, input.setName, input.setCode, input.setColor);

  const image = await loadImage(input.card.image);
  drawCard(ctx, image, input.card, W / 2, 790, 620, 0);

  ctx.textAlign = 'center';
  ctx.fillStyle = PAPER;
  fitFont(ctx, input.card.name, W - 120, 96, 'normal', DISPLAY_FONT);
  ctx.fillText(input.card.name, W / 2, 1385);
  const rarity = `${input.card.raritySymbol} ${input.card.rarityName}${input.card.isHolo ? ' · Holo' : ''} · ${input.setCode} ${input.card.number}`;
  ctx.font = `700 40px ${BODY_FONT}`;
  ctx.fillStyle = input.card.rarityColor;
  ctx.fillText(rarity, W / 2, 1470);

  drawLabel(ctx, {
    kind: input.url ? 'Verifiable pull' : 'From the collection of',
    verified: !!input.url,
    name: input.playerName,
    cert: input.url ? `Cert ${input.fingerprint}${input.cert ? ` · ${input.cert}` : ''}` : `#${input.fingerprint}`,
    hint: input.url ? 'Scan to re-open the pack it came from.' : 'Pulled before verifiable pulls existed.',
    url: input.url,
  });
  return toPng(canvas);
};
