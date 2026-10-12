import { describe, expect, it } from 'vitest';
import { decodeCard, encodeCard, modifiersFor } from './cardCode';

describe('stored cards', () => {
  it('round-trips every combination', () => {
    for (const holo of [false, true]) {
      for (const finish of [undefined, 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'] as const) {
        for (const misprint of [false, true]) {
          const card = { id: 'ok-i-pull-up', holo, ...(finish ? { finish } : {}), ...(misprint ? { misprint } : {}) };
          expect(decodeCard(encodeCard(card))).toEqual(card);
        }
      }
    }
    expect(encodeCard({ id: 'sigma', holo: true, finish: 'GOLD', misprint: true })).toBe('sigma*G!');
  });

  it('reads records from before modifiers', () => {
    expect(decodeCard('rizz')).toEqual({ id: 'rizz', holo: false });
    expect(decodeCard('rizz*')).toEqual({ id: 'rizz', holo: true });
  });

  it('gives modifier sets explicit "none"', () => {
    expect(modifiersFor({ id: 'a', holo: false }, true)).toEqual({ finish: null, misprint: false });
    expect(modifiersFor({ id: 'a', holo: false, finish: 'GOLD' }, false)).toEqual({});
  });
});
