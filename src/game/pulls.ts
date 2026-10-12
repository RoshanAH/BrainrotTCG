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
  type Rarity,
  type SetDefinition,
  type VerifiedPull,
} from '../engine';
import { getSet } from '../content/sets';
import { allocateNonce, getPlayer, peekNonce } from './player';
import { recordPack } from './history';
import { handKeyFromName, previewPath } from './previewLinks';
import { revealOrder } from './reveal';
import { getTicket, prefetchTicket } from './ticketMiner';
import type { CardWithMeta } from '../components/cards/Card';

/** Enough to re-derive and re-sign a pull later (e.g. to share a past best pack). */
export interface PullRef {
  setId: string;
  setVersion: number;
  nonce: number;
  /** The key that opened it, or a prefix of it. Only that key can share it (older refs have none). */
  publicKeyHex?: string;
}

export interface OpenedPack extends PullRef {
  cards: CardWithMeta[];
  score: PackScore;
  openedAt: number;
}

export const toCardsWithMeta = (pulled: { setId: string; cardId: string; isHolo: boolean }[]): CardWithMeta[] =>
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
  const { nonce, player } = allocateNonce();
  const ticket = await getTicket(setKey(set), player.publicKey, nonce);
  const cards = toCardsWithMeta(generatePack(set, packSeedFromTicket(ticket)));
  prefetchTicket(setKey(set), player.publicKey, nonce + 1);
  const pack: OpenedPack = {
    setId: set.id,
    setVersion: set.version,
    nonce,
    publicKeyHex: player.publicKeyHex,
    cards,
    score: scoreCards(cards),
    openedAt: Date.now(),
  };
  // Recorded now, not after the reveal: the ticket is spent either way, and a profile needs every one.
  recordPack(pack);
  return pack;
};

/** Can this player share this pull? (False after importing a different player's key.) */
export const canShare = (ref: PullRef): boolean => !ref.publicKeyHex || getPlayer().publicKeyHex.startsWith(ref.publicKeyHex);

/** Sign a proof for one of this player's pulls (with their current name). */
export const proofFor = (ref: PullRef): string => {
  const player = getPlayer();
  if (!canShare(ref)) throw new Error('This pull was opened with a different player key, so this device cannot sign it.');
  return encodeProof(
    signProof({ setId: ref.setId, setVersion: ref.setVersion, publicKey: player.publicKey, nonce: ref.nonce, name: player.name }, player.secretKey),
  );
};

/**
 * A pull link. With `preview` (the card to show and the pack's hand), it goes through that card's
 * link-preview page (src/game/previewLinks.ts), so chat apps show the card instead of the site.
 */
export const pullUrl = (proof: string, preview?: { setId: string; cardId: string; hand: string }): string =>
  `${window.location.origin}${import.meta.env.BASE_URL}${preview ? previewPath(preview.setId, preview.cardId, handKeyFromName(preview.hand)) : ''}#/pull/${proof}`;

/** The card a pack's link preview shows: its rarest (holo first), the one revealed last. */
export const previewFor = (cards: readonly { key: string; rarity: Rarity; isHolo: boolean }[], hand: string) => {
  const ordered = revealOrder(cards);
  const best = ordered[ordered.length - 1];
  if (!best) return undefined;
  const [setId, cardId] = best.key.split('/');
  return { setId, cardId, hand };
};

export interface CheckedPull extends VerifiedPull {
  cardsWithMeta: CardWithMeta[];
}

/** Verify a shared pull on this device (ticket mined in the worker). */
export const checkPull = async (proof: string): Promise<CheckedPull> => {
  const verified = await verifyProof(proof, getSet, getTicket);
  return { ...verified, cardsWithMeta: toCardsWithMeta(verified.cards).map((c) => ({ ...c, isRevealed: true })) };
};
