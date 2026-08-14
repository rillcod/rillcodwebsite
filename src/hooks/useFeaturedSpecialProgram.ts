'use client';

import { useEffect, useState } from 'react';
import {
  formatNaira,
  getSummerDepositAmount,
  getSummerTotalTuition,
  SUMMER_ONSITE_FEE,
  SUMMER_ONLINE_FEE,
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
  /**
   * The programme's own season badge and duration, or null.
   *
   * These used to be the summer school's constants, stamped onto whatever came
   * back from the server — so a spring cohort would have advertised "Batch B"
   * and summer's class days on the homepage. Null when the record does not say,
   * and a surface that prints them omits what is missing rather than inventing
   * it.
   */
  batchLabel: string | null;
  classDays: string | null;
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
  batchLabel: null,
  classDays: null,
  ageMin: 8,
  ageMax: 99,
};

/** "3 Aug – 4 Sep", when a programme has no badge of its own. */
function dateRange(from: string | null | undefined, to: string | null | undefined): string | null {
  const day = (iso: string | null | undefined) => {
    if (!iso) return null;
    const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
    return Number.isNaN(d.getTime())
      ? null
      : d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
  };
  const a = day(from);
  const b = day(to);
  if (!a && !b) return null;
  return a && b ? `${a} – ${b}` : (a ?? b);
}

function shortDeadline(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Loads the featured special programme for homepage / nav CTAs.
 *
 * `open` is the one to gate promotion on. It starts false and only becomes true
 * when the server says the programme is still running and still taking
 * registrations — so a finished intake, an unpublished page, or an endpoint that
 * cannot be reached all leave the site quiet rather than advertising something
 * that has closed. `cta` always holds usable values, so a surface that has
 * already decided to render one cannot crash on a missing field.
 */
export function useFeaturedSpecialProgram() {
  const [cta, setCta] = useState<FeaturedSpecialCta>(FALLBACK);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/special-programs/featured', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        // No featured programme at all: nothing to promote, keep the fallback
        // copy for any surface that still wants a link.
        if (!j?.data) return;
        setOpen(j.open === true);
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
          // From this programme's record, never from the summer constants.
          batchLabel: j.data.season_badge || dateRange(j.data.starts_on, j.data.ends_on),
          classDays: j.data.duration_label || null,
          ageMin: Number(j.data.age_min) || FALLBACK.ageMin,
          ageMax: Number(j.data.age_max) || FALLBACK.ageMax,
        });
      })
      .catch(() => { /* keep fallback, stay closed */ })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  return { cta, loaded, open };
}
