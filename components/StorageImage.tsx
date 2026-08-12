'use client';

/**
 * An <img> for anything stored in shop-assets.
 *
 * Exists so that signing stays at the render boundary. Services keep
 * returning the stored public URL, components keep passing that value around
 * and writing it back to the database unchanged, and only the pixel-facing
 * <img> gets a signed URL. See lib/storage/signClient.ts for why that
 * separation is load-bearing rather than tidy.
 *
 * Falls back to the stored URL if signing fails, which still resolves while
 * the bucket is public. Once it is private that fallback shows a broken
 * image — which is the correct visible failure, not a silent blank.
 */
import { useEffect, useState } from 'react';
import { signStoredUrlClient } from '@/lib/storage/signClient';

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  /** The value as stored in the database — a public shop-assets URL. */
  url: string | null | undefined;
};

export function StorageImage({ url, alt = '', ...rest }: Props) {
  // Start on the stored URL so the image can paint immediately on a cache
  // hit and there is never an empty src attribute.
  const [src, setSrc] = useState<string>(url ?? '');

  useEffect(() => {
    let cancelled = false;
    setSrc(url ?? '');
    if (!url) return;

    signStoredUrlClient(url).then(signed => {
      // Guard the async result: a technician swiping through a gallery can
      // unmount or change `url` before this resolves, and applying a stale
      // signature would show the previous photo.
      if (!cancelled && signed) setSrc(signed);
    });

    return () => { cancelled = true; };
  }, [url]);

  if (!url) return null;
  return <img src={src} alt={alt} {...rest} />;
}
