/**
 * Sharing is copying: the link or the image goes on the clipboard, ready to paste anywhere. The
 * system share sheet is only offered on phones and tablets, where it's the quick way to send
 * something to a chat; on a computer it's a detour.
 */

/** The person closed the share sheet. Any other failure (no permission, nothing to share to) falls back. */
const isCancel = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

export const copyText = async (value: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    window.prompt('Copy this:', value);
    return false;
  }
};

/** Whether this browser can put an image on the clipboard. */
export const canCopyImage = (): boolean => {
  try {
    if (typeof ClipboardItem === 'undefined' || typeof navigator.clipboard?.write !== 'function') return false;
    return typeof ClipboardItem.supports === 'function' ? ClipboardItem.supports('image/png') : true;
  } catch {
    return false;
  }
};

export const copyImage = async (blob: Blob): Promise<boolean> => {
  try {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
    return true;
  } catch {
    return false;
  }
};

export const saveImage = (blob: Blob, filename: string) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

/** The system share sheet, offered only on touch devices (see the note at the top). */
export const canShareTo = (): boolean =>
  typeof navigator.share === 'function' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

/** Open the system share sheet with the image if it can take files, otherwise the link. */
export const shareTo = async (share: { url?: string; text: string; title: string; image?: { blob: Blob; filename: string } }): Promise<'shared' | 'cancelled' | 'failed'> => {
  const file = share.image ? new File([share.image.blob], share.image.filename, { type: share.image.blob.type || 'image/png' }) : null;
  try {
    if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: share.url ?? share.text });
    else await navigator.share({ title: share.title, text: share.text, url: share.url });
    return 'shared';
  } catch (error) {
    return isCancel(error) ? 'cancelled' : 'failed';
  }
};
