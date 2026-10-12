import type { PackScore } from './scoring';

/**
 * What counts as Hall of Fame worthy. Shared by the in-game "Submit" button
 * and the CI verifier, so they can never disagree.
 * Full House or better is about 1 in 250 packs; 2,000+ brainrot value needs
 * something like a holo Brainrot card.
 */
export const HALL_OF_FAME_MIN_MULTIPLIER = 50;
export const HALL_OF_FAME_MIN_FLEX = 2000;

export const qualifiesForHallOfFame = (score: PackScore): boolean =>
  score.hand.multiplier >= HALL_OF_FAME_MIN_MULTIPLIER || score.flexValue >= HALL_OF_FAME_MIN_FLEX;
