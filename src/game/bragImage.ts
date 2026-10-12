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

export const renderPoster = async (input: PosterInput): Promise<Blob> => {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  // The poster uses the app's web fonts; make sure they're loaded before drawing with them.
  await Promise.all([
    document.fonts?.load('110px "RubikGlitch"'),
    document.fonts?.load('96px "Lilita One"'),
    document.fonts?.load('800 40px "Archivo Variable"'),
  ]).catch(() => undefined);

  const logo = '"RubikGlitch", system-ui, sans-serif';
  const display = '"Lilita One", system-ui, sans-serif';
  const body = '"Archivo Variable", system-ui, -apple-system, "Segoe UI", sans-serif';

  // Binder black, like the app.
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);

  // Logo: card-stock white with a hard yellow misprint offset.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `104px ${logo}`;
  ctx.fillStyle = YELLOW;
  ctx.fillText('BRAINROT TCG', W / 2 + 8, 168);
  ctx.fillStyle = PAPER;
  ctx.fillText('BRAINROT TCG', W / 2, 160);

  // Set: its code in its colour, then the name.
  const code = (input.cert ?? '').split(' ')[0];
  ctx.font = `700 44px ${body}`;
  const nameWidth = ctx.measureText(input.setName).width;
  ctx.font = `800 30px ${body}`;
  const codeWidth = code ? ctx.measureText(code).width + 24 : 0;
  const total = codeWidth + (code ? 18 : 0) + nameWidth;
  let x = (W - total) / 2;
  if (code) {
    ctx.fillStyle = input.setColor ?? MUTED;
    roundRect(ctx, x, 200, codeWidth, 46, 6);
    ctx.fill();
    ctx.fillStyle = '#111111';
    ctx.textAlign = 'left';
    ctx.fillText(code, x + 12, 234);
    x += codeWidth + 18;
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = PAPER;
  ctx.font = `700 44px ${body}`;
  ctx.fillText(input.setName, x, 238);

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

  // Hand and score.
  const { hand, score } = input.score;
  ctx.textAlign = 'center';
  ctx.fillStyle = PAPER;
  fitFont(ctx, hand.name, W - 120, 104, 'normal', display);
  ctx.fillText(hand.name, W / 2, 1430);
  ctx.fillStyle = MUTED;
  ctx.font = `600 40px ${body}`;
  ctx.fillText(`${score.toLocaleString('en-US')} Brainrot Score`, W / 2, 1500);

  // A graded-card label: who, the cert, and the QR that re-checks it.
  const labelX = 70;
  const labelY = 1570;
  const labelW = W - 140;
  const labelH = 290;
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 4;
  roundRect(ctx, labelX, labelY, labelW, labelH, 6);
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.fillStyle = GREEN;
  ctx.font = `800 30px ${body}`;
  ctx.fillText('VERIFIABLE PULL', labelX + 40, labelY + 64);
  ctx.fillStyle = PAPER;
  fitFont(ctx, input.playerName, 520, 52, '800', body);
  ctx.fillText(input.playerName, labelX + 40, labelY + 134);
  ctx.fillStyle = MUTED;
  ctx.font = `600 32px ${body}`;
  ctx.fillText(`Cert ${input.fingerprint}${input.cert ? ` · ${input.cert}` : ''}`, labelX + 40, labelY + 186);
  ctx.font = `500 28px ${body}`;
  ctx.fillText('Scan to re-open this exact pack.', labelX + 40, labelY + 242);
  drawQr(ctx, input.url, labelX + labelW - 40 - 230, labelY + 30, 230);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), 'image/png'));
};
