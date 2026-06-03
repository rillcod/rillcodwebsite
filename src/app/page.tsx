'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { X, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Hero, About, NigerianSTEMShowcase, Contact, Footer, ProgramExplorer } from '@/components/landing';
import SummerSchoolPopup from '@/components/SummerSchoolPopup';

export default function Home() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    // Never leave the home route spinning forever if getSession() hangs (browser tab sleep, network stall).
    let settled = false;
    const maxWait = 12_000;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      setChecked(true);
    }, maxWait);

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        if (data.session) router.replace('/dashboard');
        else setChecked(true);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        setChecked(true);
      });

    return () => {
      settled = true;
      window.clearTimeout(timeoutId);
    };
  }, [router]);

  useEffect(() => {
    if (!checked) return;

    // Show sticky mobile bar after 1.5s
    const stickyTimer = setTimeout(() => {
      setShowStickyBar(true);
    }, 1500);

    // Show registration popup modal after 3.5s (only once per session)
    const hasShownPopup = sessionStorage.getItem('summer-school-popup-shown');
    let popupTimer: NodeJS.Timeout;
    if (!hasShownPopup) {
      popupTimer = setTimeout(() => {
        setShowPopup(true);
        sessionStorage.setItem('summer-school-popup-shown', 'true');
      }, 3500);
    }

    return () => {
      clearTimeout(stickyTimer);
      if (popupTimer) clearTimeout(popupTimer);
    };
  }, [checked]);

  // While checking auth, show nothing (avoids landing page flash)
  if (!checked) {
    return (
      <div className="bg-background min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen relative">
      <Hero />
      <About />
      <ProgramExplorer />
      <NigerianSTEMShowcase />
      <Contact />
      <Footer />

      {/* Mobile Sticky Floating CTA (Only on mobile viewport) */}
      {showStickyBar && !isDismissed && (
        <div className="fixed bottom-6 left-4 right-4 z-50 lg:hidden animate-in fade-in slide-in-from-bottom-6 duration-500">
          <div className="relative bg-background/95 dark:bg-card/95 backdrop-blur-md border border-amber-500/30 p-4 shadow-2xl rounded-2xl flex items-center justify-between gap-3">
            <Link
              href="/summer-school"
              className="flex-1 flex items-center gap-3 text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0 animate-bounce">
                <span className="text-xl">☀️</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest leading-none">AI Summer School 2026</p>
                </div>
                <p className="text-xs font-black text-foreground uppercase tracking-tight truncate">Deadline: Friday, June 12</p>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              <Link
                href="/summer-school"
                className="flex items-center gap-1 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 rounded-xl text-white text-[10px] font-black uppercase tracking-wider shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
              >
                Register
              </Link>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDismissed(true);
                }}
                className="p-2 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors border border-border"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-triggered Summer School registration popup modal */}
      <SummerSchoolPopup
        isOpen={showPopup}
        onClose={() => setShowPopup(false)}
      />
    </div>
  );
}
