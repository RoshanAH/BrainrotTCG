/**
 * Link previews for shared pulls. A pull link carries its proof after the '#', which link-preview
 * bots (chat apps, social sites) never see, so every link used to preview as the generic site.
 * Share links now go through a small static page per card and hand, built by
 * scripts/preview-pages.ts: p/<set>/<card>-<hand>.html#/pull/<proof>. Its preview is that card,
 * and opening it forwards to the pull.
 *
 * The card and hand in the path only choose the preview. The pull itself is re-derived from the
 * proof when the link is opened, as always, so a hand-edited path can dress up a preview but can't
 * change what the link proves.
 */
import { POKER_HANDS, type HandKey } from '../engine';

/** The hand's key from its display name (as a score or a history entry carries it). */
export const handKeyFromName = (name: string): HandKey =>
  (Object.keys(POKER_HANDS) as HandKey[]).find((k) => POKER_HANDS[k].name === name) ?? 'NO_MATCH';

/** e.g. FULL_HOUSE -> full-house */
export const handSlug = (hand: HandKey): string => hand.toLowerCase().replace(/_/g, '-');

/** The preview page for a card and hand, relative to the site root. */
export const previewPath = (setId: string, cardId: string, hand: HandKey): string => `p/${setId}/${cardId}-${handSlug(hand)}.html`;

/** The preview image for a card, relative to the site root. */
export const previewImagePath = (setId: string, cardId: string): string => `p/img/${setId}/${cardId}.jpg`;

/** What a preview says, from the hand and set (the card's own name goes in the description). */
export const previewTitle = (hand: HandKey, setName: string): string =>
  hand === 'NO_MATCH' ? `A pack from ${setName}` : `A ${POKER_HANDS[hand].name} in ${setName}`;
