import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AppProviders from "@/components/layout/AppProviders";
import { OrganizationJsonLd, WebSiteJsonLd } from "@/components/landing/JsonLd";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://rillcod.com"),
  title: {
    default: "Rillcod Technologies — Nigeria's Leading STEM & Coding Academy | Benin City, Edo State",
    template: "%s | Rillcod Technologies",
  },
  description:
    "Rillcod Technologies is Nigeria's premier STEM and coding academy for children. We offer hands-on coding, robotics, AI, and web development classes in partner schools across Benin City, Edo State, and Nigeria. Empowering kids from JSS1 to SS3 with future-ready tech skills.",
  keywords: [
    "coding academy Nigeria",
    "STEM education Nigeria",
    "coding for kids Nigeria",
    "robotics classes Nigeria",
    "coding academy Benin City",
    "STEM education Benin City",
    "coding classes Benin City",
    "robotics Benin City",
    "tech education Benin City",
    "coding academy Edo State",
    "STEM education Edo State",
    "coding classes Ekpoma",
    "STEM education Ekpoma",
    "coding academy Uromi",
    "tech education Uromi",
    "coding classes Auchi",
    "STEM education Auchi",
    "best coding academy Africa",
    "STEM education Africa",
    "Python programming for kids",
    "Scratch programming Nigeria",
    "web development for children",
    "AI education Nigeria",
    "robotics for kids Nigeria",
    "Rillcod Technologies",
  ],
  authors: [{ name: "Rillcod Technologies", url: "https://rillcod.com" }],
  creator: "Rillcod Technologies",
  publisher: "Rillcod Technologies",
  manifest: "/manifest.json",
  alternates: {
    canonical: "https://rillcod.com",
  },
  openGraph: {
    type: "website",
    locale: "en_NG",
    url: "https://rillcod.com",
    siteName: "Rillcod Technologies",
    title: "Rillcod Technologies — Nigeria's Leading STEM & Coding Academy | Benin City",
    description:
      "Empowering Nigerian children with hands-on coding, robotics, AI, and STEM skills. Classes delivered in partner schools across Benin City, Ekpoma, Uromi, Auchi, and all of Edo State.",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Rillcod Technologies — STEM & Coding Education for Nigerian Children",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@rillcodacademy",
    creator: "@rillcodacademy",
    title: "Rillcod Technologies — Nigeria's Leading STEM & Coding Academy",
    description:
      "Hands-on coding, robotics & STEM education for Nigerian kids. Partner schools in Benin City, Edo State & across Nigeria.",
    images: ["/og-image.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    // Add your verification codes here when available
    // google: 'your-google-verification-code',
    // yandex: 'your-yandex-verification-code',
  },
  category: "education",
  other: {
    "geo.region": "NG-ED",
    "geo.placename": "Benin City",
    "geo.position": "6.3350;5.6037",
    ICBM: "6.3350, 5.6037",
    "content-language": "en-NG",
    "distribution": "global",
    "rating": "general",
    "revisit-after": "7 days",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0f0f1a' },
    { media: '(prefers-color-scheme: light)', color: '#F8F9FA' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr">
      <head>
        <OrganizationJsonLd />
        <WebSiteJsonLd />
        <link rel="canonical" href="https://rillcod.com" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="shortcut icon" href="/favicon.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192x192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512x512.png" />
        {/* iOS standalone PWA meta tags */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Rillcod" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/**
         * Anti-flash theme script: runs synchronously before React hydration.
         * Prevents the white flash when a user has dark mode saved and the page loads.
         */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = localStorage.getItem('theme') || 'dark';
                  var effective = t === 'system'
                    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                    : t;
                  document.documentElement.classList.add(effective);
                  document.documentElement.style.colorScheme = effective;
                } catch(e) {
                  document.documentElement.classList.add('dark');
                  document.documentElement.style.colorScheme = 'dark';
                }
              })();
            `,
          }}
        />
      </head>
      <body className={`${inter.className} bg-background text-foreground`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
