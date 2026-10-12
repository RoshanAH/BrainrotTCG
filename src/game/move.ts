/**
 * Moving the site to a new address (docs/HOSTING.md). A save lives in the browser's storage for
 * the address it was made on, so after a move the old address serves a redirect page
 * (scripts/redirect-site.ts) that brings the save along: in the link's '#', which never leaves the
 * device. This takes it in, before the app reads storage.
 *
 * Only the old address can hand over a save (checked by the referrer, which pages can't forge for
 * another site). A save is never replaced silently: if this address already has a different one,
 * the player is asked once, and the save being replaced is kept as a backup.
 */
const OLD_ORIGIN: string = import.meta.env.VITE_OLD_ORIGIN ?? 'https://evanlin23.github.io';
const PLAYER_KEY = 'brainrot-player-v1';
const BACKUP_KEY = 'brainrot-before-move-v1';
const DECLINED_KEY = 'brainrot-move-declined-v1';

const fromBase64Url = (text: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};

const unpack = async (kind: string, payload: string): Promise<Record<string, unknown>> => {
  let bytes: Uint8Array<ArrayBuffer> = fromBase64Url(payload);
  if (kind === 'z') bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
};

const secretOf = (player: string | null): string | undefined => {
  try {
    return (JSON.parse(player ?? '') as { secretKey?: string }).secretKey;
  } catch {
    return undefined;
  }
};

const brainrotKeys = () => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((k): k is string => !!k?.startsWith('brainrot-'));

/** Takes in a save handed over by the old address, if this visit came with one. */
export const takeMovedSave = async (): Promise<void> => {
  const match = /^#\/move\/([zj])([A-Za-z0-9_-]+)~(.*)$/s.exec(window.location.hash);
  if (!match) return;
  const [, kind, payload, rest] = match;
  let then = '';
  try {
    then = decodeURIComponent(rest);
  } catch {
    // keep going to the home screen
  }
  // Out of the address bar straight away; carry on to what the old link pointed at.
  const hash = then.includes('#') ? then.slice(then.indexOf('#')) : '';
  history.replaceState(null, '', `${import.meta.env.BASE_URL}${hash}`);

  try {
    if (new URL(document.referrer).origin !== OLD_ORIGIN) return;
    const save = await unpack(kind, payload);
    const incoming = save[PLAYER_KEY];
    if (typeof incoming !== 'string' || !secretOf(incoming)) return;
    const current = localStorage.getItem(PLAYER_KEY);
    if (current && secretOf(current) === secretOf(incoming)) return; // already here
    if (current) {
      if (localStorage.getItem(DECLINED_KEY) === secretOf(incoming)) return;
      const ok = window.confirm(
        'Bring over your save from the old Brainrot TCG address? It replaces the save on this one (which is kept as a backup).',
      );
      if (!ok) {
        localStorage.setItem(DECLINED_KEY, secretOf(incoming)!);
        return;
      }
      const backup = Object.fromEntries(brainrotKeys().filter((k) => k !== BACKUP_KEY).map((k) => [k, localStorage.getItem(k)]));
      for (const k of brainrotKeys()) if (k !== BACKUP_KEY) localStorage.removeItem(k);
      localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
    }
    for (const [k, v] of Object.entries(save)) if (k.startsWith('brainrot-') && typeof v === 'string') localStorage.setItem(k, v);
  } catch (error) {
    console.warn('Could not bring over the save from the old address', error);
  }
};
