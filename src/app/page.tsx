'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Hero, About, NigerianSTEMShowcase, Contact, Footer } from '@/components/landing';

export default function Home() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        // User is signed in — go straight to dashboard
        router.replace('/dashboard');
      } else {
        setChecked(true);
      }
    });
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
      <NigerianSTEMShowcase />
      <Contact />
      <Footer />
    </div>
  );
}
