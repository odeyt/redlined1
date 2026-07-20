import type { Metadata } from 'next';
import { generateMeta } from '@/lib/seo/metadata';

export const metadata: Metadata = generateMeta({
  title: 'Auto Repair Shop Missed Revenue Calculator — Free Tool',
  description:
    'Estimate how much revenue your auto repair shop loses each year from lapsed customers — and how much you could recover with proactive follow-up.',
  slug: '/tools/missed-revenue-calculator',
  pageType: 'tool',
  keywords: [
    'auto repair missed revenue calculator',
    'shop revenue calculator',
    'lapsed customer calculator',
    'auto repair revenue leakage',
    'shop customer retention calculator',
  ],
});
