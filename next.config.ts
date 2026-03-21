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
  // ── Native App Export (Uncomment these for Capacitor Android/iOS builds) ──
  // output: 'export',
  
  // ── Turbopack Compatibility ──────────────────────────────────────────────
  // silences warning for custom webpack used by next-pwa
  // @ts-ignore
  turbopack: {},

  // ── Bundle optimisations ───────────────────────────────────────
  // Exclude native binaries that don't run on Cloudflare Workers edge runtime
  serverExternalPackages: ['sharp'],

  experimental: {
    // Reduce duplicate module instances
    optimizePackageImports: [
      '@supabase/supabase-js',
    ],
  },

  // ── Webpack externals (for OpenNext / Cloudflare bundler) ──────
  webpack: (config: any) => {
    config.externals = [...(config.externals ?? []), 'sharp'];
    return config;
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
