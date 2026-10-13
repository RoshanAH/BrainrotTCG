import { useMemo } from 'react';
import {
  finishOrder,
  FINISH_MULTIPLIER,
  HOLO_MULTIPLIER,
  MISPRINT_MULTIPLIER,
  modifierTable,
  ODDS_TOTAL,
  POKER_HANDS,
  RARITIES_RAREST_FIRST,
  RARITY_POINTS,
  handOdds,
  oneIn,
  type HandKey,
  type SetDefinition,
} from '../../engine';
import { FINISH_INFO } from '../../game/modifiers';
import RarityBadge from './RarityBadge';
import Sheet from './Sheet';
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
  const modifiers = modifierTable(set.modifiers);
  const finishChance = modifiers ? Object.values(modifiers.finishOdds).reduce<number>((a, b) => a + (b ?? 0), 0) / ODDS_TOTAL : 0;
  const misprintChance = modifiers ? modifiers.misprintOdds / ODDS_TOTAL : 0;
  const plainChance = (1 - set.holoOdds / ODDS_TOTAL) * (1 - finishChance) * (1 - misprintChance);
  const specialPackChance = 1 - plainChance ** set.packSize;

  return (
    <Sheet title="Card guide" subtitle={`Rarity, modifiers and scoring for ${set.name} · version ${set.version}`} onClose={onClose} size="sm" className="scoring-guide">
        <h3>What makes a card rare?</h3>
        <p className="scoring-note">Every card has a base rarity: Common, Uncommon, Rare, Epic, Legendary or Brainrot. Holo is an extra shimmering effect. A finish changes the printed frame: metallic Silver, Gold, Platinum or Diamond, or colourful Neon, Cosmic or Ember in newer set versions. A misprint adds offset colours and a ghost image.</p>
        <p className="scoring-note">A card can have one finish, plus holo and misprint at the same time. These are separate rolls; their chances multiply. A 1% chance means about 1 in 100 cards on average, not a guaranteed pull after 100 cards.</p>
        <p className="scoring-note">About {(specialPackChance * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}% of {set.packSize}-card packs from this set contain at least one holo, finish or misprint. Each pack rolls independently; there is no guaranteed special card after a run of ordinary packs.</p>
        {modifiers ? <p className="scoring-note">For example, a Gold holo card has a {(set.holoOdds / 10000 * (modifiers.finishOdds.GOLD ?? 0) / 100).toLocaleString()}% chance per card before its base rarity is considered. Its points are multiplied by {HOLO_MULTIPLIER * FINISH_MULTIPLIER.GOLD}.</p> : <p className="scoring-note">This set version has no finishes or misprints.</p>}
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
              <td><span className="rarity-pill holo-pill"><span className="rarity-pill-gem" aria-hidden="true">◆</span>Holo</span></td>
              <td>{(set.holoOdds / 100).toLocaleString()}%</td>
              <td>×{HOLO_MULTIPLIER} points</td>
            </tr>
          </tbody>
        </table>

        {modifiers && (
          <>
            <h3>Finishes and misprints (they all stack)</h3>
            <table className="scoring-table">
              <thead>
                <tr><th>Modifier</th><th>Chance per card</th><th>Points</th></tr>
              </thead>
              <tbody>
                {[...finishOrder(set.modifiers)].reverse().map((f) => (
                  <tr key={f}>
                    <td><span className="finish-pill" style={{ '--finish': FINISH_INFO[f].color } as React.CSSProperties}>{FINISH_INFO[f].name}</span></td>
                    <td>{((modifiers.finishOdds[f] ?? 0) / 100).toLocaleString()}%</td>
                    <td>×{FINISH_MULTIPLIER[f].toLocaleString()}</td>
                  </tr>
                ))}
                <tr>
                  <td><span className="finish-pill misprint-pill">Misprint</span></td>
                  <td>{(modifiers.misprintOdds / 100).toLocaleString()}%</td>
                  <td>×{MISPRINT_MULTIPLIER}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}

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
    </Sheet>
  );
};

export default ScoringGuide;
