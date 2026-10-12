# Card art pipeline

Every card uses the **Genesis frame**: the neon border, winged title banner and caption box from
the original hackathon cards. `scripts/cards/extract-genesis-frame.py` recovered it from the 19
Genesis cards (they all share one frame) into `scripts/cards/templates/genesis-frame.png`, with a
transparent art window.

A card is then built from three layers:

1. **Art**: a real image (or an SVG placeholder) cover-fitted into the art window
2. **The Genesis frame** on top
3. **Title and caption** set by code: the title curves along the banner, the caption sits in the box.
   Text comes from `set.json`, so it's always spelled right, and editing a caption never means
   regenerating art.

## Supplying art

Put files in `src/content/sets/<set>/art/`, named by card id. The first match wins:

| File | Meaning |
| --- | --- |
| `<card>.png` / `.jpg` / `.webp` | **The normal case.** A real image (e.g. from the free Gemini app), framed by code |
| `<card>.card.png` / `.jpg` / `.webp` | A complete card that already has its frame, used as-is (how Genesis was made) |
| `<card>.svg` | Placeholder illustration, framed by code. Used until a real image exists |

Then run `npm run cards`. To preview one set (registered or not) as a contact sheet:

```bash
npx tsx scripts/cards/preview.ts <set-id> /tmp/<set-id>.png
```

## Making real images for free (Gemini app)

1. Open a new chat in the Gemini app and attach a Genesis card as the style reference,
   e.g. `src/content/sets/genesis/art/tralalero-tralala.card.png`.
2. Paste:
   ```
   You're the illustrator for a meme trading card game. I'll send card briefs one at a time. For each one, generate ONE image:
   - Match the rendering style of the attached card's artwork: vivid, glossy, high-detail, slightly surreal meme realism, dramatic lighting, saturated colors
   - Illustration only: NO card frame, NO border, NO text, letters, numbers or logos
   - Portrait 6:7, subject centered and fully visible, keep the edges free of important detail
   - No real or recognizable people
   Reply "ready" and wait for the first brief.
   ```
3. Send one card per message: `Card: <name> — <art brief from set.json>`.
4. Save each image as `src/content/sets/<set>/art/<card-id>.png` and run `npm run cards`.

The Gemini app's free daily image limit is enough for a set in a session or two. The Gemini
API has no free tier for images; at about $0.03 per image it's an option for bulk work.

## Image rules (all sources)

- **Shape:** portrait, about 6:7 (the art window is 444×519 px). Anything else is cover-cropped.
- **Edges:** frame decorations overlap the window's edges (a heart and star at the top, starbursts at
  the sides), so keep faces and key props away from the outer ~30 px.
- **No text:** no letters, numbers, logos or brand marks.
- **No real people:** person-memes become objects, animals or faceless silhouettes. Copyrighted
  characters become original parody designs. Team self-portraits (like Genesis's Buh67) need the
  person's OK.
- **Keep it PG-13:** no hate symbols, gore or sexual content.

## SVG placeholders

- Bold sticker-cartoon look: flat fills, thick `#12002a` outlines, expressive eyes, saturated colours,
  simple background covering the whole canvas.
- `viewBox="0 0 444 519"` (older 487×560 drawings also work; they get cropped slightly).
- Prefix every `id` with `art-`. No `<text>`, raster images, external references or `<style>` blocks.
  Keep each file under 15 KB.
