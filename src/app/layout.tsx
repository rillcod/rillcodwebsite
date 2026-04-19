import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AppProviders from "@/components/layout/AppProviders";
import { OrganizationJsonLd, WebSiteJsonLd } from "@/components/landing/JsonLd";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://www.rillcod.com"),
  title: {
    default: "Rillcod Technologies — Tech Education & Innovation Hub | STEM, Robotics, Web/App Development & IoT",
    template: "%s | Rillcod Technologies",
  },
  description:
    "Rillcod Technologies is Nigeria's premier tech education and innovation hub. We offer STEM education, coding & robotics training, professional web/app development services, and smart home automation solutions. Serving schools, businesses, and individuals across Benin City, Edo State, and Nigeria.",
  keywords: [
    "STEM education Nigeria",
    "coding academy Nigeria",
    "robotics training Nigeria",
    "web development Nigeria",
    "app development Nigeria",
    "smart home automation Nigeria",
    "IoT solutions Nigeria",
    "tech education Benin City",
    "web development Benin City",
    "app development Benin City",
    "smart home Benin City",
    "robotics Benin City",
    "coding classes Edo State",
    "software development Nigeria",
    "home automation Edo State",
    "IoT Benin City",
    "tech innovation hub Nigeria",
    "STEM robotics coding",
    "professional web development",
    "mobile app development",
    "smart home solutions",
    "automation systems Nigeria",
    "tech training Nigeria",
    "Rillcod Technologies",
  ],
  authors: [{ name: "Rillcod Technologies", url: "https://www.rillcod.com" }],
  creator: "Rillcod Technologies",
  publisher: "Rillcod Technologies",
  manifest: "/manifest.json",
  alternates: {
    canonical: "https://www.rillcod.com",
  },
  openGraph: {
    type: "website",
    locale: "en_NG",
    url: "https://www.rillcod.com",
    siteName: "Rillcod Technologies",
    title: "Rillcod Technologies — Tech Education & Innovation Hub | STEM, Robotics, Web/App Development & IoT",
    description:
      "Nigeria's premier tech education and innovation hub. STEM education, coding & robotics training, web/app development services, and smart home automation solutions in Benin City, Edo State.",
    images: [
      {
        url: "https://www.rillcod.com/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Rillcod Technologies — Tech Education & Innovation Hub",
        type: "image/png",
      },
    ],
  },
  facebook: {
    appId: "1504064024671418",
  },
  twitter: {
    card: "summary_large_image",
    site: "@rillcod_",
    creator: "@rillcod_",
    title: "Rillcod Technologies — Tech Education & Innovation Hub | STEM, Robotics, Web/App Development & IoT",
    description:
      "Nigeria's premier tech education and innovation hub. STEM education, coding & robotics training, web/app development services, and smart home automation solutions.",
    images: ["https://www.rillcod.com/twitter-image"],
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
    google: 'GPd05n2EkQyc0DKulfDYKGQly0TTc7-s87B-lD9J1P0',
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
        <link rel="canonical" href="https://www.rillcod.com" />
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
