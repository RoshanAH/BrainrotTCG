# Hosting

The site is static files: no server, nothing to scale. It's built and deployed by
`.github/workflows/deploy.yml` to one of two free hosts.

| | Address | Cost | Limits |
|---|---|---|---|
| GitHub Pages (now) | `evanlin23.github.io/BrainrotTCG` | Free, never billed | Soft limit of 100 GB of traffic a month; past it GitHub may slow the site or ask you to move |
| Cloudflare Pages | `brainrottcg.pages.dev` | Free, no card needed, never billed | None for static files: traffic and requests are unmetered |

Either way, nothing on the free plans can charge you: there's no payment method to charge.

## Moving to Cloudflare Pages

About five minutes, all in your browser:

1. Make a free Cloudflare account at <https://dash.cloudflare.com/sign-up>. Don't add a payment method.
2. Copy your **Account ID**: in the dashboard, open **Workers & Pages**; it's in the right-hand column.
3. Make an **API token**: profile icon → **My Profile** → **API Tokens** → **Create Token** →
   **Create Custom Token**. Give it one permission, **Account → Cloudflare Pages → Edit**, then
   **Continue to summary** → **Create Token**, and copy it (it's shown once).
4. In this repository on GitHub: **Settings → Secrets and variables → Actions → New repository
   secret**. Add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` with those two values.
5. **Actions → Deploy to GitHub Pages → Run workflow** (or push anything to `main`).

The deploy then creates the Cloudflare Pages project `brainrottcg`, publishes the site at its root,
checks that the new address serves this exact build, and only then turns the old address into a
redirect. The run's log shows the new address (if `brainrottcg` is taken, Cloudflare adds a suffix).

What keeps working:

- **Old links and QR codes.** Every page at the old address forwards to the same place at the new
  one: pull links, profile links and link-preview pages.
- **Saves.** A save lives in the browser's storage for the address it was made on, so the first
  time a player opens any old link, their save comes along (`scripts/redirect-site.ts`,
  `src/game/move.ts`). It travels in the link's `#`, which never leaves the device, and the new
  address accepts it only from the old one. If the player already has a different save at the new
  address, they're asked first and the replaced save is kept as a backup.
- **The Hall of Fame.** The old address keeps serving `hall-of-fame.json` for the scripts, and the
  issue links it files redirect like any other link.

## Your own domain later

Domains cost money (about $10–15 a year), so this is optional. Add the domain in Cloudflare
(**Workers & Pages → brainrottcg → Custom domains**), then set a repository **variable** (not a
secret) `SITE_URL` to it, ending in `/` (for example `https://brainrottcg.net/`), and deploy.
Link previews and the page's own tags then use it.

## Undoing it

Delete the two secrets and deploy: GitHub Pages serves the game again. Saves made at the
Cloudflare address would stay there, so do this before players settle in, or not at all.
