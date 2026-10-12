import { useState } from 'react';
import { getLatestSet } from '../../content/sets';
import ScoringGuide from './ScoringGuide';
import '../../styles/Scoring.css';

interface BrainrotScorePanelProps {
  points: number;
  multiplier: number;
  handName: string;
  score: number;
  /** Set whose odds the "how it works" guide should show. */
  setId?: string;
}

const BrainrotScorePanel = ({ points, multiplier, handName, score, setId }: BrainrotScorePanelProps) => {
  const [showGuide, setShowGuide] = useState(false);
  const set = getLatestSet(setId ?? 'genesis') ?? getLatestSet('genesis');
  return (
    <div className="score-panel">
      <div className="score-panel-math">
        {points.toLocaleString()} pts × {multiplier.toLocaleString()} ({handName})
      </div>
      <div className="score-panel-total">
        🧠 {score.toLocaleString()} <span>Brainrot Score</span>
      </div>
      {set && (
        <button className="score-panel-help" onClick={(e) => { e.stopPropagation(); setShowGuide(true); }}>
          How scoring works
        </button>
      )}
      {showGuide && set && <ScoringGuide set={set} onClose={() => setShowGuide(false)} />}
    </div>
  );
};

export default BrainrotScorePanel;
