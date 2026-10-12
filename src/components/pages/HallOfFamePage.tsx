import { useEffect, useMemo, useState } from 'react';
import { Crown, ShieldAlert, ShieldCheck } from 'lucide-react';
import Sheet from '../ui/Sheet';
import Tabs from '../ui/Tabs';
import '../../styles/HallOfFame.css';
import { getCard } from '../../data/cards';
import { checkPull } from '../../game/pulls';
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
  const [tab, setTab] = useState<'top' | 'firsts' | 'legends'>('top');

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

  const renderEntry = (entry: HallOfFameEntry, rank?: number) => {
    const check = checks[entry.issue];
    const who = normalizeName(entry.name) || 'Anonymous';
    return (
      <li key={`${entry.proof}-${rank ?? 'first'}`}>
        <a
          className={`hof-entry ${check === 'failed' ? 'is-failed' : ''}`}
          href={`#/pull/${entry.proof}`}
          aria-label={`${rank !== undefined ? `Number ${rank + 1}: ` : ''}${entry.hand} by ${who} in ${entry.setName}, score ${entry.score}`}
        >
          {rank !== undefined && <span className="hof-rank tabular">{rank + 1}</span>}
          <span className="hof-cards" aria-hidden="true">
            {entry.cards.map((c, i) => {
              const card = getCard(`${entry.setId}/${c.cardId}`);
              return card ? <img key={i} src={card.image} alt="" className={`${card.rarity.toLowerCase()} ${c.isHolo ? 'holo' : ''}`} /> : null;
            })}
          </span>
          <span className="hof-main">
            <span className="hof-hand">{entry.hand}</span>
            <span className="hof-who">
              {who} <span className="share-fp">#{entry.fingerprint}</span>
            </span>
            <span className="hof-meta">
              {entry.setName} · {formatDate(entry.submittedAt)}
            </span>
          </span>
          <span className="hof-side">
            <span className="hof-score tabular">{entry.score.toLocaleString()}</span>
            <CheckBadge check={check} />
          </span>
        </a>
      </li>
    );
  };

  const empty = (
    <div className="hof-empty">
      <Crown aria-hidden="true" />
      <p>
        <strong>No verified entries yet.</strong> Pull a Full House or better (or a Brainrot Score of {HALL_OF_FAME_MIN_SCORE.toLocaleString()}+),
        share it, and submit it from the share sheet. You could be first.
      </p>
    </div>
  );

  return (
    <Sheet title="Hall of Fame" subtitle="The luckiest verified pulls on Earth" onClose={onClose} size="lg" className="hall-of-fame">
      <Tabs
        label="Hall of Fame lists"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'top', label: 'Leaderboard' },
          { id: 'firsts', label: 'World firsts' },
          { id: 'legends', label: 'Legends' },
        ]}
      />

      <div className="hof-panel" role="tabpanel">
        {tab === 'top' && (
          <>
            {entries === null && <p className="hof-loading">Loading…</p>}
            {entries?.length === 0 && empty}
            {ranked.length > 0 && (
              <>
                <p className="hof-note">
                  <ShieldCheck aria-hidden="true" /> The top {VERIFY_LIMIT} are re-checked on your device. Tap one to see it.
                </p>
                <ol className="hof-list">{ranked.map((e, i) => renderEntry(e, i))}</ol>
              </>
            )}
          </>
        )}

        {tab === 'firsts' && (
          <>
            <p className="hof-note">The first verified Full House or better in each set.</p>
            {firsts.length > 0 ? <ul className="hof-list">{firsts.map((e) => renderEntry(e))}</ul> : empty}
          </>
        )}

        {tab === 'legends' && (
          <>
            <p className="hof-note">The originals, from the hackathon, before pulls were verifiable.</p>
            <ul className="hof-legends">
              {HACKATHON_LEGENDS.map((entry) => (
                <li key={entry.name} className="hof-legend">
                  <img src={entry.image} alt={`${entry.name}'s ${entry.description}`} className={entry.portrait ? 'is-portrait' : ''} loading="lazy" />
                  <span className="hof-legend-info">
                    <strong>{entry.name}</strong>
                    <span>
                      {entry.description} · {entry.date}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Sheet>
  );
};

const CheckBadge = ({ check }: { check?: Check }) => {
  if (check === 'verified')
    return (
      <span className="hof-check is-verified">
        <ShieldCheck aria-hidden="true" /> Verified
      </span>
    );
  if (check === 'failed')
    return (
      <span className="hof-check is-failed">
        <ShieldAlert aria-hidden="true" /> Failed
      </span>
    );
  if (check === 'checking') return <span className="hof-check">Checking…</span>;
  return null;
};

export default HallOfFamePage;
