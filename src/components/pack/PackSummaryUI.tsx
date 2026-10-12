import { motion } from 'framer-motion';
import PackCardViewer from '../ui/PackCardViewer';
import type { CardWithMeta } from '../cards/Card';
import '../../styles/Share.css';

const Motion = motion;

interface PackSummaryUIProps {
  openedCards: CardWithMeta[];
  onClose: () => void;
  onShare?: () => void;
}

const PackSummaryUI = ({ openedCards, onClose, onShare }: PackSummaryUIProps) => {
  return (
    <Motion.div
      className="pack-summary"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <h2 className="summary-title">Pack Summary</h2>
      <PackCardViewer cards={openedCards} displayMode="carousel" />
      <div className="summary-actions">
        {onShare && (
          <button className="summary-share-btn" onClick={onShare}>
            Share this pull
          </button>
        )}
        <button className="summary-close-btn" onClick={onClose}>
          Open Another Pack
        </button>
      </div>
    </Motion.div>
  );
};

export default PackSummaryUI;
