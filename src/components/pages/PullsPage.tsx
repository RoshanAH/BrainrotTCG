import { useMemo, useState } from 'react';
import { ChevronRight, Share2 } from 'lucide-react';
import type { CardWithMeta } from '../cards/Card';
import PackCardViewer from '../ui/PackCardViewer';
import Sheet from '../ui/Sheet';
import { getCard } from '../../data/cards';
import { getLatestSet } from '../../content/sets';
import { getHistory, type HistoryEntry } from '../../game/history';
import '../../styles/Pulls.css';

interface BestPack {
  highestPackCards?: CardWithMeta[];
  highestPackLegacy?: boolean;
}

interface PullsPageProps {
  stats: BestPack;
  onClose: () => void;
  /** Present when the best pack is a verifiable pull. */
  onShareBest?: () => void;
  onSharePull: (entry: HistoryEntry, cards: CardWithMeta[]) => void;
}

const PAGE = 30;
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

const timeAgo = (t: number) => {
  const minutes = Math.round((t - Date.now()) / 60000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour');
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const cardsOf = (entry: HistoryEntry): CardWithMeta[] | null =>
  entry.cards?.map((c, i) => {
    const card = getCard(`${entry.setId}/${c.id}`);
    return card ? { ...card, uniqueId: i, isRevealed: true, isHolo: c.holo } : null;
  }).filter((c): c is CardWithMeta => c !== null) ?? null;

/** Your best pull, then every pack you've opened (newest first). Tap one to share it. */
const PullsPage = ({ stats, onClose, onShareBest, onSharePull }: PullsPageProps) => {
  const history = useMemo(() => getHistory(), []);
  const [shown, setShown] = useState(PAGE);
  const best = stats.highestPackCards?.length ? stats.highestPackCards : null;

  return (
    <Sheet
      title="Your pulls"
      subtitle={history.length > 0 ? `${history.length.toLocaleString()} pack${history.length === 1 ? '' : 's'} opened` : undefined}
      onClose={onClose}
      size="lg"
      className="pulls-page"
    >
      {best ? (
        <section className="pulls-best" aria-labelledby="pulls-best-title">
          <div className="pulls-section-head">
            <h3 id="pulls-best-title" className="section-title">
              Personal best
            </h3>
            {onShareBest && (
              <button type="button" className="btn btn--secondary btn--sm" onClick={onShareBest}>
                <Share2 aria-hidden="true" /> Share
              </button>
            )}
          </div>
          <PackCardViewer cards={best} displayMode="grid" />
          {!onShareBest && stats.highestPackLegacy && (
            <p className="pulls-note">Opened before verifiable pulls existed, so it can't be shared. Beat it to get a shareable best.</p>
          )}
        </section>
      ) : (
        <div className="pulls-empty">
          <p>No packs yet.</p>
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Open your first pack
          </button>
        </div>
      )}

      {history.length > 0 && (
        <section aria-labelledby="pulls-history-title">
          <h3 id="pulls-history-title" className="section-title pulls-history-title">
            History
          </h3>
          <ul className="pulls-list">
            {history.slice(0, shown).map((entry) => {
              const cards = cardsOf(entry);
              const set = getLatestSet(entry.setId);
              const [a = '#ff3df2', b = '#29f0ff'] = set?.palette ?? [];
              return (
                <li key={`${entry.key}-${entry.nonce}`}>
                  <button
                    type="button"
                    className="pull-row"
                    style={{ '--set-a': a, '--set-b': b } as React.CSSProperties}
                    onClick={() => cards && onSharePull(entry, cards)}
                    disabled={!cards}
                  >
                    <span className="pull-row-thumbs" aria-hidden="true">
                      {cards
                        ? cards.map((c, i) => <img key={i} src={c.image} alt="" loading="lazy" className={c.isHolo ? 'holo' : ''} />)
                        : Array.from({ length: 5 }, (_, i) => <span key={i} className="pull-row-blank" />)}
                    </span>
                    <span className="pull-row-main">
                      <span className="pull-row-hand">{entry.hand}</span>
                      <span className="pull-row-meta">
                        {set?.name ?? entry.setId} · {timeAgo(entry.openedAt)}
                      </span>
                    </span>
                    <span className="pull-row-score tabular">🧠 {entry.score.toLocaleString()}</span>
                    {cards && <ChevronRight className="pull-row-chevron" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
          {shown < history.length && (
            <button type="button" className="btn btn--ghost btn--block" onClick={() => setShown((n) => n + PAGE)}>
              Show more
            </button>
          )}
        </section>
      )}
    </Sheet>
  );
};

export default PullsPage;
