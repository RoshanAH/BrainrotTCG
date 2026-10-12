import {
  concatBytes,
  decodeVarint,
  encodeVarint,
  fromBase64Url,
  fromUtf8,
  toBase64Url,
  toHex,
  utf8,
} from './bytes';
import { fingerprint, isValidName, isValidPublicKey, normalizeName, sign, verifySignature } from './identity';
import { generatePack, packSeedFromTicket } from './pack';
import { scorePack, type PackScore } from './scoring';
import { computeTicket } from './ticket';
import { setKey, type PulledCard, type SetDefinition } from './types';

/**
 * A pull proof: everything needed to re-derive a pack and attribute it to a player.
 * spec/PULL_SPEC.md is the normative description; spec/vectors.json pins this implementation to it.
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

/** Which verification rule a proof broke (spec section 7), checked in this order. */
export type ProofRule = 'decode' | 'name' | 'publicKey' | 'signature' | 'set';

export class ProofError extends Error {
  constructor(
    readonly rule: ProofRule,
    message: string,
  ) {
    super(message);
    this.name = 'ProofError';
  }
}

/** The same pull, however many times it was signed (spec section 7): use this to deduplicate. */
export const pullId = (p: Pick<PullProof, 'setId' | 'setVersion' | 'publicKey' | 'nonce'>): string =>
  `${p.setId}@${p.setVersion}/${toHex(p.publicKey)}/${p.nonce}`;

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

const MAX_SET_ID_BYTES = 64;

/** Strict decoding (spec sections 2 and 6). Throws a ProofError with rule "decode". */
export const decodeProof = (text: string): PullProof => decodeProofBytes(text).proof;

const decodeProofBytes = (text: string): { proof: PullProof; signed: Uint8Array } => {
  try {
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
    const setIdLength = take(1)[0];
    if (setIdLength === 0 || setIdLength > MAX_SET_ID_BYTES) throw new Error('Invalid set id length');
    const setId = fromUtf8(take(setIdLength));
    const [hi, lo] = take(2);
    const publicKey = take(32).slice();
    const { value: nonce, next } = decodeVarint(bytes, o);
    o = next;
    const name = fromUtf8(take(take(1)[0]));
    const signedLength = o;
    const signature = take(64).slice();
    if (o !== bytes.length) throw new Error('Proof has trailing bytes');
    return { proof: { setId, setVersion: (hi << 8) | lo, publicKey, nonce, name, signature }, signed: bytes.subarray(0, signedLength) };
  } catch (error) {
    if (error instanceof ProofError) throw error;
    throw new ProofError('decode', error instanceof Error ? error.message : 'Malformed proof');
  }
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
 * Verify a proof completely (spec section 7): strict decoding, name, public key, signature, set, then
 * re-derive the pack. Throws a ProofError naming the first rule that failed.
 */
export const verifyProof = async (proofText: string, lookup: SetLookup, ticketFn: TicketFn = computeTicket): Promise<VerifiedPull> => {
  const { proof, signed } = decodeProofBytes(proofText);
  if (!isValidName(proof.name)) throw new ProofError('name', 'Player name contains characters that are not allowed');
  if (!isValidPublicKey(proof.publicKey)) throw new ProofError('publicKey', 'Not a valid player key');
  if (!verifySignature(proof.signature, concatBytes(SIGNATURE_DOMAIN, signed), proof.publicKey)) {
    throw new ProofError('signature', 'Signature does not match');
  }
  const set = lookup(proof.setId, proof.setVersion);
  if (!set) throw new ProofError('set', `Unknown set ${proof.setId}@${proof.setVersion}`);
  const cards = await derivePack(set, proof.publicKey, proof.nonce, ticketFn);
  const score = scorePack(cards.map((c) => ({ ...c, cardId: `${c.setId}/${c.cardId}` })));
  return { proof, set, cards, score, fingerprint: fingerprint(proof.publicKey) };
};
