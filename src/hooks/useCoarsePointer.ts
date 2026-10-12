import { useSyncExternalStore } from 'react';

const query = '(pointer: coarse)';

const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};

/** True on touch-first devices, so hints can say "Tap" instead of "Click or press Space". */
export const useCoarsePointer = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
