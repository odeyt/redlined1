/** Public brand facts only. No invented reviews, ratings or customer counts. */
export function MarketingStructuredData() {
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://www.redlined1.com/#organization',
        name: 'RedlineD1',
        url: 'https://www.redlined1.com/',
        logo: 'https://www.redlined1.com/icons/icon-512x512.png',
      },
      {
        '@type': 'WebSite',
        '@id': 'https://www.redlined1.com/#website',
        name: 'RedlineD1',
        url: 'https://www.redlined1.com/',
        inLanguage: 'en',
        publisher: { '@id': 'https://www.redlined1.com/#organization' },
      },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}
