import { NextRequest, NextResponse, after } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  listSpecialProgramsAdmin,
  specialProgramsAdminClient,
} from '@/lib/special-programs/queries';
import { slugifySpecialProgram } from '@/lib/special-programs/types';
import { shouldLaunchTeachingOnPublish } from '@/lib/special-programs/bridge-offering';
import { launchSpecialProgramTeaching } from '@/lib/special-programs/launch-teaching';

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await specialProgramsAdminClient()
    .from('portal_users')
    .select('role, id')
    .eq('id', user.id)
    .single();
  if (!caller || caller.role !== 'admin') return null;
  return caller;
}

function queueTeachingLaunch(input: {
  pageId: string;
  createdBy: string;
  request: NextRequest;
}) {
  const baseUrl = (
    input.request.nextUrl?.origin ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
  const cookie = input.request.headers.get('cookie') ?? undefined;
  const cronSecret = process.env.CRON_SECRET || process.env.BILLING_CRON_SECRET || undefined;

  after(async () => {
    try {
      const result = await launchSpecialProgramTeaching({
        pageId: input.pageId,
        createdBy: input.createdBy,
        baseUrl,
        cookie,
        cronSecret,
        notifyAdminId: input.createdBy,
      });
      if (result.error) {
        console.error('[special-program launch]', input.pageId, result.error, result.detail);
      }
    } catch (err) {
      console.error('[special-program launch] failed', input.pageId, err);
    }
  });
}

/** GET /api/special-programs — admin: all; ?featured=1 public featured; ?slug= for published */
export async function GET(request: NextRequest) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const featured = searchParams.get('featured') === '1' || searchParams.get('featured') === 'true';
    const slug = searchParams.get('slug')?.trim();

    if (featured) {
      const { getFeaturedSpecialProgram } = await import('@/lib/special-programs/queries');
      const page = await getFeaturedSpecialProgram();
      return NextResponse.json({ data: page });
    }

    if (slug) {
      const { getSpecialProgramBySlug } = await import('@/lib/special-programs/queries');
      const page = await getSpecialProgramBySlug(slug, { requirePublished: true });
      if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ data: page });
    }

    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const rows = await listSpecialProgramsAdmin();
    return NextResponse.json({ data: rows });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load' }, { status: 500 });
  }
}

/** POST /api/special-programs — admin create */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const title = String(body.title || '').trim();
    if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

    let slug = String(body.slug || '').trim() || slugifySpecialProgram(title);
    slug = slugifySpecialProgram(slug);

    const sb = specialProgramsAdminClient();
    const payload = {
      program_id: body.program_id || null,
      slug,
      title,
      button_label: String(body.button_label || title).trim() || title,
      is_published: Boolean(body.is_published),
      is_featured: Boolean(body.is_featured),
      starts_on: body.starts_on || null,
      ends_on: body.ends_on || null,
      registration_deadline: body.registration_deadline || null,
      online_fee: Number(body.online_fee) || 50000,
      onsite_fee: Number(body.onsite_fee) || 40000,
      deposit_percent: Number(body.deposit_percent) || 50,
      content: body.content && typeof body.content === 'object' ? body.content : {},
      updated_at: new Date().toISOString(),
    };

    if (payload.is_featured) {
      await sb
        .from('special_program_pages')
        .update({ is_featured: false, updated_at: new Date().toISOString() })
        .eq('is_featured', true);
      payload.is_published = true;
    }

    const { data, error } = await sb
      .from('special_program_pages')
      .insert({ ...payload, created_at: new Date().toISOString() })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'That URL slug is already in use' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (body.school_id) {
      // Offering is created by trigger; attach school so teaching can build.
      for (let i = 0; i < 4; i += 1) {
        const { data: page } = await sb
          .from('special_program_pages')
          .select('academic_offering_id')
          .eq('id', data.id)
          .maybeSingle();
        if (page?.academic_offering_id) {
          await sb
            .from('academic_offerings')
            .update({
              school_id: body.school_id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', page.academic_offering_id);
          break;
        }
        await new Promise((r) => setTimeout(r, 200 * (i + 1)));
      }
    }

    const launch = shouldLaunchTeachingOnPublish({
      wasPublished: false,
      nowPublished: Boolean(data.is_published),
    });
    if (launch && !payload.program_id) {
      return NextResponse.json(
        {
          data,
          teaching_launch: 'blocked',
          teaching_error:
            'Page saved, but teaching was not started — link a programme first.',
        },
        { status: 201 },
      );
    }
    if (launch) {
      queueTeachingLaunch({ pageId: data.id, createdBy: admin.id, request });
    }

    return NextResponse.json(
      { data, teaching_launch: launch ? 'queued' : undefined },
      { status: 201 },
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to create' }, { status: 500 });
  }
}
