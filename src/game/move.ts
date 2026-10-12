/**
 * Moving the site to a new address (docs/HOSTING.md). A save lives in the browser's storage for the
 * address it was made on, so after a move it has to be handed over, and it holds the player's secret
 * key. It goes window to window with postMessage, never in a URL (URLs end up in browser history and
 * history sync). Both sides check the other's origin, which the browser enforces, so no other page
 * can hand a save in or take one out:
 *
 * - The old address (scripts/redirect-site.ts) offers "Bring my save". That opens this site at
 *   `#/receive`; it says it's ready, gets the save and reports back (`receiveSave`).
 * - From here, Settings can fetch it instead: it opens the old address at `#/send`, which sends the
 *   save back (`fetchOldSave`), for players who arrive through a new link.
 *
 * Only builds with VITE_OLD_ORIGIN (set by the deploy once the site has moved) do any of this.
 */
const OLD_ORIGIN: string = import.meta.env.VITE_OLD_ORIGIN || '';
const OLD_SITE_URL: string = import.meta.env.VITE_OLD_SITE_URL || '';
const PLAYER_KEY = 'brainrot-player-v1';
const BACKUP_KEY = 'brainrot-before-move-v1';
/** What makes a save worth keeping: replacing any of these asks first. */
const PROGRESS_KEYS = [PLAYER_KEY, 'brainrot-found-collection-v1', 'brainrot-history-v1', 'brainrot-stats-v1', 'brainrot-achievements-v1'];

export type MoveResult = 'saved' | 'kept' | 'invalid';

export const canBringOldSave = (): boolean => !!OLD_ORIGIN && !!OLD_SITE_URL && OLD_ORIGIN !== window.location.origin;

const secretOf = (player: string | null | undefined): string | undefined => {
  try {
    return (JSON.parse(player ?? '') as { secretKey?: string }).secretKey;
  } catch {
    return undefined;
  }
};

const brainrotKeys = () => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((k): k is string => !!k?.startsWith('brainrot-'));

/**
 * Write a handed-over save into this address's storage. If there's already progress here that isn't
 * the same player, the player is asked first and the replaced save is kept under BACKUP_KEY.
 */
export const importSave = (save: unknown): MoveResult => {
  if (!save || typeof save !== 'object') return 'invalid';
  const incoming = Object.fromEntries(Object.entries(save).filter(([k, v]) => k.startsWith('brainrot-') && k !== BACKUP_KEY && typeof v === 'string')) as Record<string, string>;
  if (!PROGRESS_KEYS.some((k) => k in incoming)) return 'invalid';
  if (PROGRESS_KEYS.some((k) => localStorage.getItem(k) !== null)) {
    const here = secretOf(localStorage.getItem(PLAYER_KEY));
    if (here && here === secretOf(incoming[PLAYER_KEY])) return 'saved'; // already here
    const ok = window.confirm('Bring over your save from the old Brainrot TCG address? It replaces the save on this one (which is kept as a backup).');
    if (!ok) return 'kept';
    const backup = Object.fromEntries(brainrotKeys().filter((k) => k !== BACKUP_KEY).map((k) => [k, localStorage.getItem(k)]));
    for (const k of brainrotKeys()) if (k !== BACKUP_KEY) localStorage.removeItem(k);
    localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
  }
  for (const [k, v] of Object.entries(incoming)) localStorage.setItem(k, v);
  return 'saved';
};

type Message = { type?: string; save?: unknown };

/**
 * If the old address opened this window to hand over a save, take it in and report back; resolves
 * true when this window was that receiver (the app then doesn't start in it).
 */
export const receiveSave = (): Promise<boolean> => {
  const opener = window.opener as Window | null;
  if (!canBringOldSave() || window.location.hash !== '#/receive' || !opener) return Promise.resolve(false);
  history.replaceState(null, '', import.meta.env.BASE_URL);
  const root = document.getElementById('root');
  if (root) root.textContent = 'Bringing your save over…';
  return new Promise((resolve) => {
    const finish = (receiver: boolean) => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(receiver);
    };
    // Nothing came: start the game here as usual.
    const timer = setTimeout(() => finish(false), 15000);
    const onMessage = (event: MessageEvent<Message>) => {
      if (event.origin !== OLD_ORIGIN || event.source !== opener || event.data?.type !== 'brainrot-save') return;
      const result = importSave(event.data.save);
      opener.postMessage({ type: 'brainrot-move-result', result }, OLD_ORIGIN);
      if (root) root.textContent = result === 'saved' ? 'Your save is here. You can close this window.' : 'Nothing was changed. You can close this window.';
      finish(true);
      window.close();
    };
    window.addEventListener('message', onMessage);
    opener.postMessage({ type: 'brainrot-ready' }, OLD_ORIGIN);
  });
};

/** From here: open the old address, which sends its save back (Settings). */
export const fetchOldSave = (): Promise<MoveResult | 'none' | 'blocked'> => {
  const popup = window.open(`${OLD_SITE_URL}#/send`, 'brainrot-send', 'popup,width=440,height=360');
  if (!popup) return Promise.resolve('blocked');
  return new Promise((resolve) => {
    const finish = (result: MoveResult | 'none') => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      try {
        popup.postMessage({ type: 'brainrot-move-result', result }, OLD_ORIGIN);
        setTimeout(() => popup.close(), 300);
      } catch {
        // already closed
      }
      resolve(result);
    };
    const timer = setTimeout(() => finish('none'), 20000);
    const onMessage = (event: MessageEvent<Message>) => {
      if (event.origin !== OLD_ORIGIN || event.source !== popup) return;
      if (event.data?.type === 'brainrot-save') finish(importSave(event.data.save));
      else if (event.data?.type === 'brainrot-no-save') finish('none');
    };
    window.addEventListener('message', onMessage);
  });
};
