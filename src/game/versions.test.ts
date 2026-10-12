import { describe, expect, it } from 'vitest';
import { ownedVersions, sameVersion, versionOf } from './versions';
import type { HistoryEntry } from './history';

const entry = (cards: HistoryEntry['cards']): HistoryEntry => ({ setId: 'right-now', setVersion: 2, nonce: 0, key: 'ab', cards, hand: 'x', score: 0, openedAt: 0 });
const label = (list: ReturnType<typeof ownedVersions>) =>
  list.map(({ version: v, count }) => `${v.finish ?? ''}${v.isHolo ? '*' : ''}${v.misprint ? '!' : ''}x${count}`);

describe('owned versions', () => {
  it('keeps exact combinations from the history, most valuable first', () => {
    const history = [
      entry([{ id: 'jimothy', holo: true, finish: 'GOLD' }, { id: 'jimothy', holo: false }, { id: 'other', holo: false }]),
      entry([{ id: 'jimothy', holo: false, finish: 'SILVER', misprint: true }]),
    ];
    const item = { normalCount: 2, holoCount: 1, finishes: { GOLD: 1, SILVER: 1 }, misprints: 1 };
    expect(label(ownedVersions('right-now/jimothy', 'RARE', item, history))).toEqual(['SILVER!x1', 'GOLD*x1', 'x1']);
  });

  it("fills in copies the history doesn't cover from the collection's tallies", () => {
    const item = { normalCount: 3, holoCount: 1, finishes: { DIAMOND: 1 }, misprints: 1 };
    expect(label(ownedVersions('right-now/jimothy', 'COMMON', item, []))).toEqual(['DIAMONDx1', '!x1', '*x1', 'x1']);
  });

  it('never lists more than the collection holds', () => {
    const history = [entry([{ id: 'jimothy', holo: false, finish: 'GOLD' }, { id: 'jimothy', holo: false, finish: 'GOLD' }])];
    const item = { normalCount: 1, holoCount: 0, finishes: { GOLD: 1 } };
    expect(label(ownedVersions('right-now/jimothy', 'RARE', item, history))).toEqual(['GOLDx1']);
  });

  it('compares versions with defaults for missing fields', () => {
    expect(sameVersion(versionOf({ isHolo: true }), { isHolo: true, finish: null, misprint: false })).toBe(true);
    expect(sameVersion(versionOf({ finish: 'GOLD' }), versionOf({}))).toBe(false);
  });
});
