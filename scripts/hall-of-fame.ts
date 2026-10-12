/**
 * The global Hall of Fame, with GitHub Issues as the database and this script
 * as the verifier. Nothing is trusted: every proof is re-derived from scratch.
 *
 *   npx tsx scripts/hall-of-fame.ts verify-issue   (Actions, on an issue event)
 *     Reads the issue from $GITHUB_EVENT_PATH, verifies its pull link and writes
 *     hof-comment.md plus `verified`, `changed` to $GITHUB_OUTPUT. A verified
 *     comment carries a marker with the pull id.
 *
 *   npx tsx scripts/hall-of-fame.ts inbox           (Actions, on a schedule)
 *     Reads submissions sent without a GitHub account through public Nostr relays
 *     (src/game/nostrInbox.ts), verifies each pull, and files every one that
 *     qualifies as a bot-authored Hall of Fame issue with the same verified
 *     marker, so `build` treats it like any other entry. Writes `added` to
 *     $GITHUB_OUTPUT. Event ids it has seen are kept in hof-inbox-seen.json
 *     (cached between runs) so junk isn't re-checked every time.
 *
 *   npx tsx scripts/hall-of-fame.ts build           (deploy, before vite build)
 *     Lists verified Hall of Fame issues, re-verifies each proof, and writes
 *     public/hall-of-fame.json. Without a token, or if GitHub is down, it keeps
 *     the existing file.
 *
 * "World first" order uses the time the bot first verified that exact pull on
 * the issue (its marker comment), not the issue's creation date: otherwise
 * anyone could open a placeholder issue early and edit a pull in later.
 *
 * Security: issue bodies are untrusted input. They are only ever parsed here,
 * never interpolated into a shell command, and echoed only through safe().
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getSet } from '../src/content/sets/index.ts';
import { decodeProof, extractProof, HALL_OF_FAME_MIN_SCORE, pullId, qualifiesForHallOfFame, verifyProof, type VerifiedPull } from '../src/engine/index.ts';
import { fetchEvents, HOF_KIND, HOF_TAG } from '../src/game/nostrInbox.ts';
import { processInbox } from './hof-inbox.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUTPUT = `${ROOT}public/hall-of-fame.json`;
const REPO = process.env.GITHUB_REPOSITORY ?? 'evanlin23/BrainrotTCG';
const BOT = 'github-actions[bot]';
const API = 'https://api.github.com';
const markerFor = (id: string) => `<!-- hof-verified ${id} -->`;

export interface HallOfFameEntry {
  proof: string;
  name: string;
  fingerprint: string;
  setId: string;
  setVersion: number;
  setName: string;
  hand: string;
  multiplier: number;
  score: number;
  cards: { cardId: string; isHolo: boolean }[];
  /** Trusted, from GitHub: who submitted, and when the bot first verified this pull. */
  issue: number;
  githubUser: string;
  submittedAt: string;
}

interface Issue {
  number: number;
  title: string;
  body: string | null;
  created_at: string;
  user: { login: string } | null;
  labels: ({ name?: string } | string)[];
  pull_request?: unknown;
}

const labelNames = (issue: Issue) => issue.labels.map((l) => (typeof l === 'string' ? l : l.name ?? ''));

/** Plain text for markdown: no formatting, mentions, issue references or links. */
const safe = (text: string) =>
  text
    .replace(/[`*_[\]<>|]/g, '')
    .replace(/@/g, '@\u200B')
    .replace(/#/g, '#\u200B')
    .replace(/:\/\//g, ':\u200B//')
    .replace(/[\r\n]+/g, ' ');

const toEntry = (pull: VerifiedPull, proof: string, issue: Issue, verifiedAt: string): HallOfFameEntry => ({
  proof,
  name: pull.proof.name,
  fingerprint: pull.fingerprint,
  setId: pull.set.id,
  setVersion: pull.set.version,
  setName: pull.set.name,
  hand: pull.score.hand.name,
  multiplier: pull.score.hand.multiplier,
  score: pull.score.score,
  cards: pull.cards.map((c) => ({ cardId: c.cardId, isHolo: c.isHolo })),
  issue: issue.number,
  // Entries the inbox filed came from Nostr, not from this GitHub account.
  githubUser: issue.user?.login === BOT ? 'nostr' : (issue.user?.login ?? 'unknown'),
  submittedAt: verifiedAt,
});

type Checked = { ok: true; entry: HallOfFameEntry; pull: VerifiedPull } | { ok: false; reason: string };

const checkIssue = async (issue: Issue): Promise<Checked> => {
  const proof = extractProof(issue.body ?? '');
  if (!proof) return { ok: false, reason: 'No pull link found. Paste the link from **Share this pull**.' };
  try {
    const pull = await verifyProof(proof, getSet);
    if (!qualifiesForHallOfFame(pull.score)) {
      return { ok: false, reason: `The pull is real, but a ${pull.score.hand.name} with a Brainrot Score of ${pull.score.score.toLocaleString('en-US')} doesn't qualify yet (Full House or better, or ${HALL_OF_FAME_MIN_SCORE.toLocaleString('en-US')}+ Brainrot Score).` };
    }
    return { ok: true, entry: toEntry(pull, proof, issue, issue.created_at), pull };
  } catch (error) {
    // The message can contain proof text (e.g. a set id), so it goes through safe().
    return { ok: false, reason: `This pull didn't verify: ${safe(error instanceof Error ? error.message : String(error))}` };
  }
};

