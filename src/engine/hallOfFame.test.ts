import { describe, expect, it } from 'vitest';
import { firstPulls, HALL_OF_FAME_TOP, hallOfFameList, topPulls, wouldJoinHallOfFame, type RankableEntry } from './hallOfFame';
import { POKER_HANDS, type PackScore } from './scoring';

const HANDS = { FH: POKER_HANDS.FULL_HOUSE, FOUR: POKER_HANDS.FOUR_OF_A_KIND, PAIR: POKER_HANDS.PAIR };

let clock = 0;
const entry = (id: string, score: number, hand: keyof typeof HANDS = 'FH', setId = 'set-a'): RankableEntry => ({
  id,
  setId,
  hand: HANDS[hand].name,
  multiplier: HANDS[hand].multiplier,
  score,
  submittedAt: new Date(Date.UTC(2026, 9, 1) + clock++ * 60_000).toISOString(),
});
const score = (points: number, hand: keyof typeof HANDS = 'FH'): PackScore => ({ score: points, hand: HANDS[hand] }) as PackScore;

describe('Hall of Fame list', () => {
  it('keeps the top pulls and the first of each hand in each set, each pull once', () => {
    const early = entry('early-fh', 100, 'FH', 'set-b'); // the first Full House in set-b, but a low score
    const many = Array.from({ length: HALL_OF_FAME_TOP + 20 }, (_, i) => entry(`p${i}`, 1000 + i));
    const copy = { ...many[0], submittedAt: '2030-01-01T00:00:00.000Z' }; // the same pull, verified again later
    const list = hallOfFameList([early, ...many, copy]);
    expect(topPulls(list)).toHaveLength(HALL_OF_FAME_TOP);
    expect(topPulls(list)[0].id).toBe(`p${HALL_OF_FAME_TOP + 19}`);
    expect(list.map((e) => e.id)).toContain('early-fh'); // kept as a first
    expect(list.map((e) => e.id)).toContain('p0'); // the first Full House in set-a, though not top 100
    expect(list.filter((e) => e.id === 'p0')).toHaveLength(1);
    expect(list.find((e) => e.id === 'p0')?.submittedAt).toBe(many[0].submittedAt); // earliest keeps the credit
    expect(list).toHaveLength(HALL_OF_FAME_TOP + 2); // plus the two firsts outside the top
    expect(firstPulls(list).map((e) => e.id).sort()).toEqual(['early-fh', 'p0']);
  });

  it('says whether a new pull would join', () => {
    const full = Array.from({ length: HALL_OF_FAME_TOP }, (_, i) => entry(`p${i}`, 1000 + i));
    expect(wouldJoinHallOfFame({ id: 'x', setId: 'set-a', score: score(500) }, full.slice(0, 10))).toBe(true); // room
    expect(wouldJoinHallOfFame({ id: 'x', setId: 'set-a', score: score(1001) }, full)).toBe(true); // beats the lowest
    expect(wouldJoinHallOfFame({ id: 'x', setId: 'set-a', score: score(1000) }, full)).toBe(false); // a tie goes to the earlier one
    expect(wouldJoinHallOfFame({ id: 'x', setId: 'set-b', score: score(10) }, full)).toBe(true); // first Full House in set-b
    expect(wouldJoinHallOfFame({ id: 'x', setId: 'set-a', score: score(10, 'FOUR') }, full)).toBe(true); // first 4 of a Kind in set-a
    expect(wouldJoinHallOfFame({ id: 'p5', setId: 'set-a', score: score(5000) }, full)).toBe(false); // already in
    expect(wouldJoinHallOfFame({ id: 'x', setId: 'set-a', score: score(900, 'PAIR') }, full.slice(0, 3))).toBe(false); // doesn't qualify
  });
});
