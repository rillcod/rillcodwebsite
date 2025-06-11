import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { Toaster } from "sonner";
import { MessageCircle } from "lucide-react";
import { AuthProvider } from "@/contexts/auth-context";
import { ThemeProvider } from "@/contexts/theme-context";
import { contactInfo, brandAssets } from '@/config/brand';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: {
    default: 'RILLCOD Academy - Inspiring Young Minds Through Technology',
    template: '%s | RILLCOD Academy'
  },
  description: 'Transform Nigeria\'s educational system with cutting-edge technology education. Learn coding, robotics, web development, and more through fun, hands-on projects. Partner with us or enroll your child today!',
  keywords: [
    'coding academy',
    'technology education',
    'STEM learning',
    'programming for kids',
    'robotics programming',
    'web development',
    'Python programming',
    'Scratch programming',
    'ICT fundamentals',
    'Nigeria education',
    'Benin City',
    'school partnership',
    'computer science education',
    'digital literacy',
    '21st century skills'
  ],
  authors: [{ name: 'RILLCOD Academy' }],
  creator: 'RILLCOD Academy',
  publisher: 'RILLCOD Technologies',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL('https://rillcod.com'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://rillcod.com',
    title: 'RILLCOD Academy - Inspiring Young Minds Through Technology',
    description: 'Transform Nigeria\'s educational system with cutting-edge technology education. Learn coding, robotics, web development, and more through fun, hands-on projects.',
    siteName: 'RILLCOD Academy',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'RILLCOD Academy - Technology Education for Children',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RILLCOD Academy - Inspiring Young Minds Through Technology',
    description: 'Transform Nigeria\'s educational system with cutting-edge technology education. Learn coding, robotics, web development, and more through fun, hands-on projects.',
    images: ['/og-image.jpg'],
    creator: '@rillcodacademy',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: 'your-google-verification-code',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon.png" />
        <link rel="shortcut icon" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#FF914D" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        
        {/* Preconnect to external domains for better performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://images.pexels.com" />
        
        {/* Structured Data for SEO */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "EducationalOrganization",
              "name": "RILLCOD Academy",
              "description": "Transform Nigeria's educational system with cutting-edge technology education. Learn coding, robotics, web development, and more through fun, hands-on projects.",
              "url": "https://rillcod.com",
              "logo": brandAssets.logo,
              "address": {
                "@type": "PostalAddress",
                "streetAddress": "No 26 Ogiesoba Avenue",
                "addressLocality": "Benin City",
                "addressCountry": "NG"
              },
              "contactPoint": {
                "@type": "ContactPoint",
                "telephone": contactInfo.phone.replace(/\s/g, ''),
                "contactType": "customer service",
                "email": contactInfo.email
              },
              "sameAs": [
                "https://facebook.com/rillcodacademy",
                "https://twitter.com/rillcodacademy",
                "https://instagram.com/rillcodacademy"
              ],
              "offers": {
                "@type": "Offer",
                "description": "Technology education programs for children",
                "price": "60000",
                "priceCurrency": "NGN"
              }
            })
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider>
          <AuthProvider>
            <Header />
            <main className="min-h-screen">
              {children}
            </main>
            <Footer />
            <Toaster 
              position="top-right" 
              toastOptions={{
                duration: 4000,
                style: {
                  background: '#363636',
                  color: '#fff',
                },
              }}
            />
            
            {/* WhatsApp Floating Button */}
            <a
              href={contactInfo.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="fixed bottom-6 right-6 bg-green-500 text-white p-4 rounded-full shadow-lg hover:bg-green-600 transition-all duration-300 hover:scale-110 z-50 flex items-center gap-2 group"
              aria-label="Chat on WhatsApp"
            >
              <MessageCircle className="w-6 h-6" />
              <span className="hidden md:inline font-medium">Chat with us</span>
              <div className="absolute -top-2 -right-2 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
            </a>

            {/* Loading Indicator */}
            <div id="loading-indicator" className="fixed inset-0 bg-white bg-opacity-75 flex items-center justify-center z-[9999] hidden">
              <div className="flex flex-col items-center space-y-4">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-gray-600 font-medium">Loading...</p>
              </div>
            </div>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
