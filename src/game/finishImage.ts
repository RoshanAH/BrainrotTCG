import type { Finish } from '../engine';
import frameMaskUrl from '../assets/images/card-frame-mask.webp';

type RGB = readonly [number, number, number];

// Preserve the frame's shading and outlines, replacing its inks with each metal's tones.
const PALETTES: Record<Finish, { mid: RGB; light: RGB }> = {
  SILVER: { mid: [150, 150, 150], light: [245, 245, 245] },
  GOLD: { mid: [198, 150, 38], light: [255, 240, 180] },
  PLATINUM: { mid: [144, 180, 197], light: [235, 250, 255] },
  DIAMOND: { mid: [170, 165, 221], light: [219, 253, 255] },
  NEON: { mid: [35, 190, 200], light: [200, 255, 250] },
  COSMIC: { mid: [100, 55, 185], light: [225, 200, 255] },
  EMBER: { mid: [210, 65, 20], light: [255, 225, 110] },
};

/** Recolour only printed frame pixels; artwork and transparency stay exactly as supplied. */
export const recolorFrame = (pixels: Uint8ClampedArray, mask: Uint8ClampedArray, finish: Finish, width = pixels.length / 4): void => {
  if (pixels.length !== mask.length || pixels.length % 4) throw new Error('Frame mask dimensions do not match the card');
  for (let i = 0; i < pixels.length; i += 4) {
    const coverage = mask[i + 3] / 255;
    if (!coverage) continue;
    let { mid, light } = PALETTES[finish];
    const x = (i / 4) % width;
    const y = Math.floor(i / 4 / width);
    const u = x / width;
    const v = y / (pixels.length / 4 / width);
    if (finish === 'NEON') {
      const band = (Math.sin((u + v) * Math.PI * 12) + 1) / 2;
      mid = [30 + 190 * band, 210 - 155 * band, 220];
      light = [185 + 65 * band, 255 - 75 * band, 255];
    } else if (finish === 'COSMIC') {
      const nebula = (Math.sin(u * 17 + Math.cos(v * 13) * 2) + 1) / 2;
      const star = (x * 13 + y * 17) % 97 < 2;
      mid = star ? [235, 235, 255] : [60 + 75 * nebula, 35 + 35 * nebula, 150 + 60 * nebula];
      light = star ? [255, 255, 255] : [155 + 80 * nebula, 170, 255];
    } else if (finish === 'EMBER') {
      const flame = (Math.sin(u * 30 + v * 18 + Math.sin(v * 14) * 3) + 1) / 2;
      mid = [190 + 45 * flame, 35 + 95 * flame, 12];
      light = [255, 145 + 100 * flame, 35 + 80 * flame];
    }
    const luminance = (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]) / 255;
    const t = luminance < 0.5 ? luminance * 2 : (luminance - 0.5) * 2;
    for (let channel = 0; channel < 3; channel++) {
      const low = luminance < 0.5 ? 0 : mid[channel];
      const high = luminance < 0.5 ? mid[channel] : light[channel];
      const ink = low + (high - low) * t;
      pixels[i + channel] += (ink - pixels[i + channel]) * coverage;
    }
  }
};

const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error(`Could not load ${src}`));
  img.src = src;
});

let frameMask: Promise<ImageData> | undefined;
const getFrameMask = (): Promise<ImageData> => frameMask ??= loadImage(frameMaskUrl).then((image) => {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}).catch((error) => {
  frameMask = undefined;
  throw error;
});

const cache = new Map<string, Promise<string>>();

/** One cached lossless image per card/finish, shared by every screen and the PNG exporter. */
export const finishedCardImage = (src: string, finish?: Finish | null): Promise<string> => {
  if (!finish) return Promise.resolve(src);
  const key = `${finish}:${src}`;
  const existing = cache.get(key);
  if (existing) return existing;
  const result = Promise.all([loadImage(src), getFrameMask()]).then(async ([image, mask]) => {
    const canvas = document.createElement('canvas');
    canvas.width = mask.width;
    canvas.height = mask.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    recolorFrame(pixels.data, mask.data, finish, canvas.width);
    ctx.putImageData(pixels, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (png) => png ? resolve(png) : reject(new Error('Finish render failed')), 'image/png',
    ));
    return URL.createObjectURL(blob);
  }).catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, result);
  return result;
};
