import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface Tab<T extends string> {
  id: T;
  label: ReactNode;
}

interface TabsProps<T extends string> {
  tabs: Tab<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}

/** Segmented tab bar. Arrow keys move between tabs; pair each panel with `tabPanelProps`. */
const Tabs = <T extends string>({ tabs, value, onChange, label }: TabsProps<T>) => {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((t) => t.id === value);
    const next =
      event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
      : event.key === 'Home' ? 0
      : event.key === 'End' ? tabs.length - 1
      : -1;
    if (next < 0) return;
    event.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((tab, i) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-${tab.id}`}
            aria-selected={selected}
            aria-controls={`${base}-${tab.id}-panel`}
            tabIndex={selected ? 0 : -1}
            className="tab"
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};

export default Tabs;
