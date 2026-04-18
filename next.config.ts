import type { NextConfig } from "next";
// @ts-ignore
import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  // SafeDev PWA Mode: Disabled in development to ensure stable dashboard loading
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  // ── ESLint: run separately (pre-commit / CI), not during next build ───────
  eslint: { ignoreDuringBuilds: true },

  // ── TypeScript: type errors still block builds ────────────────────────────
  typescript: { ignoreBuildErrors: false },

  // ── Native App Export (Uncomment these for Capacitor Android/iOS builds) ──
  // output: 'export',

  // ── Turbopack Compatibility ──────────────────────────────────────────────
  // silences warning for custom webpack used by next-pwa
  // @ts-ignore
  turbopack: {},

  experimental: {
    // Reduce duplicate module instances
    optimizePackageImports: [
      '@supabase/supabase-js',
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
    ];
  },

  async rewrites() {
    return [
      {
        source: '/og-image.jpg',
        destination: '/opengraph-image',
      },
      {
        source: '/twitter-image.png',
        destination: '/twitter-image',
      },
    ];
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
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
