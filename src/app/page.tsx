'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Hero, About, NigerianSTEMShowcase, Contact, ProgramExplorer } from '@/components/landing';
import SummerSchoolPopup from '@/components/SummerSchoolPopup';
import { SPECIAL_LEGACY_PUBLIC_PATH } from '@/lib/registration/enrollment-types';

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
        // The legacy path only. A link to a special programme's own page goes to
        // that page — it is the full pitch, and the popup is the shortcut for
        // people who arrived on the old URL. Which programme the popup registers
        // into is never decided here: it follows whichever one is featured.
        if (
          target.tagName === 'A' &&
          (target as HTMLAnchorElement).getAttribute('href') === SPECIAL_LEGACY_PUBLIC_PATH
        ) {
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

  return (
    <div className="bg-background min-h-screen relative public-page-root overflow-x-clip">
      <Hero />
      <About />
      <ProgramExplorer />
      <NigerianSTEMShowcase />
      <Contact />

      {/* Summer School registration popup modal */}
      <SummerSchoolPopup
        isOpen={showPopup}
        onClose={() => setShowPopup(false)}
      />
    </div>
  );
}
