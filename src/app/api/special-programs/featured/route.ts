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
          href: '/summer-school',
          button_label: '☀️ AI Summer School',
          title: 'AI Summer School',
          banner: null,
          slug: null,
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
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}
