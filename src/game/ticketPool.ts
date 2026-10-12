/**
 * Several ticket workers at once, for verifying a whole profile (hundreds of tickets). Each worker
 * needs 32 MiB, so the pool stays small. Separate from ticketMiner, which keeps one worker for
 * opening packs so that never waits behind a long verification.
 */
import { computeTicket, toHex } from '../engine';
import type { TicketRequest, TicketResponse } from '../workers/ticket.worker';

export interface TicketPool {
  ticket: (setKey: string, publicKey: Uint8Array, nonce: number) => Promise<Uint8Array>;
  /** Stop every worker; pending tickets reject. */
  close: () => void;
  size: number;
}

/** One worker per spare core, up to 8 where there's memory for it (32 MiB each), else 4. */
export const poolSize = () => {
  const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
  return Math.max(1, Math.min(memory >= 8 ? 8 : 4, (navigator.hardwareConcurrency || 2) - 1));
};

export const createTicketPool = (size = poolSize()): TicketPool => {
  type Job = { request: TicketRequest; publicKey: Uint8Array; resolve: (t: Uint8Array) => void; reject: (e: Error) => void };
  const queue: Job[] = [];
  const busy = new Map<Worker, Job>();
  const idle: Worker[] = [];
  let closed = false;
  let nextId = 0;

  const pump = () => {
    while (!closed && idle.length > 0 && queue.length > 0) {
      const worker = idle.pop()!;
      const job = queue.shift()!;
      busy.set(worker, job);
      worker.postMessage(job.request);
    }
  };

  const workers: Worker[] = [];
  for (let i = 0; i < size; i++) {
    let worker: Worker;
    try {
      worker = new Worker(new URL('../workers/ticket.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      break;
    }
    worker.onmessage = (event: MessageEvent<TicketResponse>) => {
      const job = busy.get(worker);
      busy.delete(worker);
      idle.push(worker);
      if (job) {
        if ('ticket' in event.data) job.resolve(event.data.ticket);
        else job.reject(new Error(event.data.error));
      }
      pump();
    };
    // A worker that dies hands its job to the main thread and leaves the pool.
    worker.onerror = (event) => {
      event.preventDefault();
      const job = busy.get(worker);
      busy.delete(worker);
      worker.terminate();
      workers.splice(workers.indexOf(worker), 1);
      if (job) computeTicket(job.request.setKey, job.publicKey, job.request.nonce).then(job.resolve, job.reject);
      if (workers.length === 0) {
        for (const j of queue.splice(0)) computeTicket(j.request.setKey, j.publicKey, j.request.nonce).then(j.resolve, j.reject);
      }
    };
    workers.push(worker);
    idle.push(worker);
  }

  return {
    size: Math.max(1, workers.length),
    ticket: (setKey, publicKey, nonce) => {
      if (closed) return Promise.reject(new Error('Ticket pool closed'));
      if (workers.length === 0) return computeTicket(setKey, publicKey, nonce);
      return new Promise((resolve, reject) => {
        queue.push({ request: { id: nextId++, setKey, publicKeyHex: toHex(publicKey), nonce }, publicKey, resolve, reject });
        pump();
      });
    },
    close: () => {
      closed = true;
      for (const worker of workers) worker.terminate();
      const stopped = new Error('Ticket pool closed');
      for (const job of [...queue.splice(0), ...busy.values()]) job.reject(stopped);
      busy.clear();
    },
  };
};
