'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Hero, About, NigerianSTEMShowcase, Contact, Footer, ProgramExplorer } from '@/components/landing';
import SummerSchoolPopup from '@/components/SummerSchoolPopup';

export default function Home() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [showPopup, setShowPopup] = useState(false);

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

    const handleOpenPopup = () => {
      setShowPopup(true);
    };
    window.addEventListener('rillcod-open-summer-school-popup', handleOpenPopup);

    const handleGlobalClick = (e: MouseEvent) => {
      // Ignore if not a left click or if modifier keys are pressed
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }

      let target = e.target as HTMLElement | null;
      while (target && target !== document.body) {
        if (target.tagName === 'A' && (target as HTMLAnchorElement).getAttribute('href') === '/summer-school') {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('rillcod-open-summer-school-popup'));
          break;
        }
        target = target.parentElement;
      }
    };

    document.addEventListener('click', handleGlobalClick);

    return () => {
      window.removeEventListener('rillcod-open-summer-school-popup', handleOpenPopup);
      document.removeEventListener('click', handleGlobalClick);
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

      {/* Summer School registration popup modal */}
      <SummerSchoolPopup
        isOpen={showPopup}
        onClose={() => setShowPopup(false)}
      />
    </div>
  );
}
