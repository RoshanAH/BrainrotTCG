import type { Rarity, PackScore } from '../engine';
import { REPO } from '../constants';

const RARITY_EMOJI: Record<Rarity, string> = {
  COMMON: '⬜',
  UNCOMMON: '🟩',
  RARE: '🟦',
  EPIC: '🟪',
  LEGENDARY: '🟧',
  BRAINROT: '🌈',
};

/** Wordle-style one-liner: rarity squares, holo sparkles, hand and value. */
export const bragText = (cards: { rarity: Rarity; isHolo: boolean }[], score: PackScore, setName: string, url: string) =>
  [
    `🧠 Brainrot TCG · ${setName}`,
    cards.map((c) => RARITY_EMOJI[c.rarity] + (c.isHolo ? '✨' : '')).join(''),
    `${score.hand.name}${score.hand.multiplier > 1 ? ` ×${score.hand.multiplier.toLocaleString('en-US')}` : ''} · 🧠 ${score.score.toLocaleString('en-US')} Brainrot Score`,
    `Verify it yourself: ${url}`,
  ].join('\n');

/** Pre-filled GitHub issue for the global Hall of Fame (the form lives in .github/ISSUE_TEMPLATE). */
export const hallOfFameSubmitUrl = (url: string, title: string) =>
  `https://github.com/${REPO}/issues/new?template=hall-of-fame.yml&title=${encodeURIComponent(`[Hall of Fame] ${title}`)}&pull=${encodeURIComponent(url)}`;

const SUBMITTED_KEY = 'brainrot-hof-submitted-v1';

/** Pulls this device has already sent to the Hall of Fame inbox. */
export const wasSubmitted = (id: string): boolean => {
  try {
    return (JSON.parse(localStorage.getItem(SUBMITTED_KEY) ?? '[]') as string[]).includes(id);
  } catch {
    return false;
  }
};

/**
 * Send a qualifying pull to the Hall of Fame without a GitHub account: a signed note to public
 * Nostr relays, which a GitHub Action reads every 15 minutes (see src/game/nostrInbox.ts).
 * Resolves to how many relays accepted it.
 */
export const submitToHallOfFame = async (proof: string, id: string): Promise<{ accepted: number; total: number }> => {
  const { hallOfFameEvent, publishEvent, HOF_RELAYS } = await import('./nostrInbox');
  const results = await publishEvent(hallOfFameEvent(proof, id));
  const accepted = results.filter((r) => r.ok).length;
  if (accepted > 0) {
    try {
      const list = JSON.parse(localStorage.getItem(SUBMITTED_KEY) ?? '[]') as string[];
      localStorage.setItem(SUBMITTED_KEY, JSON.stringify([...list.filter((x) => x !== id), id].slice(-200)));
    } catch {
      // only the "Submitted" label depends on this
    }
  }
  return { accepted, total: HOF_RELAYS.length };
};
