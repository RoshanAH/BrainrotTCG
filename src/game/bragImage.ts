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
  ctx.roundRect(x, y, w, h, r);
};

const drawCard = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, card: PosterCard, cx: number, cy: number, w: number, angle: number) => {
  const h = (w * 1024) / 687;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.shadowColor = card.isHolo ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = card.isHolo ? 40 : 24;
  roundRect(ctx, -w / 2, -h / 2, w, h, 18);
  ctx.clip();
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  if (card.isHolo) {
    const shine = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    ['#ff004c', '#ffe14d', '#2bff6a', '#29f0ff', '#b44dff', '#ff004c'].forEach((c, i) => shine.addColorStop(i / 5, c));
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
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, x, y, size, size, 18);
  ctx.fill();
  ctx.fillStyle = '#12002a';
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

export const renderPoster = async (input: PosterInput): Promise<Blob> => {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  // The display font is a CSS web font; make sure it's loaded before drawing with it.
  await Promise.all([document.fonts?.load('110px "RubikGlitch"'), document.fonts?.load('96px "RubikGlitch"')]).catch(() => undefined);

  // Background: deep purple with neon glows and stars.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#3b0a6b');
  bg.addColorStop(0.5, '#1d0545');
  bg.addColorStop(1, '#0b0120');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  for (const [gx, gy, color] of [[150, 300, '#ff3df2'], [930, 1500, '#29f0ff'], [900, 250, '#ffe14d']] as const) {
    const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, 700);
    glow.addColorStop(0, `${color}55`);
    glow.addColorStop(1, `${color}00`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 90; i++) {
    const x = (i * 7919) % W;
    const y = (i * 104729) % H;
    ctx.fillRect(x, y, (i % 3) + 1, (i % 3) + 1);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const display = '"RubikGlitch", system-ui, sans-serif';
  const body = 'system-ui, -apple-system, "Segoe UI", sans-serif';

  // Header
  ctx.fillStyle = '#ffffff';
  ctx.font = `110px ${display}`;
  ctx.fillText('BRAINROT TCG', W / 2, 170);
  ctx.fillStyle = '#29f0ff';
  fitFont(ctx, input.setName.toUpperCase(), W - 160, 44, '800', body);
  ctx.fillText(input.setName.toUpperCase(), W / 2, 240);

  // Cards: three on top, two below, slightly fanned.
  const images = await Promise.all(input.cards.map((c) => loadImage(c.image)));
  const slots = [
    { x: 215, y: 610, a: -0.08 },
    { x: 540, y: 590, a: 0 },
    { x: 865, y: 610, a: 0.08 },
    { x: 380, y: 1060, a: -0.05 },
    { x: 700, y: 1060, a: 0.05 },
  ];
  input.cards.forEach((card, i) => {
    const slot = slots[i] ?? slots[slots.length - 1];
    drawCard(ctx, images[i], card, slot.x, slot.y, 300, slot.a);
  });

  // Hand + value
  const { hand, flexValue } = input.score;
  const handText = hand.multiplier > 1 ? `${hand.name.toUpperCase()} ×${hand.multiplier}` : 'NO MATCHES';
  ctx.fillStyle = '#ffd700';
  fitFont(ctx, handText, W - 120, 96, 'normal', display);
  ctx.fillText(handText, W / 2, 1440);
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 54px ${body}`;
  ctx.fillText(`${flexValue.toLocaleString('en-US')} brainrot value`, W / 2, 1520);

  // Who + QR
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  fitFont(ctx, input.playerName, 560, 48, '800', body);
  ctx.fillText(input.playerName, 90, 1660);
  ctx.fillStyle = '#29f0ff';
  ctx.font = `600 38px ui-monospace, monospace`;
  ctx.fillText(`#${input.fingerprint}`, 90, 1715);
  ctx.fillStyle = '#cccccc';
  ctx.font = `500 30px ${body}`;
  ctx.fillText('Scan to verify this pull.', 90, 1790);
  ctx.fillText('Real pulls can’t be faked.', 90, 1832);
  drawQr(ctx, input.url, W - 90 - 300, 1580, 300);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), 'image/png'));
};
