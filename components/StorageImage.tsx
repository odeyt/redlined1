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
import { useSignedStorageUrl } from '@/lib/storage/useSignedStorageUrl';

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  /** The value as stored in the database — a public shop-assets URL. */
  url: string | null | undefined;
};

export function StorageImage({ url, alt = '', ...rest }: Props) {
  // Starts on the stored URL so the image can paint immediately on a cache
  // hit and there is never an empty src attribute.
  const src = useSignedStorageUrl(url);

  if (!url) return null;
  return (
    <img
      /**
       * Off-screen photos wait until they are scrolled to.
       *
       * Nothing here was lazy, so every photo attached to a record was
       * fetched the moment its list rendered — a quotation with a dozen
       * attachments pulled all twelve before the first one was looked at, and
       * that cost grows with every photo a shop adds. The bucket holds 889
       * objects at a 90KB median, so no single image is heavy; the weight is
       * in fetching them all at once.
       *
       * `decoding="async"` keeps the decode off the main thread, so a grid of
       * thumbnails does not stall scrolling while they paint.
       *
       * Both are defaults, spread BEFORE `rest`, so a caller that needs an
       * image immediately — a lightbox, a print sheet — can pass
       * loading="eager" and win.
       */
      loading="lazy"
      decoding="async"
      src={src}
      alt={alt}
      {...rest}
    />
  );
}
