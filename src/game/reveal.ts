/**
 * How a pack is shown, not what it is: the pack's cards, proof and history keep the engine's
 * order. Like the rare slot in a real booster, the best card comes last.
 */
import { FINISHES_RAREST_FIRST, RARITIES_RAREST_FIRST, type Finish, type Rarity } from '../engine';

type Revealable = { rarity: Rarity; isHolo: boolean; finish?: Finish | null; misprint?: boolean };

/** Rarity first; within a rarity, finish (Diamond highest), then misprint, then holo. */
const rank = (card: Revealable) =>
  (RARITIES_RAREST_FIRST.length - RARITIES_RAREST_FIRST.indexOf(card.rarity)) * 100 +
  (card.finish ? (FINISHES_RAREST_FIRST.length - FINISHES_RAREST_FIRST.indexOf(card.finish)) * 10 : 0) +
  (card.misprint ? 2 : 0) +
  (card.isHolo ? 1 : 0);

/** Least rare first, rarest last (a finish, misprint or holo beats its rarity's plain copy); ties keep pack order. */
export const revealOrder = <T extends Revealable>(cards: readonly T[]): T[] =>
  cards
    .map((card, i) => ({ card, i }))
    .sort((a, b) => rank(a.card) - rank(b.card) || a.i - b.i)
    .map(({ card }) => card);

/** Flag the first copy of each card the player didn't own before this pack. */
export const markNew = <T extends { key: string }>(cards: readonly T[], owned: (key: string) => boolean): (T & { isNew: boolean })[] => {
  const seen = new Set<string>();
  return cards.map((card) => {
    const isNew = !owned(card.key) && !seen.has(card.key);
    seen.add(card.key);
    return { ...card, isNew };
  });
};

/** Rare and up get a tell on the card back before the flip, and a spotlight after it. */
export const isBigPull = (rarity: Rarity): boolean => rarity === 'RARE' || rarity === 'EPIC' || rarity === 'LEGENDARY' || rarity === 'BRAINROT';
