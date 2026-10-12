/**
 * A small local log of notable pulls (big hands, high value, rare cards) so
 * they can be shared later. Kept short to stay well within localStorage limits.
 */
import { STORAGE_KEYS } from '../constants';
import { getStoredData, setStoredData } from '../utils/storage';
import type { OpenedPack, PullRef } from './pulls';

export interface LoggedPull extends PullRef {
  score: number;
  hand: string;
  openedAt: number;
}

const MAX_ENTRIES = 200;

const isNotable = (pack: OpenedPack) =>
  pack.score.hand.multiplier >= 10 ||
  pack.score.score >= 200 ||
  pack.cards.some((c) => c.rarity === 'LEGENDARY' || c.rarity === 'BRAINROT');

export const getPullLog = (): LoggedPull[] => {
  const log = getStoredData<LoggedPull[]>(STORAGE_KEYS.PULLS, []);
  return Array.isArray(log) ? log : [];
};

export const recordPull = (pack: OpenedPack) => {
  if (!isNotable(pack)) return;
  const entry: LoggedPull = {
    setId: pack.setId,
    setVersion: pack.setVersion,
    nonce: pack.nonce,
    publicKeyHex: pack.publicKeyHex,
    score: pack.score.score,
    hand: pack.score.hand.name,
    openedAt: pack.openedAt,
  };
  // Keep the best pulls when trimming.
  const log = [entry, ...getPullLog()].sort((a, b) => b.score - a.score).slice(0, MAX_ENTRIES);
  setStoredData(STORAGE_KEYS.PULLS, log);
};
