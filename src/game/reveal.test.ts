import { describe, expect, it } from 'vitest';
import { markNew, revealOrder } from './reveal';

describe('reveal order', () => {
  it('shows the rarest card last, holo above normal, otherwise pack order', () => {
    const cards = [
      { id: 'a', rarity: 'RARE' as const, isHolo: false },
      { id: 'b', rarity: 'COMMON' as const, isHolo: true },
      { id: 'c', rarity: 'COMMON' as const, isHolo: false },
      { id: 'd', rarity: 'RARE' as const, isHolo: false },
      { id: 'e', rarity: 'COMMON' as const, isHolo: false },
    ];
    expect(revealOrder(cards).map((c) => c.id)).toEqual(['c', 'e', 'b', 'a', 'd']);
    expect(cards.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd', 'e']); // the pack itself is untouched
  });

  it('marks only the first copy of a card the player did not own', () => {
    const owned = new Set(['set/x']);
    const marked = markNew([{ key: 'set/y' }, { key: 'set/x' }, { key: 'set/y' }], (k) => owned.has(k));
    expect(marked.map((c) => c.isNew)).toEqual([true, false, false]);
  });
});
