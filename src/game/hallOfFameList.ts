/**
 * The published Hall of Fame (public/hall-of-fame.json, built by scripts/hall-of-fame.ts during
 * deploy): the top pulls and each set's firsts. Nothing in it is trusted; the page re-checks entries.
 */
import { decodeProof, pullId, type RankableEntry } from '../engine';

export interface HallOfFameEntry extends RankableEntry {
  proof: string;
  name: string;
  fingerprint: string;
  setName: string;
  cards: { cardId: string; isHolo: boolean }[];
  issue: number;
  githubUser: string;
}

/** Entries from before ids were published get theirs from the proof (a bad proof keys on its text). */
const withId = (entry: Omit<HallOfFameEntry, 'id'> & { id?: unknown }): HallOfFameEntry => {
  if (typeof entry.id === 'string') return entry as HallOfFameEntry;
  let id = entry.proof;
  try {
    id = pullId(decodeProof(entry.proof));
  } catch {
    // fails verification on the page and shows as such
  }
  return { ...entry, id };
};

let loading: Promise<HallOfFameEntry[] | null> | null = null;

/** The published list, fetched once per visit; null if it couldn't be loaded. */
export const loadHallOfFame = (): Promise<HallOfFameEntry[] | null> =>
  (loading ??= fetch(`${import.meta.env.BASE_URL}hall-of-fame.json`, { cache: 'no-cache' })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: unknown) => (Array.isArray(data) ? data.map(withId) : null))
    .catch(() => {
      loading = null; // try again next time
      return null;
    }));
