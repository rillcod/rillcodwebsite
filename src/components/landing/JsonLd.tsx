import { contactInfo, socialLinks, companyInfo, brandAssets, seoConfig } from '@/config/brand';

/**
 * JSON-LD Structured Data for SEO
 * Renders EducationalOrganization + LocalBusiness schema for Google Rich Results
 */
export function OrganizationJsonLd() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': ['EducationalOrganization', 'LocalBusiness'],
    '@id': `${seoConfig.siteUrl}/#organization`,
    name: companyInfo.name,
    alternateName: 'RILLCOD',
    url: seoConfig.siteUrl,
    logo: brandAssets.logo,
    image: brandAssets.logo,
    description: seoConfig.defaultDescription,
    foundingDate: companyInfo.founded,
    slogan: companyInfo.tagline,
    telephone: contactInfo.phone,
    email: contactInfo.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'No 26 Ogiesoba Avenue',
      addressLocality: 'Benin City',
      addressRegion: 'Edo',
      addressCountry: 'NG',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 6.335,
      longitude: 5.6037,
    },
    areaServed: seoConfig.serviceAreas.map((area) => ({
      '@type': 'City',
      name: area.name,
      containedInPlace: {
        '@type': 'State',
        name: area.state,
        containedInPlace: {
          '@type': 'Country',
          name: area.country,
        },
      },
    })),
    sameAs: [
      socialLinks.facebook,
      socialLinks.twitter,
      socialLinks.instagram,
      socialLinks.linkedin,
      socialLinks.youtube,
    ],
    contactPoint: [
      {
        '@type': 'ContactPoint',
        telephone: contactInfo.phone,
        contactType: 'customer service',
        availableLanguage: ['English'],
        areaServed: 'NG',
      },
    ],
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'STEM & Coding Programs',
      itemListElement: [
        {
          '@type': 'OfferCatalog',
          name: 'ICT Fundamentals',
          description: 'Foundation course in Information and Communication Technology for young learners.',
        },
        {
          '@type': 'OfferCatalog',
          name: 'Scratch Programming',
          description: 'Visual block-based programming for beginners using MIT Scratch.',
        },
        {
          '@type': 'OfferCatalog',
          name: 'Web Development',
          description: 'HTML, CSS, and JavaScript web development for children.',
        },
        {
          '@type': 'OfferCatalog',
          name: 'Python Programming',
          description: 'Python programming and data science fundamentals for kids.',
        },
        {
          '@type': 'OfferCatalog',
          name: 'Robotics & AI',
          description: 'Hands-on robotics and artificial intelligence education.',
        },
        {
          '@type': 'OfferCatalog',
          name: 'Web Design',
          description: 'Creative web design and UI/UX fundamentals.',
        },
      ],
    },
    priceRange: '₦₦',
    openingHoursSpecification: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      opens: '08:00',
      closes: '16:00',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      reviewCount: '500',
      bestRating: '5',
      worstRating: '1',
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function WebSiteJsonLd() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${seoConfig.siteUrl}/#website`,
    url: seoConfig.siteUrl,
    name: seoConfig.siteName,
    description: seoConfig.defaultDescription,
    publisher: {
      '@id': `${seoConfig.siteUrl}/#organization`,
    },
    inLanguage: 'en-NG',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${seoConfig.siteUrl}/programs?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function BreadcrumbJsonLd({ items }: { items: { name: string; url: string }[] }) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function FAQJsonLd({ faqs }: { faqs: { question: string; answer: string }[] }) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
