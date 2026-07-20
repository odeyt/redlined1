/**
 * lib/seo/config.ts
 *
 * Canonical site-wide SEO configuration.
 * All metadata, schema, and sitemap generation imports from here.
 * Do not add environment-specific logic — this is pure configuration.
 */

export const SITE_CONFIG = {
  name: 'RedlineD1',
  tagline: 'Automotive Shop Management Software',
  description:
    'RedlineD1 is the all-in-one automotive business operating system for independent repair shops, solo mechanics, and mobile mechanics. Manage repair orders, estimates, invoices, digital vehicle inspections, inventory, and AI-powered shop intelligence from one connected platform.',
  shortDescription:
    'All-in-one shop management software for independent auto repair shops and mobile mechanics.',
  domain: 'redlined1.com',
  origin: 'https://redlined1.com',
  locale: 'en_US',
  twitterHandle: null, // Add when account exists
  facebookUrl: null,
  linkedInUrl: null,
  youtubeUrl: null,
  instagramUrl: null,
  /** OG/Twitter share image — 1200×630px recommended */
  ogImage: '/icons/icon-512x512.png',
  ogImageAlt: 'RedlineD1 — Automotive Shop Management Software',
  logo: '/logo.png',
  icon192: '/icons/icon-192x192.png',
  icon512: '/icons/icon-512x512.png',
  /** Used in Organization / LocalBusiness schema */
  organizationType: 'SoftwareApplication',
  category: 'BusinessApplication',
  supportUrl: 'https://redlined1.com/help',
  privacyUrl: 'https://redlined1.com/privacy',
  termsUrl: 'https://redlined1.com/terms',
  pricingUrl: 'https://redlined1.com/pricing',
  signupUrl: 'https://redlined1.com/signup',
  loginUrl: 'https://redlined1.com/login',
  /** Founder info — used in About schema when available */
  founder: {
    name: 'D1 Imports',
    description: 'Built from real automotive shop operating experience.',
  },
} as const;

/** Canonical route list for internal link registry and sitemap */
export const PUBLIC_ROUTES = [
  '/',
  '/pricing',
  '/privacy',
  '/terms',
  '/refund-policy',
  '/help',
  '/mobile-mechanic-software',
  '/auto-repair-invoicing-software',
  '/digital-vehicle-inspection-software',
  '/repair-order-software',
  '/ai-auto-repair-shop-software',
  '/auto-repair-estimate-software',
  '/multi-location-auto-repair-software',
  '/solo-mechanic-shop-software',
  '/tools/labor-rate-calculator',
  '/tools/missed-revenue-calculator',
  '/tools/technician-efficiency-calculator',
  '/resources/digital-vehicle-inspection-checklist',
  '/resources/repair-order-template',
  '/compare',
  '/compare/redlined1-vs-tekmetric',
  '/compare/redlined1-vs-shopmonkey',
  '/compare/redlined1-vs-autoleap',
] as const;

export type PublicRoute = (typeof PUBLIC_ROUTES)[number];

/** Routes that must NEVER be indexed */
export const PRIVATE_ROUTE_PREFIXES = [
  '/api/',
  '/admin/',
  '/auth/',
  '/billing/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/onboarding/',
  '/settings/',
  '/internal/',
  '/portal/',
  '/inspection/',
  '/status/',
  '/landing-preview',
  '/qa',
] as const;
