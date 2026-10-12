/** Sharing that works everywhere: the system share sheet where there is one, otherwise save or copy. */

export const canShareFiles = (): boolean => {
  try {
    const probe = new File([new Blob()], 'probe.png', { type: 'image/png' });
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
};

export const canShareLinks = (): boolean => typeof navigator.share === 'function';

/** Share an image (with the link as its text), or save it when the device can't share files. */
export const shareImage = async (blob: Blob, filename: string, text: string): Promise<'shared' | 'saved' | 'cancelled'> => {
  const file = new File([blob], filename, { type: blob.type || 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return 'saved';
};

/** Share a link through the system sheet, or copy it. */
export const shareLink = async (url: string, title: string, text: string): Promise<'shared' | 'copied' | 'cancelled'> => {
  if (canShareLinks()) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  return (await copyText(url)) ? 'copied' : 'cancelled';
};

export const copyText = async (value: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    window.prompt('Copy this:', value);
    return false;
  }
};
