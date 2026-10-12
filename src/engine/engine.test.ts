import { describe, expect, it } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { decodeVarint, encodeVarint, fromBase64Url, toBase64Url, toHex, utf8 } from './bytes';
import { fingerprint, generateKeypair, normalizeName } from './identity';
import { createRng, generatePack } from './pack';
import { decodeProof, derivePack, encodeProof, extractProof, signProof, verifyProof } from './proof';
import { getPokerHand, scorePack } from './scoring';
import { computeTicket } from './ticket';
import { validateSet, type SetDefinition } from './types';

const TEST_SET: SetDefinition = validateSet({
  id: 'test-set',
  version: 1,
  name: 'Test Set',
  era: 'now',
  releasedAt: '2026-10-12',
  packSize: 5,
  odds: { COMMON: 5000, UNCOMMON: 2500, RARE: 1500, EPIC: 700, LEGENDARY: 250, BRAINROT: 50 },
  holoOdds: 500,
  cards: [
    { id: 'c1', name: 'C1', rarity: 'COMMON' },
    { id: 'c2', name: 'C2', rarity: 'COMMON' },
    { id: 'u1', name: 'U1', rarity: 'UNCOMMON' },
    { id: 'r1', name: 'R1', rarity: 'RARE' },
    { id: 'e1', name: 'E1', rarity: 'EPIC' },
    { id: 'l1', name: 'L1', rarity: 'LEGENDARY' },
    { id: 'b1', name: 'B1', rarity: 'BRAINROT' },
  ],
});
const lookup = (id: string, version: number) => (id === TEST_SET.id && version === TEST_SET.version ? TEST_SET : undefined);

describe('bytes', () => {
  it('round-trips base64url for every length', () => {
    for (let n = 0; n < 40; n++) {
      const bytes = sha256(Uint8Array.of(n)).slice(0, n);
      expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    }
  });

  it('round-trips varints', () => {
    for (const v of [0, 1, 127, 128, 300, 2 ** 31, Number.MAX_SAFE_INTEGER]) {
      expect(decodeVarint(encodeVarint(v), 0).value).toBe(v);
    }
  });
});

describe('pack generation', () => {
  it('is deterministic for a seed (spec lock)', () => {
    const seed = Uint8Array.from({ length: 32 }, (_, i) => i);
    const pack = generatePack(TEST_SET, seed);
    expect(pack).toEqual(generatePack(TEST_SET, seed));
    expect(pack.map((c) => `${c.cardId}${c.isHolo ? '*' : ''}`)).toMatchInlineSnapshot(`
      [
        "l1",
        "c1",
        "c1",
        "c1",
        "c2",
      ]
    `);
  });

  it('matches the configured odds', () => {
    const counts: Record<string, number> = {};
    let holos = 0;
    const packs = 40_000;
    for (let i = 0; i < packs; i++) {
      for (const card of generatePack(TEST_SET, sha256(utf8(`seed-${i}`)))) {
        counts[card.rarity] = (counts[card.rarity] ?? 0) + 1;
        if (card.isHolo) holos++;
      }
    }
    const total = packs * TEST_SET.packSize;
    for (const [rarity, weight] of Object.entries(TEST_SET.odds)) {
      expect(Math.abs(counts[rarity] / total - weight / 10_000)).toBeLessThan(0.004);
    }
    expect(Math.abs(holos / total - 0.05)).toBeLessThan(0.003);
  });

  it('rng.int stays in range', () => {
    const rng = createRng(new Uint8Array(32));
    for (let i = 0; i < 10_000; i++) {
      const v = rng.int(7);
      expect(v >= 0 && v < 7).toBe(true);
    }
  });
});

describe('scoring', () => {
  const card = (cardId: string, isHolo = false) => ({ cardId, rarity: 'COMMON' as const, isHolo });
  it('detects poker hands', () => {
    expect(getPokerHand([card('a'), card('a'), card('a'), card('b'), card('b')]).name).toBe('Full House');
    expect(getPokerHand([card('a'), card('a'), card('a'), card('a'), card('b')]).name).toBe('4 of a Kind');
    expect(getPokerHand([card('a'), card('b'), card('c'), card('d'), card('e')]).name).toBe('No Matches');
  });
  it('multiplies value by the hand', () => {
    expect(scorePack([card('a'), card('a'), card('b'), card('c'), card('d', true)]).flexValue).toBe((4 + 20) * 2);
  });
});

describe('tickets and proofs', () => {
  it('ticket hash is fixed for given inputs (spec lock: changing params needs a new ticket version)', async () => {
    const ticket = await computeTicket('test-set@1', new Uint8Array(32), 0);
    expect(toHex(ticket)).toMatchInlineSnapshot(`"bac88a9a2bc2ccf35d6a9a2521cb7acf33a8ff99ac1d13546a675b8d21b07b35"`);
  });

  it('round-trips and verifies a signed proof', async () => {
    const { secretKey, publicKey } = generateKeypair();
    const proof = signProof({ setId: 'test-set', setVersion: 1, publicKey, nonce: 42, name: '  Sigma   Toaster 🍞 ' }, secretKey);
    const text = encodeProof(proof);
    expect(text.length).toBeLessThan(220);
    expect(decodeProof(text)).toEqual(proof);
    expect(proof.name).toBe('Sigma Toaster 🍞');

    const verified = await verifyProof(text, lookup);
    expect(verified.cards).toEqual(await derivePack(TEST_SET, publicKey, 42));
    expect(verified.fingerprint).toBe(fingerprint(publicKey));
    expect(extractProof(`look https://x.github.io/BrainrotTCG/#/pull/${text} wow`)).toBe(text);
  });

  it('rejects tampered proofs', async () => {
    const { secretKey, publicKey } = generateKeypair();
    const proof = signProof({ setId: 'test-set', setVersion: 1, publicKey, nonce: 7, name: 'Evan' }, secretKey);
    const tamperedNonce = encodeProof({ ...proof, nonce: 8 });
    const tamperedName = encodeProof({ ...proof, name: 'Not Evan' });
    await expect(verifyProof(tamperedNonce, lookup)).rejects.toThrow(/Signature/);
    await expect(verifyProof(tamperedName, lookup)).rejects.toThrow(/Signature/);
    const other = signProof({ setId: 'nope', setVersion: 1, publicKey, nonce: 7, name: 'Evan' }, secretKey);
    await expect(verifyProof(encodeProof(other), lookup)).rejects.toThrow(/Unknown set/);
  });

  it('normalises names', () => {
    expect(normalizeName('a\u0000b\n  c')).toBe('ab c');
    expect(Array.from(normalizeName('🍞'.repeat(40))).length).toBe(24);
  });
});
