// @refresh reset
'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import {
  ExclamationTriangleIcon,
  ArrowPathIcon,
  HomeIcon
} from '@/lib/icons';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-dvh bg-background font-sans relative overflow-hidden flex items-center justify-center">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-red-500/10 to-primary/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-primary/10 to-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-[max(1rem,var(--safe-area-left))] pt-[max(2rem,var(--safe-area-top))] pb-[max(2rem,var(--safe-area-bottom))] sm:px-6 lg:px-8 sm:py-16">
        <div className="text-center">
          {/* Critical Error Protocol */}
          <div className="mb-12 text-foreground">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl mb-8 shadow-2xl relative group">
              <div className="absolute inset-0 bg-brand-red-600/10 group-hover:bg-brand-red-600/20 transition-all duration-300 rounded-3xl"></div>
              <ExclamationTriangleIcon className="w-12 h-12 text-brand-red-600 relative z-10 animate-fade-in" />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-brand-red-600 rounded-full"></div>
              <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-brand-red-600 rounded-full animate-ping"></div>
            </div>
            <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight mb-4 italic">
              Something <span className="text-brand-red-600">Went Wrong</span>
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground mb-12 max-w-lg mx-auto font-bold italic leading-relaxed uppercase tracking-widest opacity-60">
              We could not finish loading this screen. Your saved information is safe. Try again or return to the home page.
            </p>
          </div>

          {/* Error Intel (Development Only) */}
          {process.env.NODE_ENV === 'development' && (
            <div className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-6 mb-12 max-w-2xl mx-auto text-left shadow-2xl overflow-hidden relative group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-brand-red-600/5 rotate-45 transform translate-x-12 -translate-y-12"></div>
              <h3 className="text-[10px] font-black text-brand-red-600 uppercase tracking-widest mb-4 italic flex items-center gap-2">
                 <div className="w-1.5 h-1.5 bg-brand-red-600 rounded-full animate-pulse"></div>
                 Technical details:
              </h3>
              <p className="text-[11px] text-foreground font-mono break-all leading-relaxed whitespace-pre-wrap">
                {error.message}
              </p>
              {error.digest && (
                <p className="text-[9px] text-muted-foreground mt-4 uppercase tracking-widest font-black italic">
                  Reference: {error.digest}
                </p>
              )}
            </div>
          )}

          {/* Recovery Protocols */}
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 justify-center mb-16 relative">
            <button
              onClick={reset}
              className="inline-flex items-center justify-center px-8 py-4 bg-primary text-white rounded-2xl hover:bg-primary/90 transition-all duration-300 font-black text-[10px] uppercase tracking-[0.25em] shadow-lg shadow-primary/20 group min-h-11"
            >
              <ArrowPathIcon className="w-4 h-4 mr-3 group-hover:rotate-180 transition-transform duration-500" />
              TRY AGAIN
            </button>
            <Link
              href="/"
              className="inline-flex items-center justify-center px-8 py-4 bg-card border border-border text-foreground rounded-2xl hover:bg-muted transition-all duration-300 font-black text-[10px] uppercase tracking-[0.25em] group min-h-11"
            >
              <HomeIcon className="w-4 h-4 mr-3" />
              GO TO HOME
            </Link>
          </div>

          {/* External Support Uplink */}
          <div className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-8 sm:p-10 shadow-2xl relative overflow-hidden max-w-2xl mx-auto">
            <div className="absolute top-0 left-0 w-32 h-32 bg-primary/5 rotate-45 transform -translate-x-16 -translate-y-16"></div>
            <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.4em] mb-8 italic">Need help?</h3>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-10">
              <Link
                href="/contact"
                className="text-[11px] font-black text-foreground uppercase tracking-widest hover:text-primary transition-colors border-b border-border hover:border-primary pb-1"
              >
                Contact support
              </Link>
              <div className="hidden sm:block text-border">|</div>
              <a
                href="https://wa.me/2348116600091"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-black text-emerald-500 uppercase tracking-widest hover:text-emerald-400 transition-colors border-b border-border hover:border-emerald-500 pb-1"
              >
                Chat on WhatsApp
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 