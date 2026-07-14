import { NextResponse } from 'next/server';
import { getFeaturedSpecialProgram } from '@/lib/special-programs/queries';
import { specialProgramPublicPath } from '@/lib/special-programs/types';

/** Lightweight public endpoint for homepage CTAs. */
export async function GET() {
  try {
    const page = await getFeaturedSpecialProgram();
    if (!page) {
      return NextResponse.json({
        data: {
          href: '/special/ai-summer-school-2026',
          button_label: '☀️ AI Summer School',
          title: 'AI Summer School',
          banner: null,
          slug: 'ai-summer-school-2026',
          online_fee: 60_000,
          onsite_fee: 35_000,
          deposit_percent: 50,
          registration_deadline: null,
        },
      });
    }
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
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}
