import { motion } from 'framer-motion';
import { RotateCcw, Share2 } from 'lucide-react';
import PackCardViewer from '../ui/PackCardViewer';
import type { CardWithMeta } from '../cards/Card';

const Motion = motion;

interface PackSummaryUIProps {
  openedCards: CardWithMeta[];
  onClose: () => void;
  onShare?: () => void;
}

/** After the last card: the whole pack, its score, and one clear next step. */
const PackSummaryUI = ({ openedCards, onClose, onShare }: PackSummaryUIProps) => (
  <Motion.div className="pack-summary" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
    <h2 className="summary-title">Your pull</h2>
    <PackCardViewer cards={openedCards} displayMode="carousel" />
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
  </Motion.div>
);

export default PackSummaryUI;
