'use client';

import { useEffect, useState } from 'react';
import {
  formatNaira,
  getSummerDepositAmount,
  getSummerTotalTuition,
  SUMMER_ONSITE_FEE,
  SUMMER_ONLINE_FEE,
  SUMMER_BATCH_LABEL,
  SUMMER_BATCH_B_CLASS_DAYS,
} from '@/lib/summer-school/pricing';

export type FeaturedSpecialCta = {
  href: string;
  /** Direct link to the registration form section */
  registerHref: string;
  button_label: string;
  title: string;
  banner: string | null;
  slug: string | null;
  onlineFeeLabel: string;
  onsiteFeeLabel: string;
  depositLabel: string;
  deadlineLabel: string | null;
  batchLabel: string;
  classDays: string;
  ageMin: number;
  ageMax: number;
};

const FALLBACK_HREF = '/special/ai-summer-school-2026';

const FALLBACK: FeaturedSpecialCta = {
  href: FALLBACK_HREF,
  registerHref: `${FALLBACK_HREF}#register`,
  button_label: '☀️ AI Summer School',
  title: 'AI Summer School 2026',
  banner: null,
  slug: 'ai-summer-school-2026',
  onlineFeeLabel: formatNaira(SUMMER_ONLINE_FEE),
  onsiteFeeLabel: formatNaira(SUMMER_ONSITE_FEE),
  depositLabel: formatNaira(getSummerDepositAmount('Online')),
  deadlineLabel: null,
  batchLabel: SUMMER_BATCH_LABEL,
  classDays: SUMMER_BATCH_B_CLASS_DAYS,
  ageMin: 8,
  ageMax: 99,
};

function shortDeadline(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

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
        const href = j.data.href || FALLBACK.href;
        const onlineFee = Number(j.data.online_fee);
        const onsiteFee = Number(j.data.onsite_fee);
        const depositPct = Number(j.data.deposit_percent) || 50;
        const totalOnline =
          Number.isFinite(onlineFee) && onlineFee > 0
            ? onlineFee
            : getSummerTotalTuition('Online');
        const totalOnsite =
          Number.isFinite(onsiteFee) && onsiteFee > 0
            ? onsiteFee
            : getSummerTotalTuition('Onsite');
        const deposit = Math.round((totalOnline * depositPct) / 100);
        setCta({
          href,
          registerHref: `${href}#register`,
          button_label: j.data.button_label || FALLBACK.button_label,
          title: j.data.title || FALLBACK.title,
          banner: j.data.banner ?? null,
          slug: j.data.slug ?? FALLBACK.slug,
          onlineFeeLabel: formatNaira(totalOnline),
          onsiteFeeLabel: formatNaira(totalOnsite),
          depositLabel: formatNaira(deposit),
          deadlineLabel: shortDeadline(j.data.registration_deadline),
          batchLabel: SUMMER_BATCH_LABEL,
          classDays: SUMMER_BATCH_B_CLASS_DAYS,
          ageMin: Number(j.data.age_min) || FALLBACK.ageMin,
          ageMax: Number(j.data.age_max) || FALLBACK.ageMax,
        });
      })
      .catch(() => { /* keep fallback */ })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  return { cta, loaded };
}
