'use client';

/**
 * An <img> for anything stored in shop-assets.
 *
 * Exists so that signing stays at the render boundary. Services keep
 * returning a stored reference, components keep passing that value around and
 * writing it back to the database unchanged, and only the pixel-facing <img>
 * gets a signed URL. See lib/storage/signClient.ts for why that separation is
 * load-bearing rather than tidy.
 *
 * ## Failure is visible and bounded
 *
 * A signed URL expires. The reference in the database does not. So a photo
 * that will not load is a URL problem until proven otherwise: the first
 * failure asks for a fresh signature and tries again. The SECOND failure is
 * not a URL problem — the object is gone, or the storage policy refuses it —
 * and retrying again would be an endless loop between the browser and the
 * signer, which is exactly the sort of thing that runs up a bill overnight on
 * a tab nobody is looking at. So the second failure renders a placeholder
 * with an accessible label and stops.
 *
 * Nothing here ever clears the stored reference. A photo that cannot be shown
 * today is still a photo; the row keeps pointing at it.
 */
import { useSignedStorageObject } from '@/lib/storage/useSignedStorageUrl';

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  /** The value as stored in the database — an object key or a legacy URL. */
  url: string | null | undefined;
  /** Shown in place of the image when it cannot be loaded. */
  fallbackLabel?: string;
  /** Glyph for the placeholder. A vehicle photo gets a car. */
  fallbackGlyph?: string;
};

export function StorageImage({
  url,
  alt = '',
  fallbackLabel = 'Photo unavailable',
  fallbackGlyph = '🚗',
  ...rest
}: Props) {
  const { src, status, retry, markLoaded } = useSignedStorageObject(url);

  if (!url) return null;

  if (status === 'unavailable') {
    // Same style as the image it replaces, so a grid does not reflow when one
    // thumbnail fails. role/aria-label rather than alt text on a broken <img>:
    // a screen reader should hear why it is missing, not the caption of a
    // picture that is not there.
    const { style, className } = rest as { style?: React.CSSProperties; className?: string };
    return (
      <span
        role="img"
        aria-label={fallbackLabel}
        title={fallbackLabel}
        className={className}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--surface-soft)', color: 'var(--muted)', fontSize: 22,
          ...style,
        }}
      >
        {fallbackGlyph}
      </span>
    );
  }

  return (
    <img
      /**
       * Off-screen photos wait until they are scrolled to.
       *
       * Nothing here was lazy, so every photo attached to a record was
       * fetched the moment its list rendered. The bucket holds ~900 objects
       * at a 90KB median, so no single image is heavy; the weight is in
       * fetching them all at once.
       *
       * Lazy loading is also why the signature lifecycle exists: a thumbnail
       * scrolled to hours after the page loaded fetches a URL that was minted
       * hours ago. signClient re-signs before that can happen.
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
      src={src || undefined}
      alt={alt}
      {...rest}
      onLoad={e => { markLoaded(); (rest.onLoad as ((e: React.SyntheticEvent<HTMLImageElement>) => void) | undefined)?.(e); }}
      onError={e => { retry(); (rest.onError as ((e: React.SyntheticEvent<HTMLImageElement>) => void) | undefined)?.(e); }}
    />
  );
}
