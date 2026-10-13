import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import type { Finish } from '../../engine';
import { finishedCardImage } from '../../game/finishImage';

interface CardImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  finish?: Finish | null;
}

/** Keep the same img element and existing holo/misprint layers, changing only its printed frame. */
const CardImage = ({ src, finish, style, ...props }: CardImageProps) => {
  const key = `${finish ?? ''}:${src}`;
  const [rendered, setRendered] = useState<{ key: string; src: string }>();
  const image = rendered?.key === key ? rendered.src : undefined;
  useEffect(() => {
    if (!finish) return;
    let cancelled = false;
    finishedCardImage(src, finish).then((result) => {
      if (!cancelled) setRendered({ key, src: result });
    }).catch((error) => {
      console.error('Could not render card finish', error);
      if (!cancelled) setRendered({ key, src });
    });
    return () => { cancelled = true; };
  }, [src, finish, key]);
  // Keep the image's dimensions while its inks are prepared, without flashing the plain version.
  return <img {...props} src={image ?? src} style={{ ...style, ...(finish && !image ? { visibility: 'hidden' } : {}) }} />;
};

export default CardImage;
