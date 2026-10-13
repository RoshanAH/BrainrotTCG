import { describe, expect, it } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { getSet } from '../content/sets';
import { utf8 } from './bytes';
import { generatePack } from './pack';
import { cardPoints } from './scoring';
import { validateSet } from './types';

describe('modifier table versions', () => {
  it('keeps old tables restricted to their original finishes and generates all new choices in table 2', () => {
    const old = getSet('right-now', 2)!;
    const next = getSet('right-now', 3)!;
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const seed = sha256(utf8(`modifier-compatibility/${i}`));
      for (const card of generatePack(old, seed)) {
        expect([null, 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND']).toContain(card.finish);
      }
      for (const card of generatePack(next, seed)) if (card.finish) seen.add(card.finish);
    }
    expect([...seen]).toEqual(expect.arrayContaining(['NEON', 'COSMIC', 'EMBER']));
    expect(old.modifiers).toBe(1);
    expect(next.modifiers).toBe(2);
    expect(next.odds).toEqual(old.odds);
    expect(next.holoOdds).toBe(old.holoOdds);
    expect(next.cards).toEqual(old.cards);
  });

  it('scores new finishes with independently stacked holo and misprint', () => {
    expect(cardPoints('COMMON', false, 'NEON')).toBe(120);
    expect(cardPoints('COMMON', true, 'COSMIC')).toBe(4000);
    expect(cardPoints('COMMON', true, 'EMBER', true)).toBe(2_000_000);
    expect(cardPoints('COMMON', true, 'GOLD', true)).toBe(1_600_000);
  });

  it('rejects unsupported modifier tables rather than silently assigning another table', () => {
    expect(() => validateSet({ ...getSet('right-now', 3), modifiers: 3 })).toThrow('modifiers must be 1, 2 or absent');
    expect(() => validateSet({ ...getSet('right-now', 3), modifiers: true })).toThrow('modifiers must be 1, 2 or absent');
  });
});
