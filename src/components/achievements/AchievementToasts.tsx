import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Award } from 'lucide-react';
import type { Achievement } from '../../data/achievements';
import '../../styles/Toasts.css';

interface AchievementToastsProps {
  queue: Achievement[];
  /** Remove these ids from the queue. */
  onDismiss: (ids: string[]) => void;
  /** Tapping a toast opens the achievements list. */
  onOpen: () => void;
}

/** At this many waiting unlocks, show one grouped toast instead of a long run of single ones. */
const GROUP_AT = 3;

/**
 * Achievement unlocks, one small toast at a time at the top of the screen. A burst (one lucky pack
 * can unlock seven) becomes a single "N achievements" toast rather than a wall over the game.
 */
const AchievementToasts = ({ queue, onDismiss, onOpen }: AchievementToastsProps) => {
  const grouped = queue.length >= GROUP_AT;
  const shown = grouped ? queue : queue.slice(0, 1);
  const key = shown.map((a) => a.id).join('|');

  useEffect(() => {
    if (!key) return;
    const timer = window.setTimeout(() => onDismiss(key.split('|')), grouped ? 4500 : 3000);
    return () => window.clearTimeout(timer);
  }, [key, grouped, onDismiss]);

  return (
    <div className="toast-region" role="status" aria-live="polite">
      <AnimatePresence mode="wait">
        {shown.length > 0 && (
          <motion.button
            key={key}
            type="button"
            className="toast"
            onClick={() => {
              onDismiss(shown.map((a) => a.id));
              onOpen();
            }}
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -8, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <span className="toast-icon" aria-hidden="true">
              <Award strokeWidth={2.4} />
            </span>
            <span className="toast-text">
              <span className="toast-kicker">{grouped ? `${shown.length} achievements unlocked` : 'Achievement unlocked'}</span>
              <span className="toast-title">
                {grouped
                  ? shown
                      .slice(0, 3)
                      .map((a) => a.name)
                      .join(', ') + (shown.length > 3 ? ` +${shown.length - 3} more` : '')
                  : shown[0].name}
              </span>
              {!grouped && <span className="toast-desc">{shown[0].description}</span>}
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AchievementToasts;
