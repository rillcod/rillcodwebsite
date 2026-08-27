import type { NextConfig } from "next";

/**
 * PRODUCTION PATH: Cloudflare Containers (Dockerfile.cf) — slim standalone
 * bundle pushed to the Cloudflare registry, fronted by the Worker gateway in
 * src/cloudflare/container-gateway.ts. Set by `npm run cf:container:deploy`
 * and by .github/workflows/deploy-cloudflare.yml.
 */
const isContainerBuild = process.env.DOCKER_BUILD === "1";
const isProduction = process.env.NODE_ENV === "production";

const cspReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
  "style-src 'self' 'unsafe-inline' https:",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https: wss:",
  "media-src 'self' blob: https:",
  "frame-src 'self' https:",
  "worker-src 'self' blob:",
  "form-action 'self' https://checkout.paystack.com",
  "report-uri /api/security/csp-report",
].join('; ');

const nextConfig: NextConfig = {
  // Local desktop/browser checks use both host spellings. Next 16 blocks
  // dev-only assets and HMR when 127.0.0.1 opens a server initialized for
  // localhost unless that hostname is explicitly allowed.
  allowedDevOrigins: ['127.0.0.1'],

  // ── TypeScript: type errors still block builds ────────────────────────────
  typescript: { ignoreBuildErrors: false },

  // ── Native App Export (Uncomment these for Capacitor Android/iOS builds) ──
  // output: 'export',

  // Slim Docker image for Cloudflare Containers (~500 MB vs ~2.8 GB full node_modules).
  ...(isContainerBuild ? { output: "standalone" as const } : {}),

  // Keep pdf engines out of the webpack bundle on the container build so AFM/TTF
  // paths resolve from node_modules inside the Container image.
  serverExternalPackages: [
    "pdfmake",
    "pdfkit",
    "@foliojs-fork/pdfkit",
    "fontkit",
    "@foliojs-fork/fontkit",
    "jose",
  ],

  // Ensure font metric / TTF files are traced into the standalone server output.
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./node_modules/pdfkit/js/data/**/*",
      "./node_modules/@foliojs-fork/pdfkit/js/data/**/*",
      "./node_modules/pdfmake/fonts/**/*",
      "./node_modules/pdfmake/build/fonts/**/*",
    ],
    // The proposal studio and the public gallery list this folder off the
    // filesystem at request time. `public/` is served by the CDN and is not
    // otherwise part of a deployed function's filesystem, so without this the
    // readdir finds nothing and both come back empty in production while
    // working perfectly in dev.
    "/api/partnerships/photos/**/*": ["./public/images/EVENTS/**/*"],
    "/api/gallery/events/**/*": ["./public/images/EVENTS/**/*"],
  },

  // ── Turbopack Compatibility ──────────────────────────────────────────────
  // @ts-ignore
  turbopack: {},

  experimental: {
    // These settings are for memory-capped production/CI builds. Applying them
    // to `next dev` can split HMR compilation across workers and leave the
    // browser with a client reference whose webpack factory was not registered.
    ...(isProduction ? {
      webpackMemoryOptimizations: true,
      cpus: 1,
      // Compile server / edge / client in short-lived child processes during
      // production builds so each compiler's heap is released between phases.
      webpackBuildWorker: true,
    } : {}),
    // Import rewriting is also production-only. In development, HMR must keep
    // a single stable client-module graph; rewriting large client barrels can
    // otherwise leave React Flight references pointing at a missing factory.
    ...(isProduction ? {
      optimizePackageImports: [
        '@supabase/supabase-js',
        // LiveKit is loaded as an isolated client chunk and imports stylesheet side effects.
        // Keep it out of barrel rewriting so its component factories remain in one graph.
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
    } : {}),
    // instrumentation.ts is enabled by default in Next.js 15
  },

  // Avoid browser source maps in CI — they inflate compile RAM.
  productionBrowserSourceMaps: false,

  // Disable persistent cache in the container build to cut peak RAM and keep
  // the Docker layer small.
  webpack: (config, { dev }) => {
    if (!dev && process.env.DOCKER_BUILD) {
      config.cache = false;
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
        // The service worker is source-controlled and must be revalidated on
        // every visit so a deploy cannot strand clients on stale chunks.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
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
          { key: 'Content-Security-Policy-Report-Only', value: cspReportOnly },
          ...(isProduction ? [{
            key: 'Strict-Transport-Security',
            // Start without includeSubDomains/preload while every subdomain is
            // being certified. This can be strengthened after production proof.
            value: 'max-age=31536000',
          }] : []),
          // Allow camera & mic for LiveKit video meetings
          { key: 'Permissions-Policy', value: 'camera=*, microphone=*, display-capture=*' },
        ],
      },
      {
        // Programme photographs are referenced by absolute URL inside issued
        // partnership documents, because those documents are previewed in a
        // srcdoc iframe and emailed, where a relative path resolves against
        // nothing. Building the PDF then reads each image back through
        // html-to-image, which needs the pixels — and a cross-origin image with
        // no CORS header rasterises as an empty box. These are public marketing
        // photographs already served to anyone; letting them be read is safe.
        source: '/images/:path*',
        headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }],
      },
      ...(isProduction ? [{
        // Production chunks are content-addressed. Do not override Next's
        // development chunk headers: Next 16 warns that doing so can break HMR
        // and it is a known path to stale module-factory crashes.
        source: '/_next/static/(.*)',
        headers: [{
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable',
        }],
      }] : []),
    ];
  },
};

export default nextConfig;
