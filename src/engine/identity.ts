import * as ed from '@noble/ed25519';
import { sha256, sha512 } from '@noble/hashes/sha2.js';

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

export const verifySignature = (signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean => {
  try {
    return ed.verify(signature, message, publicKey);
  } catch {
    return false;
  }
};

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Short human-friendly key fingerprint, e.g. "K3QF" (20 bits of SHA-256, Crockford base32). */
export const fingerprint = (publicKey: Uint8Array): string => {
  const h = sha256(publicKey);
  const bits = (h[0] << 12) | (h[1] << 4) | (h[2] >> 4);
  return Array.from({ length: 4 }, (_, i) => CROCKFORD[(bits >> (15 - i * 5)) & 31]).join('');
};

export const MAX_NAME_LENGTH = 24;

/** Normalise a display name: trim, collapse whitespace, strip control chars, cap length. */
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
