import { useEffect, useRef, useState } from 'react';
import { Share2 } from 'lucide-react';
import CardShareSheet from '../share/CardShareSheet';
import type { Card } from '../../data/cards';
import { cardPoints } from '../../data/cards';
import { FINISH_INFO, modifierClasses, modifierLabel } from '../../game/modifiers';
import { sameVersion, versionOf, type CardVersion, type OwnedVersion } from '../../game/versions';
import RarityBadge from '../ui/RarityBadge';
import Sheet from '../ui/Sheet';

interface CardViewerModalProps {
  /** The card. A pulled card carries its own version (holo, finish, misprint), and that's what shows. */
  card: Card & Partial<CardVersion>;
  /** In the collection: every version you own, most valuable first. It opens on the first. */
  versions?: OwnedVersion[];
  onClose: () => void;
  /** Only for cards the player owns (not someone else's shared pull). */
  canShare?: boolean;
}

const MAX_TILT = 12;

const versionName = (v: CardVersion) => modifierLabel(v) || 'Plain';

/** One card, big, tilting with the pointer. */
const CardViewerModal = ({ card, versions, onClose, canShare = false }: CardViewerModalProps) => {
  const [shown, setShown] = useState<CardVersion>(() => versions?.[0]?.version ?? versionOf(card));
  const { isHolo, finish, misprint } = shown;
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
        {finish && <span className="finish-frame" aria-hidden="true" />}
        {label && <span className="modifier-sticker">{label}</span>}
      </div>
      <div className="card-viewer-info">
        <RarityBadge rarity={card.rarity} isHolo={isHolo} finish={finish} misprint={misprint} />
        {card.flavor && <p className="card-viewer-flavor">{card.flavor}</p>}
        {versions && versions.length > 1 && (
          <div className="card-viewer-versions" role="group" aria-label="Your versions of this card">
            <span className="card-viewer-versions-label">Your versions</span>
            <span className="card-viewer-chips">
              {versions.map(({ version, count }) => (
                <button
                  key={versionName(version)}
                  type="button"
                  className={`version-chip ${version.misprint ? 'misprint-chip' : ''}`}
                  style={version.finish ? ({ '--finish': FINISH_INFO[version.finish].color } as React.CSSProperties) : undefined}
                  aria-pressed={sameVersion(shown, version)}
                  onClick={() => setShown(version)}
                >
                  {versionName(version)} ×{count}
                  <span className="sr-only">, {cardPoints(card.rarity, version.isHolo, version.finish, version.misprint).toLocaleString()} points</span>
                </button>
              ))}
            </span>
          </div>
        )}
        <div className="card-viewer-actions">
          {canShare && (
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setSharing(true)}>
              <Share2 aria-hidden="true" /> Share card
            </button>
          )}
        </div>
      </div>
      {sharing && <CardShareSheet card={card} version={shown} onClose={() => setSharing(false)} />}
    </Sheet>
  );
};

export default CardViewerModal;
