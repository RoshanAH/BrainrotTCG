import type { Finish } from '../engine';

type RGB = readonly [number, number, number];

// Preserve the frame's shading and outlines, replacing its inks with each metal's tones.
const PALETTES: Record<Finish, { mid: RGB; light: RGB }> = {
  SILVER: { mid: [150, 150, 150], light: [245, 245, 245] },
  GOLD: { mid: [198, 150, 38], light: [255, 240, 180] },
  PLATINUM: { mid: [144, 180, 197], light: [235, 250, 255] },
  DIAMOND: { mid: [170, 165, 221], light: [219, 253, 255] },
};

/** Recolour only printed frame pixels; artwork and transparency stay exactly as supplied. */
export const recolorFrame = (pixels: Uint8ClampedArray, mask: Uint8ClampedArray, finish: Finish): void => {
  if (pixels.length !== mask.length || pixels.length % 4) throw new Error('Frame mask dimensions do not match the card');
  const { mid, light } = PALETTES[finish];
  for (let i = 0; i < pixels.length; i += 4) {
    const coverage = mask[i + 3] / 255;
    if (!coverage) continue;
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
