import type { Metadata } from 'next';
import { generateMeta } from '@/lib/seo/metadata';

export const metadata: Metadata = generateMeta({
  title: 'Technician Efficiency Calculator — Free Auto Repair Tool',
  description:
    'Calculate your technician efficiency rate and see how much revenue you leave on the table each month. Free tool for auto repair shop owners and managers.',
  slug: '/tools/technician-efficiency-calculator',
  pageType: 'tool',
  keywords: [
    'technician efficiency calculator',
    'mechanic efficiency rate',
    'billable hours calculator auto repair',
    'shop productivity calculator',
    'technician utilization rate',
  ],
});
