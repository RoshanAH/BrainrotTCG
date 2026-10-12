import { concatBytes, decodeVarint, encodeVarint, fromBase64Url, fromUtf8, toBase64Url, utf8 } from './bytes';
import { fingerprint, isValidName, isValidPublicKey, normalizeName, sign, verifySignature } from './identity';
import { derivePack, ProofError, type SetLookup, type TicketFn } from './proof';
import { POKER_HANDS, scorePack, type HandKey, type PackScore } from './scoring';
import { computeTicket } from './ticket';
import type { PulledCard, SetDefinition } from './types';

/**
 * A profile proof: every pack a player key has opened, from its first ticket, signed by that key.
 * spec/PULL_SPEC.md (section 11) is the normative description.
 *
 * It lists which set each ticket went to, as runs: tickets 0..n-1 in order, with no gaps, so a
 * player can't leave out bad packs (only stop early, which can only make a profile smaller).
 * It doesn't list cards: the viewer re-opens every pack itself. So that a viewer can show something
 * at once, it also claims the XP and the best few packs (by ticket number): those are re-opened
 * first, and once every pack is re-opened, the claims must match exactly.
 *
 * Binary layout (v1), then base64url-encoded:
 *   u8      profile version (1)
 *   32      player public key (Ed25519)
 *   u8 + n  display name (utf-8, NFC, <= 24 chars)
 *   u8      number of sets in the table (1..64)
 *   per set: u8 + n set id (utf-8), u16be set version
 *   varint  number of runs (>= 1)
 *   per run: varint set index, varint length (>= 1)
 *   varint  claimed XP
 *   u8      number of highlights: min(5, ticket count)
 *   per highlight: varint ticket number (best pack first; ties: earlier ticket first)
 *   64      Ed25519 signature over "brainrot-tcg/profile/v1" || all preceding bytes
 *
 * Canonical form (anything else is rejected): sets appear in the table in order of first use, each
 * set is used, and two runs in a row never share a set.
 */
export const PROFILE_VERSION = 1;
const SIGNATURE_DOMAIN = utf8('brainrot-tcg/profile/v1');

/** Bounds the work a profile can ask a viewer to do. */
export const MAX_PROFILE_TICKETS = 100_000;
const MAX_SETS = 64;
const MAX_SET_ID_BYTES = 64;
/** How many best packs a profile names (and a viewer re-opens first). */
export const PROFILE_HIGHLIGHTS = 5;

export interface ProfileRun {
  setId: string;
  setVersion: number;
  /** How many tickets in a row went to this set. */
  count: number;
}

export interface ProfileClaims {
  /** XP the packs earn (section 11.3). */
  xp: number;
  /** Ticket numbers of the best packs, best first. */
  highlights: number[];
}

export interface ProfileProof extends ProfileClaims {
  publicKey: Uint8Array;
  name: string;
  runs: ProfileRun[];
  signature: Uint8Array;
}

export type UnsignedProfile = Omit<ProfileProof, 'signature'>;

const sameSet = (a: Pick<ProfileRun, 'setId' | 'setVersion'>, b: Pick<ProfileRun, 'setId' | 'setVersion'>) =>
  a.setId === b.setId && a.setVersion === b.setVersion;

/** Merge neighbouring runs of the same set and drop empty ones (the canonical form). */
export const normalizeRuns = (runs: readonly ProfileRun[]): ProfileRun[] => {
  const out: ProfileRun[] = [];
  for (const run of runs) {
    if (run.count <= 0) continue;
    const last = out[out.length - 1];
    if (last && sameSet(last, run)) last.count += run.count;
    else out.push({ ...run });
  }
  return out;
};

export const profileTicketCount = (runs: readonly ProfileRun[]): number => runs.reduce((n, r) => n + r.count, 0);

