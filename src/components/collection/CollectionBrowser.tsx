import { useMemo, useState } from 'react';
import CardViewerModal from '../cards/CardViewerModal';
import { cardPoints, getSetCards, type Card } from '../../data/cards';
import { SETS } from '../../content/sets';
import type { CollectionItem } from '../../types';

interface CollectionBrowserProps {
  collection: Record<string, CollectionItem>;
  onClose: () => void;
}

const RARITY_ORDER: Record<string, number> = { BRAINROT: 0, LEGENDARY: 1, EPIC: 2, RARE: 3, UNCOMMON: 4, COMMON: 5 };

const CollectionBrowser = ({ collection, onClose }: CollectionBrowserProps) => {
  const [selectedCard, setSelectedCard] = useState<{ card: Card; normalCount: number; holoCount: number } | null>(null);

  const items = useMemo(
    () =>
      Object.values(collection)
        .filter((item) => item?.card?.rarity)
        .map((item) => ({ ...item, normalCount: item.normalCount || 0, holoCount: item.holoCount || 0 })),
    [collection],
  );

  /** One section per set the player owns cards from (released sets always shown), in timeline order. */
  const sections = useMemo(
    () =>
      SETS.map((set) => {
        const owned = items
          .filter((item) => item.card.setId === set.id)
          .sort(
            (a, b) =>
              (RARITY_ORDER[a.card.rarity] ?? 99) - (RARITY_ORDER[b.card.rarity] ?? 99) ||
              b.normalCount + b.holoCount - (a.normalCount + a.holoCount) ||
              a.card.name.localeCompare(b.card.name),
          );
        return { set, owned, total: getSetCards(set.id).length };
      }).filter((s) => s.owned.length > 0 || !s.set.draft),
    [items],
  );

  const totalFound = items.reduce((sum, item) => sum + item.normalCount + item.holoCount, 0);
  const accountValue = items.reduce(
    (sum, item) => sum + item.normalCount * cardPoints(item.card.rarity, false) + item.holoCount * cardPoints(item.card.rarity, true),
    0,
  );

  return (
    <>
      <section className="collection-browser">
        <div className="collection-header">
          <h2>Collection</h2>
          <p>
            {items.length} unique • {totalFound} total
          </p>
          <p style={{ color: '#ffd700', fontWeight: 'bold', margin: '0.5rem 0' }}>
            🧠 Collection Brainrot Score: {accountValue.toLocaleString()}
            {totalFound > 0 && (
              <span style={{ color: '#aaa', fontWeight: 'normal', marginLeft: '0.75rem' }}>
                (average {Math.round(accountValue / totalFound).toLocaleString()} pts/card)
              </span>
            )}
          </p>
          <button className="collection-close-btn" onClick={onClose}>&times;</button>
        </div>

        {items.length === 0 ? (
          <p className="collection-empty">Open packs to start your collection.</p>
        ) : (
          sections.map(({ set, owned, total }) => (
            <div key={set.id} className="collection-set">
              <div className="collection-set-header">
                <h3>{set.name}</h3>
                <span className="collection-set-era">{set.era}</span>
                <span className="collection-set-progress">
                  {owned.length}/{total} · {Math.round((owned.length / total) * 100)}%
                </span>
                <div className="collection-set-bar">
                  <div style={{ width: `${(owned.length / total) * 100}%` }} />
                </div>
              </div>
              {owned.length > 0 && (
                <div className="collection-grid">
                  {owned.map(({ card, normalCount, holoCount }) => (
                    <article
                      key={card.key}
                      className={['collection-item', card.rarity.toLowerCase(), holoCount > 0 ? 'holo' : ''].filter(Boolean).join(' ')}
                      onClick={() => setSelectedCard({ card, normalCount, holoCount })}
                    >
                      <img src={card.image} alt={card.name} />
                      <span className="collection-count">
                        {normalCount > 0 && `x${normalCount}`}
                        {normalCount > 0 && holoCount > 0 && ' • '}
                        {holoCount > 0 && `✨x${holoCount}`}
                      </span>
                    </article>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </section>

      {selectedCard && (
        <CardViewerModal
          card={selectedCard.card}
          hasNormal={selectedCard.normalCount > 0}
          hasHolo={selectedCard.holoCount > 0}
          initialHolo={selectedCard.holoCount > 0 && selectedCard.normalCount === 0}
          onClose={() => setSelectedCard(null)}
        />
      )}
    </>
  );
};

export default CollectionBrowser;
