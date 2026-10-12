# Design

How Brainrot TCG looks and behaves. The values live in `src/styles/tokens.css`; the shared pieces in
`src/styles/base.css` and `src/components/ui/`. Most players are on phones, opening packs one-handed
between other things, so every rule below starts from a 390 px wide screen.

## Principles

1. **The pack is the hero.** Each screen has one primary action: on the home screen it's opening the
   pack; during a reveal it's the next card; in the summary it's opening another pack. Everything else
   steps back (smaller, quieter, or out of the way).
2. **Nothing overlaps the game.** Navigation is a bottom tab bar on phones (in the thumb zone) and a top
   bar on wide screens, laid out around the content rather than floating over it.
3. **Focus mode while opening.** Once a pack is cut, the tabs and the era picker get out of the way
   until the pack is done, so the reveal owns the screen.
4. **One way to show a panel.** Collection, achievements, settings, sharing and the rest are the same
   sheet: a bottom sheet on phones, a centred dialog on wide screens, with the same header, close
   button, Escape key, focus handling and backdrop.
5. **Readable before flashy.** Rubik Glitch is for the logo only. Headings use Lilita One (the same
   face as the card captions), and body text uses Inter. Scores use tabular numbers.
6. **Colour carries meaning.** Surfaces are one purple-black ramp. Accent colours mean something:
   brand gradient for primary actions, cyan for links and focus, and the rarity colours, which are
   identical everywhere a rarity appears (cards, badges, collection, scoring guide).
7. **Celebrate in proportion.** A common card gets a flip; a Brainrot pull gets the confetti.
   Achievement toasts arrive one at a time, small and out of the way; a burst of unlocks becomes one
   grouped toast instead of a wall.
8. **Speak the device's language.** Phones say "Tap", desktops say "Click or press Space". Hints that
   only make sense with a mouse (tilt the card) only show with a mouse.
9. **Accessible by default.** Text meets WCAG AA contrast; every control is reachable by keyboard with a
   visible focus ring; touch targets are at least 44 px; panels trap focus and close with Escape;
   motion is reduced when the OS asks for it.
10. **Fast and steady.** Images have fixed aspect ratios so nothing jumps while loading; animations are
    120–320 ms and only animate transform and opacity.

## Tokens

| Group | Tokens | Notes |
| --- | --- | --- |
| Surfaces | `--bg`, `--bg-elevated`, `--surface`, `--surface-2`, `--surface-3` | lighter = closer |
| Text | `--text`, `--text-muted`, `--text-subtle` | all AA on `--bg-elevated` |
| Brand | `--brand`, `--brand-2` (cyan), `--brand-3` (yellow), `--brand-gradient` | primary actions use the gradient |
| Rarity | `--rarity-common` … `--rarity-brainrot` | never redefine locally |
| Type | `--font-body`, `--font-display`, `--font-logo`, `--text-xs` … `--text-3xl` | |
| Space | `--space-1` (4 px) … `--space-7` (48 px), `--gutter` | 4 px grid |
| Shape | `--radius-sm` … `--radius-xl`, `--radius-pill` | |
| Depth | `--shadow-1` … `--shadow-3`, `--glow-brand` | |
| Motion | `--dur-fast`, `--dur`, `--dur-slow`, `--ease-out`, `--ease-spring` | zero under reduced motion |
| Layout | `--touch-target`, `--nav-height`, `--safe-top`, `--safe-bottom` | |

## Components

- **Buttons** (`.btn`): `--primary` (gradient, one per screen), `--secondary` (surface + border),
  `--ghost` (text only); `--lg`, `--block`; `.icon-btn` for icon-only buttons, always with an
  `aria-label`.
- **Sheet** (`ui/Sheet.tsx`): every panel. A bottom sheet on phones, a centred dialog from 720px.
  Title, optional subtitle and sticky footer, close button, Escape, focus trap, scroll lock, focus
  returns to the opener. Sheets stack (a card opened from the collection sits on top of it). Sizes:
  `sm` (settings, share), `md` (one pull), `lg` (collection, history, achievements, Hall of Fame);
  `bare` for a single big card.
- **Tabs** (`ui/Tabs.tsx`): a segmented control when one sheet holds several lists, so only one
  shows at a time. Arrow keys move between tabs.
- **Rows**: lists are rows (thumbnail, two lines of text, a value on the right, a chevron when it
  opens something), not cards in a grid. Settings use grouped rows with `.switch` toggles.
- **App nav** (`ui/AppNav.tsx`): Collection, Pulls, Hall of Fame, Achievements, Settings, each an
  icon plus a label.
- **Toasts** (`achievements/AchievementToasts.tsx`): one at a time, top centre, auto-dismiss.
- **Chips and badges**: era chips in the picker; rarity badges show name, colour and points.
- **Empty states**: one icon, one sentence that says what to do next.

## Checking a change

Run the app, then capture every screen at 390×844 and 1440×900 (a Playwright script that opens a
pack and every sheet is the quickest way). Look for overlap, cut-off text and anything that needs a
mouse. Keyboard through it: Tab reaches everything, Escape closes the top panel.
