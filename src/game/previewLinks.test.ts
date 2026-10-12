import { describe, expect, it } from 'vitest';
import { ALL_SET_VERSIONS } from '../content/sets';
import { POKER_HANDS, type HandKey } from '../engine';
import { handKeyFromName, previewImagePath, previewPath, previewTitle } from './previewLinks';

describe('link previews', () => {
  it('names one page per card and hand, and one image per card', () => {
    expect(previewPath('right-now', 'jimothy', 'FULL_HOUSE')).toMatch(/^p\/[0-9a-f]{8}\.html$/);
    // Every card and hand gets its own page (the build checks this too).
    const paths = ALL_SET_VERSIONS.flatMap((set) => set.cards.flatMap((card) => (Object.keys(POKER_HANDS) as HandKey[]).map((h) => previewPath(set.id, card.id, h))));
    expect(new Set(paths).size).toBe(paths.length);
    expect(previewImagePath('right-now', 'jimothy')).toBe('p/img/right-now/jimothy.jpg');
  });

  it('reads the hand from its display name and titles the preview', () => {
    for (const key of Object.keys(POKER_HANDS) as HandKey[]) expect(handKeyFromName(POKER_HANDS[key].name)).toBe(key);
    expect(handKeyFromName('nonsense')).toBe('NO_MATCH');
    expect(previewTitle('FOUR_OF_A_KIND', 'Summer of Slop')).toBe('A 4 of a Kind in Summer of Slop');
    expect(previewTitle('NO_MATCH', 'Summer of Slop')).toBe('A pack from Summer of Slop');
  });
});
