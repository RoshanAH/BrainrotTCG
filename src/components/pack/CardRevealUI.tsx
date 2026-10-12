import { useRef } from 'react';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import { FastForward } from 'lucide-react';
import Card from '../cards/Card';
import type { CardWithMeta } from '../cards/Card';
import cardBackImage from '../../assets/images/card_back.webp';
import RarityBadge from '../ui/RarityBadge';
import { useCoarsePointer } from '../../hooks/useCoarsePointer';
import { isBigPull } from '../../game/reveal';

const Motion = motion;

interface CardRevealUIProps {
  currentCard: CardWithMeta;
  currentIndex: number;
  totalCards: number;
  hasMovedMouse: boolean;
  onInteraction: () => void;
  /** Reveal everything and go straight to the summary. */
  onSkip: () => void;
}

/** How far (px) or how fast (px/s) a flipped card has to be flung to move on. */
const SWIPE_DISTANCE = 80;
const SWIPE_SPEED = 500;

/**
 * One card at a time off the top of the stack, rarest last. Big pulls light the back's edge before
 * the flip and get a spotlight after it; a flipped card can be swiped away or tapped.
 */
const CardRevealUI = ({ currentCard, currentIndex, totalCards, hasMovedMouse, onInteraction, onSkip }: CardRevealUIProps) => {
  const touch = useCoarsePointer();
  const revealed = currentCard?.isRevealed;
  const remaining = totalCards - currentIndex - 1;
  const big = !!currentCard && isBigPull(currentCard.rarity);
  const slow = !!currentCard && (currentCard.rarity === 'LEGENDARY' || currentCard.rarity === 'BRAINROT');
  const hint = touch
    ? revealed
      ? 'Swipe or tap for the next card'
      : 'Tap to flip'
    : revealed
      ? 'Click or press Space for the next card'
      : 'Click or press Space to flip';

  // A mouse drag ends with a click on the card; that click isn't a tap, so it mustn't advance again.
  const draggedAt = useRef(0);
  const onDragEnd = (_: unknown, info: PanInfo) => {
    draggedAt.current = performance.now();
    if (Math.abs(info.offset.x) > SWIPE_DISTANCE || Math.abs(info.velocity.x) > SWIPE_SPEED) onInteraction();
  };
  const onTap = () => {
    if (performance.now() - draggedAt.current > 300) onInteraction();
  };

  return (
    <>
      <div className="reveal-top">
        <div className="reveal-progress" role="progressbar" aria-label="Cards revealed" aria-valuemin={1} aria-valuemax={totalCards} aria-valuenow={currentIndex + 1} aria-valuetext={`Card ${currentIndex + 1} of ${totalCards}`}>
          {Array.from({ length: totalCards }, (_, i) => (
            <span key={i} className={i < currentIndex ? 'done' : i === currentIndex ? 'current' : ''} aria-hidden="true" />
          ))}
        </div>
        <button type="button" className="reveal-skip" onClick={onSkip}>
          Skip <FastForward aria-hidden="true" />
        </button>
      </div>

      <div className={`active-card-container ${revealed && big ? 'is-spotlit' : ''}`}>
        {/* The cards still to come, as a stack behind the current one. */}
        {Array.from({ length: Math.min(remaining, 3) }, (_, i) => (
          <div key={`stack-${i}`} className="reveal-stack-card" style={{ '--depth': i + 1 } as React.CSSProperties} aria-hidden="true">
            <img src={cardBackImage} alt="" draggable="false" />
          </div>
        ))}
        <AnimatePresence mode="popLayout">
          {currentCard && (
            <Motion.div
              key={currentCard.uniqueId}
              className="reveal-card"
              initial={{ y: 24, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: revealed && big ? 1.03 : 1 }}
              exit={{ x: -360, opacity: 0, rotate: -10, transition: { duration: 0.22 } }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              drag={revealed ? 'x' : false}
              dragSnapToOrigin
              dragElastic={0.6}
              onDragEnd={onDragEnd}
            >
              <Card card={currentCard} isFlipped={currentCard.isRevealed} onFlip={onTap} tell={big} slowFlip={slow} />
            </Motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="reveal-rarity" aria-live="polite">
        {revealed && <RarityBadge rarity={currentCard.rarity} isHolo={currentCard.isHolo} />}
        {revealed && currentCard.isNew && <span className="reveal-new">New</span>}
      </div>

      <p className="tip-text">{hint}</p>
      {!touch && <div className={`mouse-hint ${hasMovedMouse ? 'fade-out' : ''}`}>Move the mouse over the card to tilt it</div>}
    </>
  );
};

export default CardRevealUI;
