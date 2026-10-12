import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../constants';
import { getHistory, historyForKey, migratePullLog, recordPack } from './history';
import type { OpenedPack } from './pulls';

/** Minimal localStorage with an optional size cap, to exercise the out-of-space path. */
const installStorage = (maxChars = Infinity) => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (v.length > maxChars) throw new DOMException('full', 'QuotaExceededError');
      data.set(k, v);
    },
    removeItem: (k: string) => data.delete(k),
  });
  return data;
};

const KEY = 'ab'.repeat(32);

const pack = (nonce: number, overrides: Partial<OpenedPack> = {}) =>
  ({
    setId: 'right-now',
    setVersion: 1,
    nonce,
    publicKeyHex: KEY,
    cards: ['bombardiro-crocodilo', 'tung-tung-sahur', 'ballerina-cappuccina', 'chimpanzini-bananini', 'lirili-larila'].map(
      (id, i) => ({ id, isHolo: i === 1 }),
    ),
    score: { hand: { name: 'Pair' }, score: 100 },
    openedAt: 1_000 + nonce,
    ...overrides,
  }) as unknown as OpenedPack;

describe('pack history', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('records packs newest first and round-trips cards and holo flags', () => {
    installStorage();
    recordPack(pack(0));
    recordPack(pack(1));
    const history = getHistory();
    expect(history.map((e) => e.nonce)).toEqual([1, 0]);
    expect(history[0]).toMatchObject({
      setId: 'right-now',
      setVersion: 1,
      key: KEY.slice(0, 16),
      hand: 'Pair',
      score: 100,
    });
    expect(history[0].cards?.slice(0, 2)).toEqual([
      { id: 'bombardiro-crocodilo', holo: false },
      { id: 'tung-tung-sahur', holo: true },
    ]);
  });

  it('keeps one entry per ticket', () => {
    installStorage();
    recordPack(pack(3));
    recordPack(pack(3, { openedAt: 9_999 }));
    expect(getHistory()).toHaveLength(1);
    expect(getHistory()[0].openedAt).toBe(9_999);
  });

  it('lists one key in ticket order', () => {
    installStorage();
    recordPack(pack(2));
    recordPack(pack(0));
    recordPack(pack(1, { publicKeyHex: 'cd'.repeat(32) }));
    expect(historyForKey(KEY).map((e) => e.nonce)).toEqual([0, 2]);
  });

  it('drops cached cards of older packs when storage is full, but keeps every ticket', () => {
    const data = installStorage();
    for (let n = 0; n < 6; n++) recordPack(pack(n));
    const full = data.get(STORAGE_KEYS.HISTORY)!.length;
    installStorage(full); // now exactly at the limit: the next write overflows
    localStorage.setItem(STORAGE_KEYS.HISTORY, data.get(STORAGE_KEYS.HISTORY)!);
    recordPack(pack(6));
    const history = getHistory();
    expect(history.map((e) => e.nonce)).toEqual([6, 5, 4, 3, 2, 1, 0]);
    expect(history[0].cards).not.toBeNull();
    expect(history[history.length - 1].cards).toBeNull();
  });

  it('carries the old notable-pulls log over once, without cards', () => {
    installStorage();
    recordPack(pack(1));
    localStorage.setItem(
      STORAGE_KEYS.PULLS,
      JSON.stringify([
        { setId: 'right-now', setVersion: 1, nonce: 1, publicKeyHex: KEY, score: 100, hand: 'Pair', openedAt: 1001 },
        { setId: 'right-now', setVersion: 1, nonce: 0, publicKeyHex: KEY, score: 50, hand: 'No Matches', openedAt: 1000 },
        { setId: 'genesis', setVersion: 1, nonce: 5, score: 1, hand: 'x', openedAt: 1 },
      ]),
    );
    migratePullLog();
    const history = getHistory();
    expect(history.map((e) => e.nonce)).toEqual([1, 0]);
    expect(history[0].cards).not.toBeNull();
    expect(history[1].cards).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.PULLS)).toBeNull();
  });
});
