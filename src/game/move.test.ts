import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importSave } from './move';

/** Just enough of localStorage and window for importSave. */
const store = new Map<string, string>();
const confirm = vi.fn(() => true);
Object.assign(globalThis, {
  localStorage: {
    get length() {
      return store.size;
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
  window: { confirm, location: { origin: 'https://new.example' } },
});

const player = (secretKey: string) => JSON.stringify({ secretKey, name: 'Combo Miner', nextNonce: 3, createdAt: 1 });
const OLD = { 'brainrot-player-v1': player('aa'), 'brainrot-found-collection-v1': '{"x/y":{"normal":1}}', 'brainrot-settings-v1': '{}' };

describe('bringing a save over', () => {
  beforeEach(() => {
    store.clear();
    confirm.mockClear();
    confirm.mockReturnValue(true);
  });

  it('takes a save into an empty address without asking', () => {
    expect(importSave(OLD)).toBe('saved');
    expect(store.get('brainrot-player-v1')).toBe(OLD['brainrot-player-v1']);
    expect(store.get('brainrot-found-collection-v1')).toBe(OLD['brainrot-found-collection-v1']);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('takes an old save from before player keys', () => {
    expect(importSave({ 'brainrot-found-collection-v1': '{}', 'brainrot-stats-v1': '{}' })).toBe('saved');
    expect(store.has('brainrot-stats-v1')).toBe(true);
  });

  it('ignores anything that is not a save', () => {
    expect(importSave(null)).toBe('invalid');
    expect(importSave('brainrot')).toBe('invalid');
    expect(importSave({ 'brainrot-settings-v1': '{}' })).toBe('invalid'); // no progress in it
    expect(importSave({ 'brainrot-player-v1': 5, other: 'x' })).toBe('invalid');
    expect(store.size).toBe(0);
  });

  it('only writes brainrot keys with string values', () => {
    importSave({ ...OLD, 'unrelated-key': 'x', 'brainrot-stats-v1': 7 });
    expect(store.has('unrelated-key')).toBe(false);
    expect(store.has('brainrot-stats-v1')).toBe(false);
  });

  it('does nothing when the same player is already here', () => {
    store.set('brainrot-player-v1', player('aa'));
    store.set('brainrot-found-collection-v1', '{"newer":{"normal":9}}');
    expect(importSave(OLD)).toBe('same');
    expect(store.get('brainrot-found-collection-v1')).toBe('{"newer":{"normal":9}}');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('asks before replacing a different save, and keeps it as a backup', () => {
    store.set('brainrot-player-v1', player('bb'));
    store.set('brainrot-stats-v1', '{"packsOpened":4}');
    confirm.mockReturnValue(false);
    expect(importSave(OLD)).toBe('kept');
    expect(store.get('brainrot-player-v1')).toBe(player('bb'));

    confirm.mockReturnValue(true);
    expect(importSave(OLD)).toBe('saved');
    expect(store.get('brainrot-player-v1')).toBe(player('aa'));
    expect(store.has('brainrot-stats-v1')).toBe(false); // nothing of the old save mixed in
    const backup = JSON.parse(store.get('brainrot-before-move-v1')!) as Record<string, string>;
    expect(backup['brainrot-player-v1']).toBe(player('bb'));
    expect(backup['brainrot-stats-v1']).toBe('{"packsOpened":4}');
  });

  it("doesn't ask when this browser only visited (a player key with no packs)", () => {
    store.set('brainrot-player-v1', JSON.stringify({ secretKey: 'cc', name: 'Visitor', nextNonce: 0, createdAt: 2 }));
    store.set('brainrot-stats-v1', '{"packsOpened":0,"holoCards":{}}');
    store.set('brainrot-achievements-v1', '{}');
    expect(importSave(OLD)).toBe('saved');
    expect(store.get('brainrot-player-v1')).toBe(player('aa'));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('lets the caller decide instead of asking (Settings asks in the page)', () => {
    store.set('brainrot-player-v1', player('bb'));
    expect(importSave(OLD, () => false)).toBe('kept');
    expect(store.get('brainrot-player-v1')).toBe(player('bb'));
    expect(importSave(OLD, () => true)).toBe('saved');
    expect(store.get('brainrot-player-v1')).toBe(player('aa'));
    expect(confirm).not.toHaveBeenCalled();
  });
});
