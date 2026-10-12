/**
 * Presses "Run workflow" on the Hall of Fame inbox every 15 minutes. GitHub's own schedule for that
 * workflow is best effort and has never fired for this repository, so a Cloudflare cron trigger
 * (free) does it instead. Setup: README.md next to this file.
 *
 * Needs one secret, GITHUB_TOKEN: a fine-grained token for evanlin23/BrainrotTCG only, with
 * Actions read and write. It can start workflows in this repository and do nothing else.
 */
const DISPATCH = 'https://api.github.com/repos/evanlin23/BrainrotTCG/actions/workflows/hall-of-fame-inbox.yml/dispatches';

export default {
  async scheduled(_event, env) {
    const res = await fetch(DISPATCH, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'brainrot-hall-of-fame-cron',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ ref: 'main' }),
    });
    // 204 means queued. Anything else fails the run, so it shows in the Worker's logs.
    if (res.status !== 204) throw new Error(`GitHub answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  },

  // No web page: visiting the Worker's URL can't start a run.
  async fetch() {
    return new Response('Not found', { status: 404 });
  },
};
