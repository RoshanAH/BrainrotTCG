import { useEffect, useMemo, useState } from 'react';
import '../../styles/HallOfFame.css';
import { getCard } from '../../data/cards';
import { checkPull } from '../../game/pulls';
import { REPO } from '../../constants';
import { decodeProof, HALL_OF_FAME_MIN_MULTIPLIER, HALL_OF_FAME_MIN_SCORE, normalizeName, pullId } from '../../engine';

// Hackathon legends: screenshots from before pulls were verifiable.
import adiImage from '../../assets/images/hall_of_fame/adi-four-of-a-kind.webp';
import danielImage from '../../assets/images/hall_of_fame/daniel-full-house.webp';
import squidImage from '../../assets/images/hall_of_fame/tehsquid-full-house.webp';

interface LegendEntry {
  name: string;
  description: string;
  image: string;
  date: string;
  portrait?: boolean;
}

const HACKATHON_LEGENDS: LegendEntry[] = [
  { name: 'Adi/frail_banana', description: '4 of a Kind', image: adiImage, date: 'March 1st, 2026' },
  { name: 'Daniel/dandandoo', description: 'Full House', image: danielImage, date: 'March 1st, 2026' },
  { name: 'TehSquid', description: 'Full House', image: squidImage, date: 'March 4th, 2026', portrait: true },
];

/** Shape of public/hall-of-fame.json, built by scripts/hall-of-fame.ts during deploy. */
interface HallOfFameEntry {
  proof: string;
  name: string;
  fingerprint: string;
  setId: string;
  setName: string;
  hand: string;
  multiplier: number;
  score: number;
  cards: { cardId: string; isHolo: boolean }[];
  issue: number;
  githubUser: string;
  submittedAt: string;
}

type Check = 'checking' | 'verified' | 'failed';

/** How many entries to re-verify on this device (each costs one ticket). */
const VERIFY_LIMIT = 30;

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

interface HallOfFamePageProps {
  onClose: () => void;
}

