---
name: new-set
description: Research current meme trends and draft a new Brainrot TCG card set end to end (card list, set.json, SVG placeholder art, Gemini prompt sheet, previews), ready for a draft PR. Use when asked to add, draft or update a card set, era, or monthly "Right Now" drop.
---

# Drafting a new Brainrot TCG set

Read `docs/ADDING_A_SET.md` and `docs/ART_STYLE.md` first; they are the source of truth.

## 1. Research (use subagents with web search)

- Find what is trending in brainrot/meme culture **right now**: TikTok, YouTube Shorts, Roblox
  (e.g. Steal a Brainrot-style games), Twitch, X, Reddit, and non-English scenes (Indonesia,
  Brazil, India, Korea, Spain/LatAm, Philippines...). Cite sources with dates. Discard anything you
  can't confirm from at least two sources.
- Check open GitHub issues titled "Propose a card" (community proposals); top-voted ones go first.
- Skip memes already in an existing set (`grep -h '"name"' src/content/sets/*/set.json`).

## 2. Card list

12 cards: 4 COMMON, 3 UNCOMMON, 2 RARE, 1 EPIC, 1 LEGENDARY, 1 BRAINROT. Names max 22 chars,
captions max ~26 chars and genuinely funny, flavor max 90 chars, plus an `art` brief.

Hard rules: no identifiable real people (turn person-memes into objects, animals or faceless
silhouettes), copyrighted characters only as renamed parodies with original art, no
hate-associated or tragedy memes, PG-13. Flag anything risky in the PR description.

## 3. Files

1. `src/content/sets/<id>/set.json` with `"draft": true` (template in `docs/ADDING_A_SET.md`).
2. SVG placeholders in `src/content/sets/<id>/art/<card-id>.svg` (`viewBox="0 0 444 519"`).
   Delegate one subagent per set and have it review its own contact sheet:
   `npx tsx scripts/cards/preview.ts <id> /tmp/<id>.png` (then Read the PNG).
3. `npm run prompts -- <id>` for the free Gemini-app prompt sheet.
4. Register the set in `src/content/sets/index.ts`, then run `npm run cards`,
   `npm run check:sets -- --update` and `npm run check`.

## 4. Pull request

Open a **draft** PR with the contact sheet image, the research summary with sources, and the
risk notes. A human approves tone, IP and art before removing `"draft": true`.
