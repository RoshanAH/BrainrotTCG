# Architecture

Brainrot TCG is a static site (Vite + React on GitHub Pages) with **no backend**. Every pull is
still verifiable by anyone, because packs are derived from proofs rather than stored anywhere.

## Layers

```
src/engine/        Pure TypeScript. No React, no DOM, no Vite. Runs in the browser, a Web Worker and Node (CI).
  pack.ts            seeded PRNG + deterministic pack generation (integer-only odds)
  ticket.ts          Argon2id proof-of-work: the cost of one pack
  identity.ts        Ed25519 player keys, fingerprints, name rules
  proof.ts           pull proofs: encode / decode / sign / verify
  scoring.ts         Brainrot Score: rarity points x combo multipliers, all derived from the odds
  odds.ts            exact combo odds for any set (powers the in-game scoring guide)
  hallOfFame.ts      what qualifies for the Hall of Fame (shared by UI and CI)

src/content/       Data. Adding content never needs code changes.
  sets/<set>/set.json  cards (id, name, rarity, caption, flavor, art brief), odds, holo odds
  sets/<set>/art/      source art (real images, full cards, or SVG placeholders)
  sets/<set>/cards/    built card images (npm run cards); committed
  sets/<set>/pack.webp the set's booster pack wrapper, built from its colours and rarest cards
  sets/index.ts        the registry: every version of every set (old versions and archived sets stay for old proofs)
  sets.lock.json       hash of each released set@version (npm run check:sets)

src/game/          Browser glue around the engine.
  player.ts          the local player key, name and ticket counter (localStorage)
  ticketMiner.ts     mines tickets in workers/ticket.worker.ts, pre-mining the next pack
  pulls.ts           openPack(), proofFor(), pullUrl(), checkPull()
  share.ts, bragImage.ts   brag text, Hall of Fame link, 9:16 poster with QR

src/components/    React UI (pack opening, collection, set picker, share sheet, pull viewer, pages)

scripts/           Node tools (run with tsx)
  cards/             card compositor (Genesis frame + art + text), pack wrappers, previews, prompt sheets
  check-sets.ts      set lock guard
  hall-of-fame.ts    verifies Hall of Fame issues; builds public/hall-of-fame.json
```

## How a pull works

```
player key (Ed25519)  ─┐
set@version           ─┼─► Argon2id ticket (≈0.1–0.5 s of work) ─► SHA-256 ─► sfc32 PRNG ─► 5 cards + holos
ticket number (nonce) ─┘
```

- Opening a pack consumes the next ticket number. The ticket is mined in a Web Worker while the
  previous pack is still on screen, so players never wait.
- A **proof** is `(set, version, public key, nonce, name)` signed with the player's key: about 130
  bytes, base64url-encoded into `#/pull/<proof>` links.
- **Verifying** means recomputing the ticket and the pack from the proof. Nothing can be edited:
  changing any byte breaks the signature, and the cards are never part of the proof (they're re-derived).

### Why proof-of-work

Without a server nobody can witness pack openings, so the game can't stop players choosing which
pulls to show. It can make every pull **cost the same as opening a pack**: searching for a lucky
pack is just opening packs. Argon2id is memory-hard, which keeps the advantage of GPUs and big
machines small compared to plain hashing.

Known limits: you can't prove how many packs someone opened in total, or that they weren't using a
bot. Neither matters for "look at my best pull".

## Hall of Fame (no server)

```
player ─► Share ─► "Submit" ─► GitHub issue form (pull link)
                                   │
                    .github/workflows/hall-of-fame.yml
                    scripts/hall-of-fame.ts verify-issue  ─► comment + label (+ redeploy)
                                   │
                    .github/workflows/deploy.yml
                    scripts/hall-of-fame.ts build  ─► public/hall-of-fame.json (re-verified, deduped)
                                   │
                    Hall of Fame page re-derives each entry again in the visitor's browser
```

Issue text is untrusted and is only parsed by the script, never put into a shell command. The
submitter's GitHub username and the issue date come from GitHub, so they can be trusted for
"world first" ordering.

## Invariants (CI enforces these)

1. **Released sets never change.** Card ids, order, rarities, odds or pack size of a released
   `set@version` can't change; bump `version` and keep the old file (`npm run check:sets`).
2. **Engine changes that alter packs need a new ticket or proof version.** The engine tests lock
   known-answer vectors (`src/engine/engine.test.ts`).
3. **Every card has a built image** (`npm run cards`).

Run everything with `npm run check`.
