'use client';

import { breadcrumbSchema } from '@/lib/seo/schema';

export interface BreadcrumbItem {
  name: string;
  href: string;
}

interface Props {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: Props) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema(items)) }}
      />
      <nav aria-label="Breadcrumb" style={{ padding: '12px 0', fontSize: 13, color: 'var(--muted, #666)' }}>
        <ol style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 6px', listStyle: 'none', margin: 0, padding: 0 }}>
          {items.map((item, i) => (
            <li key={item.href} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {i < items.length - 1 ? (
                <>
                  <a href={item.href} style={{ color: 'inherit', textDecoration: 'none' }}>{item.name}</a>
                  <span aria-hidden="true" style={{ opacity: 0.5 }}>›</span>
                </>
              ) : (
                <span aria-current="page" style={{ fontWeight: 600, color: 'var(--foreground, #111)' }}>{item.name}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
