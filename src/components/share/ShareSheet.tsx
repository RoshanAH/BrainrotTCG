import { useMemo, useState } from 'react';
import type { CardWithMeta } from '../cards/Card';
import type { PackScore } from '../../engine';
import { qualifiesForHallOfFame } from '../../engine';
import { getLatestSet } from '../../content/sets';
import { getPlayer } from '../../game/player';
import { proofFor, pullUrl, type PullRef } from '../../game/pulls';
import { bragText, hallOfFameSubmitUrl } from '../../game/share';
import PackCardViewer from '../ui/PackCardViewer';
import '../../styles/Share.css';

export interface ShareTarget {
  ref: PullRef;
  cards: CardWithMeta[];
  score: PackScore;
}

interface ShareSheetProps {
  target: ShareTarget;
  onClose: () => void;
}

const ShareSheet = ({ target, onClose }: ShareSheetProps) => {
  const player = getPlayer();
  const setName = getLatestSet(target.ref.setId)?.name ?? target.ref.setId;
  const url = useMemo(() => pullUrl(proofFor(target.ref)), [target.ref]);
  const text = bragText(target.cards, target.score, setName, url);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (what: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      window.prompt('Copy this:', value);
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title: 'My Brainrot TCG pull', text, url });
    } catch {
      // cancelled
    }
  };

  return (
    <div className="share-sheet-backdrop" onClick={onClose}>
      <div className="share-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Share this pull">
        <button className="share-close" onClick={onClose} aria-label="Close">×</button>
        <h2>Show it off</h2>
        <p className="share-owner">
          Pulled by <strong>{player.name}</strong> <span className="share-fp">#{player.fingerprint}</span> · {setName}
        </p>
        <PackCardViewer cards={target.cards} displayMode="grid" />
        <pre className="share-brag">{text}</pre>
        <div className="share-actions">
          {'share' in navigator && <button onClick={nativeShare}>Share…</button>}
          <button onClick={() => copy('link', url)}>{copied === 'link' ? 'Copied!' : 'Copy link'}</button>
          <button onClick={() => copy('text', text)}>{copied === 'text' ? 'Copied!' : 'Copy brag text'}</button>
          {qualifiesForHallOfFame(target.score) && (
            <a className="share-hof" href={hallOfFameSubmitUrl(url, `${target.score.hand.name} in ${setName}`)} target="_blank" rel="noreferrer">
              Submit to the global Hall of Fame
            </a>
          )}
        </div>
        <p className="share-note">
          The link is a ~130-byte proof. Anyone who opens it re-derives this exact pack from your player key and ticket #{target.ref.nonce} on
          their own device, so it can't be edited or faked.
        </p>
      </div>
    </div>
  );
};

export default ShareSheet;
