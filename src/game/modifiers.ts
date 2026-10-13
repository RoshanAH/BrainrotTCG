/**
 * How card modifiers (spec section 5.4) look in the game: names, colours and labels. The odds and
 * points live in the engine; a set opts in with `"modifiers": 1`.
 */
import type React from 'react';
import { FINISHES_V2_RAREST_FIRST, type Finish } from '../engine';
import '../styles/Modifiers.css';

export const FINISH_INFO: Record<Finish, { name: string; color: string }> = {
  SILVER: { name: 'Silver', color: '#cfd6dd' },
  GOLD: { name: 'Gold', color: '#ffcf4a' },
  PLATINUM: { name: 'Platinum', color: '#a8e6ff' },
  DIAMOND: { name: 'Diamond', color: '#c9b6ff' },
  NEON: { name: 'Neon', color: '#39f5ed' },
  COSMIC: { name: 'Cosmic', color: '#bc8cff' },
  EMBER: { name: 'Ember', color: '#ff8b40' },
};

/** What makes a card special beyond its rarity, e.g. "Gold · Holo · Misprint" ('' if nothing). */
export const modifierLabel = (card: { isHolo?: boolean; finish?: Finish | null; misprint?: boolean }, withHolo = true): string =>
  [card.finish && FINISH_INFO[card.finish].name, withHolo && card.isHolo && 'Holo', card.misprint && 'Misprint'].filter(Boolean).join(' · ');

/** The rarest finish in a tally of finishes owned, if any. */
export const bestFinish = (finishes?: Partial<Record<Finish, number>>): Finish | undefined => FINISHES_V2_RAREST_FIRST.find((f) => (finishes?.[f] ?? 0) > 0);

/** Classes for a card's face: `finish-gold misprint` and so on. */
export const modifierClasses = (card: { finish?: Finish | null; misprint?: boolean }): string =>
  [card.finish && `finish-${card.finish.toLowerCase()}`, card.misprint && 'misprint'].filter(Boolean).join(' ');

/** Props for a thumbnail's wrapper: the modifier classes plus the finish colour as `--finish`. */
export const modifierThumb = (card: { finish?: Finish | null; misprint?: boolean }) => ({
  className: `mod-thumb ${modifierClasses(card)}`,
  style: (card.finish ? { '--finish': FINISH_INFO[card.finish].color } : undefined) as React.CSSProperties | undefined,
});
