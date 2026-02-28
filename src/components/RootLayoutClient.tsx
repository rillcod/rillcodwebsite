"use client";

import { usePathname } from 'next/navigation';
import Navigation from '@/components/layout/Navigation';
import { Footer } from '@/components/landing';
import { MessageCircle } from "lucide-react";
import { contactInfo } from '@/config/brand';

export default function RootLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isDashboardRoute = pathname?.startsWith('/admin') ||
    pathname?.startsWith('/teacher') ||
    pathname?.startsWith('/student');

  return (
    <>
      {!isDashboardRoute && <Navigation />}
      <main className="min-h-screen">
        {children}
      </main>
      {!isDashboardRoute && <Footer />}

      {/* WhatsApp Floating Button */}
      {!isDashboardRoute && (
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
      )}
    </>
  );
} 