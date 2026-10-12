import { useMemo, useState } from 'react';
import type { CardWithMeta } from '../cards/Card';
import type { PackScore } from '../../engine';
import { qualifiesForHallOfFame } from '../../engine';
import { getLatestSet, setCode } from '../../content/sets';
import { getPlayer } from '../../game/player';
import { canShare, proofFor, pullUrl, type PullRef } from '../../game/pulls';
import { bragText, hallOfFameSubmitUrl } from '../../game/share';
import { renderPoster } from '../../game/bragImage';
import { Copy, Crown, ImageDown, Link2, Share2, ShieldCheck } from 'lucide-react';
import PackCardViewer from '../ui/PackCardViewer';
import Sheet from '../ui/Sheet';
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
  const set = getLatestSet(target.ref.setId);
  const setName = set?.name ?? target.ref.setId;
  const shareable = canShare(target.ref);
  const url = useMemo(() => (shareable ? pullUrl(proofFor(target.ref)) : ''), [shareable, target.ref]);
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

  const [posterBusy, setPosterBusy] = useState(false);
  const savePoster = async () => {
    setPosterBusy(true);
    try {
      const blob = await renderPoster({
        cards: target.cards,
        score: target.score,
        setName,
        playerName: player.name,
        fingerprint: player.fingerprint,
        url,
        cert: set ? `${setCode(set)} #${target.ref.nonce}` : `#${target.ref.nonce}`,
        setColor: set?.palette?.[0],
      });
      const file = new File([blob], `brainrot-pull-${target.ref.setId}-${target.ref.nonce}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My Brainrot TCG pull', text: url });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }
    } catch (error) {
      console.error('Poster failed', error);
    } finally {
      setPosterBusy(false);
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title: 'My Brainrot TCG pull', text, url });
    } catch {
      // cancelled
    }
  };

  if (!shareable) {
    return (
      <Sheet title="Can't share this one" onClose={onClose} size="sm">
        <p className="share-note">
          This pack was opened with a different player key than the one on this device (for example, before you imported a
          save), so this device can't sign a proof for it. Open it on the device that has that key, or import that save again.
        </p>
      </Sheet>
    );
  }

  const canNativeShare = typeof navigator.share === 'function';
  return (
    <Sheet
      title="Share your pull"
      subtitle={
        <>
          {setName} · {target.score.hand.name} · <span className="tabular">{target.score.score.toLocaleString()}</span>
        </>
      }
      onClose={onClose}
      size="sm"
      className="share-sheet"
    >
      <PackCardViewer cards={target.cards} displayMode="grid" showValue={false} className="share-cards" />

      <div className="share-primary">
        {canNativeShare ? (
          <button type="button" className="btn btn--primary btn--lg btn--block" onClick={nativeShare}>
            <Share2 aria-hidden="true" /> Share
          </button>
        ) : (
          <button type="button" className="btn btn--primary btn--lg btn--block" onClick={() => copy('link', url)}>
            <Link2 aria-hidden="true" /> {copied === 'link' ? 'Link copied' : 'Copy link'}
          </button>
        )}
      </div>

      <div className="share-secondary">
        {canNativeShare && (
          <button type="button" className="share-option" onClick={() => copy('link', url)}>
            <Link2 aria-hidden="true" />
            {copied === 'link' ? 'Copied' : 'Copy link'}
          </button>
        )}
        <button type="button" className="share-option" onClick={() => copy('text', text)}>
          <Copy aria-hidden="true" />
          {copied === 'text' ? 'Copied' : 'Copy text'}
        </button>
        <button type="button" className="share-option" onClick={savePoster} disabled={posterBusy}>
          <ImageDown aria-hidden="true" />
          {posterBusy ? 'Making…' : 'Poster'}
        </button>
      </div>

      {qualifiesForHallOfFame(target.score) && (
        <a className="share-hof" href={hallOfFameSubmitUrl(url, `${target.score.hand.name} in ${setName}`)} target="_blank" rel="noreferrer">
          <Crown aria-hidden="true" />
          <span>
            <strong>This qualifies for the Hall of Fame</strong>
            <span>Submit it on GitHub</span>
          </span>
        </a>
      )}

      <p className="share-note">
        <ShieldCheck aria-hidden="true" /> Anyone who opens the link re-checks this exact pack on their own device.
      </p>
    </Sheet>
  );
};

export default ShareSheet;
