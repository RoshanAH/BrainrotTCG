import type { Finish } from '../engine';
import frameMaskUrl from '../assets/images/card-frame-mask.webp';
import { recolorFrame } from './frameRecolor';

export { recolorFrame } from './frameRecolor';

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
    recolorFrame(pixels.data, mask.data, finish);
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
