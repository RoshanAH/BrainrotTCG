import { useMemo, useState } from 'react';
import { ChevronRight, Link2 } from 'lucide-react';
import type { CardWithMeta } from '../cards/Card';
import PackCardViewer from '../ui/PackCardViewer';
import Sheet from '../ui/Sheet';
import ProfileSummary from './ProfileSummary';
import { getCard } from '../../data/cards';
import { getLatestSet, setCode } from '../../content/sets';
import { getHistory, type HistoryEntry } from '../../game/history';
import { getPlayer } from '../../game/player';
import { myProfileInfo, myProfileProof, myStats, profileUrl } from '../../game/profiles';
import { copyText } from '../../game/shareActions';
import '../../styles/Pulls.css';

interface LegacyBest {
  highestPackCards?: CardWithMeta[];
  highestPackLegacy?: boolean;
}

interface MyProfilePageProps {
  stats: LegacyBest;
  onClose: () => void;
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
  entry.cards
    ?.map((c, i) => {
      const card = getCard(`${entry.setId}/${c.id}`);
      return card ? { ...card, uniqueId: i, isRevealed: true, isHolo: c.holo } : null;
    })
    .filter((c): c is CardWithMeta => c !== null) ?? null;

/** Your level and stats, a link that proves them, and every pack you've opened (newest first). */
const MyProfilePage = ({ stats, onClose, onSharePull }: MyProfilePageProps) => {
  const player = getPlayer();
  const history = useMemo(() => getHistory(), []);
  const summary = useMemo(() => myStats(), []);
  const mine = useMemo(() => myProfileInfo(), []);
  const [shown, setShown] = useState(PAGE);
  const [copied, setCopied] = useState(false);
  const [preparing, setPreparing] = useState<string | null>(null);
  /** A link that took a while to prepare; the tap that started it may no longer be allowed to copy. */
  const [readyUrl, setReadyUrl] = useState<string | null>(null);

  const send = async (url: string) => {
    if (await copyText(url)) {
      setReadyUrl(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const share = async () => {
    if (readyUrl) return send(readyUrl);
    // Usually instant; tickets this device has no cards for are re-opened once, first.
    const slow = !!mine?.missing;
    setPreparing(slow ? 'Preparing…' : null);
    let proof: string | null;
    try {
      proof = await myProfileProof((done, total) => setPreparing(`Preparing ${done}/${total}…`));
    } finally {
      setPreparing(null);
    }
    if (!proof) return;
    if (slow) setReadyUrl(profileUrl(proof));
    else await send(profileUrl(proof));
  };

  const openEntry = (entry: HistoryEntry | undefined) => {
    const cards = entry && cardsOf(entry);
    if (entry && cards) onSharePull(entry, cards);
  };

  return (
    <Sheet
      title="Profile"
      subtitle={
        <>
          {player.name} <span className="share-fp">#{player.fingerprint}</span>
        </>
      }
      onClose={onClose}
      size="lg"
      className="pulls-page"
    >
      {mine ? (
        <ProfileSummary
          stats={summary}
          onOpenPack={(pack) => openEntry(history.find((e) => e.nonce === pack.nonce && player.publicKeyHex.startsWith(e.key)))}
          actions={
            <button type="button" className="btn btn--secondary btn--sm" onClick={share} disabled={!!preparing}>
              <Link2 aria-hidden="true" />
              {preparing ?? (copied ? 'Link copied' : readyUrl ? 'Copy link now' : 'Copy profile link')}
            </button>
          }
        />
      ) : (
        <div className="pulls-empty">
          <p>No packs yet. Your level, stats and best pulls show up here.</p>
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Open your first pack
          </button>
        </div>
      )}

      {mine && mine.filled > 0 && (
        <p className="pulls-note">
          {mine.filled.toLocaleString()} early pack{mine.filled === 1 ? " wasn't" : "s weren't"} recorded on this device. A profile
          can't skip tickets, so yours counts {mine.filled === 1 ? 'it' : 'them'} as whatever those tickets hold.
        </p>
      )}

      {stats.highestPackLegacy && stats.highestPackCards?.length ? (
        <section className="pulls-legacy">
          <h3 className="section-title pulls-history-title">Best before verifiable pulls</h3>
          <PackCardViewer cards={stats.highestPackCards} displayMode="grid" canShareCards />
        </section>
      ) : null}

      {history.length > 0 && (
        <section aria-labelledby="pulls-history-title" className="pulls-history">
          <h3 id="pulls-history-title" className="section-title pulls-history-title">
            All packs · {history.length.toLocaleString()}
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
                    onClick={() => openEntry(entry)}
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
                        {set && <span className="set-code">{setCode(set)}</span>}
                        <span className="pull-row-setname">{set?.name ?? entry.setId} · </span>
                        {timeAgo(entry.openedAt)}
                      </span>
                    </span>
                    <span className="pull-row-score tabular">{entry.score.toLocaleString()}</span>
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

export default MyProfilePage;
