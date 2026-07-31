import type { NextConfig } from "next";
import path from "path";
// @ts-ignore
import withPWAInit from "next-pwa";
// @ts-ignore
import runtimeCaching from "next-pwa/cache";

/** Cloudflare Pages sets CF_PAGES=1; local OpenNext scripts set OPENNEXT_CLOUDFLARE=1. */
const isCloudflareBuild =
  process.env.CF_PAGES === "1" || process.env.OPENNEXT_CLOUDFLARE === "1";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  // SafeDev PWA Mode: Disabled in development to ensure stable dashboard loading
  disable: process.env.NODE_ENV === "development",
  buildExcludes: [
    /middleware-manifest\.json$/,
    /app-build-manifest\.json$/,
    /_buildManifest\.js$/,
    /_ssgManifest\.js$/,
  ],
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

  // Keep pdf engines out of the webpack bundle on Vercel so AFM/TTF paths resolve
  // from node_modules. On Cloudflare, omit them so stubs replace the heavy packages
  // instead of copying fonts into the Worker. `jose` stays external for workerd.
  serverExternalPackages: isCloudflareBuild
    ? ["jose"]
    : [
        "pdfmake",
        "pdfkit",
        "@foliojs-fork/pdfkit",
        "fontkit",
        "@foliojs-fork/fontkit",
        "jose",
      ],

  // Ensure font metric / TTF files are traced into Vercel serverless functions.
  outputFileTracingIncludes: isCloudflareBuild
    ? {}
    : {
        "/api/**/*": [
          "./node_modules/pdfkit/js/data/**/*",
          "./node_modules/@foliojs-fork/pdfkit/js/data/**/*",
          "./node_modules/pdfmake/fonts/**/*",
          "./node_modules/pdfmake/build/fonts/**/*",
        ],
      },

  // ── Turbopack Compatibility ──────────────────────────────────────────────
  // silences warning for custom webpack used by next-pwa
  // @ts-ignore
  turbopack: {},

  experimental: {
    // Lower peak RAM on Vercel’s 8GB builders (large app + next-pwa webpack).
    webpackMemoryOptimizations: true,
    cpus: 1,
    // Compile server / edge / client each in its own short-lived child process
    // so each compilation's heap is freed before the next phase instead of
    // accumulating in one process. Next disables this by default whenever a
    // custom `webpack` config is present — and next-pwa always adds one — so it
    // has to be opted into explicitly here.
    webpackBuildWorker: true,
    // Reduce duplicate module instances from barrel imports
    optimizePackageImports: [
      '@supabase/supabase-js',
      '@livekit/components-react',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-avatar',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-label',
      '@radix-ui/react-navigation-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slot',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
      '@radix-ui/react-tooltip',
      'recharts',
      'date-fns',
      'lucide-react',
    ],
    // instrumentation.ts is enabled by default in Next.js 15
  },

  // Avoid browser source maps on Vercel — they inflate compile RAM.
  productionBrowserSourceMaps: false,

  // next-pwa already injects webpack; disable persistent cache on Vercel to cut peak RAM.
  webpack: (config, { dev, isServer }) => {
    if (!dev && process.env.VERCEL) {
      config.cache = false;
    }
    // Cloudflare Workers size limits: stub Node-only heavies so they never enter the Worker.
    if (isServer && isCloudflareBuild) {
      const stubs = path.join(__dirname, "src/lib");
      config.resolve = config.resolve ?? {};
      config.resolve.alias = {
        ...(config.resolve.alias as Record<string, string | false | string[]>),
        "firebase-admin": path.join(stubs, "push/firebase-admin-stub.cjs"),
        pdfmake: path.join(stubs, "cloudflare-stubs/pdfmake.cjs"),
        "pdfmake/fonts/Roboto": path.join(stubs, "cloudflare-stubs/pdfmake.cjs"),
        pdfkit: path.join(stubs, "cloudflare-stubs/pdfkit.cjs"),
        "@foliojs-fork/pdfkit": path.join(stubs, "cloudflare-stubs/pdfkit.cjs"),
        fontkit: path.join(stubs, "cloudflare-stubs/pdfkit.cjs"),
        "@foliojs-fork/fontkit": path.join(stubs, "cloudflare-stubs/pdfkit.cjs"),
      };
    }
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
      // One student registration door — online is a type on that page, not a separate funnel
      {
        source: '/online-registration',
        destination: '/student-registration?type=online',
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
