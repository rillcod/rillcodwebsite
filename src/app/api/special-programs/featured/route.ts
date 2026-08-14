import { NextResponse } from 'next/server';
import { getFeaturedSpecialProgram } from '@/lib/special-programs/queries';
import { isPromotable, specialProgramPublicPath } from '@/lib/special-programs/types';

/**
 * Lightweight public endpoint for homepage CTAs.
 *
 * Returns `open` alongside the data: whether this programme should still be
 * promoted across the site. It used to hand back a hardcoded AI Summer School
 * whenever nothing was featured, so the site advertised an intake that might not
 * exist and could not be switched off except in code. Now an absent or finished
 * programme says so, and the surfaces that promote it stand down.
 */
export async function GET() {
  try {
    const page = await getFeaturedSpecialProgram();
    // Nothing published: the site has no special programme to sell right now,
    // and saying so is better than inventing one.
    if (!page) return NextResponse.json({ data: null, open: false });

    const start = page.starts_on;
    const end = page.ends_on;
    let banner: string | null = page.content.season_badge || null;
    if (!banner && start && end) {
      const fmt = (iso: string) => {
        const d = new Date(`${iso}T12:00:00`);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      };
      banner = `${page.title} is Active (${fmt(start)} to ${fmt(end)})`;
    }
    return NextResponse.json({
      // The page still exists and stays reachable at its own URL; `open` only
      // governs whether the rest of the site advertises it.
      open: isPromotable(page),
      data: {
        id: page.id,
        slug: page.slug,
        href: specialProgramPublicPath(page.slug),
        button_label: page.button_label,
        title: page.title,
        banner,
        starts_on: page.starts_on,
        ends_on: page.ends_on,
        registration_deadline: page.registration_deadline,
        online_fee: page.online_fee,
        onsite_fee: page.onsite_fee,
        deposit_percent: page.deposit_percent,
        age_min: page.content.age_min ?? 8,
        age_max: page.content.age_max ?? 99,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}
