import type { NextConfig } from "next";
// @ts-ignore
import withPWAInit from "next-pwa";
// @ts-ignore
import runtimeCaching from "next-pwa/cache";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  // SafeDev PWA Mode: Disabled in development to ensure stable dashboard loading
  disable: process.env.NODE_ENV === "development",
  runtimeCaching,
  fallbacks: {
    document: "/offline.html",
  },
});

const nextConfig: NextConfig = {
  // ── ESLint: run separately (pre-commit / CI), not during next build ───────
  eslint: { ignoreDuringBuilds: true },

  // ── TypeScript: type errors still block builds ────────────────────────────
  typescript: { ignoreBuildErrors: false },

  // ── Native App Export (Uncomment these for Capacitor Android/iOS builds) ──
  // output: 'export',

  // Keep pdf engines out of the webpack bundle so AFM/TTF paths resolve from
  // node_modules on Vercel (bundling rewrites __dirname → .next/server/chunks).
  serverExternalPackages: [
    'pdfmake',
    'pdfkit',
    '@foliojs-fork/pdfkit',
    'fontkit',
    '@foliojs-fork/fontkit',
  ],

  // Ensure font metric / TTF files are traced into serverless functions.
  outputFileTracingIncludes: {
    '/api/**/*': [
      './node_modules/pdfkit/js/data/**/*',
      './node_modules/@foliojs-fork/pdfkit/js/data/**/*',
      './node_modules/pdfmake/fonts/**/*',
      './node_modules/pdfmake/build/fonts/**/*',
    ],
  },

  // ── Turbopack Compatibility ──────────────────────────────────────────────
  // silences warning for custom webpack used by next-pwa
  // @ts-ignore
  turbopack: {},

  experimental: {
    // Reduce duplicate module instances
    optimizePackageImports: [
      '@supabase/supabase-js',
      '@livekit/components-react',
    ],
    // instrumentation.ts is enabled by default in Next.js 15
  },

  // ── Image optimisation ─────────────────────────────────────────
  images: {
    unoptimized: true,
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 3600,
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com', pathname: '/**' },
      { protocol: 'https', hostname: 'images.pexels.com', pathname: '/**' },
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
      { protocol: 'https', hostname: 'via.placeholder.com', pathname: '/**' },
      { protocol: 'https', hostname: 'picsum.photos', pathname: '/**' },
    ],
  },

  // ── Compression ────────────────────────────────────────────────
  compress: true,

  // ── Security headers ───────────────────────────────────────────
  async redirects() {
    return [
      {
        source: '/dashboard/identity-cards',
        destination: '/dashboard/card-studio',
        permanent: true,
      },
      // Permanent redirect — consolidates indexing to /login (canonical)
      {
        source: '/student/login',
        destination: '/login?type=student',
        permanent: true,
      },
    ];
  },

  async rewrites() {
    return [
      {
        source: '/og-image.jpg',
        destination: '/api/social/og',
      },
      {
        source: '/twitter-image.png',
        destination: '/api/social/twitter',
      },
    ];
  },

  async headers() {
    return [
      {
        // Noindex auth pages — they're not in the sitemap and should not be indexed
        source: '/(login|signup|reset-password|student/login)',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
          // Allow camera & mic for LiveKit video meetings
          { key: 'Permissions-Policy', value: 'camera=*, microphone=*, display-capture=*' },
        ],
      },
      {
        // Long-lived cache for static assets
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default withPWA(nextConfig);
