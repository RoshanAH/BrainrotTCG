import { MoveHorizontal } from 'lucide-react';
import { RefObject } from 'react';
import { useCoarsePointer } from '../../hooks/useCoarsePointer';
import type { CutPoint } from '../../hooks/usePackCutter';
import type { Spark } from '../../hooks/useSparks';
import type { SetDefinition } from '../../engine';

interface PackCuttingUIProps {
  packRef: RefObject<HTMLDivElement | null>;
  packDesign: string;
  set: SetDefinition;
  error: string | null;
  isCutting: boolean;
  isPackCut: boolean;
  cutPoints: CutPoint[];
  sparks: Spark[];
}

const PackCuttingUI = ({
  packRef,
  packDesign,
  set,
  error,
  isCutting,
  isPackCut,
  cutPoints,
  sparks,
}: PackCuttingUIProps) => {
  const touch = useCoarsePointer();
  return (
    <>
      <div className="pack-shell-wrap">
        <div
          ref={packRef}
          className={`pack-shell ${isCutting ? 'is-cutting' : ''} ${isPackCut ? 'is-cut' : ''}`}
          style={{ '--pack-mask': `url("${packDesign}")` } as React.CSSProperties}
        >
          <img
            className="pack-half pack-half-bottom"
            src={packDesign}
            alt="Brainrot TCG booster pack wrapper"
            draggable="false"
          />
          <img
            className="pack-half pack-half-top"
            src={packDesign}
            alt=""
            aria-hidden="true"
            draggable="false"
          />
          {/* The set tag is stuck on the top strip, so it tears away with it. */}
          <div className="pack-top-piece">
            <div
              className="pack-set-ribbon"
              style={{ '--set-a': set.palette?.[0] ?? '#ff3df2', '--set-b': set.palette?.[1] ?? '#29f0ff' } as React.CSSProperties}
            >
              <span className="pack-set-name">{set.name}</span>
              <span className="pack-set-era">{set.era}</span>
            </div>
          </div>
          <div className="tear-guide" />
          <div className="swipe-hint">
            <MoveHorizontal className="swipe-hint-icon" aria-hidden="true" />
            <span className="swipe-hint-text">{touch ? 'Swipe across to open' : 'Drag across to open'}</span>
          </div>
          {cutPoints.length > 1 && (
            <svg className="cut-line-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polyline
                className="cut-line"
                points={cutPoints.map(p => `${p.x},${p.y}`).join(' ')}
              />
            </svg>
          )}
        </div>
        {error && (
          <p className="pack-hint is-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="spark-layer" aria-hidden="true">
        {sparks.map((spark) => (
          <span
            key={spark.id}
            className="drag-spark"
            style={{
              '--x': `${spark.x}px`,
              '--y': `${spark.y}px`,
              '--dx': `${spark.dx}px`,
              '--dy': `${spark.dy}px`,
              '--size': `${spark.size}px`,
              '--hue': spark.hue,
            } as React.CSSProperties}
          />
        ))}
      </div>
    </>
  );
};

export default PackCuttingUI;
