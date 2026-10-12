/**
 * Hall of Fame submissions without a GitHub account, through public Nostr relays (NIP-01).
 *
 * The game signs a small event with a throwaway key (the pull proof inside carries the player's own
 * signature, so this key is only a transport) and posts it to several relays. A scheduled GitHub
 * Action (`scripts/hall-of-fame.ts inbox`) reads them, verifies each pull with the same engine, and
 * files the ones that qualify. Relays can drop an event, which is why there are several; they can't
 * forge a pull, because every entry is re-derived from its proof.
 *
 * Runs in the browser and in Node 22 (both have a global WebSocket).
 */
import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { fromHex, toHex, utf8 } from '../engine/bytes';

/** Open public relays (no account, payment or proof-of-work, per their NIP-11 info). */
export const HOF_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net', 'wss://offchain.pub', 'wss://relay.nostr.net'];
/** NIP-78 application data: not a post, so it never shows up in anyone's feed. */
export const HOF_KIND = 30078;
export const HOF_TAG = 'brainrot-tcg-hall-of-fame';

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

type Unsigned = Omit<NostrEvent, 'id' | 'sig'>;

/** NIP-01: sha256 of the serialized [0, pubkey, created_at, kind, tags, content]. */
export const eventId = (e: Unsigned): string => toHex(sha256(utf8(JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content]))));

export const signEvent = (e: Unsigned, secretKey: Uint8Array): NostrEvent => {
  const id = eventId(e);
  return { ...e, id, sig: toHex(schnorr.sign(fromHex(id), secretKey)) };
};

export const verifyEvent = (e: NostrEvent): boolean => {
  try {
    return eventId(e) === e.id && schnorr.verify(fromHex(e.sig), fromHex(e.id), fromHex(e.pubkey));
  } catch {
    return false;
  }
};

/** A Hall of Fame submission for one pull, signed with a fresh throwaway key. */
export const hallOfFameEvent = (proof: string, pullId: string, now = Date.now()): NostrEvent => {
  const secretKey = schnorr.utils.randomSecretKey();
  return signEvent(
    {
      pubkey: toHex(schnorr.getPublicKey(secretKey)),
      created_at: Math.floor(now / 1000),
      kind: HOF_KIND,
      tags: [
        ['d', `brainrot-tcg/hof/${pullId}`],
        ['t', HOF_TAG],
      ],
      content: JSON.stringify({ v: 1, proof }),
    },
    secretKey,
  );
};

/** The proof inside a submission, or null if it isn't one. */
export const proofFromEvent = (e: NostrEvent): string | null => {
  if (e.kind !== HOF_KIND || !e.tags.some((t) => t[0] === 't' && t[1] === HOF_TAG)) return null;
  try {
    const content = JSON.parse(e.content) as { v?: unknown; proof?: unknown };
    return content.v === 1 && typeof content.proof === 'string' && content.proof.length < 2000 ? content.proof : null;
  } catch {
    return null;
  }
};

type Socket = Pick<WebSocket, 'send' | 'close'> & {
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
};
export type SocketFactory = (url: string) => Socket;
const defaultSocket: SocketFactory = (url) => new WebSocket(url) as unknown as Socket;

export interface PublishResult {
  relay: string;
  ok: boolean;
  message: string;
}

/** Send an event to every relay at once; each answers OK (accepted) or not, or times out. */
export const publishEvent = (event: NostrEvent, relays = HOF_RELAYS, timeoutMs = 7000, open: SocketFactory = defaultSocket): Promise<PublishResult[]> =>
  Promise.all(
    relays.map(
      (relay) =>
        new Promise<PublishResult>((resolve) => {
          let done = false;
          let socket: Socket | null = null;
          const finish = (ok: boolean, message: string) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            try {
              socket?.close();
            } catch {
              // already closed
            }
            resolve({ relay, ok, message });
          };
          const timer = setTimeout(() => finish(false, 'timed out'), timeoutMs);
          try {
            socket = open(relay);
          } catch (error) {
            finish(false, String(error));
            return;
          }
          socket.onopen = () => socket!.send(JSON.stringify(['EVENT', event]));
          socket.onmessage = (msg) => {
            try {
              const data = JSON.parse(String(msg.data)) as unknown[];
              if (data[0] === 'OK' && data[1] === event.id) finish(data[2] === true, String(data[3] ?? ''));
            } catch {
              // ignore anything that isn't JSON
            }
          };
          socket.onerror = () => finish(false, 'connection failed');
          socket.onclose = () => finish(false, 'closed');
        }),
    ),
  );

export interface Filter {
  kinds: number[];
  '#t'?: string[];
  since?: number;
  limit?: number;
}

/** Ask every relay for matching events and merge them by id (stops at each relay's EOSE or timeout). */
export const fetchEvents = async (filter: Filter, relays = HOF_RELAYS, timeoutMs = 10000, open: SocketFactory = defaultSocket) => {
  const byId = new Map<string, NostrEvent>();
  const perRelay = await Promise.all(
    relays.map(
      (relay) =>
        new Promise<{ relay: string; count: number; error?: string }>((resolve) => {
          const sub = `hof-${Math.random().toString(36).slice(2, 10)}`;
          let count = 0;
          let done = false;
          let socket: Socket | null = null;
          const finish = (error?: string) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            try {
              socket?.send(JSON.stringify(['CLOSE', sub]));
              socket?.close();
            } catch {
              // already closed
            }
            resolve({ relay, count, error });
          };
          const timer = setTimeout(() => finish('timed out'), timeoutMs);
          try {
            socket = open(relay);
          } catch (error) {
            finish(String(error));
            return;
          }
          socket.onopen = () => socket!.send(JSON.stringify(['REQ', sub, filter]));
          socket.onmessage = (msg) => {
            try {
              const data = JSON.parse(String(msg.data)) as unknown[];
              if (data[0] === 'EVENT' && data[1] === sub && data[2] && typeof data[2] === 'object') {
                const e = data[2] as NostrEvent;
                if (typeof e.id === 'string' && !byId.has(e.id)) byId.set(e.id, e);
                count++;
              } else if ((data[0] === 'EOSE' || data[0] === 'CLOSED') && data[1] === sub) {
                finish(data[0] === 'CLOSED' ? String(data[2] ?? 'closed') : undefined);
              }
            } catch {
              // ignore anything that isn't JSON
            }
          };
          socket.onerror = () => finish('connection failed');
          socket.onclose = () => finish('closed');
        }),
    ),
  );
  return { events: [...byId.values()], perRelay };
};
