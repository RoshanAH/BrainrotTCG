/**
 * Profiles: your signed list of which set every ticket went to, from ticket #0 (engine/profile.ts).
 * Building one uses this device's pack history; viewing one re-opens every pack on the viewer's device.
 */
import {
  checkClaims,
  checkProfile,
  claimsFor,
  derivePack,
  encodeProfile,
  openProfileTicket,
  ProofError,
  profileStats,
  scorePulled,
  signProfile,
  toHex,
  type CheckedProfile,
  type ProfilePack,
  type ProfileRun,
  type ProfileStats,
  type ProofRule,
  type PulledCard,
  type SetDefinition,
} from '../engine';
import { DEFAULT_SET_ID, getCardDefinition, getLatestSet, getSet } from '../content/sets';
import { getPlayer, peekNonce } from './player';
import { addDerivedPacks, historyForKey, type HistoryEntry } from './history';
import { getReopened, putReopened } from './reopenCache';
import { getTicket } from './ticketMiner';
import { createTicketPool } from './ticketPool';

export const profileUrl = (profile: string): string => `${window.location.origin}${import.meta.env.BASE_URL}#/profile/${profile}`;

const toPulled = (entry: HistoryEntry, set: SetDefinition): PulledCard[] | null => {
  if (!entry.cards) return null;
  const cards = entry.cards.map((c, slot) => {
    const rarity = getCardDefinition(set.id, c.id)?.rarity;
    return rarity ? { setId: set.id, cardId: c.id, rarity, isHolo: c.holo, slot } : null;
  });
  return cards.every((c) => c) ? (cards as PulledCard[]) : null;
};

interface Ticket {
  nonce: number;
  set: SetDefinition;
  /** Null when this device has no record of the pack (yet). */
  pack: ProfilePack | null;
  /** True when the set is a guess: the ticket isn't in the history at all. */
  filled: boolean;
  openedAt: number;
}

/**
 * Every ticket this key has used, 0..nextNonce-1. A ticket with no record takes the set of the one
 * before it (or after it): its pack was never seen, so any set is as good, and leaving it out isn't
 * allowed.
 */
const myTickets = (): Ticket[] => {
  const player = getPlayer();
  const total = peekNonce();
  const known = new Map(historyForKey(player.publicKeyHex).map((e) => [e.nonce, e]));
  const setOf = (e: HistoryEntry | undefined) => (e ? getSet(e.setId, e.setVersion) : undefined);
  const firstKnown = [...known.values()].map(setOf).find((s) => s);
  let previous: SetDefinition = firstKnown ?? getLatestSet(DEFAULT_SET_ID)!;
  let previousTime = 0;
  const tickets: Ticket[] = [];
  for (let nonce = 0; nonce < total; nonce++) {
    const entry = known.get(nonce);
    const set = setOf(entry) ?? previous;
    const cards = entry && setOf(entry) ? toPulled(entry, set) : null;
    tickets.push({
      nonce,
      set,
      pack: cards ? { nonce, set, cards, score: scorePulled(cards) } : null,
      filled: !setOf(entry),
      openedAt: entry?.openedAt ?? previousTime,
    });
    previous = set;
    previousTime = entry?.openedAt ?? previousTime;
  }
  return tickets;
};

const runsOf = (tickets: readonly { set: SetDefinition }[]): ProfileRun[] => {
  const runs: ProfileRun[] = [];
  for (const { set } of tickets) {
    const last = runs[runs.length - 1];
    if (last && last.setId === set.id && last.setVersion === set.version) last.count++;
    else runs.push({ setId: set.id, setVersion: set.version, count: 1 });
  }
  return runs;
};

export interface MyProfile {
  packs: number;
  /** Tickets this device has no record of (opened before pack history existed). */
  filled: number;
  /** Tickets whose packs must be re-opened before a profile can be signed. */
  missing: number;
}

export const myProfileInfo = (): MyProfile | null => {
  const tickets = myTickets();
  if (tickets.length === 0) return null;
  return { packs: tickets.length, filled: tickets.filter((t) => t.filled).length, missing: tickets.filter((t) => !t.pack).length };
};

/**
 * Sign your profile. Its claims (XP, best packs) must be exact, so any ticket this device has no
 * cards for is re-opened first (and kept in the history for next time).
 */
