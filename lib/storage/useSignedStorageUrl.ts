'use client';

/**
 * The signed form of a stored shop-assets URL, for the places an <img> will
 * not do — an href, a next/image src, a print window.
 *
 * Same contract as StorageImage, which is built on this: the stored public URL
 * is what renders first, and the signed URL replaces it when signing returns.
 * While the bucket is public that fallback resolves; once it is private a
 * signing failure shows a broken image or a dead link, which is the correct
 * visible failure rather than a blank space nobody reports.
 *
 * Signing here rather than on click, deliberately: a click handler that has to
 * await a signature before calling window.open is blocked as a popup by every
 * browser, so the href has to be ready before the user reaches for it.
 */
import { useEffect, useState } from 'react';
import { signStoredUrlClient } from './signClient';

export function useSignedStorageUrl(url: string | null | undefined): string {
  const [src, setSrc] = useState<string>(url ?? '');

  useEffect(() => {
    let cancelled = false;
    setSrc(url ?? '');
    if (!url) return;
    signStoredUrlClient(url).then(signed => {
      // A gallery can be swiped past before this resolves; applying a stale
      // signature would show the previous photo.
      if (!cancelled && signed) setSrc(signed);
    });
    return () => { cancelled = true; };
  }, [url]);

  return src;
}
