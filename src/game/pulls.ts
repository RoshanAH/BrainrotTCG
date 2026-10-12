/**
 * Opening packs and turning them into shareable, verifiable pull proofs.
 */
import { getCard, scoreCards, type Card } from '../data/cards';
import {
  encodeProof,
  generatePack,
  packSeedFromTicket,
  setKey,
  signProof,
  verifyProof,
  type PackScore,
  type SetDefinition,
  type VerifiedPull,
} from '../engine';
import { getSet } from '../content/sets';
import { allocateNonce, getPlayer, peekNonce } from './player';
import { getTicket, prefetchTicket } from './ticketMiner';
import type { CardWithMeta } from '../components/cards/Card';

/** Enough to re-derive and re-sign a pull later (e.g. to share a past best pack). */
export interface PullRef {
  setId: string;
  setVersion: number;
  nonce: number;
}

export interface OpenedPack extends PullRef {
  cards: CardWithMeta[];
  score: PackScore;
  openedAt: number;
}

const toCardsWithMeta = (pulled: { setId: string; cardId: string; isHolo: boolean }[]): CardWithMeta[] =>
  pulled.map((p) => {
    const card: Card | undefined = getCard(`${p.setId}/${p.cardId}`);
    if (!card) throw new Error(`Unknown card ${p.setId}/${p.cardId}`);
    return { ...card, uniqueId: Math.random(), isRevealed: false, isHolo: p.isHolo };
  });

/** Mine the next pack's ticket in the background. */
export const prefetchNextPack = (set: SetDefinition) => {
  prefetchTicket(setKey(set), getPlayer().publicKey, peekNonce());
};

/** Open a pack: consume a ticket number, mine (or reuse) its ticket, derive the cards. */
export const openPack = async (set: SetDefinition): Promise<OpenedPack> => {
  const player = getPlayer();
  const nonce = allocateNonce();
  const ticket = await getTicket(setKey(set), player.publicKey, nonce);
  const cards = toCardsWithMeta(generatePack(set, packSeedFromTicket(ticket)));
  prefetchTicket(setKey(set), player.publicKey, nonce + 1);
  return { setId: set.id, setVersion: set.version, nonce, cards, score: scoreCards(cards), openedAt: Date.now() };
};

/** Sign a proof for one of this player's pulls (with their current name). */
export const proofFor = (ref: PullRef): string => {
  const player = getPlayer();
  return encodeProof(
    signProof({ setId: ref.setId, setVersion: ref.setVersion, publicKey: player.publicKey, nonce: ref.nonce, name: player.name }, player.secretKey),
  );
};

export const pullUrl = (proof: string): string => `${window.location.origin}${import.meta.env.BASE_URL}#/pull/${proof}`;

export interface CheckedPull extends VerifiedPull {
  cardsWithMeta: CardWithMeta[];
}

/** Verify a shared pull on this device (ticket mined in the worker). */
export const checkPull = async (proof: string): Promise<CheckedPull> => {
  const verified = await verifyProof(proof, getSet, getTicket);
  return { ...verified, cardsWithMeta: toCardsWithMeta(verified.cards).map((c) => ({ ...c, isRevealed: true })) };
};
