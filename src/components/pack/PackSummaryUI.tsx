import { useState } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw, Share2 } from 'lucide-react';
import type { CardWithMeta } from '../cards/Card';
import CardViewerModal from '../cards/CardViewerModal';
import BrainrotScorePanel from '../ui/BrainrotScorePanel';
import { CARD_RARITIES, getSetCards, scoreCards } from '../../data/cards';
import type { SetDefinition } from '../../engine';

const Motion = motion;

interface PackSummaryUIProps {
  openedCards: CardWithMeta[];
  set: SetDefinition;
  onClose: () => void;
  onShare?: () => void;
}

/**
 * After the last card: the hand as the headline, the score, and the five cards laid out like a
 * pack's contents on a table, each with its collector number, rarity and a NEW sticker if it's new.
 */
const PackSummaryUI = ({ openedCards, set, onClose, onShare }: PackSummaryUIProps) => {
  const [selected, setSelected] = useState<CardWithMeta | null>(null);
  const { points, hand, score } = scoreCards(openedCards);
  const setCards = getSetCards(set.id);
  const numberOf = (card: CardWithMeta) => {
    const i = setCards.findIndex((c) => c.key === card.key);
    return `${String(i + 1).padStart(3, '0')}/${String(setCards.length).padStart(3, '0')}`;
  };
  const newCount = openedCards.filter((c) => c.isNew).length;

  return (
    <Motion.div className="pack-summary" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
      <h2 className="summary-title">{hand.name === 'No Matches' ? 'No matches' : hand.name}</h2>
      <BrainrotScorePanel points={points} multiplier={hand.multiplier} handName={hand.name} score={score} setId={set.id} />

      <ul className="summary-cards">
        {openedCards.map((card) => (
          <li key={card.uniqueId}>
            <button
              type="button"
              className={`summary-card ${card.rarity.toLowerCase()} ${card.isHolo ? 'holo' : ''}`}
              onClick={() => setSelected(card)}
              aria-label={`${card.name}, ${CARD_RARITIES[card.rarity].name}${card.isHolo ? ', holo' : ''}${card.isNew ? ', new' : ''}`}
            >
              <img src={card.image} alt="" draggable="false" />
              {card.isNew && <span className="new-sticker">New</span>}
            </button>
            <span className="collection-label tabular" aria-hidden="true">
              {numberOf(card)}{' '}
              <span className={`collection-label-rarity ${card.rarity.toLowerCase()}`}>{CARD_RARITIES[card.rarity].symbol}</span>
            </span>
          </li>
        ))}
      </ul>
      {newCount > 0 && (
        <p className="summary-new tabular">
          {newCount} new {newCount === 1 ? 'card' : 'cards'} for your binder
        </p>
      )}

      <div className="summary-actions">
        {onShare && (
          <button type="button" className="btn btn--secondary btn--lg" onClick={onShare}>
            <Share2 aria-hidden="true" /> Share
          </button>
        )}
        <button type="button" className="btn btn--primary btn--lg" onClick={onClose}>
          <RotateCcw aria-hidden="true" /> Open another pack
        </button>
      </div>

      {selected && (
        <CardViewerModal
          card={selected}
          hasNormal={!selected.isHolo}
          hasHolo={selected.isHolo}
          initialHolo={selected.isHolo}
          onClose={() => setSelected(null)}
          canShare
        />
      )}
    </Motion.div>
  );
};

export default PackSummaryUI;
