import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

export const dynamic = 'force-dynamic';

function admin() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function fetchAll(q: any) {
  const out: any[] = []; let from = 0;
  for (;;) { const { data, error } = await q.range(from, from + 999); if (error || !data) break; out.push(...data); if (data.length < 1000) break; from += 1000; }
  return out;
}

const norm = (e?: string | null) => (e || '').trim().toLowerCase();

// GET /api/records — unified, source-tagged, school-scoped record sheet.
export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users').select('id, role, school_id, school_name').eq('id', user.id).single();
  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const sb = admin();

  // School scope: admin = all; school = own; teacher = assigned schools + own.
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
  const inScope = (schoolId?: string | null) => !scopeSchoolIds || (schoolId != null && scopeSchoolIds.includes(schoolId));

  // ── Pull the source tables ──
  const [users, leads, prospects, regResults] = await Promise.all([
    fetchAll(sb.from('portal_users').select('id, email, full_name, role, school_id, school_name, section_class, enrollment_type, is_active, created_at').neq('is_deleted', true)),
    fetchAll(sb.from('form_leads').select('id, email, response_data, child_current_school, school_id, status, match_status, submitted_at')),
    fetchAll(sb.from('prospective_students').select('id, full_name, email, parent_email, school_id, school_name, grade, course_interest, status, created_at').eq('is_deleted', false)),
    fetchAll(sb.from('registration_results').select('email, status')),
  ]);

  const leadEmails = new Set(leads.map((l: any) => norm(l.email)).filter(Boolean));
  const bulkEmails = new Set(regResults.filter((r: any) => ['created', 'success', 'registered'].includes(String(r.status || '').toLowerCase())).map((r: any) => norm(r.email)));
  const accountEmails = new Set(users.map((u: any) => norm(u.email)).filter(Boolean));

  const sourceFor = (u: any): string => {
    if (leadEmails.has(norm(u.email))) return 'Consent form';
    if (bulkEmails.has(norm(u.email))) return 'Bulk register';
    const et = String(u.enrollment_type || '').toLowerCase();
    if (et.includes('summer')) return 'Summer';
    if (et.includes('online')) return 'Online';
    if (et) return 'School';
    return 'Direct';
  };

  const records: any[] = [];

  // 1. Portal accounts (live source of truth).
  for (const u of users) {
    if (!inScope(u.school_id)) continue;
    const role = u.role ?? 'student';
    records.push({
      id: u.id,
      type: role.charAt(0).toUpperCase() + role.slice(1),
      name: u.full_name || '(no name)',
      email: u.email || '',
      school: u.school_name || '',
      klass: u.section_class || '',
      program: '',
      source: role === 'student' ? sourceFor(u) : '—',
      status: u.is_active === false ? 'Inactive' : 'Active',
      registered: u.created_at || null,
      href: role === 'student' ? `/dashboard/students?focus=${u.id}` : `/dashboard/directory`,
    });
  }

  // 2. Consent-form leads that have NOT become an account yet (pending registrations).
  for (const l of leads) {
    if (norm(l.email) && accountEmails.has(norm(l.email))) continue; // already an account
    if (!inScope(l.school_id)) continue;
    const rd = (l.response_data ?? {}) as Record<string, any>;
    records.push({
      id: l.id,
      type: 'Lead',
      name: rd.child_name || rd.parent_name || '(unnamed lead)',
      email: l.email || rd.parent_email || '',
      school: l.child_current_school || rd.child_current_school || '',
      klass: rd.child_class || '',
      program: rd.program_category || '',
      source: 'Consent form',
      status: l.match_status === 'approved' ? 'Matched' : (l.status || 'New'),
      registered: l.submitted_at || null,
      href: l.school_id ? `/dashboard/consent-forms` : `/dashboard/crm`,
    });
  }

  // 3. CRM prospects not yet an account and not already represented by a lead.
  for (const p of prospects) {
    const e = norm(p.email) || norm(p.parent_email);
    if (e && (accountEmails.has(e) || leadEmails.has(e))) continue;
    if (!inScope(p.school_id)) continue;
    records.push({
      id: p.id,
      type: 'Prospect',
      name: p.full_name || '(unnamed)',
      email: p.email || p.parent_email || '',
      school: p.school_name || '',
      klass: p.grade || '',
      program: p.course_interest || '',
      source: 'Prospect',
      status: p.status || 'Enquiry',
      registered: p.created_at || null,
      href: `/dashboard/crm`,
    });
  }

  // Newest first.
  records.sort((a, b) => String(b.registered || '').localeCompare(String(a.registered || '')));

  return NextResponse.json({ records, count: records.length, scope: profile.role });
}
