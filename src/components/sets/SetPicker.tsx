import { useEffect, useRef } from 'react';
import type { SetDefinition } from '../../engine';
import { isNewSet, setCode } from '../../content/sets';
import type { CollectionItem } from '../../types';
import '../../styles/Sets.css';

interface SetPickerProps {
  sets: SetDefinition[];
  selectedId: string;
  onSelect: (setId: string) => void;
  collection: Record<string, CollectionItem>;
  /** While a pack is being opened, switching sets would throw it away. */
  disabled?: boolean;
}

/** The timeline of packs: one chip per era, with collection progress. Keeps the chosen era in view. */
const SetPicker = ({ sets, selectedId, onSelect, collection, disabled = false }: SetPickerProps) => {
  const listRef = useRef<HTMLDivElement>(null);

  // Centre the selected era (the newest is last, so it would otherwise start off-screen on phones).
  useEffect(() => {
    const list = listRef.current;
    const chip = list?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!list || !chip) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    list.scrollTo({ left: chip.offsetLeft - (list.clientWidth - chip.clientWidth) / 2, behavior: reduce ? 'auto' : 'smooth' });
  }, [selectedId]);

  if (sets.length < 2) return null;
  return (
    <nav className="set-picker" aria-label="Choose an era">
      <div className="set-picker-list" ref={listRef}>
        {sets.map((set) => {
          const owned = set.cards.filter((c) => collection[`${set.id}/${c.id}`]).length;
          const [a = '#ff3df2', b = '#29f0ff'] = set.palette ?? [];
          const selected = set.id === selectedId;
          return (
            <button
              key={set.id}
              type="button"
              className={`set-chip ${selected ? 'selected' : ''}`}
              style={{ '--set-a': a, '--set-b': b } as React.CSSProperties}
              onClick={() => onSelect(set.id)}
              aria-pressed={selected}
              disabled={disabled && !selected}
              title={disabled && !selected ? 'Finish this pack first' : undefined}
            >
              <span className="set-chip-head">
                <span className="set-code" aria-hidden="true">
                  {setCode(set)}
                </span>
                <span className="set-chip-name">{set.name}</span>
              </span>
              <span className="set-chip-meta">
                {set.era}
                {set.draft && <span className="set-chip-draft"> · preview</span>}
                <span className="tabular" aria-label={`${owned} of ${set.cards.length} collected`}>
                  {' '}
                  · {owned}/{set.cards.length}
                </span>
                {isNewSet(set) && <span className="set-chip-new">New</span>}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default SetPicker;
