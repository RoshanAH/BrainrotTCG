# Adding a set

A set is data: a `set.json` plus art. No code changes are needed apart from one import line.

## 1. Pick the cards

12 cards is a good size: 4 Common, 3 Uncommon, 2 Rare, 1 Epic, 1 Legendary, 1 Brainrot. The
rarest slot goes to the most iconic or funniest meme of the era.

Rules (see also `docs/ART_STYLE.md`):
- **No real, identifiable people.** Person-memes become objects, animals or silhouettes.
- **Copyrighted characters become parodies** with a riffed name and original art.
- **No hate-associated or tragedy memes.** Keep it PG-13 and readable for a global audience.

## 2. Write `src/content/sets/<set-id>/set.json`

```json
{
  "id": "my-set",
  "version": 1,
  "name": "My Set",
  "era": "2027",
  "tagline": "Fresh off the timeline",
  "releasedAt": "2027-01-01",
  "draft": true,
  "palette": ["#FFD60A", "#00B4D8", "#FF4D6D"],
  "packSize": 5,
  "odds": { "COMMON": 5000, "UNCOMMON": 2500, "RARE": 1500, "EPIC": 700, "LEGENDARY": 250, "BRAINROT": 50 },
  "holoOdds": 500,
  "cards": [
    {
      "id": "kebab-case-id",
      "name": "Display Name",
      "rarity": "COMMON",
      "caption": "Short punchline (max ~26 chars)",
      "flavor": "One line of origin story",
      "year": 2027,
      "art": "What the illustration shows"
    }
  ]
}
```

- Odds are integer weights out of 10,000; `holoOdds` is also out of 10,000.
- `draft: true` hides the set unless a player turns on **Settings → Preview upcoming sets**.
  Remove it when the art is final.

## 3. Make the art

```bash
npm run prompts -- my-set     # writes src/content/sets/my-set/PROMPTS.md
```

Follow `PROMPTS.md` in the free Gemini app and save images as `art/<card-id>.png`. SVG
placeholders (`art/<card-id>.svg`) work too while you wait. Preview the whole set:

```bash
npx tsx scripts/cards/preview.ts my-set /tmp/my-set.png
```

## 4. Register, build and lock

1. Add the import to `src/content/sets/index.ts` and put it in `ALL_SET_VERSIONS` (array order is
   timeline order).
2. Run:
   ```bash
   npm run cards
   npm run check:sets -- --update   # locks my-set@1
   npm run check
   ```
3. Commit `set.json`, `art/`, `cards/`, `PROMPTS.md` and `sets.lock.json`, then open a PR.

## Changing a released set

Fixing names, captions, flavor or art is fine at any time. Changing **cards, their order, rarities,
odds or pack size** breaks every proof for that version, so:

1. Copy `set.json` to `set.v1.json` and import it in the registry as well.
2. Bump `version` in `set.json` and make the change.
3. Run `npm run cards` and `npm run check:sets -- --update`.
