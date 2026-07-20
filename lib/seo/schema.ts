/**
 * lib/seo/schema.ts
 *
 * JSON-LD structured data generators for RedlineD1.
 * All generators return plain objects ready for JSON.stringify().
 *
 * Rules:
 * - No fake aggregate ratings or review counts
 * - No invented prices, availability, or unsupported claims
 * - FAQPage only where questions are rendered on the page
 * - HowTo only where content genuinely describes a process
 */

import { SITE_CONFIG } from './config';
import type { BreadcrumbItem, FAQItem } from './types';

export interface JsonLd {
  '@context': string;
  '@type': string | string[];
  [key: string]: unknown;
}

/** Base @context value */
const CTX = 'https://schema.org';

/** Organization schema — include on homepage and about page */
export function organizationSchema(): JsonLd {
  return {
    '@context': CTX,
    '@type': 'Organization',
    name: SITE_CONFIG.name,
    url: SITE_CONFIG.origin,
    logo: {
      '@type': 'ImageObject',
      url: `${SITE_CONFIG.origin}${SITE_CONFIG.icon512}`,
    },
    description: SITE_CONFIG.shortDescription,
    sameAs: [
      SITE_CONFIG.facebookUrl,
      SITE_CONFIG.linkedInUrl,
      SITE_CONFIG.youtubeUrl,
      SITE_CONFIG.instagramUrl,
    ].filter((x): x is NonNullable<typeof x> => x != null),
  };
}

/** WebSite schema with SearchAction — include on homepage */
export function webSiteSchema(): JsonLd {
  return {
    '@context': CTX,
    '@type': 'WebSite',
    name: SITE_CONFIG.name,
    url: SITE_CONFIG.origin,
    description: SITE_CONFIG.shortDescription,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_CONFIG.origin}/help?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/** SoftwareApplication schema — for product/pricing/feature pages */
export function softwareApplicationSchema(options?: {
  name?: string;
  description?: string;
  applicationCategory?: string;
  operatingSystem?: string;
}): JsonLd {
  return {
    '@context': CTX,
    '@type': 'SoftwareApplication',
    name: options?.name ?? SITE_CONFIG.name,
    description: options?.description ?? SITE_CONFIG.shortDescription,
    url: SITE_CONFIG.origin,
    applicationCategory: options?.applicationCategory ?? 'BusinessApplication',
    operatingSystem: options?.operatingSystem ?? 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free Forever plan available. Paid plans start at $24/month.',
    },
    featureList: [
      'Digital Vehicle Inspections',
      'Repair Orders',
      'Estimates and Invoicing',
      'Customer and Vehicle History',
      'Parts Inventory Management',
      'Multi-Location Support',
      'AI-Powered Shop Intelligence',
      'Technician Workflow Management',
    ].join(', '),
  };
}

/** WebPage schema — use on most public pages */
export function webPageSchema(options: {
  name: string;
  description: string;
  url: string;
  datePublished?: string;
  dateModified?: string;
}): JsonLd {
  return {
    '@context': CTX,
    '@type': 'WebPage',
    name: options.name,
    description: options.description,
    url: options.url,
    isPartOf: {
      '@type': 'WebSite',
      name: SITE_CONFIG.name,
      url: SITE_CONFIG.origin,
    },
    ...(options.datePublished ? { datePublished: options.datePublished } : {}),
    ...(options.dateModified ? { dateModified: options.dateModified } : {}),
  };
}

/** FAQPage schema — only where FAQ items are visibly rendered on the page */
export function faqSchema(faqs: FAQItem[]): JsonLd {
  return {
    '@context': CTX,
    '@type': 'FAQPage',
    mainEntity: faqs.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: answer,
      },
    })),
  };
}

/** BreadcrumbList schema */
export function breadcrumbSchema(items: BreadcrumbItem[]): JsonLd {
  return {
    '@context': CTX,
    '@type': 'BreadcrumbList',
    itemListElement: items.map(({ name, href }, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name,
      item: href.startsWith('http') ? href : `${SITE_CONFIG.origin}${href}`,
    })),
  };
}

/** ItemList schema — for comparison or resource list pages */
export function itemListSchema(
  name: string,
  items: Array<{ name: string; description: string; url: string }>,
): JsonLd {
  return {
    '@context': CTX,
    '@type': 'ItemList',
    name,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      description: item.description,
      url: item.url.startsWith('http') ? item.url : `${SITE_CONFIG.origin}${item.url}`,
    })),
  };
}

/** Serialize one or more JSON-LD objects for use in <script type="application/ld+json"> */
export function serializeSchema(schema: JsonLd | JsonLd[]): string {
  return JSON.stringify(Array.isArray(schema) ? schema : [schema], null, 0);
}
