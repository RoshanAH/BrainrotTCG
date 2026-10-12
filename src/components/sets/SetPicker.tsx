import type { SetDefinition } from '../../engine';
import type { CollectionItem } from '../../types';
import '../../styles/Sets.css';

interface SetPickerProps {
  sets: SetDefinition[];
  selectedId: string;
  onSelect: (setId: string) => void;
  collection: Record<string, CollectionItem>;
}

/** The timeline of packs: one chip per era, with collection progress. */
const SetPicker = ({ sets, selectedId, onSelect, collection }: SetPickerProps) => {
  if (sets.length < 2) return null;
  return (
    <nav className="set-picker" aria-label="Choose a pack">
      {sets.map((set) => {
        const owned = set.cards.filter((c) => collection[`${set.id}/${c.id}`]).length;
        const [a = '#ff3df2', b = '#29f0ff'] = set.palette ?? [];
        return (
          <button
            key={set.id}
            className={`set-chip ${set.id === selectedId ? 'selected' : ''}`}
            style={{ '--set-a': a, '--set-b': b } as React.CSSProperties}
            onClick={() => onSelect(set.id)}
            aria-pressed={set.id === selectedId}
          >
            <span className="set-chip-era">{set.era}</span>
            <span className="set-chip-name">{set.name}</span>
            <span className="set-chip-progress">
              {owned}/{set.cards.length}
              {set.draft && <span className="set-chip-draft"> · preview</span>}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

export default SetPicker;
