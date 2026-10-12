import { CARD_RARITIES, cardPoints, type RarityKey } from '../../data/cards';
import '../../styles/Scoring.css';

interface RarityBadgeProps {
  rarity: RarityKey;
  isHolo?: boolean;
  showPoints?: boolean;
}

/** Rarity shown by name and colour together (never colour alone), plus the card's points. */
const RarityBadge = ({ rarity, isHolo = false, showPoints = true }: RarityBadgeProps) => (
  <span className={`rarity-pill ${rarity.toLowerCase()}`}>
    <span className="rarity-pill-gem" aria-hidden="true">◆</span>
    {isHolo && 'Holo '}
    {CARD_RARITIES[rarity].name}
    {showPoints && <span className="rarity-pill-points">{cardPoints(rarity, isHolo).toLocaleString()} pts</span>}
  </span>
);

export default RarityBadge;
