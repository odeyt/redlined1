import type { MetadataRoute } from 'next';

const ORIGIN = 'https://www.redlined1.com';

type SitemapEntry = MetadataRoute.Sitemap[number];

function url(
  path: string,
  options?: Partial<SitemapEntry>,
): SitemapEntry {
  return {
    url: `${ORIGIN}${path}`,
    lastModified: new Date(),
    changeFrequency: 'monthly',
    priority: 0.7,
    ...options,
  };
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    // ── Core ──────────────────────────────────────────────────────────
    url('/', { changeFrequency: 'weekly', priority: 1.0 }),
    url('/pricing', { changeFrequency: 'weekly', priority: 0.9 }),
    url('/help', { changeFrequency: 'monthly', priority: 0.5 }),

    // ── Commercial landing pages ───────────────────────────────────────
    url('/mobile-mechanic-software', { priority: 0.9 }),
    url('/auto-repair-invoicing-software', { priority: 0.9 }),
    url('/digital-vehicle-inspection-software', { priority: 0.9 }),
    url('/repair-order-software', { priority: 0.9 }),
    url('/ai-auto-repair-shop-software', { priority: 0.8 }),
    url('/auto-repair-estimate-software', { priority: 0.8 }),
    url('/multi-location-auto-repair-software', { priority: 0.8 }),
    url('/solo-mechanic-shop-software', { priority: 0.8 }),
    url('/auto-repair-crm', { priority: 0.8 }),
    url('/technician-time-tracking', { priority: 0.8 }),
    url('/automotive-business-operating-system', { priority: 0.8 }),

    // ── Tools ─────────────────────────────────────────────────────────
    url('/tools/labor-rate-calculator', { priority: 0.8 }),
    url('/tools/missed-revenue-calculator', { priority: 0.8 }),
    url('/tools/technician-efficiency-calculator', { priority: 0.7 }),

    // ── Resources ─────────────────────────────────────────────────────
    url('/resources/digital-vehicle-inspection-checklist', { priority: 0.7 }),
    url('/resources/repair-order-template', { priority: 0.7 }),

    // ── Comparisons ───────────────────────────────────────────────────
    url('/compare', { priority: 0.7 }),
    url('/compare/redlined1-vs-tekmetric', { priority: 0.7 }),
    url('/compare/redlined1-vs-shopmonkey', { priority: 0.7 }),


    // ── Legal ─────────────────────────────────────────────────────────
    url('/privacy', { changeFrequency: 'yearly', priority: 0.3 }),
    url('/terms', { changeFrequency: 'yearly', priority: 0.3 }),
    url('/refund-policy', { changeFrequency: 'yearly', priority: 0.2 }),
  ];
}