const github = async <T>(path: string, token: string, body?: unknown): Promise<T> => {
  const res = await fetch(`${API}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} on ${path}: ${await res.text()}`);
  return (await res.json()) as T;
};

interface Comment {
  body: string | null;
  created_at: string;
  user: { login: string } | null;
}

/** When the bot first verified this pull on this issue (only the bot's own comments count). */
const firstVerifiedAt = async (issue: number, id: string, token: string): Promise<string | null> => {
  for (let page = 1; page < 20; page++) {
    const batch = await github<Comment[]>(`/repos/${REPO}/issues/${issue}/comments?per_page=100&page=${page}`, token);
    const hit = batch.find((c) => c.user?.login === BOT && c.body?.includes(markerFor(id)));
    if (hit) return hit.created_at;
    if (batch.length < 100) break;
  }
  return null;
};

const FOOTER = '\n\n---\n_Verified automatically by re-deriving the pack from its proof (`scripts/hall-of-fame.ts`)._';

/** The bot's comment on a verified pull; its marker is what `build` looks for. */
const verifiedComment = (entry: HallOfFameEntry, pull: VerifiedPull) =>
  `✅ **Verified!** ${safe(entry.name)} \\#${entry.fingerprint} pulled a **${entry.hand}** in ${safe(entry.setName)} with a Brainrot Score of **${entry.score.toLocaleString('en-US')}**.\n\nIt will appear in the Hall of Fame after the next deploy (started automatically).${FOOTER}\n${markerFor(pullId(pull.proof))}`;

const verifyIssue = async () => {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? '', 'utf8')) as { issue: Issue };
  const result = await checkIssue(event.issue);
  const token = process.env.GITHUB_TOKEN;
  // An edit that keeps the same verified pull needs no new comment or redeploy.
  let already = false;
  if (result.ok && token) {
    try {
      already = (await firstVerifiedAt(event.issue.number, pullId(result.pull.proof), token)) !== null;
    } catch (error) {
      console.warn(`Could not read earlier comments; treating this as a new verification. ${error}`);
    }
  }
  const body = result.ok ? verifiedComment(result.entry, result.pull) : `❌ **Not added.** ${result.reason}${FOOTER}`;
  writeFileSync('hof-comment.md', body);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `verified=${result.ok}\nchanged=${!already}\n`);
  console.log(already ? 'Already verified this pull on this issue; nothing to do.' : body);
};

/** Issues the bot has verified (it adds both labels; submitters can't add labels themselves). */
const listVerifiedIssues = async (token: string): Promise<Issue[]> => {
  const issues: Issue[] = [];
  for (let page = 1; page < 100; page++) {
    const batch = await github<Issue[]>(`/repos/${REPO}/issues?state=all&labels=hall-of-fame,verified&per_page=100&page=${page}`, token);
    issues.push(...batch.filter((i) => !i.pull_request));
    if (batch.length < 100) break;
  }
  return issues;
};

