import * as ed from '@noble/ed25519';
import { sha256, sha512 } from '@noble/hashes/sha2.js';
import { concatBytes } from './bytes';

// Enable noble's synchronous API.
ed.hashes.sha512 = sha512;

export interface Keypair {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
}

export const generateKeypair = (): Keypair => {
  const secretKey = ed.utils.randomSecretKey();
  return { secretKey, publicKey: ed.getPublicKey(secretKey) };
};

export const publicKeyFromSecret = (secretKey: Uint8Array): Uint8Array => ed.getPublicKey(secretKey);

export const sign = (message: Uint8Array, secretKey: Uint8Array): Uint8Array => ed.sign(message, secretKey);

/** Order of the Ed25519 prime-order subgroup. */
const L = 2n ** 252n + 27742317777372353535851937790883648493n;

const decodePoint = (bytes: Uint8Array): ed.Point | null => {
  try {
    return ed.Point.fromBytes(bytes, false); // strict RFC 8032 decoding: canonical, on the curve
  } catch {
    return null;
  }
};

const littleEndian = (bytes: Uint8Array): bigint => bytes.reduceRight((n, b) => (n << 8n) | BigInt(b), 0n);

/**
 * A usable public key (spec section 7.3): a valid point of prime order L. Rejects the eight
 * small-order points, for which anyone can forge signatures, and keys with a small-order component.
 */
export const isValidPublicKey = (publicKey: Uint8Array): boolean => {
  if (publicKey.length !== 32) return false;
  const A = decodePoint(publicKey);
  return A !== null && !A.is0() && A.isTorsionFree();
};

/**
 * Ed25519 verification exactly as the spec pins it (section 7.4): S < L and the cofactorless
 * equation, i.e. the encoding of [S]B - [k]A equals R byte for byte. Libraries differ here
 * (ZIP-215 and cofactored checks accept more), so we don't delegate it.
 */
export const verifySignature = (signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean => {
  if (signature.length !== 64 || !isValidPublicKey(publicKey)) return false;
  const A = decodePoint(publicKey)!;
  const R = signature.subarray(0, 32);
  const S = littleEndian(signature.subarray(32));
  if (S >= L) return false;
  const k = littleEndian(sha512(concatBytes(R, publicKey, message))) % L;
  const expected = ed.Point.BASE.multiplyUnsafe(S).subtract(A.multiplyUnsafe(k)).toBytes();
  return expected.every((b, i) => b === R[i]);
};

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Human-friendly key fingerprint, e.g. "K3QF-8M2D": 40 bits of SHA-256, Crockford base32 (spec section 9). */
export const fingerprint = (publicKey: Uint8Array): string => {
  const bits = sha256(publicKey)
    .subarray(0, 5)
    .reduce((n, b) => (n << 8n) | BigInt(b), 0n);
  const chars = Array.from({ length: 8 }, (_, i) => CROCKFORD[Number((bits >> BigInt(35 - i * 5)) & 31n)]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
};

export const MAX_NAME_LENGTH = 24;

/**
 * Is this name allowed in a proof (spec section 7.2)? Only fixed character lists, never Unicode
 * tables, so every verifier agrees: no controls, no invisible or bidi format characters, U+0020 as
 * the only space (never leading, trailing or doubled), at most 24 code points.
 */
export const isValidName = (name: string): boolean =>
  Array.from(name).length <= MAX_NAME_LENGTH &&
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  !/[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB\u{E0001}\u{E0020}-\u{E007F}]/u.test(name) &&
  !/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/u.test(name) &&
  !/^ | $| {2}/.test(name);

/** Normalise a display name: trim, collapse whitespace, strip control chars, cap length. Always passes isValidName. */
export const normalizeName = (name: string): string =>
  Array.from(
    name
      .normalize('NFC')
      .replace(/\p{C}/gu, '')
      .replace(/\s+/g, ' ')
      .trim(),
  )
    .slice(0, MAX_NAME_LENGTH)
    .join('')
    .trim();
