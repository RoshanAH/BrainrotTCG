import { useEffect, useRef, useState } from 'react';
import { Share2, Sparkles } from 'lucide-react';
import CardShareSheet from '../share/CardShareSheet';
import type { Card } from '../../data/cards';
import type { Finish } from '../../engine';
import { FINISHES_RAREST_FIRST } from '../../engine';
import { FINISH_INFO, modifierClasses, modifierLabel } from '../../game/modifiers';
import RarityBadge from '../ui/RarityBadge';
import Sheet from '../ui/Sheet';

interface CardViewerModalProps {
  card: Card;
  hasNormal: boolean;
  hasHolo: boolean;
  initialHolo: boolean;
  /** A specific pulled card's finish and misprint (pack summary, a shared pull). */
  finish?: Finish | null;
  misprint?: boolean;
  /** In the collection: the finishes and misprints you own, so you can look at each. */
  owned?: { finishes?: Partial<Record<Finish, number>>; misprints?: number };
  onClose: () => void;
  /** Only for cards the player owns (not someone else's shared pull). */
  canShare?: boolean;
}

const MAX_TILT = 12;

/** One card, big, tilting with the pointer. */
const CardViewerModal = ({ card, hasNormal, hasHolo, initialHolo, finish: pulledFinish = null, misprint: pulledMisprint = false, owned, onClose, canShare = false }: CardViewerModalProps) => {
  const [isHolo, setIsHolo] = useState(initialHolo);
  const [finish, setFinish] = useState<Finish | null>(pulledFinish);
  const [misprint, setMisprint] = useState(pulledMisprint);
  const ownedFinishes = [...FINISHES_RAREST_FIRST].reverse().filter((f) => (owned?.finishes?.[f] ?? 0) > 0);
  const shown = { isHolo, finish, misprint };
  const label = modifierLabel(shown, false);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const onMove = (clientX: number, clientY: number) => {
      const rect = cardRef.current?.getBoundingClientRect();
      if (!rect) return;
      const px = Math.max(-1.5, Math.min(1.5, (clientX - (rect.left + rect.width / 2)) / (rect.width / 2)));
      const py = Math.max(-1.5, Math.min(1.5, (clientY - (rect.top + rect.height / 2)) / (rect.height / 2)));
      setTilt({ x: -py * MAX_TILT, y: px * MAX_TILT });
    };
    const mouse = (e: MouseEvent) => onMove(e.clientX, e.clientY);
    const touch = (e: TouchEvent) => e.touches[0] && onMove(e.touches[0].clientX, e.touches[0].clientY);
    window.addEventListener('mousemove', mouse);
    window.addEventListener('touchmove', touch, { passive: true });
    return () => {
      window.removeEventListener('mousemove', mouse);
      window.removeEventListener('touchmove', touch);
    };
  }, []);

  return (
    <Sheet title={card.name} onClose={onClose} bare className="card-viewer">
      <div
        ref={cardRef}
        className={`card-viewer-card ${card.rarity.toLowerCase()} ${isHolo ? 'holo' : ''} ${modifierClasses(shown)}`}
        style={{ transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}
      >
        <img src={card.image} alt={card.name} draggable="false" />
        {misprint && <img src={card.image} alt="" aria-hidden="true" className="misprint-ghost" draggable="false" />}
        {label && <span className="modifier-sticker">{label}</span>}
      </div>
      <div className="card-viewer-info">
        <RarityBadge rarity={card.rarity} isHolo={isHolo} finish={finish} misprint={misprint} />
        {card.flavor && <p className="card-viewer-flavor">{card.flavor}</p>}
        {(ownedFinishes.length > 0 || (owned?.misprints ?? 0) > 0) && (
          <div className="card-viewer-versions" role="group" aria-label="Your versions of this card">
            <span className="card-viewer-versions-label">Your versions</span>
            <span className="card-viewer-chips">
              {ownedFinishes.length > 0 && (
                <button type="button" className="version-chip" aria-pressed={finish === null} onClick={() => setFinish(null)}>
                  No finish
                </button>
              )}
              {ownedFinishes.map((f) => (
                <button
                  key={f}
                  type="button"
                  className="version-chip"
                  style={{ '--finish': FINISH_INFO[f].color } as React.CSSProperties}
                  aria-pressed={finish === f}
                  onClick={() => setFinish(f)}
                >
                  {FINISH_INFO[f].name} ×{owned!.finishes![f]}
                </button>
              ))}
              {(owned?.misprints ?? 0) > 0 && (
                <button type="button" className="version-chip misprint-chip" aria-pressed={misprint} onClick={() => setMisprint(!misprint)}>
                  Misprint ×{owned!.misprints}
                </button>
              )}
            </span>
          </div>
        )}
        <div className="card-viewer-actions">
          {hasNormal && hasHolo && (
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setIsHolo(!isHolo)} aria-pressed={isHolo}>
              <Sparkles aria-hidden="true" /> {isHolo ? 'Show normal' : 'Show holo'}
            </button>
          )}
          {canShare && (
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setSharing(true)}>
              <Share2 aria-hidden="true" /> Share card
            </button>
          )}
        </div>
      </div>
      {sharing && <CardShareSheet card={card} isHolo={isHolo} onClose={() => setSharing(false)} />}
    </Sheet>
  );
};

export default CardViewerModal;