const HallOfFamePage = ({ onClose }: HallOfFamePageProps) => {
  const [entries, setEntries] = useState<HallOfFameEntry[] | null>(null);
  const [checks, setChecks] = useState<Record<number, Check>>({});

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}hall-of-fame.json`, { cache: 'no-cache' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: HallOfFameEntry[]) => setEntries(Array.isArray(data) ? data : []))
      .catch(() => setEntries([]));
  }, []);

  // One entry per pull (earliest submission keeps the credit), best first. A pull can be signed
  // more than once, so this keys on set, key and ticket number rather than the proof text.
  const ranked = useMemo(() => {
    const seen = new Set<string>();
    const idOf = (e: HallOfFameEntry) => {
      try {
        return pullId(decodeProof(e.proof));
      } catch {
        return e.proof; // fails verification below and shows as such
      }
    };
    return [...(entries ?? [])]
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
      .filter((e) => !seen.has(idOf(e)) && !!seen.add(idOf(e)))
      .sort((a, b) => b.multiplier - a.multiplier || b.score - a.score || a.submittedAt.localeCompare(b.submittedAt));
  }, [entries]);

  /** First verified submission of each hand in each set. */
  const firsts = useMemo(() => {
    const seen = new Set<string>();
    return [...ranked]
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
      .filter((e) => {
        const key = `${e.setId}|${e.hand}`;
        if (seen.has(key) || e.multiplier < HALL_OF_FAME_MIN_MULTIPLIER) return false;
        seen.add(key);
        return true;
      });
  }, [ranked]);

  // Don't trust the JSON either: re-derive each pack here, one at a time.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const entry of ranked.slice(0, VERIFY_LIMIT)) {
        if (cancelled) return;
        setChecks((prev) => ({ ...prev, [entry.issue]: 'checking' }));
        try {
          const pull = await checkPull(entry.proof);
          // Every field we display must be exactly what the proof produces.
          const matches =
            pull.proof.name === entry.name &&
            pull.fingerprint === entry.fingerprint &&
            pull.set.id === entry.setId &&
            pull.score.hand.name === entry.hand &&
            pull.score.score === entry.score &&
            pull.cards.length === entry.cards.length &&
            pull.cards.every((c, i) => c.cardId === entry.cards[i]?.cardId && c.isHolo === entry.cards[i]?.isHolo);
          if (!cancelled) setChecks((prev) => ({ ...prev, [entry.issue]: matches ? 'verified' : 'failed' }));
        } catch {
          if (!cancelled) setChecks((prev) => ({ ...prev, [entry.issue]: 'failed' }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ranked]);

  const renderEntry = (entry: HallOfFameEntry, index?: number) => {
    const check = checks[entry.issue];
    return (
      <article key={`${entry.proof}-${index ?? 'first'}`} className={`hof-entry ${check === 'failed' ? 'failed' : ''}`}>
        {index !== undefined && <div className="hof-rank">#{index + 1}</div>}
        <div className="hof-cards">
          {entry.cards.map((c, i) => {
            const card = getCard(`${entry.setId}/${c.cardId}`);
            return card ? (
              <img key={i} src={card.image} alt={card.name} className={`hof-card ${card.rarity.toLowerCase()} ${c.isHolo ? 'holo' : ''}`} />
            ) : null;
          })}
        </div>
        <div className="hof-info">
          <div className="hof-hand">
            {entry.hand} <span className="hof-flex">🧠 {entry.score.toLocaleString()}</span>
          </div>
          <div className="hof-who">
            {normalizeName(entry.name) || 'Anonymous'} <span className="share-fp">#{entry.fingerprint}</span> ·{' '}
            <a href={`https://github.com/${REPO}/issues/${entry.issue}`} target="_blank" rel="noreferrer">
              @{entry.githubUser}
            </a>
          </div>
          <div className="hof-meta">
            {entry.setName} · {formatDate(entry.submittedAt)}
          </div>
          <div className={`hof-check ${check ?? ''}`}>
            {check === 'verified' && '✓ verified on your device'}
            {check === 'checking' && 'checking…'}
            {check === 'failed' && '✗ failed verification'}
          </div>
          <a className="hof-view" href={`#/pull/${entry.proof}`}>View pull</a>
        </div>
      </article>
    );
  };

  return (
    <div className="hall-of-fame-page">
      <div className="hall-of-fame-header">
        <h2>Hall of Fame</h2>
        <p>
          The luckiest verified pulls on Earth. GitHub Actions verified every entry, and the top {VERIFY_LIMIT} are re-checked on
          your device right now. Open any pull to check it yourself.
        </p>
        <button className="hall-of-fame-close-btn" onClick={onClose}>&times;</button>
      </div>

      <section className="hof-section">
        <h3>Global leaderboard</h3>
        {entries === null && <p className="hof-empty">Loading…</p>}
        {entries?.length === 0 && (
          <p className="hof-empty">
            No verified entries yet. Pull a Full House or better (or a {HALL_OF_FAME_MIN_SCORE.toLocaleString()}+ Brainrot Score), hit <strong>Share this pull</strong>, then{' '}
            <strong>Submit to the global Hall of Fame</strong>. You could be first.
          </p>
        )}
        <div className="hof-list">{ranked.map((e, i) => renderEntry(e, i))}</div>
      </section>

      {firsts.length > 0 && (
        <section className="hof-section">
          <h3>World firsts</h3>
          <p className="hof-sub">The first verified Full House or better in each set, by submission time.</p>
          <div className="hof-list">{firsts.map((e) => renderEntry(e))}</div>
        </section>
      )}

      <section className="hof-section">
        <h3>Hackathon legends</h3>
        <p className="hof-sub">The originals, from before pulls were verifiable.</p>
        <div className="hall-of-fame-grid">
          {HACKATHON_LEGENDS.map((entry) => (
            <div key={entry.name} className="hall-of-fame-card">
              <div className={`hall-of-fame-image ${entry.portrait ? 'portrait' : ''}`}>
                <img src={entry.image} alt={`${entry.name}'s achievement`} />
              </div>
              <div className="hall-of-fame-info">
                <div className="hall-of-fame-name">{entry.name}</div>
                <div className="hall-of-fame-achievement">{entry.description}</div>
                <div className="hall-of-fame-date">{entry.date}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default HallOfFamePage;
