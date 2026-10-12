import { CardWithMeta } from '../cards/Card';
import PackCardViewer from '../ui/PackCardViewer';
import '../../styles/BestPackPage.css';
import '../../styles/Share.css';

interface Stats {
    highestPackValue?: number;
    highestPackFlexValue?: number;
    highestPackBaseValue?: number;
    highestPackMultiplier?: number;
    highestPackHandName?: string;
    highestPackCards?: CardWithMeta[];
    highestPackLegacy?: boolean;
}

interface BestPackPageProps {
    stats: Stats;
    onClose: () => void;
    /** Present when the best pack is a verifiable pull. */
    onShare?: () => void;
}

const BestPackPage = ({ stats, onClose, onShare }: BestPackPageProps) => {
    const hasBest = !!stats.highestPackCards?.length;

    return (
        <div className="best-pack-page">
            <div className="best-pack-header">
                <h2>Personal Best Pack</h2>
                <p>Your luckiest pull so far</p>
                <button className="best-pack-close-btn" onClick={onClose}>&times;</button>
            </div>
            {onShare ? (
                <div className="best-pack-share">
                    <button className="summary-share-btn" onClick={onShare}>Share this pull (verifiable link)</button>
                </div>
            ) : stats.highestPackLegacy && hasBest ? (
                <p className="best-pack-legacy">Opened before verifiable pulls existed, so it can't be shared as a proof. Beat it to get a shareable best!</p>
            ) : null}

            <div className="best-pack-content">
                {hasBest && stats.highestPackCards ? (
                    <PackCardViewer
                        cards={stats.highestPackCards}
                        displayMode="carousel"
                    />
                ) : (
                    <div className="best-pack-empty">
                        <p>You haven't opened any packs yet!</p>
                        <p>Open some packs to record your personal best.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BestPackPage;
