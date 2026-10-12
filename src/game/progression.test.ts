import { describe, expect, it } from 'vitest';
import { CARD_BACKS, COLLECTION_MILESTONES, PACK_FOILS, TITLES, collectionMilestone, nextReward, setProgress, titleFor, usable } from './progression';

describe('progression', () => {
  it('starts everyone with a title, a card back and a pack foil', () => {
    for (const rewards of [TITLES, CARD_BACKS, PACK_FOILS]) {
      expect(rewards[0].level).toBe(1);
      expect([...rewards].sort((a, b) => a.level - b.level)).toEqual(rewards); // in level order
      expect(new Set(rewards.map((r) => r.id)).size).toBe(rewards.length);
    }
  });

  it('gives the highest title reached', () => {
    expect(titleFor(1)).toBe('Fresh Pull');
    expect(titleFor(4)).toBe('Pack Rat');
    expect(titleFor(99)).toBe('Brainrot Royalty');
  });

  it('names the next unlock', () => {
    expect(nextReward(1)).toMatchObject({ level: 3, kind: 'title' });
    expect(nextReward(3)).toMatchObject({ level: 4, kind: 'card back', name: 'Midnight' });
    expect(nextReward(30)).toBeUndefined();
  });

  it('only uses rewards that are unlocked', () => {
    expect(usable(CARD_BACKS, 'gold', 10)).toBe('gold');
    expect(usable(CARD_BACKS, 'gold', 9)).toBe('classic');
    expect(usable(PACK_FOILS, undefined, 50)).toBe('standard');
    expect(usable(PACK_FOILS, 'nonsense', 50)).toBe('standard');
  });

  it('places a score between milestones', () => {
    expect(collectionMilestone(0)).toEqual({ current: undefined, next: COLLECTION_MILESTONES[0] });
    expect(collectionMilestone(1_000)).toEqual({ current: COLLECTION_MILESTONES[0], next: COLLECTION_MILESTONES[1] });
    expect(collectionMilestone(10 ** 9)).toEqual({ current: COLLECTION_MILESTONES[COLLECTION_MILESTONES.length - 1], next: undefined });
  });

  it('completes and masters sets', () => {
    expect(setProgress(11, 0, 12)).toBeNull();
    expect(setProgress(12, 3, 12)).toBe('complete');
    expect(setProgress(12, 12, 12)).toBe('master');
    expect(setProgress(0, 0, 0)).toBeNull();
  });
});
