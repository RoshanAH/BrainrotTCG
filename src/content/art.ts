/** Built card images (see `npm run cards`), resolved through Vite so they get hashed URLs. */
const CARD_IMAGES = import.meta.glob('./sets/*/cards/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const cardImageUrl = (setId: string, cardId: string): string =>
  CARD_IMAGES[`./sets/${setId}/cards/${cardId}.webp`] ?? '';
