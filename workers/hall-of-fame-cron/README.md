# Hall of Fame cron (Cloudflare Worker)

GitHub's schedule for `.github/workflows/hall-of-fame-inbox.yml` is best effort and has never fired
for this repository. This Worker presses that workflow's "Run workflow" every 15 minutes instead.
It's free (Workers' free plan includes cron triggers) and its only power is starting workflows here.

## Set up (dashboard, about 5 minutes)

1. **GitHub token.** github.com → Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token. Repository access: only `evanlin23/BrainrotTCG`.
   Permissions: Actions → Read and write. Pick the longest expiry and note when to renew it.
   Don't paste it anywhere but step 3.
2. **Worker.** dash.cloudflare.com → Workers & Pages → Create → Worker (Hello World) → name it
   `brainrot-hall-of-fame-cron` → Deploy. Then Edit code, replace everything with `index.js` from
   this folder, and Deploy.
3. **Secret.** The Worker → Settings → Variables and Secrets → Add: type Secret, name
   `GITHUB_TOKEN`, value the token from step 1 → Deploy.
4. **Schedule.** The Worker → Settings → Trigger events → Add → Cron Triggers → `*/15 * * * *`.
5. **Check.** Within 15 minutes, Actions → Hall of Fame inbox shows a new run. The Worker's Logs
   show an error if GitHub refused (401: the token is wrong or expired; 403/404: it lacks Actions
   write on this repository).

Or from this folder with Wrangler: `npx wrangler deploy`, then `npx wrangler secret put GITHUB_TOKEN`
(`wrangler.toml` already has the schedule).

To stop it, delete the cron trigger or the Worker. When the token expires, make a new one and replace
the secret.
