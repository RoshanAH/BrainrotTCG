/**
 * The engine against the spec's test vectors. spec/vectors.json is generated from this engine
 * (scripts/spec-vectors.ts); spec/vectors-python.json from spec/verify_pull.py, an independent
 * implementation of spec/PULL_SPEC.md. CI runs both implementations on both files.
 */
import { describe, expect, it } from 'vitest';
import engineVectors from '../../spec/vectors.json';
import pythonVectors from '../../spec/vectors-python.json';
import { getSet } from '../content/sets';
import { fromHex, toHex } from './bytes';
import { createRng, generatePack } from './pack';
import { decodeProof, pullId, verifyProof, type ProofRule } from './proof';
import { checkProfile, profileStats, verifyProfile } from './profile';
import { computeTicket } from './ticket';

const lookup = (id: string, version: number) => getSet(id, version);
const setOf = (key: string) => {
  const [id, version] = key.split('@');
  const set = getSet(id, Number(version));
  if (!set) throw new Error(`unknown set ${key}`);
  return set;
};

describe.each([
  ['spec/vectors.json', engineVectors],
  ['spec/vectors-python.json', pythonVectors],
])('%s', (_file, vectors) => {
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

  interface ProfileVector {
    note: string;
    profile: string;
    publicKey: string;
    name: string;
    fingerprint: string;
    tickets: string[];
    packs: { cards: unknown[]; hand: string; score: number }[];
    xp: number;
    level: number;
    highlights: number[];
  }
  const { profiles = [], invalidProfiles = [] } = vectors as { profiles?: ProfileVector[]; invalidProfiles?: { note: string; rule: ProofRule; profile: string }[] };

  it('valid profiles re-open to the listed packs and level', async () => {
    expect(profiles.length).toBeGreaterThan(0);
    for (const v of profiles) {
      const { checked, packs } = await verifyProfile(v.profile, lookup);
      expect(checked.profile.name, v.note).toBe(v.name);
      expect(toHex(checked.profile.publicKey)).toBe(v.publicKey);
      expect(checked.fingerprint).toBe(v.fingerprint);
      expect(checked.tickets.map((s) => `${s.id}@${s.version}`)).toEqual(v.tickets);
      expect(packs.map((p) => ({ cards: p.cards.map(({ cardId, rarity, isHolo }) => ({ cardId, rarity, isHolo })), hand: p.score.hand.name, score: p.score.score }))).toEqual(v.packs);
      const stats = profileStats(packs);
      expect([stats.xp, stats.level], v.note).toEqual([v.xp, v.level]);
      expect(checked.profile.highlights).toEqual(v.highlights);
    }
  });

  it('invalid profiles are rejected for the right reason', async () => {
    expect(invalidProfiles.length).toBeGreaterThan(0);
    for (const v of invalidProfiles) {
      let rule: ProofRule | 'accepted' = 'accepted';
      try {
        // Claims need every pack re-opened; everything else fails before that.
        if (v.rule === 'claims') await verifyProfile(v.profile, lookup);
        else checkProfile(v.profile, lookup);
      } catch (error) {
        rule = (error as { rule: ProofRule }).rule;
      }
      expect(rule, v.note).toBe(v.rule);
    }
  });
});
