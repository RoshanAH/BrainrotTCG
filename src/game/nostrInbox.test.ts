import { describe, expect, it } from 'vitest';
import { schnorr } from '@noble/curves/secp256k1.js';
import { toHex } from '../engine/bytes';
import { fetchEvents, hallOfFameEvent, HOF_KIND, HOF_TAG, proofFromEvent, publishEvent, signEvent, verifyEvent, type NostrEvent, type SocketFactory } from './nostrInbox';

/** An in-memory relay: answers EVENT with OK (or a refusal) and REQ with stored events then EOSE. */
const fakeRelays = (behaviour: Record<string, 'accept' | 'refuse' | 'silent' | 'fail'>, stored: NostrEvent[] = []): SocketFactory => (url) => {
  const socket = {
    onopen: null as ((e: unknown) => void) | null,
    onmessage: null as ((e: { data: unknown }) => void) | null,
    onerror: null as ((e: unknown) => void) | null,
    onclose: null as ((e: unknown) => void) | null,
    send: (raw: string) => {
      const msg = JSON.parse(raw) as unknown[];
      const reply = (data: unknown[]) => queueMicrotask(() => socket.onmessage?.({ data: JSON.stringify(data) }));
      if (msg[0] === 'EVENT' && behaviour[url] === 'accept') reply(['OK', (msg[1] as NostrEvent).id, true, '']);
      if (msg[0] === 'EVENT' && behaviour[url] === 'refuse') reply(['OK', (msg[1] as NostrEvent).id, false, 'blocked: no']);
      if (msg[0] === 'REQ') {
        for (const e of stored) reply(['EVENT', msg[1], e]);
        reply(['EOSE', msg[1]]);
      }
    },
    close: () => undefined,
  };
  queueMicrotask(() => (behaviour[url] === 'fail' ? socket.onerror?.({}) : socket.onopen?.({})));
  return socket;
};

describe('nostr inbox', () => {
  it('signs NIP-01 events that verify, and rejects any edit', () => {
    const event = hallOfFameEvent('PROOF', 'right-now@1/abc/9', 1_700_000_000_000);
    expect(event.kind).toBe(HOF_KIND);
    expect(event.created_at).toBe(1_700_000_000);
    expect(event.tags).toContainEqual(['t', HOF_TAG]);
    expect(verifyEvent(event)).toBe(true);
    expect(verifyEvent({ ...event, content: event.content.replace('PROOF', 'PROOX') })).toBe(false);
    expect(verifyEvent({ ...event, sig: '00'.repeat(64) })).toBe(false);
    expect(proofFromEvent(event)).toBe('PROOF');
  });

  it('uses a fresh key for every submission', () => {
    expect(hallOfFameEvent('P', 'x').pubkey).not.toBe(hallOfFameEvent('P', 'x').pubkey);
  });

  it('only reads submissions in the expected shape', () => {
    const sk = schnorr.utils.randomSecretKey();
    const pubkey = toHex(schnorr.getPublicKey(sk));
    const make = (kind: number, tags: string[][], content: string) => signEvent({ pubkey, created_at: 1, kind, tags, content }, sk);
    expect(proofFromEvent(make(1, [['t', HOF_TAG]], '{"v":1,"proof":"P"}'))).toBeNull(); // wrong kind
    expect(proofFromEvent(make(HOF_KIND, [['t', 'other']], '{"v":1,"proof":"P"}'))).toBeNull(); // wrong tag
    expect(proofFromEvent(make(HOF_KIND, [['t', HOF_TAG]], 'not json'))).toBeNull();
    expect(proofFromEvent(make(HOF_KIND, [['t', HOF_TAG]], '{"v":2,"proof":"P"}'))).toBeNull(); // unknown version
    expect(proofFromEvent(make(HOF_KIND, [['t', HOF_TAG]], JSON.stringify({ v: 1, proof: 'x'.repeat(5000) })))).toBeNull();
  });

  it('reports which relays accepted a submission', async () => {
    const event = hallOfFameEvent('P', 'x');
    const relays = ['wss://a', 'wss://b', 'wss://c', 'wss://d'];
    const results = await publishEvent(event, relays, 200, fakeRelays({ 'wss://a': 'accept', 'wss://b': 'refuse', 'wss://c': 'silent', 'wss://d': 'fail' }));
    expect(results.map((r) => [r.relay, r.ok])).toEqual([
      ['wss://a', true],
      ['wss://b', false],
      ['wss://c', false],
      ['wss://d', false],
    ]);
    expect(results[2].message).toBe('timed out');
  });

  it('merges what every relay returns, once per event', async () => {
    const a = hallOfFameEvent('A', 'a');
    const b = hallOfFameEvent('B', 'b');
    const { events, perRelay } = await fetchEvents({ kinds: [HOF_KIND] }, ['wss://a', 'wss://b'], 200, fakeRelays({ 'wss://a': 'accept', 'wss://b': 'accept' }, [a, b]));
    expect(events.map((e) => e.id).sort()).toEqual([a.id, b.id].sort());
    expect(perRelay.map((r) => r.count)).toEqual([2, 2]);
  });
});
