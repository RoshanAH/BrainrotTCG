/** Built card images (see `npm run cards`), resolved through Vite so they get hashed URLs. */
const CARD_IMAGES = import.meta.glob('./sets/*/cards/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const cardImageUrl = (setId: string, cardId: string): string =>
  CARD_IMAGES[`./sets/${setId}/cards/${cardId}.webp`] ?? '';

/** Each set's booster pack wrapper, also built by `npm run cards`. */
const PACK_IMAGES = import.meta.glob('./sets/*/pack.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const packImageUrl = (setId: string): string => PACK_IMAGES[`./sets/${setId}/pack.webp`] ?? '';

/** A small copy of each wrapper for the pack picker, which shows them all at once. */
const PACK_THUMBS = import.meta.glob('./sets/*/pack-thumb.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const packThumbUrl = (setId: string): string => PACK_THUMBS[`./sets/${setId}/pack-thumb.webp`] ?? packImageUrl(setId);
