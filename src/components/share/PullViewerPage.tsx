import { useEffect, useState } from 'react';
import { checkPull, pullUrl, type CheckedPull } from '../../game/pulls';
import PackCardViewer from '../ui/PackCardViewer';
import '../../styles/Share.css';
import { normalizeName } from '../../engine';

interface PullViewerPageProps {
  proof: string;
  onClose: () => void;
}

type State = { status: 'checking' } | { status: 'ok'; pull: CheckedPull } | { status: 'error'; reason: string };

/** Opened from a shared `#/pull/<proof>` link. Everything is verified right here, on the viewer's device. */
const PullViewerPage = ({ proof, onClose }: PullViewerPageProps) => {
  const [state, setState] = useState<State>({ status: 'checking' });

  useEffect(() => {
    let cancelled = false;
    checkPull(proof)
      .then((pull) => !cancelled && setState({ status: 'ok', pull }))
      .catch((error: unknown) => !cancelled && setState({ status: 'error', reason: error instanceof Error ? error.message : String(error) }));
    return () => {
      cancelled = true;
    };
  }, [proof]);

  return (
    <div className="pull-viewer-page">
      <button className="share-close" onClick={onClose} aria-label="Close">×</button>
      {state.status === 'checking' && (
        <div className="pull-viewer-checking">
          <div className="pull-viewer-spinner" />
          <p>Re-opening this pack on your device to check it…</p>
        </div>
      )}

      {state.status === 'error' && (
        <div className="pull-viewer-invalid">
          <h2>✗ Not a valid pull</h2>
          <p>{state.reason}</p>
          <p className="share-note">This link was edited, cut off, or made up. Real pulls always verify.</p>
          <button className="summary-close-btn" onClick={onClose}>Open your own packs</button>
        </div>
      )}

      {state.status === 'ok' && (
        <>
          <h2 className="pull-viewer-title">{state.pull.score.hand.name !== 'No Matches' ? state.pull.score.hand.name : 'A pull'} from {state.pull.set.name}</h2>
          <p className="share-owner">
            Pulled by <strong>{normalizeName(state.pull.proof.name) || 'Anonymous'}</strong> <span className="share-fp">#{state.pull.fingerprint}</span> · {state.pull.set.era}
          </p>
          <PackCardViewer cards={state.pull.cardsWithMeta} displayMode="carousel" />
          <div className="pull-viewer-verified">
            <strong>✓ Verified on this device.</strong> This is exactly what ticket #{state.pull.proof.nonce} of this player's key produces in{' '}
            {state.pull.set.name} v{state.pull.set.version}. Each ticket costs real work to mine, so a pull like this can't be faked or edited.
          </div>
          <div className="share-actions">
            <button onClick={() => navigator.clipboard?.writeText(pullUrl(proof))}>Copy link</button>
            <button className="summary-close-btn" onClick={onClose}>Open your own packs</button>
          </div>
        </>
      )}
    </div>
  );
};

export default PullViewerPage;
