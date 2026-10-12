/**
 * The global Hall of Fame, with GitHub Issues as the database and this script
 * as the verifier. Nothing is trusted: every proof is re-derived from scratch.
 *
 *   npx tsx scripts/hall-of-fame.ts verify-issue   (Actions, on an issue event)
 *     Reads the issue from $GITHUB_EVENT_PATH, verifies its pull link and writes
 *     hof-comment.md plus `verified`, `changed` to $GITHUB_OUTPUT. A verified
 *     comment carries a marker with the pull id.
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
  githubUser: issue.user?.login ?? 'unknown',
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

const github = async <T>(path: string, token: string): Promise<T> => {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
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
  const footer = '\n\n---\n_Verified automatically by re-deriving the pack from its proof (`scripts/hall-of-fame.ts`)._';
  const body = result.ok
    ? `✅ **Verified!** ${safe(result.entry.name)} \\#${result.entry.fingerprint} pulled a **${result.entry.hand}** in ${safe(result.entry.setName)} with a Brainrot Score of **${result.entry.score.toLocaleString('en-US')}**.\n\nIt will appear in the Hall of Fame after the next deploy (started automatically).${footer}\n${markerFor(pullId(result.pull.proof))}`
    : `❌ **Not added.** ${result.reason}${footer}`;
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

const mode = process.argv[2];
if (mode === 'verify-issue') await verifyIssue();
else if (mode === 'build') await build();
else {
  console.error('Usage: npx tsx scripts/hall-of-fame.ts <verify-issue|build>');
  process.exit(2);
}
