import type { Metadata } from 'next';
import { generateMeta } from '@/lib/seo/metadata';

export const metadata: Metadata = generateMeta({
  title: 'Repair Order Template for Auto Repair Shops',
  description:
    'A free, printable repair order template for independent auto repair shops. Covers customer info, vehicle details, labor lines, parts, authorization, and totals.',
  slug: '/resources/repair-order-template',
  pageType: 'resource',
  keywords: [
    'repair order template',
    'auto repair order form',
    'RO template',
    'mechanic repair order',
    'auto shop repair order',
    'repair order form download',
  ],
});
