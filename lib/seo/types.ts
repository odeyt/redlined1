/**
 * lib/seo/types.ts
 *
 * Shared TypeScript types for the SEO system.
 */

export type RobotsDirective = 'index' | 'noindex' | 'follow' | 'nofollow';

export type PageType =
  | 'homepage'
  | 'landing'
  | 'pricing'
  | 'feature'
  | 'comparison'
  | 'alternative'
  | 'guide'
  | 'resource'
  | 'tool'
  | 'case-study'
  | 'research'
  | 'integration'
  | 'legal'
  | 'help'
  | 'about'
  | 'blog'
  | 'changelog';

export type SchemaType =
  | 'WebPage'
  | 'WebSite'
  | 'Organization'
  | 'SoftwareApplication'
  | 'FAQPage'
  | 'Article'
  | 'HowTo'
  | 'BreadcrumbList'
  | 'ItemList'
  | 'VideoObject';

export interface BreadcrumbItem {
  name: string;
  href: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface SeoPageConfig {
  title: string;
  description: string;
  /** Slug relative to the canonical origin (e.g. '/mobile-mechanic-software') */
  slug: string;
  pageType: PageType;
  keywords?: string[];
  publishedAt?: string;
  modifiedAt?: string;
  /** Override OG image */
  ogImage?: string;
  ogImageAlt?: string;
  /** Override OG/Twitter title when it should differ from <title> */
  ogTitle?: string;
  ogDescription?: string;
  breadcrumbs?: BreadcrumbItem[];
  faqs?: FAQItem[];
  schemaTypes?: SchemaType[];
  index?: boolean;
  follow?: boolean;
}

export interface InternalLink {
  key: string;
  href: string;
  label: string;
  description: string;
  pageType: PageType;
  topics: string[];
  priority: 'high' | 'medium' | 'low';
  status: 'published' | 'draft' | 'planned';
}

/** Result of getPhotoLimit or any server-side limit check — re-exported for convenience */
export interface SeoMetrics {
  route: string;
  organicSessions?: number;
  organicSignups?: number;
  organicTrialStarts?: number;
  keyword?: string;
  device?: 'desktop' | 'mobile' | 'tablet';
  country?: string;
  referrer?: string;
}
