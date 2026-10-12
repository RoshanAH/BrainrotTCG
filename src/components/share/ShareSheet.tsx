import { useMemo } from 'react';
import { Crown, ShieldCheck } from 'lucide-react';
import type { CardWithMeta } from '../cards/Card';
import type { PackScore } from '../../engine';
import { qualifiesForHallOfFame } from '../../engine';
import { getLatestSet, setCode } from '../../content/sets';
import { getPlayer } from '../../game/player';
import { canShare, proofFor, pullUrl, type PullRef } from '../../game/pulls';
import { bragText, hallOfFameSubmitUrl } from '../../game/share';
import { renderPoster } from '../../game/bragImage';
import Sheet from '../ui/Sheet';
import SharePreviewSheet from './SharePreviewSheet';
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

/** Share a whole pack: the poster you'll send, then share it or the link. */
const ShareSheet = ({ target, onClose }: ShareSheetProps) => {
  const player = getPlayer();
  const set = getLatestSet(target.ref.setId);
  const setName = set?.name ?? target.ref.setId;
  const shareable = canShare(target.ref);
  const url = useMemo(() => (shareable ? pullUrl(proofFor(target.ref)) : ''), [shareable, target.ref]);

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

  return (
    <SharePreviewSheet
      title="Share your pull"
      subtitle={
        <>
          {setName} · {target.score.hand.name} · <span className="tabular">{target.score.score.toLocaleString()}</span>
        </>
      }
      makeImage={() =>
        renderPoster({
          cards: target.cards,
          score: target.score,
          setName,
          playerName: player.name,
          fingerprint: player.fingerprint,
          url,
          cert: set ? `${setCode(set)} #${target.ref.nonce}` : `#${target.ref.nonce}`,
          setColor: set?.palette?.[0],
        })
      }
      imageName={`brainrot-pull-${target.ref.setId}-${target.ref.nonce}.png`}
      url={url}
      text={bragText(target.cards, target.score, setName, url)}
      onClose={onClose}
    >
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
        <ShieldCheck aria-hidden="true" /> Anyone who opens the link or scans the code re-checks this exact pack on their own
        device.
      </p>
    </SharePreviewSheet>
  );
};

export default ShareSheet;
