import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { authorSchoolScope } from '@/lib/newsletters/push';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function getCaller() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = adminClient();
  const { data } = await admin.from('portal_users').select('id, role, school_id').eq('id', user.id).single();
  return data ? { ...data, admin } : null;
}

const isManager = (role: string) => ['admin', 'teacher', 'school'].includes(role);

// GET /api/newsletters — role-scoped list (server-side, no client RLS dependency).
//   admin   → all; teacher/school → their school(s) + own; student/parent → delivered + published.
//   managers additionally get _total / _viewed delivery analytics per newsletter.
export async function GET() {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = caller.admin;

    if (isManager(caller.role)) {
      let q = admin.from('newsletters').select('*').order('created_at', { ascending: false });
      if (caller.role !== 'admin') {
        const scope = await authorSchoolScope(admin, caller);
        const ids = scope ?? [];
        // own authored OR within assigned school(s)
        const parts = [`author_id.eq.${caller.id}`];
        if (ids.length) parts.push(`school_id.in.(${ids.join(',')})`);
        q = q.or(parts.join(',')) as any;
      }
      const { data: rows, error } = await q;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const list = rows ?? [];

      // Delivery analytics (total + viewed) per newsletter.
      const nlIds = list.map((n: any) => n.id);
      const totals: Record<string, number> = {};
      const viewed: Record<string, number> = {};
      for (let i = 0; i < nlIds.length; i += 100) {
        const batch = nlIds.slice(i, i + 100);
        const { data: dels } = await admin.from('newsletter_delivery').select('newsletter_id, is_viewed').in('newsletter_id', batch);
        for (const d of dels ?? []) {
          totals[d.newsletter_id] = (totals[d.newsletter_id] ?? 0) + 1;
          if (d.is_viewed) viewed[d.newsletter_id] = (viewed[d.newsletter_id] ?? 0) + 1;
        }
      }
      return NextResponse.json({
        data: list.map((n: any) => ({ ...n, _total: totals[n.id] ?? 0, _viewed: viewed[n.id] ?? 0 })),
        role: caller.role,
      });
    }

    // Recipient (student/parent): their delivered + published newsletters; mark viewed.
    const { data: deliveries } = await admin.from('newsletter_delivery')
      .select('newsletter_id').eq('user_id', caller.id);
    const ids = (deliveries ?? []).map((d: any) => d.newsletter_id).filter(Boolean);
    if (ids.length === 0) return NextResponse.json({ data: [], role: caller.role });
    const { data: nls } = await admin.from('newsletters')
      .select('*').in('id', ids).eq('status', 'published').order('published_at', { ascending: false });
    await admin.from('newsletter_delivery').update({ is_viewed: true }).eq('user_id', caller.id).in('newsletter_id', ids);
    return NextResponse.json({ data: nls ?? [], role: caller.role });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// POST /api/newsletters — create/update a draft (managers only; must own unless admin).
export async function POST(request: NextRequest) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!isManager(caller.role)) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    const admin = caller.admin;

    const body = await request.json();
    const title = String(body.title ?? '').trim();
    const content = String(body.content ?? '');
    if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

    if (body.id) {
      const { data: existing } = await admin.from('newsletters').select('author_id').eq('id', body.id).maybeSingle();
      if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (caller.role !== 'admin' && (existing as any).author_id !== caller.id) {
        return NextResponse.json({ error: 'You can only edit your own newsletters' }, { status: 403 });
      }
      const { data, error } = await admin.from('newsletters')
        .update({ title, content }).eq('id', body.id).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data });
    }

    const { data, error } = await admin.from('newsletters')
      .insert({ title, content, author_id: caller.id, school_id: caller.school_id ?? null, status: 'draft' })
      .select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
