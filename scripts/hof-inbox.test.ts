import { describe, expect, it } from 'vitest';
import vectors from '../spec/vectors.json';
import { getSet } from '../src/content/sets/index.ts';
import { decodeProof, pullId } from '../src/engine/index.ts';
import { hallOfFameEvent } from '../src/game/nostrInbox.ts';
import { processInbox, type InboxContext } from './hof-inbox.ts';

const byNote = (note: string) => vectors.valid.find((v) => v.note === note)!.proof;
const fourOfAKind = byNote('mined 4 of a Kind'); // qualifies
const pair = byNote('simple'); // real, doesn't qualify
const idOf = (proof: string) => pullId(decodeProof(proof));

const context = (overrides: Partial<InboxContext> = {}) => {
  const filedProofs: string[] = [];
  const ctx: InboxContext = {
    seen: new Set(),
    filed: new Set(),
    budget: 10,
    maxFiled: 10,
    lookup: getSet,
    file: async (proof) => {
      filedProofs.push(proof);
    },
    ...overrides,
  };
  return { ctx, filedProofs };
};

describe('Hall of Fame inbox', () => {
  it('files a qualifying pull once, even when it arrives twice', async () => {
    const { ctx, filedProofs } = context();
    const events = [hallOfFameEvent(fourOfAKind, idOf(fourOfAKind), 1000), hallOfFameEvent(fourOfAKind, idOf(fourOfAKind), 2000)];
    expect((await processInbox(events, ctx)).added).toBe(1);
    expect(filedProofs).toEqual([fourOfAKind]);
    // A later run sees nothing new.
    expect((await processInbox(events, ctx)).added).toBe(0);
  });

  it('ignores pulls that do not qualify, do not verify, or are already in the Hall of Fame', async () => {
    const forged = fourOfAKind.slice(0, -4) + (fourOfAKind.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    const { ctx, filedProofs } = context({ filed: new Set([idOf(byNote('mined 3 of a Kind'))]) });
    const events = [
      hallOfFameEvent(pair, idOf(pair)),
      hallOfFameEvent(forged, 'forged'),
      hallOfFameEvent(byNote('mined 3 of a Kind'), idOf(byNote('mined 3 of a Kind'))),
      { ...hallOfFameEvent(fourOfAKind, idOf(fourOfAKind)), sig: '00'.repeat(64) }, // broken transport signature
    ];
    expect((await processInbox(events, ctx)).added).toBe(0);
    expect(filedProofs).toEqual([]);
  });

  it('stops at the budget and leaves the rest for the next run', async () => {
    const { ctx } = context({ budget: 1 });
    const events = [hallOfFameEvent(pair, idOf(pair), 1000), hallOfFameEvent(fourOfAKind, idOf(fourOfAKind), 2000)];
    expect(await processInbox(events, ctx)).toEqual({ added: 0, deferred: 1 });
    ctx.budget = 1;
    expect((await processInbox(events, ctx)).added).toBe(1);
  });

  it('files at most maxFiled per run and leaves the rest for the next run', async () => {
    const { ctx, filedProofs } = context({ maxFiled: 0 });
    const events = [hallOfFameEvent(fourOfAKind, idOf(fourOfAKind))];
    expect(await processInbox(events, ctx)).toEqual({ added: 0, deferred: 1 });
    ctx.maxFiled = 1;
    expect((await processInbox(events, ctx)).added).toBe(1);
    expect(filedProofs).toEqual([fourOfAKind]);
  });

  it("skips a real, qualifying pull that wouldn't make the list, and doesn't check it again", async () => {
    let asked = 0;
    const { ctx, filedProofs } = context({ accepts: () => (asked++, false) });
    const events = [hallOfFameEvent(fourOfAKind, idOf(fourOfAKind))];
    expect((await processInbox(events, ctx)).added).toBe(0);
    expect((await processInbox(events, ctx)).added).toBe(0);
    expect(filedProofs).toEqual([]);
    expect(asked).toBe(1);
  });

  it('retries next run when filing on GitHub fails', async () => {
    let fail = true;
    const { ctx } = context({
      file: async () => {
        if (fail) throw new Error('GitHub 502');
      },
    });
    const events = [hallOfFameEvent(fourOfAKind, idOf(fourOfAKind))];
    expect((await processInbox(events, ctx)).added).toBe(0);
    fail = false;
    expect((await processInbox(events, ctx)).added).toBe(1);
  });
});
