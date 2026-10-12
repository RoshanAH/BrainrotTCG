import { describe, expect, it } from 'vitest';
import { POKER_HANDS, type HandKey } from '../engine';
import { handKeyFromName, handSlug, previewImagePath, previewPath, previewTitle } from './previewLinks';

describe('link previews', () => {
  it('names one page per card and hand, and one image per card', () => {
    expect(previewPath('right-now', 'jimothy', 'FULL_HOUSE')).toBe('p/right-now/jimothy-full-house.html');
    expect(previewImagePath('right-now', 'jimothy')).toBe('p/img/right-now/jimothy.jpg');
    const slugs = (Object.keys(POKER_HANDS) as HandKey[]).map(handSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.every((s) => /^[a-z-]+$/.test(s))).toBe(true);
  });

  it('reads the hand from its display name and titles the preview', () => {
    for (const key of Object.keys(POKER_HANDS) as HandKey[]) expect(handKeyFromName(POKER_HANDS[key].name)).toBe(key);
    expect(handKeyFromName('nonsense')).toBe('NO_MATCH');
    expect(previewTitle('FOUR_OF_A_KIND', 'Summer of Slop')).toBe('A 4 of a Kind in Summer of Slop');
    expect(previewTitle('NO_MATCH', 'Summer of Slop')).toBe('A pack from Summer of Slop');
  });
});
