'use client';

/**
 * An <a> to something in shop-assets — a PDF attachment, "open full size".
 *
 * The image case has StorageImage; this is the same signing at the same
 * boundary for the cases where the browser navigates to the object rather
 * than rendering it. A component rather than the hook directly because these
 * links are built inside .map() over an attachment list, where a hook cannot
 * be called.
 */
import { useSignedStorageUrl } from '@/lib/storage/useSignedStorageUrl';

type Props = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  /** The value as stored in the database — a public shop-assets URL. */
  url: string | null | undefined;
};

export function StorageLink({ url, children, ...rest }: Props) {
  const href = useSignedStorageUrl(url);
  if (!url) return null;
  return <a href={href} {...rest}>{children}</a>;
}
