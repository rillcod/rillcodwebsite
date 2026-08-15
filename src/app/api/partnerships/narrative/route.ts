import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildProposalNarrative, type ProposalNarrative } from '@/lib/partnerships/proposal-narrative';
import { getPublishedProgression } from '@/lib/partnerships/curriculum';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = createAdminClient();
    const { data: profile } = await db
      .from('portal_users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || !['admin', 'teacher'].includes(profile.role || '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const schoolName = String(body.school_name || '').trim() || 'Prospective School';
    const city = body.city ? String(body.city).trim() : null;
    const state = body.state ? String(body.state).trim() : null;
    const studentCount = Number(body.student_count) || null;
    const angle = String(body.angle || 'general');
    const userNotes = body.notes ? String(body.notes).trim() : '';

    let angleContext = '';
    if (angle === 'executive') {
      angleContext = 'Focus heavily on executive prestige, international-standard STEM accreditation, and academic leadership in the region.';
    } else if (angle === 'robotics') {
      angleContext = 'Emphasize physical robotics kits, hands-on circuit prototyping, IoT hardware, and preparation for national youth robotics competitions.';
    } else if (angle === 'admissions') {
      angleContext = 'Focus on admissions growth, termly PTA capstone project expos, and tangible digital portfolios that parents rave about at open days.';
    } else if (angle === 'zero_capex') {
      angleContext = 'Emphasize Zero CapEx risk, 100% turnkey equipment supply, dedicated certified instructors, and 30% profit-sharing settled every term.';
    }

    const combinedNotes = [userNotes, angleContext].filter(Boolean).join(' ');

    const curriculum = await getPublishedProgression(db);

    const narrative: ProposalNarrative = await buildProposalNarrative(
      {
        school: {
          name: schoolName,
          city,
          state,
          student_count: studentCount,
        },
        curriculum,
        notes: combinedNotes || null,
      },
      { useAI: true },
    );

    return NextResponse.json({
      success: true,
      narrative,
    });
  } catch (error) {
    console.error('[api/partnerships/narrative] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not generate AI proposal copy' },
      { status: 500 },
    );
  }
}
