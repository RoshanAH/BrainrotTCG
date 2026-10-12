import { CARD_RARITIES, cardPoints, type RarityKey } from '../../data/cards';
import type { Finish } from '../../engine';
import { FINISH_INFO } from '../../game/modifiers';
import '../../styles/Scoring.css';

interface RarityBadgeProps {
  rarity: RarityKey;
  isHolo?: boolean;
  finish?: Finish | null;
  misprint?: boolean;
  showPoints?: boolean;
}

/** Rarity shown by name and colour together (never colour alone), plus the card's points (modifiers included). */
const RarityBadge = ({ rarity, isHolo = false, finish, misprint, showPoints = true }: RarityBadgeProps) => (
  <span className={`rarity-pill ${rarity.toLowerCase()}`}>
    <span className="rarity-pill-gem" aria-hidden="true">{CARD_RARITIES[rarity].symbol}</span>
    {finish && <span style={{ color: FINISH_INFO[finish].color }}>{FINISH_INFO[finish].name} </span>}
    {misprint && 'Misprint '}
    {isHolo && 'Holo '}
    {CARD_RARITIES[rarity].name}
    {showPoints && <span className="rarity-pill-points">{cardPoints(rarity, isHolo, finish, misprint).toLocaleString()} pts</span>}
  </span>
);

export default RarityBadge;
