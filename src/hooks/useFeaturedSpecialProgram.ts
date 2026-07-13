'use client';

import { useEffect, useState } from 'react';

export type FeaturedSpecialCta = {
  href: string;
  button_label: string;
  title: string;
  banner: string | null;
  slug: string | null;
};

const FALLBACK: FeaturedSpecialCta = {
  href: '/summer-school',
  button_label: '☀️ AI Summer School',
  title: 'AI Summer School',
  banner: 'Summer School is Active — Register & Scan',
  slug: null,
};

/** Loads the featured special programme for homepage / nav CTAs. */
export function useFeaturedSpecialProgram() {
  const [cta, setCta] = useState<FeaturedSpecialCta>(FALLBACK);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/special-programs/featured', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.data) return;
        setCta({
          href: j.data.href || FALLBACK.href,
          button_label: j.data.button_label || FALLBACK.button_label,
          title: j.data.title || FALLBACK.title,
          banner: j.data.banner ?? FALLBACK.banner,
          slug: j.data.slug ?? null,
        });
      })
      .catch(() => { /* keep fallback */ })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  return { cta, loaded };
}
