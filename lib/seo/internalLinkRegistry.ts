/**
 * lib/seo/internalLinkRegistry.ts
 *
 * Central registry of all public routes and their SEO relationship metadata.
 * Use this to generate internal links, validate routes, and build content maps.
 *
 * Rules:
 * - All entries with status 'published' must exist as real routes
 * - status 'planned' entries are documentation only — do not link to them yet
 * - Never auto-generate pages from this registry; it is a reference only
 */

import type { InternalLink, PageType } from './types';

export const INTERNAL_LINKS: InternalLink[] = [
  // ── Core pages ───────────────────────────────────────────────────────────
  {
    key: 'home',
    href: '/',
    label: 'RedlineD1 — Automotive Shop Management Software',
    description: 'The main product landing page and application entry point.',
    pageType: 'homepage',
    topics: ['shop management', 'automotive software', 'repair shop'],
    priority: 'high',
    status: 'published',
  },
  {
    key: 'pricing',
    href: '/pricing',
    label: 'Pricing',
    description: 'Plan comparison and pricing details.',
    pageType: 'pricing',
    topics: ['pricing', 'plans', 'subscription'],
    priority: 'high',
    status: 'published',
  },
  {
    key: 'help',
    href: '/help',
    label: 'Help Center',
    description: 'Support documentation and FAQs.',
    pageType: 'help',
    topics: ['support', 'documentation'],
    priority: 'medium',
    status: 'published',
  },

  // ── Commercial landing pages ─────────────────────────────────────────────
  {
    key: 'mobile-mechanic-software',
    href: '/mobile-mechanic-software',
    label: 'Mobile Mechanic Software',
    description: 'Shop management software for mobile and field mechanics.',
    pageType: 'feature',
    topics: ['mobile mechanic', 'field service', 'invoicing on the go'],
    priority: 'high',
    status: 'published',
  },
  {
    key: 'auto-repair-invoicing-software',
    href: '/auto-repair-invoicing-software',
    label: 'Auto Repair Invoicing Software',
    description: 'Estimates, repair orders, and invoices in one connected workflow.',
    pageType: 'feature',
    topics: ['invoicing', 'estimates', 'repair orders', 'payments'],
    priority: 'high',
    status: 'published',
  },
  {
    key: 'digital-vehicle-inspection-software',
    href: '/digital-vehicle-inspection-software',
    label: 'Digital Vehicle Inspection Software',
    description: 'Photo-based DVI with customer-facing reports.',
    pageType: 'feature',
    topics: ['DVI', 'digital inspection', 'vehicle inspection', 'photos'],
    priority: 'high',
    status: 'published',
  },
  {
    key: 'repair-order-software',
    href: '/repair-order-software',
    label: 'Repair Order Software',
    description: 'Digital repair orders with technician assignment and status tracking.',
    pageType: 'feature',
    topics: ['repair orders', 'RO', 'technician workflow', 'shop workflow'],
    priority: 'high',
    status: 'published',
  },
  {
    key: 'ai-auto-repair-shop-software',
    href: '/ai-auto-repair-shop-software',
    label: 'AI Auto Repair Shop Software',
    description: 'AI-powered intelligence for revenue, customer retention, and shop operations.',
    pageType: 'feature',
    topics: ['AI', 'shop intelligence', 'revenue leakage', 'automotive AI'],
    priority: 'high',
    status: 'published',
  },
  {
    key: 'auto-repair-estimate-software',
    href: '/auto-repair-estimate-software',
    label: 'Auto Repair Estimate Software',
    description: 'Professional estimates with labor guides and parts markup.',
    pageType: 'feature',
    topics: ['estimates', 'quoting', 'labor guide', 'parts markup'],
    priority: 'medium',
    status: 'published',
  },
  {
    key: 'multi-location-auto-repair-software',
    href: '/multi-location-auto-repair-software',
    label: 'Multi-Location Auto Repair Software',
    description: 'Manage multiple shop locations from one platform.',
    pageType: 'feature',
    topics: ['multi-location', 'chain shops', 'automotive franchise'],
    priority: 'medium',
    status: 'published',
  },
  {
    key: 'solo-mechanic-shop-software',
    href: '/solo-mechanic-shop-software',
    label: 'Solo Mechanic Shop Software',
    description: 'Lightweight, affordable shop management for a one-person operation.',
    pageType: 'feature',
    topics: ['solo mechanic', 'one-person shop', 'small shop software'],
    priority: 'medium',
    status: 'published',
  },
  {
    key: 'auto-repair-crm',
    href: '/auto-repair-crm',
    label: 'Auto Repair CRM',
    description: 'Customer profiles, vehicle history, and service relationship management.',
    pageType: 'feature',
    topics: ['CRM', 'customer management', 'vehicle history', 'customer retention'],
    priority: 'medium',
    status: 'published',
  },
  {
    key: 'technician-time-tracking',
    href: '/technician-time-tracking',
    label: 'Technician Time Tracking',
    description: 'Clock-in/clock-out, job assignments, and technician efficiency tracking.',
    pageType: 'feature',
    topics: ['time tracking', 'technician productivity', 'clock in clock out', 'billable hours'],
    priority: 'medium',
    status: 'published',
  },
  {
    key: 'automotive-business-operating-system',
    href: '/automotive-business-operating-system',
    label: 'Automotive Business Operating System',
    description: 'RedlineD1 as a complete operating system for automotive repair businesses.',
    pageType: 'feature',
    topics: ['shop management', 'automotive OS', 'business operating system', 'all-in-one shop software'],
    priority: 'medium',
    status: 'published',
  },

  // ── Calculator tools ─────────────────────────────────────────────────────
  {
    key: 'labor-rate-calculator',
    href: '/tools/labor-rate-calculator',
    label: 'Auto Repair Labor Rate Calculator',
    description: 'Calculate the right labor rate to cover costs and hit profit targets.',
    pageType: 'tool',
    topics: ['labor rate', 'shop profitability', 'pricing strategy'],
    priority: 'high',
    status: 'published',
  },
  {
    key: 'missed-revenue-calculator',
    href: '/tools/missed-revenue-calculator',
    label: 'Missed Revenue Calculator',
    description: 'Estimate how much revenue your shop loses from lapsed customers.',
    pageType: 'tool',
    topics: ['revenue leakage', 'customer retention', 'shop revenue'],
    priority: 'high',
    status: 'published',
  },
  {
    key: 'technician-efficiency-calculator',
    href: '/tools/technician-efficiency-calculator',
    label: 'Technician Efficiency Calculator',
    description: 'Measure technician billed hours vs. clock hours.',
    pageType: 'tool',
    topics: ['technician efficiency', 'labor productivity', 'billed hours'],
    priority: 'medium',
    status: 'published',
  },

  // ── Resources ────────────────────────────────────────────────────────────
  {
    key: 'dvi-checklist',
    href: '/resources/digital-vehicle-inspection-checklist',
    label: 'Digital Vehicle Inspection Checklist',
    description: 'A complete, printable DVI checklist for independent shops.',
    pageType: 'resource',
    topics: ['DVI checklist', 'vehicle inspection', 'shop process'],
    priority: 'high',
    status: 'published',
  },
  {
    key: 'repair-order-template',
    href: '/resources/repair-order-template',
    label: 'Repair Order Template',
    description: 'A free repair order template for auto repair shops.',
    pageType: 'resource',
    topics: ['repair order template', 'RO form', 'shop document'],
    priority: 'medium',
    status: 'published',
  },

  // ── Comparison pages ─────────────────────────────────────────────────────
  {
    key: 'compare',
    href: '/compare',
    label: 'Compare Alternatives',
    description: 'How RedlineD1 compares to other automotive shop management platforms.',
    pageType: 'comparison',
    topics: ['software comparison', 'alternatives', 'shop software comparison'],
    priority: 'medium',
    status: 'published',
  },
  {
    key: 'vs-tekmetric',
    href: '/compare/redlined1-vs-tekmetric',
    label: 'RedlineD1 vs. Tekmetric',
    description: 'Side-by-side comparison of RedlineD1 and Tekmetric.',
    pageType: 'comparison',
    topics: ['Tekmetric alternative', 'Tekmetric vs RedlineD1'],
    priority: 'medium',
    status: 'published',
  },
  {
    key: 'vs-shopmonkey',
    href: '/compare/redlined1-vs-shopmonkey',
    label: 'RedlineD1 vs. Shopmonkey',
    description: 'Side-by-side comparison of RedlineD1 and Shopmonkey.',
    pageType: 'comparison',
    topics: ['Shopmonkey alternative', 'Shopmonkey vs RedlineD1'],
    priority: 'medium',
    status: 'published',
  },

  // ── Legal ────────────────────────────────────────────────────────────────
  {
    key: 'privacy',
    href: '/privacy',
    label: 'Privacy Policy',
    description: 'How RedlineD1 collects and uses data.',
    pageType: 'legal',
    topics: ['privacy', 'data policy'],
    priority: 'low',
    status: 'published',
  },
  {
    key: 'terms',
    href: '/terms',
    label: 'Terms of Service',
    description: 'RedlineD1 terms and conditions.',
    pageType: 'legal',
    topics: ['terms of service', 'legal'],
    priority: 'low',
    status: 'published',
  },
];

/** Look up a registered link by key */
export function getLinkByKey(key: string): InternalLink | undefined {
  return INTERNAL_LINKS.find(l => l.key === key);
}

/** Get all published links for a given page type */
export function getLinksByType(pageType: PageType): InternalLink[] {
  return INTERNAL_LINKS.filter(l => l.pageType === pageType && l.status === 'published');
}

/** Get all published links touching a given topic */
export function getLinksByTopic(topic: string): InternalLink[] {
  const lower = topic.toLowerCase();
  return INTERNAL_LINKS.filter(
    l => l.status === 'published' && l.topics.some(t => t.toLowerCase().includes(lower)),
  );
}

/** All published hrefs — used in sitemap validation */
export function getPublishedRoutes(): string[] {
  return INTERNAL_LINKS.filter(l => l.status === 'published').map(l => l.href);
}
