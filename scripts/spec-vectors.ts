/**
 * Writes spec/vectors.json: test vectors for spec/PULL_SPEC.md. Valid pulls come from the engine;
 * invalid ones are built byte by byte so they exercise each rejection rule.
 *
 *   npx tsx scripts/spec-vectors.ts
 *
 * The vectors only need regenerating when a set or the spec gains a version. Both the engine tests
 * and spec/verify_pull.py check them.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sha256 } from '@noble/hashes/sha2.js';
import { getSet } from '../src/content/sets/index.ts';
import {
  computeTicket,
  concatBytes,
  createRng,
  derivePack,
  encodeProof,
  encodeVarint,
  fromBase64Url,
  generatePack,
  publicKeyFromSecret,
  qualifiesForHallOfFame,
  scorePack,
  setKey,
  sign,
  signProof,
  toBase64Url,
  toHex,
  utf8,
  type SetDefinition,
} from '../src/engine/index.ts';

const OUT = fileURLToPath(new URL('../spec/vectors.json', import.meta.url));
const hash = (label: string) => sha256(utf8(label));
const must = (id: string, version: number): SetDefinition => {
  const set = getSet(id, version);
  if (!set) throw new Error(`missing ${id}@${version}`);
  return set;
};

const KEYS = [hash('brainrot-tcg/vector-key/1'), hash('brainrot-tcg/vector-key/2')];
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** Spec section 9: first 40 bits of SHA-256(public key), Crockford base32. */
const fingerprint40 = (publicKey: Uint8Array) => {
  let bits = 0n;
  for (const b of sha256(publicKey).subarray(0, 5)) bits = (bits << 8n) | BigInt(b);
  const chars = Array.from({ length: 8 }, (_, i) => CROCKFORD[Number((bits >> BigInt(35 - i * 5)) & 31n)]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
};

// --- tickets ---
const ticketCases = [
  { setKey: 'test-set@1', publicKey: new Uint8Array(32), nonce: 0 },
  { setKey: 'right-now@1', publicKey: publicKeyFromSecret(KEYS[0]), nonce: 7 },
  { setKey: 'web-ancients@1', publicKey: publicKeyFromSecret(KEYS[1]), nonce: 2 ** 40 + 3 },
];
const tickets = [];
for (const t of ticketCases) {
  tickets.push({ setKey: t.setKey, publicKey: toHex(t.publicKey), nonce: t.nonce, ticket: toHex(await computeTicket(t.setKey, t.publicKey, t.nonce)) });
}

// --- PRNG ---
const rng = [1, 2].map((i) => {
  const seed = hash(`brainrot-tcg/vector-seed/${i}`);
  const r = createRng(seed);
  return { seed: toHex(seed), outputs: Array.from({ length: 8 }, () => r.next()) };
});

// --- packs straight from seeds ---
const packs = [];
for (const [id, version] of [['genesis', 1], ['right-now', 1], ['lockdown-lore', 1]] as const) {
  const set = must(id, version);
  for (let i = 0; i < 3; i++) {
    const seed = hash(`brainrot-tcg/vector-pack/${id}/${i}`);
    packs.push({
      set: setKey(set),
      seed: toHex(seed),
      cards: generatePack(set, seed).map(({ cardId, rarity, isHolo }) => ({ cardId, rarity, isHolo })),
    });
  }
}

// --- valid proofs ---
const valid: unknown[] = [];
const addValid = async (set: SetDefinition, sk: Uint8Array, nonce: number, name: string, note: string) => {
  const publicKey = publicKeyFromSecret(sk);
  const proof = signProof({ setId: set.id, setVersion: set.version, publicKey, nonce, name }, sk);
  const cards = await derivePack(set, publicKey, nonce);
  const score = scorePack(cards);
  valid.push({
    note,
    proof: encodeProof(proof),
    set: setKey(set),
    publicKey: toHex(publicKey),
    nonce,
    name: proof.name,
    fingerprint: fingerprint40(publicKey),
    cards: cards.map(({ cardId, rarity, isHolo }) => ({ cardId, rarity, isHolo })),
    points: score.points,
    hand: score.hand.name,
    multiplier: score.hand.multiplier,
    score: score.score,
    hallOfFame: qualifiesForHallOfFame(score),
  });
  return proof;
};
await addValid(must('right-now', 1), KEYS[0], 0, 'Evan', 'simple');
await addValid(must('web-ancients', 1), KEYS[0], 1, 'Zo\u00EB \u{1F9E0} Brainrot', 'non-ASCII name');
await addValid(must('genesis', 1), KEYS[1], 300, '', 'empty name, archived set');
await addValid(must('vine-and-dank', 1), KEYS[1], 2 ** 40 + 3, 'Big Nonce', 'multi-byte varint');
// A mined combo, so scoring multipliers get exercised.
const lockdown = must('lockdown-lore', 1);
const wanted = [10, 15, 150];
for (let nonce = 0; nonce < 5000 && wanted.length; nonce++) {
  const score = scorePack(await derivePack(lockdown, publicKeyFromSecret(KEYS[0]), nonce));
  if (score.hand.multiplier >= wanted[0]) {
    await addValid(lockdown, KEYS[0], nonce, 'Combo Miner', `mined ${score.hand.name}`);
    wanted.shift();
  }
}

// --- invalid proofs ---
const PROOF_DOMAIN = utf8('brainrot-tcg/proof/v1');
interface Raw {
  version?: number;
  setId?: Uint8Array;
  setVersion?: number;
  publicKey?: Uint8Array;
  nonce?: Uint8Array;
  name?: Uint8Array;
}
const sk = KEYS[0];
const pk = publicKeyFromSecret(sk);
const body = (r: Raw = {}) => {
  const setId = r.setId ?? utf8('right-now');
  const name = r.name ?? utf8('Evan');
  const v = r.setVersion ?? 1;
  return concatBytes(
    Uint8Array.of(r.version ?? 1, setId.length),
    setId,
    Uint8Array.of(v >> 8, v & 255),
    r.publicKey ?? pk,
    r.nonce ?? encodeVarint(5),
    Uint8Array.of(name.length),
    name,
  );
};
/** Sign exactly these bytes (no normalisation), like a hostile client would. */
const signed = (r: Raw = {}) => {
  const b = body(r);
  return concatBytes(b, sign(concatBytes(PROOF_DOMAIN, b), sk));
};
const b64 = toBase64Url;
const good = signed();
const flip = (bytes: Uint8Array, index: number) => {
  const out = bytes.slice();
  out[index < 0 ? out.length + index : index] ^= 1;
  return out;
};
const L = 2n ** 252n + 27742317777372353535851937790883648493n;
const addL = (sig: Uint8Array) => {
  let s = 0n;
  for (let i = 63; i >= 32; i--) s = (s << 8n) | BigInt(sig[i]);
  s += L;
  const out = sig.slice();
  for (let i = 32; i < 64; i++) {
    out[i] = Number(s & 255n);
    s >>= 8n;
  }
  return out;
};
// Non-minimal varint for nonce 5: 0x85 0x00. Signed over the non-minimal bytes.
const nonMinimal = signed({ nonce: Uint8Array.of(0x85, 0x00) });
// The same pull re-encoded: canonical signature, but the varint in the link is non-minimal.
const goodBody = body();
const nonceAt = goodBody.length - 1 - 4 - 1; // [.. nonce][len][E v a n]
const relaxed = concatBytes(goodBody.subarray(0, nonceAt), Uint8Array.of(0x85, 0x00), goodBody.subarray(nonceAt + 1), good.subarray(good.length - 64));
// base64url with non-zero unused bits in the last character (needs a length that isn't a multiple of 3).
const oddLength = signed({ name: utf8('Evan!') });
if (oddLength.length % 3 === 0) throw new Error('pick another name length');
const nonCanonicalB64 = (() => {
  const text = b64(oddLength);
  const last = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.indexOf(text[text.length - 1]);
  return text.slice(0, -1) + 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[last | 1];
})();
const identity = Uint8Array.from({ length: 32 }, (_, i) => (i === 0 ? 1 : 0));
const smallOrderForgery = concatBytes(body({ publicKey: identity }), identity, new Uint8Array(32));

const invalid = [
  { note: 'signature byte flipped', rule: 'signature', proof: b64(flip(good, -1)) },
  { note: 'nonce changed after signing', rule: 'signature', proof: b64(concatBytes(body({ nonce: encodeVarint(6) }), good.subarray(good.length - 64))) },
  { note: 'trailing byte', rule: 'decode', proof: b64(concatBytes(good, Uint8Array.of(0))) },
  { note: 'truncated', rule: 'decode', proof: b64(good.subarray(0, good.length - 1)) },
  { note: 'unsupported proof version', rule: 'decode', proof: b64(signed({ version: 2 })) },
  { note: 'empty set id', rule: 'decode', proof: b64(signed({ setId: new Uint8Array(0) })) },
  { note: 'non-minimal varint (signed as sent)', rule: 'decode', proof: b64(nonMinimal) },
  { note: 'non-minimal varint (re-encoded copy of a valid pull)', rule: 'decode', proof: b64(relaxed) },
  { note: 'varint above 2^53-1', rule: 'decode', proof: b64(signed({ nonce: Uint8Array.of(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01) })) },
  { note: 'base64url with non-zero unused bits', rule: 'decode', proof: nonCanonicalB64 },
  { note: 'base64url padding', rule: 'decode', proof: `${b64(good)}=` },
  { note: 'invalid UTF-8 in name', rule: 'decode', proof: b64(signed({ name: Uint8Array.of(0x45, 0xc3, 0x28) })) },
  { note: 'name not normalised (double space)', rule: 'name', proof: b64(signed({ name: utf8('Evan  Lin') })) },
  { note: 'name with a byte order mark', rule: 'name', proof: b64(signed({ name: utf8('\uFEFFEvan') })) },
  { note: 'name with a zero-width joiner', rule: 'name', proof: b64(signed({ name: utf8('Ev\u200Dan') })) },
  { note: 'name with a no-break space', rule: 'name', proof: b64(signed({ name: utf8('Ev\u00A0an') })) },
  { note: 'name with a trailing space', rule: 'name', proof: b64(signed({ name: utf8('Evan ') })) },
  { note: 'name with right-to-left override', rule: 'name', proof: b64(signed({ name: utf8('Evan\u202Egnp.exe') })) },
  { note: 'name over 24 code points', rule: 'name', proof: b64(signed({ name: utf8('x'.repeat(25)) })) },
  { note: 'small-order public key with a forged signature', rule: 'publicKey', proof: b64(smallOrderForgery) },
  { note: 'non-canonical public key encoding', rule: 'publicKey', proof: b64(signed({ publicKey: Uint8Array.from({ length: 32 }, (_, i) => (i === 31 ? 0x7f : i === 0 ? 0xee : 0xff)) })) },
  { note: 'signature with S + L (malleated)', rule: 'signature', proof: b64(concatBytes(good.subarray(0, good.length - 64), addL(good.subarray(good.length - 64)))) },
  { note: 'unknown set', rule: 'set', proof: b64(signed({ setId: utf8('no-such-set') })) },
  { note: 'unknown set version', rule: 'set', proof: b64(signed({ setVersion: 99 })) },
];
// Sanity: everything decodes as base64url-ish text the way we intended.
for (const v of invalid) if (!/^[A-Za-z0-9_=-]+$/.test(v.proof)) throw new Error(`bad vector ${v.note}`);
void fromBase64Url;

// Names are checked against fixed lists only (no NFC, no Unicode categories), so these are valid.
for (const [note, name] of [
  ['name not in NFC (valid; UIs normalise for display)', 'Zoe\u0308'],
  ['name with an unassigned code point (valid in every Unicode version)', 'E\u0378van'],
] as const) {
  const set = must('right-now', 1);
  const cards = await derivePack(set, pk, 5);
  const score = scorePack(cards);
  valid.push({
    note,
    proof: b64(signed({ name: utf8(name) })),
    set: setKey(set),
    publicKey: toHex(pk),
    nonce: 5,
    name,
    fingerprint: fingerprint40(pk),
    cards: cards.map(({ cardId, rarity, isHolo }) => ({ cardId, rarity, isHolo })),
    points: score.points,
    hand: score.hand.name,
    multiplier: score.hand.multiplier,
    score: score.score,
    hallOfFame: qualifiesForHallOfFame(score),
  });
}

// --- the same pull, signed twice with different names ---
const a = signProof({ setId: 'right-now', setVersion: 1, publicKey: pk, nonce: 9, name: 'First' }, sk);
const bSame = signProof({ setId: 'right-now', setVersion: 1, publicKey: pk, nonce: 9, name: 'Second' }, sk);
const samePull = [{ note: 'same set, key and nonce: one pull for leaderboards', proofs: [encodeProof(a), encodeProof(bSame)], pullId: `right-now@1/${toHex(pk)}/9` }];

writeFileSync(
  OUT,
  JSON.stringify({ spec: 'spec/PULL_SPEC.md', version: 1, tickets, rng, packs, valid, invalid, samePull }, null, 2) + '\n',
);
console.log(`wrote ${OUT}: ${tickets.length} tickets, ${packs.length} packs, ${valid.length} valid, ${invalid.length} invalid`);