const encodeUnsigned = (p: UnsignedProfile): Uint8Array => {
  const runs = normalizeRuns(p.runs);
  if (runs.length === 0) throw new Error('A profile needs at least one pack');
  if (profileTicketCount(runs) > MAX_PROFILE_TICKETS) throw new Error('Too many packs for one profile');
  if (p.publicKey.length !== 32) throw new Error('Invalid public key');
  const name = utf8(normalizeName(p.name));
  if (name.length > 255) throw new Error('Name too long');

  const table: { setId: string; setVersion: number }[] = [];
  const indexOf = (run: ProfileRun) => {
    let i = table.findIndex((t) => sameSet(t, run));
    if (i < 0) i = table.push({ setId: run.setId, setVersion: run.setVersion }) - 1;
    return i;
  };
  const runBytes = runs.map((run) => concatBytes(encodeVarint(indexOf(run)), encodeVarint(run.count)));
  if (table.length > MAX_SETS) throw new Error('Too many sets');
  if (p.highlights.length !== Math.min(PROFILE_HIGHLIGHTS, profileTicketCount(runs))) throw new Error('Wrong number of highlights');

  const tableBytes = table.map((t) => {
    const id = utf8(t.setId);
    if (id.length === 0 || id.length > MAX_SET_ID_BYTES) throw new Error('Invalid set id');
    return concatBytes(Uint8Array.of(id.length), id, Uint8Array.of((t.setVersion >> 8) & 255, t.setVersion & 255));
  });
  return concatBytes(
    Uint8Array.of(PROFILE_VERSION),
    p.publicKey,
    Uint8Array.of(name.length),
    name,
    Uint8Array.of(table.length),
    ...tableBytes,
    encodeVarint(runs.length),
    ...runBytes,
    encodeVarint(p.xp),
    Uint8Array.of(p.highlights.length),
    ...p.highlights.map((n) => encodeVarint(n)),
  );
};

export const signProfile = (unsigned: UnsignedProfile, secretKey: Uint8Array): ProfileProof => {
  const normalized = { ...unsigned, name: normalizeName(unsigned.name), runs: normalizeRuns(unsigned.runs) };
  const signature = sign(concatBytes(SIGNATURE_DOMAIN, encodeUnsigned(normalized)), secretKey);
  return { ...normalized, signature };
};

export const encodeProfile = (profile: ProfileProof): string => toBase64Url(concatBytes(encodeUnsigned(profile), profile.signature));

/** Strict decoding. Throws a ProofError with rule "decode". */
export const decodeProfile = (text: string): ProfileProof => decodeProfileBytes(text).profile;

const decodeProfileBytes = (text: string): { profile: ProfileProof; signed: Uint8Array } => {
  try {
    const bytes = fromBase64Url(text.trim());
    let o = 0;
    const take = (n: number) => {
      if (o + n > bytes.length) throw new Error('Profile is truncated');
      const out = bytes.subarray(o, o + n);
      o += n;
      return out;
    };
    const varint = () => {
      const { value, next } = decodeVarint(bytes, o);
      o = next;
      return value;
    };

    const [version] = take(1);
    if (version !== PROFILE_VERSION) throw new Error(`Unsupported profile version ${version}`);
    const publicKey = take(32).slice();
    const name = fromUtf8(take(take(1)[0]));

    const setCount = take(1)[0];
    if (setCount === 0 || setCount > MAX_SETS) throw new Error('Invalid set table size');
    const table: { setId: string; setVersion: number }[] = [];
    for (let i = 0; i < setCount; i++) {
      const idLength = take(1)[0];
      if (idLength === 0 || idLength > MAX_SET_ID_BYTES) throw new Error('Invalid set id length');
      const setId = fromUtf8(take(idLength));
      const [hi, lo] = take(2);
      const entry = { setId, setVersion: (hi << 8) | lo };
      if (table.some((t) => sameSet(t, entry))) throw new Error('Set listed twice');
      table.push(entry);
    }

    const runCount = varint();
    if (runCount === 0) throw new Error('A profile needs at least one pack');
    const runs: ProfileRun[] = [];
    let total = 0;
    let used = 0; // sets must appear in the table in order of first use
    for (let i = 0; i < runCount; i++) {
      const index = varint();
      const count = varint();
      if (index >= table.length) throw new Error('Set index out of range');
      if (index > used) throw new Error('Sets are not in order of first use');
      if (index === used) used++;
      if (count === 0) throw new Error('Empty run');
      if (runs.length > 0 && sameSet(runs[runs.length - 1], table[index])) throw new Error('Two runs in a row share a set');
      total += count;
      if (total > MAX_PROFILE_TICKETS) throw new Error('Too many packs for one profile');
      runs.push({ ...table[index], count });
    }
    if (used !== table.length) throw new Error('A listed set is never used');

    const xp = varint();
    const highlightCount = take(1)[0];
    if (highlightCount !== Math.min(PROFILE_HIGHLIGHTS, total)) throw new Error('Wrong number of highlights');
    const highlights: number[] = [];
    for (let i = 0; i < highlightCount; i++) {
      const nonce = varint();
      if (nonce >= total) throw new Error('Highlight is not one of the tickets');
      if (highlights.includes(nonce)) throw new Error('Highlight listed twice');
      highlights.push(nonce);
    }

    const signedLength = o;
    const signature = take(64).slice();
    if (o !== bytes.length) throw new Error('Profile has trailing bytes');
    return { profile: { publicKey, name, runs, xp, highlights, signature }, signed: bytes.subarray(0, signedLength) };
  } catch (error) {
    if (error instanceof ProofError) throw error;
    throw new ProofError('decode', error instanceof Error ? error.message : 'Malformed profile');
  }
};

