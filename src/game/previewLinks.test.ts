import { describe, expect, it } from 'vitest';
import { POKER_HANDS, type HandKey } from '../engine';
import { cardPreviewPath, PREVIEW_COPIES, previewImagePath, previewOf, previewPath, previewTitle } from './previewLinks';

const pack = (...ids: string[]) => ids.map((id) => ({ key: `right-now/${id}` }));

describe('link previews', () => {
  it('shows the cards that make the hand', () => {
    expect(previewOf(pack('a', 'b', 'a', 'b', 'a'))).toEqual({ setId: 'right-now', cardIds: ['a', 'b'], hand: 'FULL_HOUSE' });
    expect(previewOf(pack('b', 'a', 'b', 'b', 'a'))).toEqual({ setId: 'right-now', cardIds: ['b', 'a'], hand: 'FULL_HOUSE' }); // the three first
    expect(previewOf(pack('z', 'y', 'c', 'z', 'y'))?.cardIds).toEqual(['y', 'z']); // Two Pair: one picture per pair of cards
    expect(previewOf(pack('q', 'a', 'a', 'a', 'a'))).toEqual({ setId: 'right-now', cardIds: ['a'], hand: 'FOUR_OF_A_KIND' });
    expect(previewOf(pack('a', 'b', 'c', 'c', 'd'))).toEqual({ setId: 'right-now', cardIds: ['c'], hand: 'PAIR' });
    // Nothing matches: the last card, which is the best once sorted by revealOrder.
    expect(previewOf(pack('a', 'b', 'c', 'd', 'e'))).toEqual({ setId: 'right-now', cardIds: ['e'], hand: 'NO_MATCH' });
    expect(previewOf([])).toBeUndefined();
  });

  it('lays out exactly a pack for every hand', () => {
    for (const hand of Object.keys(POKER_HANDS) as HandKey[]) expect(PREVIEW_COPIES[hand].reduce((a, b) => a + b)).toBeLessThanOrEqual(5);
    expect(PREVIEW_COPIES.FULL_HOUSE).toEqual([3, 2]);
  });

  it('keeps the addresses of links already shared', () => {
    // One-card hands hash as "set/card/HAND", like the earlier pages.
    expect(previewPath({ setId: 'right-now', cardIds: ['jimothy'], hand: 'FULL_HOUSE' })).toMatch(/^p\/[0-9a-f]{8}\.html$/);
    expect(previewPath({ setId: 'right-now', cardIds: ['jimothy', 'a'], hand: 'FULL_HOUSE' })).not.toBe(previewPath({ setId: 'right-now', cardIds: ['jimothy'], hand: 'FULL_HOUSE' }));
    expect(cardPreviewPath('right-now', 'jimothy')).toMatch(/^p\/[0-9a-f]{8}\.html$/);
    expect(previewImagePath({ setId: 'right-now', cardIds: ['a', 'b'], hand: 'TWO_PAIR' })).toBe('p/img/right-now/two-pair/a_b.jpg');
  });

  it('titles the preview', () => {
    expect(previewTitle('FOUR_OF_A_KIND', 'Summer of Slop')).toBe('A 4 of a Kind in Summer of Slop');
    expect(previewTitle('NO_MATCH', 'Summer of Slop')).toBe('A pack from Summer of Slop');
  });
});
