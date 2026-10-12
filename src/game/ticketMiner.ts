/**
 * Computes tickets in a Web Worker, one at a time (each needs 32 MiB), with a
 * small cache so the next pack can be mined while the current one is on screen.
 */
import { computeTicket, toHex } from '../engine';
import type { TicketRequest, TicketResponse } from '../workers/ticket.worker';

type Pending = { resolve: (t: Uint8Array) => void; reject: (e: Error) => void };

let worker: Worker | null | undefined;
let nextId = 0;
const pending = new Map<number, Pending>();
const cache = new Map<string, Promise<Uint8Array>>();
let queue: Promise<unknown> = Promise.resolve();

const getWorker = (): Worker | null => {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('../workers/ticket.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<TicketResponse>) => {
      const job = pending.get(event.data.id);
      if (!job) return;
      pending.delete(event.data.id);
      if ('ticket' in event.data) job.resolve(event.data.ticket);
      else job.reject(new Error(event.data.error));
    };
  } catch {
    worker = null; // no worker support: fall back to the main thread
  }
  return worker;
};

const run = (setKey: string, publicKey: Uint8Array, nonce: number): Promise<Uint8Array> => {
  const w = getWorker();
  if (!w) return computeTicket(setKey, publicKey, nonce);
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    w.postMessage({ id, setKey, publicKeyHex: toHex(publicKey), nonce } satisfies TicketRequest);
  });
};

/** Get a ticket, mining it if needed. Jobs run one after another. */
export const getTicket = (setKey: string, publicKey: Uint8Array, nonce: number): Promise<Uint8Array> => {
  const key = `${setKey}|${toHex(publicKey)}|${nonce}`;
  let job = cache.get(key);
  if (!job) {
    job = queue.then(() => run(setKey, publicKey, nonce));
    queue = job.catch(() => undefined);
    cache.set(key, job);
    job.catch(() => cache.delete(key));
    // Keep the cache small: tickets for other sets/nonces are cheap to recompute.
    if (cache.size > 8) cache.delete(cache.keys().next().value!);
  }
  return job;
};

/** Start mining a ticket in the background (e.g. the next pack while this one is on screen). */
export const prefetchTicket = (setKey: string, publicKey: Uint8Array, nonce: number): void => {
  void getTicket(setKey, publicKey, nonce).catch(() => undefined);
};
