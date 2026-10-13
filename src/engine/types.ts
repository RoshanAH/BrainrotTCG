export type Rarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'BRAINROT';

/** Rarest first. This order is part of the pack-generation spec; never reorder. */
export const RARITIES_RAREST_FIRST: readonly Rarity[] = ['BRAINROT', 'LEGENDARY', 'EPIC', 'RARE', 'UNCOMMON', 'COMMON'];

/** Odds are integer weights out of this total (basis points), so pack generation never touches floats. */
export const ODDS_TOTAL = 10_000;

/** A card's finish, on top of its rarity and holo (sets with modifiers only). */
export type Finish = 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND' | 'NEON' | 'COSMIC' | 'EMBER';

/** Rarest first. This order is part of the pack-generation spec; never reorder. */
export const FINISHES_RAREST_FIRST: readonly Finish[] = ['DIAMOND', 'PLATINUM', 'GOLD', 'SILVER'];

/**
 * Modifier table 1 (spec section 5.4), for sets with `"modifiers": 1`: each card also rolls a finish
 * (odds out of ODDS_TOTAL; the rest have none) and whether it's a misprint. A released table never
 * changes; different odds would be table 2.
 */
export const MODIFIERS_V1 = {
  finishOdds: { DIAMOND: 10, PLATINUM: 50, GOLD: 250, SILVER: 1000 } as Readonly<Partial<Record<Finish, number>>>,
  misprintOdds: 50,
} as const;

/** Table 2 adds three distinct frames; table 1 and its draw order stay frozen. */
export const FINISHES_V2_RAREST_FIRST: readonly Finish[] = ['DIAMOND', 'PLATINUM', 'EMBER', 'GOLD', 'COSMIC', 'NEON', 'SILVER'];
export const MODIFIERS_V2 = {
  finishOdds: { DIAMOND: 10, PLATINUM: 50, EMBER: 200, GOLD: 250, COSMIC: 500, NEON: 800, SILVER: 1000 } as Readonly<Partial<Record<Finish, number>>>,
  misprintOdds: 50,
} as const;

export const modifierTable = (version: SetDefinition['modifiers']) => version === 2 ? MODIFIERS_V2 : version === 1 ? MODIFIERS_V1 : undefined;
export const finishOrder = (version: SetDefinition['modifiers']): readonly Finish[] => version === 2 ? FINISHES_V2_RAREST_FIRST : FINISHES_RAREST_FIRST;

export interface CardDefinition {
  /** Stable slug, unique within the set. Never rename a released card. */
  id: string;
  name: string;
  rarity: Rarity;
  caption?: string;
  flavor?: string;
  year?: number;
  /** Art brief used for SVG art and Gemini-app prompts. */
  art?: string;
}

export interface SetDefinition {
  id: string;
  /** Bump when anything that affects pack contents changes (cards, order, odds). Old versions stay in the registry. */
  version: number;
  name: string;
  era: string;
  tagline?: string;
  /** ISO date the set became openable. */
  releasedAt: string;
  /** Draft sets (e.g. placeholder art) are hidden unless the player opts into previews. */
  draft?: boolean;
  /**
   * ISO date the set stopped being openable. Archived sets stay in the registry, so old pulls
   * still verify and owned cards still show, but nobody can open new packs.
   */
  archivedAt?: string;
  palette?: string[];
  packSize: number;
  /** Weight per rarity, summing to ODDS_TOTAL. */
  odds: Record<Rarity, number>;
  /** Chance of holo per card, out of ODDS_TOTAL. */
  holoOdds: number;
  /** Immutable modifier table 1 or 2. Both roll a finish and misprint; absent = neither. */
  modifiers?: 1 | 2;
  /** Order matters: it is part of pack generation. */
  cards: CardDefinition[];
}

/** `${id}@${version}` — the string that goes into tickets and proofs. */
export const setKey = (set: Pick<SetDefinition, 'id' | 'version'>): string => `${set.id}@${set.version}`;

export interface PulledCard {
  setId: string;
  cardId: string;
  rarity: Rarity;
  isHolo: boolean;
  /** Sets with modifiers only: the card's finish (null for none) and whether it's a misprint. */
  finish?: Finish | null;
  misprint?: boolean;
  /** Position in the pack (0-based). */
  slot: number;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Validate a set definition (e.g. one loaded from JSON). Throws with a readable message on problems. */
export const validateSet = (input: unknown): SetDefinition => {
  const set = input as SetDefinition;
  const fail = (msg: string): never => {
    throw new Error(`Set "${set?.id ?? '?'}": ${msg}`);
  };
  if (!set || typeof set !== 'object') fail('not an object');
  if (!SLUG.test(set.id) || set.id.length > 40) fail('id must be a short kebab-case slug');
  if (!Number.isInteger(set.version) || set.version < 1 || set.version > 65535) fail('version must be an integer 1..65535');
  if (!Number.isInteger(set.packSize) || set.packSize < 1 || set.packSize > 15) fail('packSize must be 1..15');
  if (set.archivedAt !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(set.archivedAt)) fail('archivedAt must be an ISO date (YYYY-MM-DD)');
  if (!Number.isInteger(set.holoOdds) || set.holoOdds < 0 || set.holoOdds > ODDS_TOTAL) fail('holoOdds out of range');
  if (set.modifiers !== undefined && set.modifiers !== 1 && set.modifiers !== 2) fail('modifiers must be 1, 2 or absent');
  const total = RARITIES_RAREST_FIRST.reduce((sum, r) => {
    const w = set.odds?.[r];
    if (!Number.isInteger(w) || w < 0) fail(`odds.${r} must be a non-negative integer`);
    return sum + w;
  }, 0);
  if (total !== ODDS_TOTAL) fail(`odds must sum to ${ODDS_TOTAL} (got ${total})`);
  if (!Array.isArray(set.cards) || set.cards.length === 0) fail('cards must be a non-empty array');
  const seen = new Set<string>();
  for (const card of set.cards) {
    if (!SLUG.test(card.id)) fail(`card id "${card.id}" must be a kebab-case slug`);
    if (seen.has(card.id)) fail(`duplicate card id "${card.id}"`);
    seen.add(card.id);
    if (!RARITIES_RAREST_FIRST.includes(card.rarity)) fail(`card "${card.id}" has unknown rarity "${card.rarity}"`);
    if (!card.name) fail(`card "${card.id}" needs a name`);
  }
  for (const r of RARITIES_RAREST_FIRST) {
    if (set.odds[r] > 0 && !set.cards.some((c) => c.rarity === r)) fail(`odds.${r} > 0 but the set has no ${r} cards`);
  }
  return set;
};
