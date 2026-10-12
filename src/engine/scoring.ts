import type { Rarity } from './types';

export interface PokerHand {
  name: string;
  multiplier: number;
}

/** Poker hand definitions with their multipliers (matching cards = same card id). */
export const POKER_HANDS = {
  FIVE_OF_A_KIND: { name: '5 of a Kind', multiplier: 1000 },
  FOUR_OF_A_KIND: { name: '4 of a Kind', multiplier: 250 },
  FULL_HOUSE: { name: 'Full House', multiplier: 50 },
  THREE_OF_A_KIND: { name: '3 of a Kind', multiplier: 10 },
  TWO_PAIR: { name: 'Two Pair', multiplier: 5 },
  PAIR: { name: 'Pair', multiplier: 2 },
  NO_MATCH: { name: 'No Matches', multiplier: 1 },
} as const satisfies Record<string, PokerHand>;

export const RARITY_VALUES: Record<Rarity, number> = {
  COMMON: 1,
  UNCOMMON: 2,
  RARE: 4,
  EPIC: 7,
  LEGENDARY: 20,
  BRAINROT: 100,
};

export const HOLO_VALUE_MULTIPLIER = 20;

export const getCardValue = (rarity: Rarity, isHolo: boolean): number =>
  (RARITY_VALUES[rarity] ?? 0) * (isHolo ? HOLO_VALUE_MULTIPLIER : 1);

interface ScorableCard {
  /** Cards match when this is equal (use `${setId}/${cardId}` or plain card id). */
  cardId: string;
  rarity: Rarity;
  isHolo: boolean;
}

/** Determine the poker hand for a pack of cards. */
export const getPokerHand = (cards: readonly { cardId: string }[]): PokerHand => {
  if (cards.length === 0) return POKER_HANDS.NO_MATCH;
  const counts = new Map<string, number>();
  for (const card of cards) counts.set(card.cardId, (counts.get(card.cardId) ?? 0) + 1);
  const freq = [...counts.values()].sort((a, b) => b - a);
  if (freq[0] >= 5) return POKER_HANDS.FIVE_OF_A_KIND;
  if (freq[0] === 4) return POKER_HANDS.FOUR_OF_A_KIND;
  if (freq[0] === 3 && freq[1] === 2) return POKER_HANDS.FULL_HOUSE;
  if (freq[0] === 3) return POKER_HANDS.THREE_OF_A_KIND;
  if (freq[0] === 2 && freq[1] === 2) return POKER_HANDS.TWO_PAIR;
  if (freq[0] === 2) return POKER_HANDS.PAIR;
  return POKER_HANDS.NO_MATCH;
};

export interface PackScore {
  baseValue: number;
  hand: PokerHand;
  flexValue: number;
}

/** "Brainrot value": sum of card values times the poker-hand multiplier. */
export const scorePack = (cards: readonly ScorableCard[]): PackScore => {
  const baseValue = cards.reduce((sum, c) => sum + getCardValue(c.rarity, c.isHolo), 0);
  const hand = getPokerHand(cards);
  return { baseValue, hand, flexValue: baseValue * hand.multiplier };
};
