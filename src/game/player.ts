/**
 * The local player: an Ed25519 key (their identity in pull proofs), a display
 * name, and the next ticket number. Stored in localStorage; exported with saves.
 */
import { fingerprint, fromHex, generateKeypair, normalizeName, publicKeyFromSecret, toHex } from '../engine';

const STORAGE_KEY = 'brainrot-player-v1';

interface StoredPlayer {
  secretKey: string;
  name: string;
  nextNonce: number;
  createdAt: number;
}

export interface Player {
  name: string;
  secretKey: Uint8Array;
  publicKey: Uint8Array;
  publicKeyHex: string;
  fingerprint: string;
}

const ADJECTIVES = ['Sigma', 'Skibidi', 'Rizzy', 'Goated', 'Mewing', 'Unhinged', 'Feral', 'Bussin', 'Aura', 'Cooked', 'Delulu', 'Cracked', 'Based', 'Zesty', 'Chopped', 'Lowkey'];
const NOUNS = ['Toaster', 'Noodle', 'Gremlin', 'Goblin', 'Capybara', 'Pigeon', 'Banana', 'Raccoon', 'Shrimp', 'Croissant', 'Wizard', 'Penguin', 'Meatball', 'Frog', 'Biscuit', 'Cactus'];

const randomName = () => {
  const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
  return `${pick(ADJECTIVES)} ${pick(NOUNS)} ${Math.floor(Math.random() * 90) + 10}`;
};

const read = (): StoredPlayer | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPlayer;
    if (!/^[0-9a-f]{64}$/.test(parsed.secretKey) || !Number.isSafeInteger(parsed.nextNonce)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const write = (stored: StoredPlayer) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch (error) {
    console.error('Could not save player identity', error);
  }
};

let cached: StoredPlayer | null = null;

const stored = (): StoredPlayer => {
  if (cached) return cached;
  cached = read();
  if (!cached) {
    cached = { secretKey: toHex(generateKeypair().secretKey), name: randomName(), nextNonce: 0, createdAt: Date.now() };
    write(cached);
  }
  return cached;
};

const toPlayer = (s: StoredPlayer): Player => {
  const secretKey = fromHex(s.secretKey);
  const publicKey = publicKeyFromSecret(secretKey);
  return { name: s.name, secretKey, publicKey, publicKeyHex: toHex(publicKey), fingerprint: fingerprint(publicKey) };
};

export const getPlayer = (): Player => toPlayer(stored());

/** The ticket number the next pack will use (without consuming it). */
export const peekNonce = (): number => {
  const fresh = read();
  if (fresh && cached && fresh.nextNonce > cached.nextNonce) cached = fresh; // another tab moved ahead
  return stored().nextNonce;
};

/** Consume the next ticket number. Every opened pack uses a new one. */
export const allocateNonce = (): number => {
  const nonce = peekNonce();
  cached = { ...stored(), nextNonce: nonce + 1 };
  write(cached);
  return nonce;
};

export const renamePlayer = (name: string): Player => {
  const clean = normalizeName(name);
  if (!clean) return getPlayer();
  cached = { ...stored(), name: clean };
  write(cached);
  return toPlayer(cached);
};

/** For save export/import. The secret key is what makes pulls yours, so treat the export as private. */
export const exportPlayer = (): string => JSON.stringify(stored());

export const importPlayer = (raw: string): boolean => {
  try {
    const incoming = JSON.parse(raw) as StoredPlayer;
    if (!/^[0-9a-f]{64}$/.test(incoming.secretKey) || !Number.isSafeInteger(incoming.nextNonce)) return false;
    const current = read();
    // Never move the ticket counter backwards for the same key (that would replay old packs).
    const nextNonce = current?.secretKey === incoming.secretKey ? Math.max(current.nextNonce, incoming.nextNonce) : incoming.nextNonce;
    cached = { ...incoming, name: normalizeName(incoming.name) || randomName(), nextNonce };
    write(cached);
    return true;
  } catch {
    return false;
  }
};
