export type Rarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'BRAINROT';

/** Rarest first. This order is part of the pack-generation spec; never reorder. */
export const RARITIES_RAREST_FIRST: readonly Rarity[] = ['BRAINROT', 'LEGENDARY', 'EPIC', 'RARE', 'UNCOMMON', 'COMMON'];

/** Odds are integer weights out of this total (basis points), so pack generation never touches floats. */
export const ODDS_TOTAL = 10_000;

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
  palette?: string[];
  packSize: number;
  /** Weight per rarity, summing to ODDS_TOTAL. */
  odds: Record<Rarity, number>;
  /** Chance of holo per card, out of ODDS_TOTAL. */
  holoOdds: number;
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
  if (!Number.isInteger(set.holoOdds) || set.holoOdds < 0 || set.holoOdds > ODDS_TOTAL) fail('holoOdds out of range');
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
