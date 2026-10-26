'use client';

import Link from 'next/link';
import { trackEvent } from '@/lib/analytics/track';

export function SearchCta({ slug }: { slug: string }) {
  return <Link className="rd1-search-primary" href="/signup" onClick={() => trackEvent('start_free_click', { cta_location: slug })}>Start free</Link>;
}
