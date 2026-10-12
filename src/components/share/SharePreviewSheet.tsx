import { useEffect, useState, type ReactNode } from 'react';
import { Copy, Download, ImageUp, Link2, Share2 } from 'lucide-react';
import { canShareFiles, canShareLinks, copyText, shareImage, shareLink } from '../../game/shareActions';
import Sheet from '../ui/Sheet';
import '../../styles/Share.css';

interface SharePreviewSheetProps {
  title: string;
  subtitle?: ReactNode;
  /** Draws the image to share; it's shown exactly as it will be sent. */
  makeImage: () => Promise<Blob>;
  imageName: string;
  /** The link to share; without one, only the image can be shared. */
  url?: string;
  /** Text that goes with a shared link or image. */
  text: string;
  onClose: () => void;
  /** Extra content under the actions (Hall of Fame, notes). */
  children?: ReactNode;
}

/** What you see is what you send: the image first, then share it or the link. */
const SharePreviewSheet = ({ title, subtitle, makeImage, imageName, url, text, onClose, children }: SharePreviewSheetProps) => {
  const [image, setImage] = useState<{ blob: Blob; src: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let src = '';
    let cancelled = false;
    makeImage()
      .then((blob) => {
        if (cancelled) return;
        src = URL.createObjectURL(blob);
        setImage({ blob, src });
      })
      .catch((error) => {
        console.error('Could not draw the share image', error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (src) URL.revokeObjectURL(src);
    };
    // The image depends only on what was opened; makeImage is a fresh closure each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flash = (message: string) => {
    setDone(message);
    setTimeout(() => setDone(null), 1800);
  };

  const filesOk = canShareFiles();
  const onShareImage = async () => {
    if (!image) return;
    const result = await shareImage(image.blob, imageName, url ?? text);
    if (result === 'saved') flash('Image saved');
  };
  const onShareLink = async () => {
    if (!url) return;
    const result = await shareLink(url, title, text);
    if (result === 'copied') flash('Link copied');
  };

  return (
    <Sheet title={title} subtitle={subtitle} onClose={onClose} size="md" className="share-sheet">
      <div className="share-layout">
        <figure className="share-preview">
          {image ? (
            <img src={image.src} alt="The image you'll share" />
          ) : (
            <span className="share-preview-wait" role="status">
              {failed ? "Couldn't draw the image" : 'Drawing the image…'}
            </span>
          )}
        </figure>

        <div className="share-side">
          <div className="share-actions-main">
            <button type="button" className="btn btn--primary btn--block" onClick={onShareImage} disabled={!image}>
              {filesOk ? <ImageUp aria-hidden="true" /> : <Download aria-hidden="true" />} {filesOk ? 'Share image' : 'Save image'}
            </button>
            {url && (
              <button type="button" className="btn btn--secondary btn--block" onClick={onShareLink}>
                {canShareLinks() ? <Share2 aria-hidden="true" /> : <Link2 aria-hidden="true" />} {canShareLinks() ? 'Share link' : 'Copy link'}
              </button>
            )}
          </div>

          <p className="share-more">
            {url && canShareLinks() && (
              <button type="button" className="link-btn" onClick={async () => (await copyText(url)) && flash('Link copied')}>
                <Link2 aria-hidden="true" /> Copy link
              </button>
            )}
            <button type="button" className="link-btn" onClick={async () => (await copyText(text)) && flash('Text copied')}>
              <Copy aria-hidden="true" /> Copy text
            </button>
          </p>
          <p className="share-done" role="status">
            {done}
          </p>

          {children}
        </div>
      </div>
    </Sheet>
  );
};

export default SharePreviewSheet;
