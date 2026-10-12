/**
 * The global Hall of Fame, with GitHub Issues as the database and this script
 * as the verifier. Nothing is trusted: every proof is re-derived from scratch.
 *
 *   npx tsx scripts/hall-of-fame.ts verify-issue   (Actions, on an issue event)
 *     Reads the issue from $GITHUB_EVENT_PATH, verifies its pull link and writes
 *     hof-comment.md plus `verified=true|false` to $GITHUB_OUTPUT.
 *
 *   npx tsx scripts/hall-of-fame.ts build           (deploy, before vite build)
 *     Lists every Hall of Fame issue, re-verifies each proof, and writes
 *     public/hall-of-fame.json. Without a token it keeps the existing file.
 *
 * Security: issue bodies are untrusted input. They are only ever parsed here,
 * never interpolated into a shell command.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getSet } from '../src/content/sets/index.ts';
import { extractProof, HALL_OF_FAME_MIN_SCORE, pullId, qualifiesForHallOfFame, verifyProof, type VerifiedPull } from '../src/engine/index.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUTPUT = `${ROOT}public/hall-of-fame.json`;
const REPO = process.env.GITHUB_REPOSITORY ?? 'evanlin23/BrainrotTCG';
const TITLE_PREFIX = '[Hall of Fame]';

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
  /** Trusted, from GitHub: who submitted and when. */
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

/** Plain text for markdown: no mentions, no code fences, no links. */
const safe = (text: string) => text.replace(/[`*_[\]<>|]/g, '').replace(/@/g, '@​');

const toEntry = (pull: VerifiedPull, proof: string, issue: Issue): HallOfFameEntry => ({
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
  githubUser: issue.user?.login ?? 'unknown',
  submittedAt: issue.created_at,
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
    return { ok: true, entry: toEntry(pull, proof, issue), pull };
  } catch (error) {
    return { ok: false, reason: `This pull didn't verify: ${error instanceof Error ? error.message : String(error)}` };
  }
};

const verifyIssue = async () => {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? '', 'utf8')) as { issue: Issue };
  const result = await checkIssue(event.issue);
  const footer = '\n\n---\n_Verified automatically by re-deriving the pack from its proof (`scripts/hall-of-fame.ts`)._';
  const body = result.ok
    ? `✅ **Verified!** ${safe(result.entry.name)} #${result.entry.fingerprint} pulled a **${result.entry.hand}** in ${safe(result.entry.setName)} with a Brainrot Score of **${result.entry.score.toLocaleString('en-US')}**.\n\nIt will appear in the Hall of Fame after the next deploy (started automatically).${footer}`
    : `❌ **Not added.** ${result.reason}${footer}`;
  writeFileSync('hof-comment.md', body);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `verified=${result.ok}\n`);
  console.log(body);
};

const listIssues = async (token: string): Promise<Issue[]> => {
  const issues: Issue[] = [];
  for (let page = 1; page < 50; page++) {
    const res = await fetch(`https://api.github.com/repos/${REPO}/issues?state=all&per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    const batch = (await res.json()) as Issue[];
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
  const candidates = (await listIssues(token)).filter(
    (i) => (i.title.startsWith(TITLE_PREFIX) || labelNames(i).includes('hall-of-fame')) && !labelNames(i).includes('rejected'),
  );
  const seen = new Set<string>();
  const entries: HallOfFameEntry[] = [];
  // Oldest first, so the first submission of a pull keeps the credit.
  for (const issue of candidates.sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const result = await checkIssue(issue);
    if (!result.ok) {
      console.log(`#${issue.number}: skipped (${result.reason})`);
      continue;
    }
    const key = pullId(result.pull.proof);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(result.entry);
    console.log(`#${issue.number}: ${result.entry.hand} (${result.entry.score})`);
  }
  writeFileSync(OUTPUT, JSON.stringify(entries, null, 1) + '\n');
  console.log(`${entries.length} verified entries -> public/hall-of-fame.json`);
};

const mode = process.argv[2];
if (mode === 'verify-issue') await verifyIssue();
else if (mode === 'build') await build();
else {
  console.error('Usage: npx tsx scripts/hall-of-fame.ts <verify-issue|build>');
  process.exit(2);
}
