/**
 * lib/seo/metadata.ts
 *
 * Shared metadata generation for Next.js App Router generateMetadata() exports.
 * Import this in page/layout files to produce consistent, canonical metadata.
 */

import type { Metadata } from 'next';
import { SITE_CONFIG } from './config';
import { canonicalUrl } from './urls';
import type { SeoPageConfig } from './types';

const DEFAULT_KEYWORDS = [
  'auto repair shop software',
  'automotive shop management',
  'repair order software',
  'automotive CRM',
  'digital vehicle inspection software',
  'mobile mechanic software',
  'auto repair invoicing',
];

/** Generate a full Metadata object for a page. Merges page config with site defaults. */
export function generateMeta(config: SeoPageConfig): Metadata {
  const canonical = canonicalUrl(config.slug);
  const title = config.title.includes('RedlineD1')
    ? config.title
    : `${config.title} | RedlineD1`;
  const ogTitle = config.ogTitle ?? title;
  const ogDesc = config.ogDescription ?? config.description;
  const ogImage = config.ogImage ?? SITE_CONFIG.ogImage;
  const ogAlt = config.ogImageAlt ?? SITE_CONFIG.ogImageAlt;

  return {
    metadataBase: new URL(SITE_CONFIG.origin),
    title,
    description: config.description,
    keywords: config.keywords ?? DEFAULT_KEYWORDS,
    alternates: {
      canonical,
    },
    openGraph: {
      type: 'website',
      url: canonical,
      title: ogTitle,
      description: ogDesc,
      siteName: SITE_CONFIG.name,
      images: [
        {
          url: ogImage,
          width: 512,
          height: 512,
          alt: ogAlt,
        },
      ],
      locale: SITE_CONFIG.locale,
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description: ogDesc,
      images: [ogImage],
      ...(SITE_CONFIG.twitterHandle ? { site: SITE_CONFIG.twitterHandle } : {}),
    },
    robots: {
      index: config.index ?? true,
      follow: config.follow ?? true,
      googleBot: {
        index: config.index ?? true,
        follow: config.follow ?? true,
        'max-snippet': -1,
        'max-image-preview': 'large',
        'max-video-preview': -1,
      },
    },
    ...(config.publishedAt ? { other: { 'article:published_time': config.publishedAt } } : {}),
  };
}

/** Standard root layout metadata — used in app/layout.tsx */
export const ROOT_METADATA: Metadata = {
  metadataBase: new URL(SITE_CONFIG.origin),
  title: {
    default: `${SITE_CONFIG.name} | ${SITE_CONFIG.tagline}`,
    template: `%s | ${SITE_CONFIG.name}`,
  },
  description: SITE_CONFIG.shortDescription,
  keywords: DEFAULT_KEYWORDS,
  authors: [{ name: SITE_CONFIG.name, url: SITE_CONFIG.origin }],
  creator: SITE_CONFIG.name,
  publisher: SITE_CONFIG.name,
  openGraph: {
    type: 'website',
    siteName: SITE_CONFIG.name,
    title: `${SITE_CONFIG.name} | ${SITE_CONFIG.tagline}`,
    description: SITE_CONFIG.shortDescription,
    images: [
      {
        url: SITE_CONFIG.ogImage,
        width: 512,
        height: 512,
        alt: SITE_CONFIG.ogImageAlt,
      },
    ],
    locale: SITE_CONFIG.locale,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_CONFIG.name} | ${SITE_CONFIG.tagline}`,
    description: SITE_CONFIG.shortDescription,
    images: [SITE_CONFIG.ogImage],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: SITE_CONFIG.name,
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
  },
};
