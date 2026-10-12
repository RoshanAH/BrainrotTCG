import {
  concatBytes,
  decodeVarint,
  encodeVarint,
  fromBase64Url,
  fromUtf8,
  toBase64Url,
  utf8,
} from './bytes';
import { fingerprint, normalizeName, sign, verifySignature } from './identity';
import { generatePack, packSeedFromTicket } from './pack';
import { scorePack, type PackScore } from './scoring';
import { computeTicket } from './ticket';
import { setKey, type PulledCard, type SetDefinition } from './types';

/**
 * A pull proof: everything needed to re-derive a pack and attribute it to a player.
 *
 * Binary layout (v1), then base64url-encoded:
 *   u8      proof version (1)
 *   u8 + n  set id (utf-8)
 *   u16be   set version
 *   32      player public key (Ed25519)
 *   varint  nonce (ticket number)
 *   u8 + n  display name (utf-8, NFC, <= 24 chars)
 *   64      Ed25519 signature over "brainrot-tcg/proof/v1" || all preceding bytes
 */
export const PROOF_VERSION = 1;
const SIGNATURE_DOMAIN = utf8('brainrot-tcg/proof/v1');

export interface PullProof {
  setId: string;
  setVersion: number;
  publicKey: Uint8Array;
  nonce: number;
  name: string;
  signature: Uint8Array;
}

export type UnsignedProof = Omit<PullProof, 'signature'>;

const encodeUnsigned = (p: UnsignedProof): Uint8Array => {
  const setId = utf8(p.setId);
  const name = utf8(normalizeName(p.name));
  if (setId.length === 0 || setId.length > 64) throw new Error('Invalid set id');
  if (name.length > 255) throw new Error('Name too long');
  if (p.publicKey.length !== 32) throw new Error('Invalid public key');
  return concatBytes(
    Uint8Array.of(PROOF_VERSION, setId.length),
    setId,
    Uint8Array.of((p.setVersion >> 8) & 255, p.setVersion & 255),
    p.publicKey,
    encodeVarint(p.nonce),
    Uint8Array.of(name.length),
    name,
  );
};

export const signProof = (unsigned: UnsignedProof, secretKey: Uint8Array): PullProof => {
  const normalized = { ...unsigned, name: normalizeName(unsigned.name) };
  const signature = sign(concatBytes(SIGNATURE_DOMAIN, encodeUnsigned(normalized)), secretKey);
  return { ...normalized, signature };
};

export const encodeProof = (proof: PullProof): string => toBase64Url(concatBytes(encodeUnsigned(proof), proof.signature));

export const decodeProof = (text: string): PullProof => {
  const bytes = fromBase64Url(text.trim());
  let o = 0;
  const take = (n: number) => {
    if (o + n > bytes.length) throw new Error('Proof is truncated');
    const out = bytes.subarray(o, o + n);
    o += n;
    return out;
  };
  const [version] = take(1);
  if (version !== PROOF_VERSION) throw new Error(`Unsupported proof version ${version}`);
  const setId = fromUtf8(take(take(1)[0]));
  const [hi, lo] = take(2);
  const publicKey = take(32).slice();
  const { value: nonce, next } = decodeVarint(bytes, o);
  o = next;
  const name = fromUtf8(take(take(1)[0]));
  const signature = take(64).slice();
  if (o !== bytes.length) throw new Error('Proof has trailing bytes');
  return { setId, setVersion: (hi << 8) | lo, publicKey, nonce, name, signature };
};

/** Pull the proof out of a share link, a bare proof string, or text that contains a link. */
export const extractProof = (text: string): string | null => {
  const match = text.match(/#\/pull\/([A-Za-z0-9_-]{100,400})/) ?? text.trim().match(/^([A-Za-z0-9_-]{100,400})$/);
  return match ? match[1] : null;
};

export interface VerifiedPull {
  proof: PullProof;
  set: SetDefinition;
  cards: PulledCard[];
  score: PackScore;
  fingerprint: string;
}

export type SetLookup = (setId: string, version: number) => SetDefinition | undefined;

/** Computes a ticket; the browser passes a Web Worker-backed version. */
export type TicketFn = (setKey: string, publicKey: Uint8Array, nonce: number) => Promise<Uint8Array>;

/** Derive the pack for a (set, key, nonce) triple. This is what both opening and verifying do. */
export const derivePack = async (
  set: SetDefinition,
  publicKey: Uint8Array,
  nonce: number,
  ticketFn: TicketFn = computeTicket,
): Promise<PulledCard[]> => {
  const ticket = await ticketFn(setKey(set), publicKey, nonce);
  return generatePack(set, packSeedFromTicket(ticket));
};

/**
 * Verify a proof completely: signature, set, and the pack itself (by recomputing the ticket).
 * Throws with a human-readable reason if anything is off.
 */
export const verifyProof = async (proofText: string, lookup: SetLookup, ticketFn: TicketFn = computeTicket): Promise<VerifiedPull> => {
  const proof = decodeProof(proofText);
  if (normalizeName(proof.name) !== proof.name) throw new Error('Proof name is not normalised');
  const message = concatBytes(SIGNATURE_DOMAIN, encodeUnsigned(proof));
  if (!verifySignature(proof.signature, message, proof.publicKey)) throw new Error('Signature does not match');
  const set = lookup(proof.setId, proof.setVersion);
  if (!set) throw new Error(`Unknown set ${proof.setId}@${proof.setVersion}`);
  const cards = await derivePack(set, proof.publicKey, proof.nonce, ticketFn);
  const score = scorePack(cards.map((c) => ({ ...c, cardId: `${c.setId}/${c.cardId}` })));
  return { proof, set, cards, score, fingerprint: fingerprint(proof.publicKey) };
};
