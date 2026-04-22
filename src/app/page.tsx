'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Hero, About, NigerianSTEMShowcase, Contact, Footer, ProgramExplorer } from '@/components/landing';

export default function Home() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

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

  // While checking auth, show nothing (avoids landing page flash)
  if (!checked) {
    return (
      <div className="bg-background min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen">
      <Hero />
      <About />
      <ProgramExplorer />
      <NigerianSTEMShowcase />
      <Contact />
      <Footer />
    </div>
  );
}
