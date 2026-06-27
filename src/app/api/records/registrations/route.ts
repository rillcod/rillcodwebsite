import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

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
  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const sb = admin();

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

  const [results, batches, users] = await Promise.all([
    fetchAll(sb.from('registration_results').select('id, batch_id, full_name, email, password, class_name, status, created_at')),
    fetchAll(sb.from('registration_batches').select('id, school_id, school_name, class_name, created_at')),
    fetchAll(sb.from('portal_users').select('email, is_active').eq('role', 'student').neq('is_deleted', true)),
  ]);
  const batchById = new Map(batches.map((b: any) => [b.id, b]));
  const liveByEmail = new Map(users.map((u: any) => [norm(u.email), u.is_active !== false]));

  const rows = results.map((r: any) => {
    const b = batchById.get(r.batch_id) || {};
    const live = liveByEmail.has(norm(r.email));
    return {
      id: r.id,
      name: r.full_name,
      email: r.email,
      password: r.password,
      klass: r.class_name || b.class_name || '',
      school: b.school_name || '',
      schoolId: b.school_id || null,
      source: b.class_name === 'Single Student Registrations' ? 'Single student' : 'Bulk register',
      batchName: b.class_name || 'Registration batch',
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
  return NextResponse.json({ registrations: rows, count: rows.length });
}