/** Pull the profile out of a share link, a bare profile string, or text that contains a link. */
export const extractProfile = (text: string): string | null => {
  const match = text.match(/#\/profile\/([A-Za-z0-9_-]{100,})/) ?? text.trim().match(/^([A-Za-z0-9_-]{100,})$/);
  return match ? match[1] : null;
};

export interface CheckedProfile {
  profile: ProfileProof;
  /** Ticket n is tickets[n]: the set it was opened in. */
  tickets: SetDefinition[];
  fingerprint: string;
}

/**
 * Everything but re-opening the packs: strict decoding, name, public key, signature, sets.
 * Cheap, so a viewer can show who and how many right away. Throws a ProofError.
 */
export const checkProfile = (text: string, lookup: SetLookup): CheckedProfile => {
  const { profile, signed } = decodeProfileBytes(text);
  if (!isValidName(profile.name)) throw new ProofError('name', 'Player name contains characters that are not allowed');
  if (!isValidPublicKey(profile.publicKey)) throw new ProofError('publicKey', 'Not a valid player key');
  if (!verifySignature(profile.signature, concatBytes(SIGNATURE_DOMAIN, signed), profile.publicKey)) {
    throw new ProofError('signature', 'Signature does not match');
  }
  const tickets: SetDefinition[] = [];
  for (const run of profile.runs) {
    const set = lookup(run.setId, run.setVersion);
    if (!set) throw new ProofError('set', `Unknown set ${run.setId}@${run.setVersion}`);
    for (let i = 0; i < run.count; i++) tickets.push(set);
  }
  return { profile, tickets, fingerprint: fingerprint(profile.publicKey) };
};

export interface ProfilePack {
  nonce: number;
  set: SetDefinition;
  cards: PulledCard[];
  score: PackScore;
}

export const scorePulled = (cards: readonly PulledCard[]): PackScore =>
  scorePack(cards.map((c) => ({ ...c, cardId: `${c.setId}/${c.cardId}` })));

/** Re-open one ticket of a checked profile. */
export const openProfileTicket = async (checked: CheckedProfile, nonce: number, ticketFn: TicketFn = computeTicket): Promise<ProfilePack> => {
  const set = checked.tickets[nonce];
  const cards = await derivePack(set, checked.profile.publicKey, nonce, ticketFn);
  return { nonce, set, cards, score: scorePulled(cards) };
};

/** What a profile of these packs (all of them, in ticket order) must claim. */
export const claimsFor = (packs: readonly ProfilePack[]): ProfileClaims => {
  const stats = profileStats(packs, PROFILE_HIGHLIGHTS);
  return { xp: stats.xp, highlights: stats.best.map((p) => p.nonce) };
};

/** Section 11.2 step 6, once every pack is re-opened: the claims must be exactly right. */
export const checkClaims = (profile: ProfileClaims, packs: readonly ProfilePack[]): void => {
  const actual = claimsFor(packs);
  if (actual.xp !== profile.xp) throw new ProofError('claims', `Claims ${profile.xp} XP, but the packs earn ${actual.xp}`);
  if (actual.highlights.join() !== profile.highlights.join()) {
    throw new ProofError('claims', "The packs it names as its best aren't its best");
  }
};

/**
 * Re-open every pack of these runs and sign a profile with exactly the right claims. Slow (a ticket
 * per pack): tests and tools use it; the game builds claims from the packs it already opened.
 */
export const createProfile = async (
  unsigned: Omit<UnsignedProfile, keyof ProfileClaims>,
  secretKey: Uint8Array,
  lookup: SetLookup,
  ticketFn: TicketFn = computeTicket,
): Promise<ProfileProof> => {
  const runs = normalizeRuns(unsigned.runs);
  const packs: ProfilePack[] = [];
  let nonce = 0;
  for (const run of runs) {
    const set = lookup(run.setId, run.setVersion);
    if (!set) throw new Error(`Unknown set ${run.setId}@${run.setVersion}`);
    for (let i = 0; i < run.count; i++, nonce++) {
      const cards = await derivePack(set, unsigned.publicKey, nonce, ticketFn);
      packs.push({ nonce, set, cards, score: scorePulled(cards) });
    }
  }
  return signProfile({ ...unsigned, runs, ...claimsFor(packs) }, secretKey);
};

/** Check a profile and re-open every pack in it, in ticket order, then check its claims. */
export const verifyProfile = async (
  text: string,
  lookup: SetLookup,
  ticketFn: TicketFn = computeTicket,
): Promise<{ checked: CheckedProfile; packs: ProfilePack[] }> => {
  const checked = checkProfile(text, lookup);
  const packs: ProfilePack[] = [];
  for (let nonce = 0; nonce < checked.tickets.length; nonce++) packs.push(await openProfileTicket(checked, nonce, ticketFn));
  checkClaims(checked.profile, packs);
  return { checked, packs };
};

// ---- Levels: worked out from the packs themselves, so they're exactly as trustworthy as they are. ----

export const XP_PER_PACK = 10;
export const XP_PER_NEW_CARD = 25;
export const XP_PER_HAND: Record<HandKey, number> = {
  NO_MATCH: 0,
  PAIR: 0,
  TWO_PAIR: 5,
  THREE_OF_A_KIND: 5,
  FULL_HOUSE: 50,
  FOUR_OF_A_KIND: 100,
  FIVE_OF_A_KIND: 1000,
};

const handKeyOf = (score: PackScore): HandKey =>
  (Object.keys(POKER_HANDS) as HandKey[]).find((k) => POKER_HANDS[k].name === score.hand.name) ?? 'NO_MATCH';

/** XP to reach a level: 0, 100, 300, 600, 1000, ... (50 x L x (L - 1)). */
export const xpForLevel = (level: number): number => 50 * level * (level - 1);

export const levelForXp = (xp: number): number => {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
};

export interface ProfileStats {
  packs: number;
  xp: number;
  level: number;
  /** Distinct cards (holo or not counts once), by set id. */
  uniqueBySet: Record<string, number>;
  unique: number;
  holos: number;
  totalScore: number;
  hands: Partial<Record<HandKey, number>>;
  /** Highest score first; ties go to the earlier ticket. */
  best: ProfilePack[];
}

/** Stats for packs in ticket order (they can be a prefix while verification is still running). */
export const profileStats = (packs: readonly ProfilePack[], bestCount = 5): ProfileStats => {
  const seen = new Set<string>();
  const uniqueBySet: Record<string, number> = {};
  const hands: Partial<Record<HandKey, number>> = {};
  let xp = 0;
  let holos = 0;
  let totalScore = 0;
  for (const pack of packs) {
    xp += XP_PER_PACK;
    const hand = handKeyOf(pack.score);
    xp += XP_PER_HAND[hand];
    hands[hand] = (hands[hand] ?? 0) + 1;
    totalScore += pack.score.score;
    for (const card of pack.cards) {
      if (card.isHolo) holos++;
      const key = `${card.setId}/${card.cardId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueBySet[card.setId] = (uniqueBySet[card.setId] ?? 0) + 1;
      xp += XP_PER_NEW_CARD;
    }
  }
  const best = [...packs].sort((a, b) => b.score.score - a.score.score || a.nonce - b.nonce).slice(0, bestCount);
  return { packs: packs.length, xp, level: levelForXp(xp), uniqueBySet, unique: seen.size, holos, totalScore, hands, best };
};
