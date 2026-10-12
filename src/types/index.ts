import type { Card } from '../data/cards';
import type { CardWithMeta } from '../components/cards/Card';

export interface AchievementData {
  unlockedAt: number;
  pack?: CardWithMeta[];
}

export interface CollectionItem {
  card: Card;
  normalCount: number;
  holoCount: number;
  count?: number; // legacy field
}

export interface Stats {
  packsOpened: number;
  holoCards: Record<string, boolean>;
  highestPackValue?: number; // legacy
  highestPackFlexValue?: number;
  highestPackBaseValue?: number;
  highestPackMultiplier?: number;
  highestPackHandName?: string;
  highestPackCards?: CardWithMeta[];
  /** Ticket reference of the best pack, so it can be shared as a verifiable proof. */
  highestPackRef?: { setId: string; setVersion: number; nonce: number };
  /** The best pack predates verifiable pulls and can't be proven. */
  highestPackLegacy?: boolean;
}

export interface HallOfFameData {
  first4OfAKind?: {
    achieved: boolean;
    date: number;
    cardId: string;
  };
  firstFullHouse?: {
    achieved: boolean;
    date: number;
    cards: Record<string, number>;
  };
}

export type Rarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'BRAINROT';

export interface RarityCount {
  COMMON: string[];
  UNCOMMON: string[];
  RARE: string[];
  EPIC: string[];
  LEGENDARY: string[];
  BRAINROT: string[];
}

export interface CardsByRarity {
  COMMON: number;
  UNCOMMON: number;
  RARE: number;
  EPIC: number;
  LEGENDARY: number;
  BRAINROT: number;
}

export interface Settings {
  soundEnabled: boolean;
  particlesEnabled: boolean;
  /** Show draft sets (placeholder art) in the set picker. */
  showDraftSets?: boolean;
}
