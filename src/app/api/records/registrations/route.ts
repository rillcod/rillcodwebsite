import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { roleHasCapability } from '@/lib/auth/capabilities';

export const dynamic = 'force-dynamic';
function admin() { return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!); }
async function fetchAll(q: any) { const out: any[] = []; let f = 0; for (;;) { const { data, error } = await q.range(f, f + 999); if (error || !data) break; out.push(...data); if (data.length < 1000) break; f += 1000; } return out; }
const norm = (e?: string | null) => (e || '').trim().toLowerCase();

// GET /api/records/registrations — ALL registration credentials across every batch,
// consolidated into one filterable list (no more per-batch silos). School-scoped.
export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('portal_users').select('id, role, school_id').eq('id', user.id).single();
  if (!profile || !roleHasCapability(profile.role, 'view_records')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const sb = admin();
  const canViewCredentials = roleHasCapability(profile.role, 'view_registration_credentials');


  let scopeSchoolIds: string[] | null = null;
  if (profile.role !== 'admin') {
    const ids = new Set<string>();
    if (profile.school_id) ids.add(profile.school_id);
    if (profile.role === 'teacher') {
      const { data: ts } = await sb.from('teacher_schools').select('school_id').eq('teacher_id', user.id);
      for (const r of ts ?? []) if ((r as any).school_id) ids.add((r as any).school_id);
    }
    scopeSchoolIds = [...ids];
  }
  if (scopeSchoolIds && scopeSchoolIds.length === 0) {
    return NextResponse.json({ registrations: [], count: 0 });
  }

  let batchesQuery = sb
    .from('registration_batches')
    .select('id, school_id, school_name, class_name, created_by, created_at');
  if (scopeSchoolIds) {
    batchesQuery = batchesQuery.in('school_id', scopeSchoolIds);
  }

  const batches = await fetchAll(batchesQuery);
  if (batches.length === 0) {
    return NextResponse.json({ registrations: [], count: 0 });
  }

  const batchById = new Map(batches.map((b: any) => [b.id, b]));
  const batchIds = batches.map((b: any) => b.id);
  const creatorIds = [...new Set(batches.map((b: any) => b.created_by).filter(Boolean))];
  const creators = creatorIds.length > 0
    ? await fetchAll(
      sb
        .from('portal_users')
        .select('id, full_name, role, email')
        .in('id', creatorIds),
    )
    : [];
  const creatorById = new Map(creators.map((c: any) => [c.id, c]));
  const results = await fetchAll(
    sb
      .from('registration_results')
      .select(canViewCredentials
        ? 'id, batch_id, full_name, email, password, class_name, status, created_at'
        : 'id, batch_id, full_name, email, class_name, status, created_at')
      .in('batch_id', batchIds),
  );

  const emails = [...new Set(results.map((r: any) => norm(r.email)).filter(Boolean))];
  const users = emails.length > 0
    ? await fetchAll(
      sb
        .from('portal_users')
        .select('id, email, is_active')
        .eq('role', 'student')
        .neq('is_deleted', true)
        .in('email', emails),
    )
    : [];
  const userByEmail = new Map(users.map((u: any) => [norm(u.email), u]));
  const liveByEmail = new Map(users.map((u: any) => [norm(u.email), u.is_active !== false]));

  const rows = results.map((r: any) => {
    const b = batchById.get(r.batch_id) || {};
    const creator = b.created_by ? creatorById.get(b.created_by) : null;
    const liveUser = userByEmail.get(norm(r.email)) as any;
    const live = !!liveUser;
    return {
      id: r.id,
      portalUserId: liveUser?.id ?? null,
      name: r.full_name,
      email: r.email,
      password: canViewCredentials ? (r.password ?? null) : null,
      klass: r.class_name || b.class_name || '',
      school: b.school_name || '',
      schoolId: b.school_id || null,
      source: b.class_name === 'Single Student Registrations' ? 'Single student' : 'Bulk register',
      batchName: b.class_name || 'Registration batch',
      creatorName: creator?.full_name || creator?.email || null,
      creatorRole: creator?.role || null,
      creatorLabel: creator ? `${creator.full_name || creator.email}${creator.role ? ` (${creator.role})` : ''}` : null,
      status: r.status,
      // Is this credential still backed by a live account?
      account: live ? (liveByEmail.get(norm(r.email)) ? 'Active' : 'Inactive') : 'Deleted',
      registered: r.created_at || b.created_at || null,
      batchId: r.batch_id,
    };
  }).filter((r: any) => {
    if (!liveByEmail.has(norm(r.email))) return false;
    return !scopeSchoolIds || (r.schoolId && scopeSchoolIds.includes(r.schoolId));
  });

  rows.sort((a: any, b: any) => String(b.registered || '').localeCompare(String(a.registered || '')));
  return NextResponse.json({ registrations: rows, count: rows.length, canViewCredentials });
}
