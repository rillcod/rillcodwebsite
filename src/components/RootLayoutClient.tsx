"use client";

import { usePathname } from 'next/navigation';
import Navigation from '@/components/layout/Navigation';
import { Footer } from '@/components/landing';
import SmartWhatsAppWidget from '@/components/SmartWhatsAppWidget';

export default function RootLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isDashboardRoute =
    pathname?.startsWith('/dashboard') ||
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/teacher') ||
    pathname?.startsWith('/student') ||
    pathname?.startsWith('/login') ||
    pathname?.startsWith('/signup') ||
    pathname?.startsWith('/reset-password') ||
    pathname?.startsWith('/verify');

  return (
    <>
      {!isDashboardRoute && <Navigation />}
      <main className="min-h-screen">
        {children}
      </main>
      {!isDashboardRoute && <Footer />}

      {/* WhatsApp Floating Button */}
      {!isDashboardRoute && <SmartWhatsAppWidget />}
    </>
  );
} 