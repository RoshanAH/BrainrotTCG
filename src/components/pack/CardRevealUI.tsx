import { motion, AnimatePresence } from 'framer-motion';
import Card from '../cards/Card';
import type { CardWithMeta } from '../cards/Card';
import RarityBadge from '../ui/RarityBadge';
import { useCoarsePointer } from '../../hooks/useCoarsePointer';

const Motion = motion;

interface CardRevealUIProps {
  currentCard: CardWithMeta;
  currentIndex: number;
  totalCards: number;
  hasMovedMouse: boolean;
  onInteraction: () => void;
}

const CardRevealUI = ({ currentCard, currentIndex, totalCards, hasMovedMouse, onInteraction }: CardRevealUIProps) => {
  const touch = useCoarsePointer();
  const revealed = currentCard?.isRevealed;
  const hint = touch
    ? revealed
      ? 'Tap for the next card'
      : 'Tap to flip'
    : revealed
      ? 'Click or press Space for the next card'
      : 'Click or press Space to flip';

  return (
    <>
      <div className="reveal-progress" role="progressbar" aria-label="Cards revealed" aria-valuemin={1} aria-valuemax={totalCards} aria-valuenow={currentIndex + 1} aria-valuetext={`Card ${currentIndex + 1} of ${totalCards}`}>
        {Array.from({ length: totalCards }, (_, i) => (
          <span key={i} className={i < currentIndex ? 'done' : i === currentIndex ? 'current' : ''} aria-hidden="true" />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {currentCard && (
          <Motion.div
            key={currentCard.uniqueId}
            initial={{ x: 300, opacity: 0, rotate: 8 }}
            animate={{ x: 0, opacity: 1, rotate: 0 }}
            exit={{ x: -300, opacity: 0, rotate: -8 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="active-card-container"
          >
            <Card card={currentCard} isFlipped={currentCard.isRevealed} onFlip={onInteraction} />
          </Motion.div>
        )}
      </AnimatePresence>

      <div className="reveal-rarity" aria-live="polite">
        {revealed && <RarityBadge rarity={currentCard.rarity} isHolo={currentCard.isHolo} />}
      </div>

      <p className="tip-text">{hint}</p>
      {!touch && <div className={`mouse-hint ${hasMovedMouse ? 'fade-out' : ''}`}>Move the mouse over the card to tilt it</div>}
    </>
  );
};

export default CardRevealUI;
