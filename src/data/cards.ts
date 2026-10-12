/**
 * UI-facing card data: set definitions from the registry + built image URLs.
 * Card definitions live in `src/content/sets/<set>/set.json`.
 */
import { SETS } from '../content/sets';
import { cardImageUrl } from '../content/art';
import { getCardValue as engineCardValue, scorePack, type CardDefinition, type PackScore, type Rarity } from '../engine';

export type RarityKey = Rarity;

export interface RarityInfo {
  name: string;
  color: string;
}

export const CARD_RARITIES: Record<RarityKey, RarityInfo> = {
  COMMON: { name: 'Common', color: '#aaaaaa' },
  UNCOMMON: { name: 'Uncommon', color: '#1eff00' },
  RARE: { name: 'Rare', color: '#0070dd' },
  EPIC: { name: 'Epic', color: '#a335ee' },
  LEGENDARY: { name: 'Legendary', color: '#ff8000' },
  BRAINROT: { name: 'Brainrot', color: 'rainbow' },
};

export interface Card {
  /** `${setId}/${id}`, unique across sets; used as the collection key. */
  key: string;
  setId: string;
  id: string;
  name: string;
  rarity: RarityKey;
  image: string;
  caption?: string;
  flavor?: string;
}

export const toCard = (setId: string, def: CardDefinition): Card => ({
  key: `${setId}/${def.id}`,
  setId,
  id: def.id,
  name: def.name,
  rarity: def.rarity,
  image: cardImageUrl(setId, def.id),
  caption: def.caption,
  flavor: def.flavor,
});

/** Every card in every current set. */
export const ALL_CARDS: Card[] = SETS.flatMap((set) => set.cards.map((def) => toCard(set.id, def)));

const BY_KEY = new Map(ALL_CARDS.map((c) => [c.key, c]));

export const getCard = (key: string): Card | undefined => BY_KEY.get(key);

export const getSetCards = (setId: string): Card[] => ALL_CARDS.filter((c) => c.setId === setId);

export const getCardsByRarity = (rarity: RarityKey): Card[] => ALL_CARDS.filter((card) => card.rarity === rarity);

export const getCardValue = engineCardValue;

/** Score UI cards (matching = same card key). */
export const scoreCards = (cards: readonly { key: string; rarity: RarityKey; isHolo: boolean }[]): PackScore =>
  scorePack(cards.map((c) => ({ cardId: c.key, rarity: c.rarity, isHolo: c.isHolo })));
