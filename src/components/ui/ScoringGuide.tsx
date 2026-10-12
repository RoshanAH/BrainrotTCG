import { useMemo } from 'react';
import { HOLO_MULTIPLIER, POKER_HANDS, RARITIES_RAREST_FIRST, RARITY_POINTS, handOdds, oneIn, type HandKey, type SetDefinition } from '../../engine';
import RarityBadge from './RarityBadge';
import '../../styles/Scoring.css';

interface ScoringGuideProps {
  set: SetDefinition;
  onClose: () => void;
}

const HAND_ORDER: HandKey[] = ['PAIR', 'TWO_PAIR', 'THREE_OF_A_KIND', 'FULL_HOUSE', 'FOUR_OF_A_KIND', 'FIVE_OF_A_KIND'];

const formatOneIn = (n: number) => (n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString());

/** How Brainrot Score works, with the exact odds for this set. */
const ScoringGuide = ({ set, onClose }: ScoringGuideProps) => {
  const odds = useMemo(() => handOdds(set), [set]);
  const rarities = [...RARITIES_RAREST_FIRST].reverse().filter((r) => set.odds[r] > 0);

  return (
    <div className="scoring-guide-backdrop" onClick={onClose}>
      <div className="scoring-guide" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="How Brainrot Score works">
        <button className="share-close" onClick={onClose} aria-label="Close">×</button>
        <h2>How Brainrot Score works</h2>
        <p className="scoring-formula">
          Brainrot Score = <strong>card points</strong> × <strong>combo multiplier</strong>
        </p>
        <p className="scoring-note">Rarer always pays more: every number comes from the odds. Odds below are exact for {set.name}.</p>

        <h3>Card rarity</h3>
        <table className="scoring-table">
          <thead>
            <tr><th>Rarity</th><th>Chance per card</th><th>Points</th></tr>
          </thead>
          <tbody>
            {rarities.map((r) => (
              <tr key={r}>
                <td><RarityBadge rarity={r} showPoints={false} /></td>
                <td>{(set.odds[r] / 100).toLocaleString()}%</td>
                <td>{RARITY_POINTS[r].toLocaleString()}</td>
              </tr>
            ))}
            <tr>
              <td><span className="rarity-pill holo-pill">✨ Holo</span></td>
              <td>{(set.holoOdds / 100).toLocaleString()}%</td>
              <td>×{HOLO_MULTIPLIER} points</td>
            </tr>
          </tbody>
        </table>

        <h3>Combos (same card more than once)</h3>
        <table className="scoring-table">
          <thead>
            <tr><th>Combo</th><th>Chance per pack</th><th>Multiplier</th></tr>
          </thead>
          <tbody>
            {HAND_ORDER.map((h) => (
              <tr key={h}>
                <td>{POKER_HANDS[h].name}</td>
                <td>1 in {formatOneIn(oneIn(odds[h]))}</td>
                <td>×{POKER_HANDS[h].multiplier.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ScoringGuide;