const build = async () => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    if (!existsSync(OUTPUT)) writeFileSync(OUTPUT, '[]\n');
    console.log('No GITHUB_TOKEN; keeping the existing hall-of-fame.json');
    return;
  }
  let issues: Issue[];
  try {
    issues = (await listVerifiedIssues(token)).filter((i) => !labelNames(i).includes('rejected'));
  } catch (error) {
    // Don't block a deploy on the Issues API: the committed file is still a verified snapshot.
    if (!existsSync(OUTPUT)) writeFileSync(OUTPUT, '[]\n');
    console.warn(`Could not list Hall of Fame issues; keeping the existing hall-of-fame.json. ${error}`);
    return;
  }
  const verified: HallOfFameEntry[] = [];
  for (const issue of issues) {
    const result = await checkIssue(issue);
    if (!result.ok) {
      console.log(`#${issue.number}: skipped (${result.reason})`);
      continue;
    }
    const id = pullId(result.pull.proof);
    const verifiedAt = await firstVerifiedAt(issue.number, id, token);
    if (!verifiedAt) {
      console.log(`#${issue.number}: skipped (the bot hasn't verified this pull on the issue yet)`);
      continue;
    }
    verified.push({ ...result.entry, submittedAt: verifiedAt });
  }
  // The first verification of a pull keeps the credit; later copies of it are dropped.
  const seen = new Set<string>();
  const entries = verified
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.issue - b.issue)
    .filter((e) => {
      const id = pullId(decodeProof(e.proof));
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  for (const e of entries) console.log(`#${e.issue}: ${e.hand} (${e.score}), verified ${e.submittedAt}`);
  writeFileSync(OUTPUT, JSON.stringify(entries, null, 1) + '\n');
  console.log(`${entries.length} verified entries -> public/hall-of-fame.json`);
};

const SEEN_PATH = 'hof-inbox-seen.json';
/** How far back to read the relays. Seen events are skipped, so a long window only costs a download. */
const INBOX_WINDOW_S = 7 * 24 * 60 * 60;
/** Pulls re-derived per run (about 0.1 s each), so a flood of submissions can't run the job forever. */
const INBOX_BUDGET = 300;
/** Entries filed per run (two GitHub requests each), well under GitHub's limits on creating content. */
const INBOX_MAX_FILED = 20;

const siteUrl = () => {
  const [owner, name] = REPO.split('/');
  return `https://${owner}.github.io/${name}/`;
};

const inbox = async () => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('inbox needs GITHUB_TOKEN to file issues');
  const seen = new Set<string>(existsSync(SEEN_PATH) ? (JSON.parse(readFileSync(SEEN_PATH, 'utf8')) as string[]) : []);

  const since = Math.floor(Date.now() / 1000) - INBOX_WINDOW_S;
  const { events, perRelay } = await fetchEvents({ kinds: [HOF_KIND], '#t': [HOF_TAG], since, limit: 500 });
  for (const r of perRelay) console.log(`${r.relay}: ${r.count} events${r.error ? ` (${r.error})` : ''}`);

  // Pulls already filed, by anyone, in any state: the first submission keeps the credit.
  const filed = new Set<string>();
  for (let page = 1; page < 100; page++) {
    const batch = await github<Issue[]>(`/repos/${REPO}/issues?state=all&labels=hall-of-fame&per_page=100&page=${page}`, token);
    for (const issue of batch) {
      const proof = extractProof(issue.body ?? '');
      if (!proof) continue;
      try {
        filed.add(pullId(decodeProof(proof)));
      } catch {
        // not a valid proof; nothing to dedupe against
      }
    }
    if (batch.length < 100) break;
  }

  const { added, deferred } = await processInbox(events, {
    seen,
    filed,
    budget: INBOX_BUDGET,
    maxFiled: INBOX_MAX_FILED,
    lookup: getSet,
    log: console.log,
    // Filed by the bot, so the issue-opened workflow doesn't run on it again; the marker comment is
    // the "first verified" time, exactly as for issues people open themselves.
    file: async (proof, pull, event) => {
      const issue = await github<Issue>(`/repos/${REPO}/issues`, token, {
        title: `[Hall of Fame] ${pull.score.hand.name} by ${safe(pull.proof.name) || 'Anonymous'}`,
        body: `${siteUrl()}#/pull/${proof}\n\nSubmitted without a GitHub account, through public Nostr relays (event \`${event.id}\`).`,
        labels: ['hall-of-fame', 'verified'],
      });
      const entry = toEntry(pull, proof, issue, issue.created_at);
      await github(`/repos/${REPO}/issues/${issue.number}/comments`, token, { body: verifiedComment(entry, pull) });
      console.log(`#${issue.number}: ${entry.hand} (${entry.score}) from Nostr event ${event.id}`);
    },
  });
  if (deferred) console.log(`${deferred} events left for the next run`);

  // Keep the cache bounded; the newest ids matter (older events fall out of the window anyway).
  writeFileSync(SEEN_PATH, JSON.stringify([...seen].slice(-20000)));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `added=${added}\n`);
  console.log(`${events.length} events read, ${added} added`);
};

const mode = process.argv[2];
if (mode === 'verify-issue') await verifyIssue();
else if (mode === 'inbox') await inbox();
else if (mode === 'build') await build();
else {
  console.error('Usage: npx tsx scripts/hall-of-fame.ts <verify-issue|inbox|build>');
  process.exit(2);
}
