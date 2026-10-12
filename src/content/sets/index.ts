/**
 * The set registry. Plain data + engine validation, no Vite APIs, so Node
 * scripts (CI verification, card builds) can import it too.
 *
 * Adding a set: create `sets/<id>/set.json` + art, import it below, run
 * `npm run cards` and `npm run check:sets -- --update`.
 * Changing a released set: copy its current set.json to `set.v<N>.json`,
 * import that here too (old proofs need it), then bump `version`.
 */
import { setKey, validateSet, type CardDefinition, type SetDefinition } from '../../engine';
import genesis from './genesis/set.json';
import webAncients from './web-ancients/set.json';

/** Every version of every set. Display order = timeline order (Genesis first). */
export const ALL_SET_VERSIONS: SetDefinition[] = [genesis, webAncients].map((s) => validateSet(s));

const byKey = new Map(ALL_SET_VERSIONS.map((s) => [setKey(s), s]));
if (byKey.size !== ALL_SET_VERSIONS.length) throw new Error('Duplicate set@version in registry');

/** The latest version of each set, in timeline order. These are the packs you can open. */
export const SETS: SetDefinition[] = [...new Map(ALL_SET_VERSIONS.map((s) => [s.id, s])).values()].map(
  (s) => ALL_SET_VERSIONS.filter((v) => v.id === s.id).sort((a, b) => b.version - a.version)[0],
);

export const DEFAULT_SET_ID = 'genesis';

export const getSet = (id: string, version: number): SetDefinition | undefined => byKey.get(`${id}@${version}`);

export const getLatestSet = (id: string): SetDefinition | undefined => SETS.find((s) => s.id === id);

/** Card definition by set + card id (searches every version, newest first). */
export const getCardDefinition = (setId: string, cardId: string): CardDefinition | undefined => {
  for (const set of ALL_SET_VERSIONS.filter((s) => s.id === setId).sort((a, b) => b.version - a.version)) {
    const card = set.cards.find((c) => c.id === cardId);
    if (card) return card;
  }
  return undefined;
};

/** Collection key for a card: unique across sets. */
export const cardKey = (setId: string, cardId: string): string => `${setId}/${cardId}`;
