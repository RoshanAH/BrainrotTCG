/**
 * Packs this device has re-opened while checking someone's profile, so a second look (or the same
 * profile with more packs) only re-opens what's new. Only ever written with packs this device
 * derived itself, so trusting it is trusting this device.
 */
import type { PulledCard, SetDefinition } from '../engine';

const KEY = 'brainrot-reopened-v1';
const MAX_ENTRIES = 5000;

let memory: Map<string, string> | null = null;
let dirty = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const load = (): Map<string, string> => {
  if (memory) return memory;
  try {
    memory = new Map(Object.entries(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>));
  } catch {
    memory = new Map();
  }
  return memory;
};

const flush = () => {
  flushTimer = null;
  if (!dirty || !memory) return;
  dirty = false;
  while (memory.size > MAX_ENTRIES) memory.delete(memory.keys().next().value!);
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(memory)));
  } catch {
    // Out of space: it's only a cache.
    memory.clear();
    localStorage.removeItem(KEY);
  }
};

const keyOf = (set: SetDefinition, publicKeyHex: string, nonce: number) => `${set.id}@${set.version}|${publicKeyHex}|${nonce}`;

export const getReopened = (set: SetDefinition, publicKeyHex: string, nonce: number): PulledCard[] | null => {
  const stored = load().get(keyOf(set, publicKeyHex, nonce));
  if (!stored) return null;
  const cards = stored.split(',').map((c, slot) => {
    const cardId = c.replace(/\*$/, '');
    // This exact version's rarity: a later version may change it (spec section 12).
    const rarity = set.cards.find((card) => card.id === cardId)?.rarity;
    return rarity ? { setId: set.id, cardId, rarity, isHolo: c.endsWith('*'), slot } : null;
  });
  return cards.every((c) => c) ? (cards as PulledCard[]) : null;
};

export const putReopened = (set: SetDefinition, publicKeyHex: string, nonce: number, cards: readonly PulledCard[]) => {
  const map = load();
  const key = keyOf(set, publicKeyHex, nonce);
  map.delete(key); // re-insert as newest
  map.set(key, cards.map((c) => c.cardId + (c.isHolo ? '*' : '')).join(','));
  dirty = true;
  flushTimer ??= setTimeout(flush, 1000);
};
