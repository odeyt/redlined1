import type { Metadata } from 'next';
import { generateMeta } from '@/lib/seo/metadata';

export const metadata: Metadata = generateMeta({
  title: 'Digital Vehicle Inspection Checklist',
  description:
    'A complete multi-point vehicle inspection checklist for auto repair shops. Use it as a training guide, customer handout, or starting template for your DVI process.',
  slug: '/resources/digital-vehicle-inspection-checklist',
  pageType: 'resource',
  keywords: [
    'digital vehicle inspection checklist',
    'multi-point vehicle inspection checklist',
    'DVI checklist auto repair',
    'vehicle inspection form',
    'car inspection checklist',
  ],
  modifiedAt: '2025-01-01',
});
