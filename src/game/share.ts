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
    `${score.hand.name}${score.hand.multiplier > 1 ? ` ×${score.hand.multiplier}` : ''} · ${score.flexValue.toLocaleString('en-US')} brainrot value`,
    `Verify it yourself: ${url}`,
  ].join('\n');

/** Pre-filled GitHub issue for the global Hall of Fame (the form lives in .github/ISSUE_TEMPLATE). */
export const hallOfFameSubmitUrl = (url: string, title: string) =>
  `https://github.com/${REPO}/issues/new?template=hall-of-fame.yml&title=${encodeURIComponent(`[Hall of Fame] ${title}`)}&pull=${encodeURIComponent(url)}`;