export const myProfileProof = async (onProgress?: (done: number, total: number) => void): Promise<string | null> => {
  const tickets = myTickets();
  if (tickets.length === 0) return null;
  const player = getPlayer();
  const missing = tickets.filter((t) => !t.pack);
  const derived: HistoryEntry[] = [];
  for (const [i, t] of missing.entries()) {
    onProgress?.(i, missing.length);
    const cards = await derivePack(t.set, player.publicKey, t.nonce, getTicket);
    t.pack = { nonce: t.nonce, set: t.set, cards, score: scorePulled(cards) };
    derived.push({
      setId: t.set.id,
      setVersion: t.set.version,
      nonce: t.nonce,
      key: player.publicKeyHex.slice(0, 16),
      cards: cards.map((c) => ({ id: c.cardId, holo: c.isHolo })),
      hand: t.pack.score.hand.name,
      score: t.pack.score.score,
      openedAt: t.openedAt,
    });
  }
  addDerivedPacks(derived);
  const packs = tickets.map((t) => t.pack!);
  return encodeProfile(signProfile({ publicKey: player.publicKey, name: player.name, runs: runsOf(tickets), ...claimsFor(packs) }, player.secretKey));
};

/** Your stats from this device's history (no mining): what viewers of your profile will see. */
export const myStats = (): ProfileStats => profileStats(myTickets().flatMap((t) => (t.pack ? [t.pack] : [])));

export interface ProfileProgress {
  checked: CheckedProfile;
  /** Packs re-opened so far, in ticket order. */
  packs: ProfilePack[];
  /** The packs the profile names as its best, once they're re-opened (they go first). */
  highlights: ProfilePack[] | null;
  /** Every pack re-opened and the claims match. */
  done: boolean;
  /** Set when the profile turned out not to be real (rule "claims") or re-opening failed. */
  error?: { rule?: ProofRule; message: string };
}

/**
 * Check a profile, then re-open its packs on a pool of workers, its claimed best packs first,
 * reporting as they finish; when every pack is in, check its claims. Packs this device has
 * re-opened before come from its cache. `checkProfile` errors (bad signature, unknown set, ...)
 * are thrown before anything is re-opened.
 */
export const verifyProfileLive = (text: string, onProgress: (p: ProfileProgress) => void, signal: AbortSignal): CheckedProfile => {
  const checked = checkProfile(text, getSet);
  const { profile, tickets } = checked;
  const total = tickets.length;
  const keyHex = toHex(profile.publicKey);
  const results: (ProfilePack | undefined)[] = new Array(total);
  const order = [...profile.highlights, ...Array.from({ length: total }, (_, n) => n).filter((n) => !profile.highlights.includes(n))];
  let pool: ReturnType<typeof createTicketPool> | null = null;
  let next = 0;
  let finished = 0;
  let lastReport = 0;

  const snapshot = (extra: Partial<ProfileProgress> = {}): ProfileProgress => {
    const highlights = profile.highlights.map((n) => results[n]);
    return {
      checked,
      packs: results.filter((p): p is ProfilePack => !!p),
      highlights: highlights.every((p) => p) ? (highlights as ProfilePack[]) : null,
      done: false,
      ...extra,
    };
  };
  const report = (force = false) => {
    const now = performance.now();
    if (!force && now - lastReport < 150) return;
    lastReport = now;
    onProgress(snapshot());
  };

  const open = async (nonce: number) => {
    const set = tickets[nonce];
    const cached = getReopened(set, keyHex, nonce);
    if (cached) return { nonce, set, cards: cached, score: scorePulled(cached) };
    pool ??= createTicketPool();
    const pack = await openProfileTicket(checked, nonce, pool.ticket);
    putReopened(set, keyHex, nonce, pack.cards);
    return pack;
  };

  const work = async () => {
    while (!signal.aborted && next < total) {
      const nonce = order[next++];
      results[nonce] = await open(nonce);
      finished++;
      report(finished <= profile.highlights.length);
    }
  };

  signal.addEventListener('abort', () => pool?.close(), { once: true });
  const workers = Math.min(total, 8);
  Promise.all(Array.from({ length: workers }, work))
    .then(() => {
      if (signal.aborted) return;
      try {
        checkClaims(profile, results as ProfilePack[]);
        onProgress(snapshot({ done: true }));
      } catch (error) {
        const rule = error instanceof ProofError ? error.rule : undefined;
        onProgress(snapshot({ error: { rule, message: error instanceof Error ? error.message : String(error) } }));
      }
    })
    .catch((error) => {
      if (signal.aborted) return;
      console.error('Profile verification failed', error);
      onProgress(snapshot({ error: { message: String(error) } }));
    })
    .finally(() => pool?.close());
  report(true);
  return checked;
};
