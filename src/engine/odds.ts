import { handFromCounts, POKER_HANDS, type HandKey } from './scoring';
import { ODDS_TOTAL, type SetDefinition } from './types';

/**
 * Exact chance of each combo for one pack of a set, by enumerating every
 * multiset of cards (a 5-card pack from 19 cards is only ~34k cases).
 */
export const handOdds = (set: SetDefinition): Record<HandKey, number> => {
  const counts = new Map<string, number>();
  for (const c of set.cards) counts.set(c.rarity, (counts.get(c.rarity) ?? 0) + 1);
  const p = set.cards.map((c) => set.odds[c.rarity] / ODDS_TOTAL / counts.get(c.rarity)!);
  const n = p.length;
  const k = set.packSize;
  const factorial = (x: number): number => (x <= 1 ? 1 : x * factorial(x - 1));
  const result = Object.fromEntries(Object.keys(POKER_HANDS).map((h) => [h, 0])) as Record<HandKey, number>;

  // Recursively choose how many copies of card i (non-increasing index order = multisets).
  const copies: number[] = [];
  const walk = (i: number, remaining: number, prob: number, multinomial: number) => {
    if (remaining === 0) {
      result[handFromCounts(copies.filter((c) => c > 0))] += prob * multinomial;
      return;
    }
    if (i === n) return;
    for (let m = remaining; m >= 0; m--) {
      copies.push(m);
      walk(i + 1, remaining - m, prob * p[i] ** m, multinomial / factorial(m));
      copies.pop();
    }
  };
  walk(0, k, 1, factorial(k));
  return result;
};

/** "1 in N" for display. */
export const oneIn = (chance: number): number => (chance > 0 ? 1 / chance : Infinity);
