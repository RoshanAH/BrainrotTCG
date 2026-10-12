import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { Card } from '../../data/cards';
import RarityBadge from '../ui/RarityBadge';
import Sheet from '../ui/Sheet';

interface CardViewerModalProps {
  card: Card;
  hasNormal: boolean;
  hasHolo: boolean;
  initialHolo: boolean;
  onClose: () => void;
}

const MAX_TILT = 12;

/** One card, big, tilting with the pointer. */
const CardViewerModal = ({ card, hasNormal, hasHolo, initialHolo, onClose }: CardViewerModalProps) => {
  const [isHolo, setIsHolo] = useState(initialHolo);
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
        className={`card-viewer-card ${card.rarity.toLowerCase()} ${isHolo ? 'holo' : ''}`}
        style={{ transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}
      >
        <img src={card.image} alt={card.name} draggable="false" />
      </div>
      <div className="card-viewer-info">
        <RarityBadge rarity={card.rarity} isHolo={isHolo} />
        {card.flavor && <p className="card-viewer-flavor">{card.flavor}</p>}
        {hasNormal && hasHolo && (
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => setIsHolo(!isHolo)} aria-pressed={isHolo}>
            <Sparkles aria-hidden="true" /> {isHolo ? 'Show normal' : 'Show holo'}
          </button>
        )}
      </div>
    </Sheet>
  );
};

export default CardViewerModal;
