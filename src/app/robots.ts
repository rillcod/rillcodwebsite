import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Explicitly allow Facebook and WhatsApp crawlers
      {
        userAgent: ['facebookexternalhit', 'Facebot', 'WhatsApp'],
        allow: '/',
      },
      // Allow all other crawlers with restrictions
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/dashboard/',
          '/_next/',
          '/private/',
        ],
      },
    ],
    sitemap: 'https://rillcod.com/sitemap.xml',
  }
} 