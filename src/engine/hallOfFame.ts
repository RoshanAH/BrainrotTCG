import { HOLO_MULTIPLIER, POKER_HANDS, RARITY_POINTS, type PackScore } from './scoring';

/**
 * What counts as Hall of Fame worthy. Shared by the in-game "Submit" button
 * and the CI verifier, so they can never disagree.
 * A Full House or better (about 1 in 70 packs in the current sets), or a Brainrot
 * Score of at least one holo Brainrot card's worth.
 */
export const HALL_OF_FAME_MIN_MULTIPLIER = POKER_HANDS.FULL_HOUSE.multiplier;
export const HALL_OF_FAME_MIN_SCORE = RARITY_POINTS.BRAINROT * HOLO_MULTIPLIER;

export const qualifiesForHallOfFame = (score: PackScore): boolean =>
  score.hand.multiplier >= HALL_OF_FAME_MIN_MULTIPLIER || score.score >= HALL_OF_FAME_MIN_SCORE;
