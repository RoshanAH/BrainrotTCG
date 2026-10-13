import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, effectsLevel, musicLevel, readSettings } from './settings';

describe('settings', () => {
  it('fills in the defaults', () => {
    expect(readSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(readSettings({ particlesEnabled: false, showDraftSets: true })).toEqual({ ...DEFAULT_SETTINGS, particlesEnabled: false, showDraftSets: true });
  });

  it('turns the old sound switch into the two sliders', () => {
    expect(readSettings({ soundEnabled: true, particlesEnabled: true })).toEqual(DEFAULT_SETTINGS);
    const muted = readSettings({ soundEnabled: false, particlesEnabled: true });
    expect([muted.musicVolume, muted.effectsVolume]).toEqual([0, 0]);
    expect(muted).not.toHaveProperty('soundEnabled');
  });

  it('enables good-pull pauses for older saves, preserves the toggle, and rejects malformed values', () => {
    expect(readSettings({ musicVolume: 0.2 }).pauseBigPulls).toBe(true);
    expect(readSettings({ pauseBigPulls: false }).pauseBigPulls).toBe(false);
    expect(readSettings({ pauseBigPulls: true }).pauseBigPulls).toBe(true);
    expect(readSettings({ pauseBigPulls: 'false' }).pauseBigPulls).toBe(true);
    expect(readSettings({ pauseBigPulls: null }).pauseBigPulls).toBe(true);
  });

  it('keeps sliders in range', () => {
    expect(readSettings({ musicVolume: 3, effectsVolume: -1 })).toMatchObject({ musicVolume: 1, effectsVolume: 0 });
    expect(readSettings({ musicVolume: 'loud', effectsVolume: Number.NaN })).toMatchObject({ musicVolume: 0.5, effectsVolume: 1 });
    expect(readSettings({ musicVolume: 0.2, soundEnabled: false }).musicVolume).toBe(0.2); // a set slider wins
  });

  it('sounds the same as before at the defaults', () => {
    expect(musicLevel(DEFAULT_SETTINGS.musicVolume)).toBeCloseTo(0.05);
    expect(effectsLevel(DEFAULT_SETTINGS.effectsVolume)).toBe(1);
    expect(musicLevel(0)).toBe(0);
    expect(effectsLevel(0)).toBe(0);
  });
});
