/**
 * The engine against spec/vectors.json, the same vectors spec/verify_pull.py (an independent
 * implementation of spec/PULL_SPEC.md) checks. If both pass, the two agree.
 */
import { describe, expect, it } from 'vitest';
import vectors from '../../spec/vectors.json';
import { getSet } from '../content/sets';
import { fromHex, toHex } from './bytes';
import { createRng, generatePack } from './pack';
import { decodeProof, pullId, verifyProof, type ProofRule } from './proof';
import { computeTicket } from './ticket';

const lookup = (id: string, version: number) => getSet(id, version);
const setOf = (key: string) => {
  const [id, version] = key.split('@');
  const set = getSet(id, Number(version));
  if (!set) throw new Error(`unknown set ${key}`);
  return set;
};

describe('spec vectors', () => {
  it('tickets', async () => {
    for (const t of vectors.tickets) {
      expect(toHex(await computeTicket(t.setKey, fromHex(t.publicKey), t.nonce))).toBe(t.ticket);
    }
  });

  it('sfc32', () => {
    for (const r of vectors.rng) {
      const rng = createRng(fromHex(r.seed));
      expect(r.outputs.map(() => rng.next())).toEqual(r.outputs);
    }
  });

  it('packs', () => {
    for (const p of vectors.packs) {
      const cards = generatePack(setOf(p.set), fromHex(p.seed)).map(({ cardId, rarity, isHolo }) => ({ cardId, rarity, isHolo }));
      expect(cards).toEqual(p.cards);
    }
  });

  it('valid proofs', async () => {
    for (const v of vectors.valid) {
      const pull = await verifyProof(v.proof, lookup);
      expect(pull.proof.name, v.note).toBe(v.name);
      expect(toHex(pull.proof.publicKey)).toBe(v.publicKey);
      expect(pull.proof.nonce).toBe(v.nonce);
      expect(pull.fingerprint).toBe(v.fingerprint);
      expect(pull.cards.map(({ cardId, rarity, isHolo }) => ({ cardId, rarity, isHolo }))).toEqual(v.cards);
      expect([pull.score.points, pull.score.hand.name, pull.score.hand.multiplier, pull.score.score]).toEqual([v.points, v.hand, v.multiplier, v.score]);
    }
  });

  it('invalid proofs are rejected for the right reason', async () => {
    for (const v of vectors.invalid) {
      const error = await verifyProof(v.proof, lookup).then(
        () => null,
        (e: { rule?: ProofRule }) => e,
      );
      expect(error, v.note).not.toBeNull();
      expect(error?.rule, v.note).toBe(v.rule);
    }
  });

  it('the same pull signed twice has one pull id', () => {
    for (const s of vectors.samePull) {
      const ids = s.proofs.map((p) => pullId(decodeProof(p)));
      expect(new Set(ids).size).toBe(1);
      expect(ids[0]).toBe(s.pullId);
    }
  });
});
