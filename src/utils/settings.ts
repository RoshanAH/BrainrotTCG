import type { Settings } from '../types';

/**
 * Settings, and the two volume sliders. Music and sound effects (cards, the pack, voices) each have
 * a slider from 0 (off) to 1. A slider moves along a squared curve, which sounds more even than a
 * straight line. The defaults are as loud as the game was before the sliders: effects at full, the
 * music quiet underneath.
 */
const MUSIC_MAX = 0.2;

export const DEFAULT_SETTINGS: Settings = {
  musicVolume: 0.5,
  effectsVolume: 1,
  particlesEnabled: true,
  pauseBigPulls: true,
};

const slider = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

/** Stored settings, filled in from the defaults. Older saves had one sound switch: off mutes both. */
export const readSettings = (stored: unknown): Settings => {
  const { soundEnabled, ...rest } = (stored && typeof stored === 'object' ? stored : {}) as Partial<Settings> & { soundEnabled?: boolean };
  const muted = soundEnabled === false;
  return {
    ...DEFAULT_SETTINGS,
    ...rest,
    musicVolume: slider(rest.musicVolume, muted ? 0 : DEFAULT_SETTINGS.musicVolume),
    effectsVolume: slider(rest.effectsVolume, muted ? 0 : DEFAULT_SETTINGS.effectsVolume),
    pauseBigPulls: typeof rest.pauseBigPulls === 'boolean' ? rest.pauseBigPulls : DEFAULT_SETTINGS.pauseBigPulls,
  };
};

/** The music's audio volume for a slider position. */
export const musicLevel = (value: number): number => MUSIC_MAX * value ** 2;

/** A sound effect's audio volume for a slider position. */
export const effectsLevel = (value: number): number => value ** 2;
