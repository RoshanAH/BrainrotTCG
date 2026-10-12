import { describe, expect, it } from 'vitest';
import { isBigPull, markNew, revealOrder } from './reveal';

describe('reveal order', () => {
  it('shows the most valuable card last, otherwise pack order', () => {
    const cards = [
      { id: 'a', rarity: 'RARE' as const, isHolo: false },
      { id: 'b', rarity: 'UNCOMMON' as const, isHolo: false },
      { id: 'c', rarity: 'COMMON' as const, isHolo: false },
      { id: 'd', rarity: 'RARE' as const, isHolo: false },
      { id: 'e', rarity: 'COMMON' as const, isHolo: true },
    ];
    expect(revealOrder(cards).map((c) => c.id)).toEqual(['c', 'b', 'a', 'd', 'e']);
    expect(cards.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd', 'e']); // the pack itself is untouched
  });

  it('puts a finish or misprint after plain cards of higher rarity when it is worth more', () => {
    const cards = [
      { id: 'gold', rarity: 'COMMON' as const, isHolo: false, finish: 'GOLD' as const, misprint: false },
      { id: 'diamond', rarity: 'COMMON' as const, isHolo: false, finish: 'DIAMOND' as const, misprint: false },
      { id: 'misprint', rarity: 'COMMON' as const, isHolo: false, finish: null, misprint: true },
      { id: 'plain', rarity: 'COMMON' as const, isHolo: false, finish: null, misprint: false },
      { id: 'epic', rarity: 'EPIC' as const, isHolo: false, finish: null, misprint: false },
    ];
    // 10, 70 (Epic), 400 (Gold), 2,000 (misprint), 10,000 (Diamond)
    expect(revealOrder(cards).map((c) => c.id)).toEqual(['plain', 'epic', 'gold', 'misprint', 'diamond']);
  });

  it('counts finishes and misprints as big pulls', () => {
    expect(isBigPull({ rarity: 'COMMON', isHolo: true })).toBe(false);
    expect(isBigPull({ rarity: 'COMMON', isHolo: false, finish: 'SILVER' })).toBe(true);
    expect(isBigPull({ rarity: 'UNCOMMON', isHolo: false, misprint: true })).toBe(true);
    expect(isBigPull({ rarity: 'RARE', isHolo: false })).toBe(true);
  });

  it('marks only the first copy of a card the player did not own', () => {
    const owned = new Set(['set/x']);
    const marked = markNew([{ key: 'set/y' }, { key: 'set/x' }, { key: 'set/y' }], (k) => owned.has(k));
    expect(marked.map((c) => c.isNew)).toEqual([true, false, false]);
  });
});
