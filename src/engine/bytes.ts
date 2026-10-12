/** Small byte helpers shared by the engine. No DOM or Node APIs, so it runs in the browser, workers and CI scripts. */

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export const utf8 = (text: string): Uint8Array => encoder.encode(text);
export const fromUtf8 = (bytes: Uint8Array): string => decoder.decode(bytes);

export const concatBytes = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
};

export const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export const fromHex = (hex: string): Uint8Array => {
  if (!/^(?:[0-9a-f]{2})*$/i.test(hex)) throw new Error('Invalid hex string');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** base64url without padding (URL-safe, used for share links). */
export const toBase64Url = (bytes: Uint8Array): string => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64[n & 63];
  }
  return out;
};

export const fromBase64Url = (text: string): Uint8Array => {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw new Error('Invalid base64url string');
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < text.length; i += 4) {
    const chunk = text.slice(i, i + 4);
    const n = [...chunk].reduce((acc, c, j) => acc | (B64.indexOf(c) << (18 - 6 * j)), 0);
    out[o++] = (n >> 16) & 255;
    if (chunk.length > 2) out[o++] = (n >> 8) & 255;
    if (chunk.length > 3) out[o++] = n & 255;
  }
  return out;
};

/** Unsigned LEB128 varint, for nonces up to Number.MAX_SAFE_INTEGER. */
export const encodeVarint = (value: number): Uint8Array => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Varint out of range');
  const out: number[] = [];
  let v = value;
  do {
    let byte = v % 128;
    v = Math.floor(v / 128);
    if (v > 0) byte |= 128;
    out.push(byte);
  } while (v > 0);
  return Uint8Array.from(out);
};

export const decodeVarint = (bytes: Uint8Array, offset: number): { value: number; next: number } => {
  let value = 0;
  let scale = 1;
  for (let i = offset; i < bytes.length && i < offset + 8; i++) {
    value += (bytes[i] & 127) * scale;
    if ((bytes[i] & 128) === 0) {
      if (!Number.isSafeInteger(value)) break;
      return { value, next: i + 1 };
    }
    scale *= 128;
  }
  throw new Error('Invalid varint');
};
