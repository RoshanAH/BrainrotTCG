import { describe, expect, it } from 'vitest';
import { recolorFrame } from './finishImage';

describe('printed frame finishes', () => {
  it('preserves artwork pixels and card transparency', () => {
    const pixels = new Uint8ClampedArray([240, 20, 80, 255, 90, 180, 20, 120]);
    const mask = new Uint8ClampedArray([255, 255, 255, 0, 255, 255, 255, 255]);
    recolorFrame(pixels, mask, 'SILVER');
    expect([...pixels.slice(0, 4)]).toEqual([240, 20, 80, 255]);
    expect(pixels[7]).toBe(120);
    expect(pixels[4]).toBe(pixels[5]);
    expect(pixels[5]).toBe(pixels[6]);
  });

  it('makes silver neutral and gold warm without flattening the frame shading', () => {
    const mask = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255]);
    const silver = new Uint8ClampedArray([20, 20, 20, 255, 220, 220, 220, 255]);
    recolorFrame(silver, mask, 'SILVER');
    expect(silver[0]).toBe(silver[1]);
    expect(silver[4]).toBe(silver[5]);
    expect(silver[0]).toBeLessThan(silver[4]);
    const gold = new Uint8ClampedArray([20, 20, 20, 255, 220, 220, 220, 255]);
    recolorFrame(gold, mask, 'GOLD');
    expect(gold[4]).toBeGreaterThan(gold[5]);
    expect(gold[5]).toBeGreaterThan(gold[6]);
    expect(gold[0]).toBeLessThan(gold[4]);
  });

  it('keeps platinum blue and diamond violet distinct', () => {
    const mask = new Uint8ClampedArray([255, 255, 255, 255]);
    const platinum = new Uint8ClampedArray([128, 128, 128, 255]);
    const diamond = platinum.slice();
    recolorFrame(platinum, mask, 'PLATINUM');
    recolorFrame(diamond, mask, 'DIAMOND');
    expect(platinum[2]).toBeGreaterThan(platinum[1]);
    expect(platinum[1]).toBeGreaterThan(platinum[0]);
    expect(diamond[2]).toBeGreaterThan(diamond[0]);
    expect(diamond[0]).toBeGreaterThan(diamond[1]);
    expect([...diamond]).not.toEqual([...platinum]);
  });

  it('blends the frame edge rather than leaving a hard cutout', () => {
    const original = new Uint8ClampedArray([255, 0, 0, 255]);
    const solid = original.slice();
    const edge = original.slice();
    recolorFrame(solid, new Uint8ClampedArray([255, 255, 255, 255]), 'SILVER');
    recolorFrame(edge, new Uint8ClampedArray([255, 255, 255, 128]), 'SILVER');
    expect(edge[0]).toBeGreaterThan(solid[0]);
    expect(edge[0]).toBeLessThan(original[0]);
    expect(edge[1]).toBeGreaterThan(original[1]);
    expect(edge[1]).toBeLessThan(solid[1]);
  });
});
