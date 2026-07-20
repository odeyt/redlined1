/**
 * Server-side metadata for the labor rate calculator page.
 * Exported separately because the page itself is a client component.
 */
import type { Metadata } from 'next';
import { generateMeta } from '@/lib/seo/metadata';

export const metadata: Metadata = generateMeta({
  title: 'Auto Repair Labor Rate Calculator — Free Tool',
  description:
    'Calculate the exact labor rate your auto repair shop needs to cover costs and hit your profit target. Free calculator with transparent formula and methodology.',
  slug: '/tools/labor-rate-calculator',
  pageType: 'tool',
  keywords: [
    'auto repair labor rate calculator',
    'shop labor rate calculator',
    'mechanic labor rate formula',
    'auto shop break-even rate',
    'labor rate pricing tool',
  ],
});
