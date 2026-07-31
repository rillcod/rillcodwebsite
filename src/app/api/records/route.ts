import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { isTeacherIsolationOn } from '@/lib/server/teacher-scope';
import { getTeacherClassScope } from '@/lib/server/teacher-class-scope';
import { programLabel } from '@/lib/consent/onboard-lead-children';
import { RESULT_INTAKE_FORM_TYPE } from '@/lib/parent-claim/intake-form';

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

function formatProgram(raw?: string | null): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  return programLabel(s) || s;
}

function isQrClaimLead(rd: Record<string, any>, formType?: string | null, matchNotes?: string | null): boolean {
  if (formType === RESULT_INTAKE_FORM_TYPE) return true;
  const src = String(rd.source || rd.intake_channel || '').toLowerCase();
  if (src.includes('result_checker') || src.includes('parent_qr') || src.includes('result_scan')) return true;
  const notes = String(matchNotes || '').toLowerCase();
  return notes.includes('result') && (notes.includes('scan') || notes.includes('id-card') || notes.includes('qr'));
}

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
  let visibleStudentIds: Set<string> | null = null;
  if (profile.role === 'teacher' && await isTeacherIsolationOn(sb)) {
    const classScope = await getTeacherClassScope(sb, user.id, profile.school_id);
    visibleStudentIds = new Set<string>();
    if (classScope.classIds.length > 0) {
      const { data: classStudents } = await sb.from('portal_users').select('id').eq('role', 'student').in('class_id', classScope.classIds);
      for (const row of classStudents ?? []) visibleStudentIds.add(row.id);
    }
    if (classScope.classNames.length > 0) {
      const { data: sectionStudents } = await sb.from('portal_users').select('id').eq('role', 'student').is('class_id', null)
        .in('school_id', classScope.assignedSchoolIds).in('section_class', classScope.classNames);
      for (const row of sectionStudents ?? []) visibleStudentIds.add(row.id);
    }
    const { data: authored } = await sb.from('student_progress_reports').select('student_id').eq('teacher_id', user.id);
    for (const row of authored ?? []) if (row.student_id) visibleStudentIds.add(row.student_id);
  }
  if (scopeSchoolIds && scopeSchoolIds.length === 0) {
    return NextResponse.json({ records: [], count: 0, scope: profile.role });
  }

  // ── Pull the source tables ──
  let usersQuery = sb
    .from('portal_users')
    .select('id, email, full_name, role, school_id, school_name, section_class, grade, enrollment_type, is_active, created_at')
    .neq('is_deleted', true);
  let leadsQuery = sb
    .from('form_leads')
    .select('id, email, response_data, child_current_school, school_id, status, match_status, match_notes, matched_student_id, matched_parent_id, matched_school_id, form_id, submitted_at');
  let prospectsQuery = sb
    .from('prospective_students')
    .select('id, full_name, email, parent_email, school_id, school_name, grade, course_interest, status, created_at')
    .eq('is_deleted', false);

  if (scopeSchoolIds) {
    usersQuery = usersQuery.in('school_id', scopeSchoolIds);
    leadsQuery = leadsQuery.in('school_id', scopeSchoolIds);
    prospectsQuery = prospectsQuery.in('school_id', scopeSchoolIds);
  }

  const [users, leads, prospects, regResults, childLinks, forms, studentRows, enrollments] = await Promise.all([
    fetchAll(usersQuery),
    fetchAll(leadsQuery),
    fetchAll(prospectsQuery),
    fetchAll(sb.from('registration_results').select('email, status').in('status', ['created', 'updated', 'success', 'registered'])),
    fetchAll(sb.from('form_lead_child_links').select('lead_id, student_portal_user_id, source, link_status:status')),
    fetchAll(sb.from('consent_forms').select('id, form_type, title, school_id')),
    fetchAll(sb.from('students').select('user_id, course_interest, school_id, school_name').not('user_id', 'is', null)),
    fetchAll(sb.from('enrollments').select('user_id, program_id, status').eq('status', 'active')),
  ]);

  const formById = new Map((forms as any[]).map((f) => [f.id, f]));
  const schoolIdsNeeded = new Set<string>();
  for (const l of leads as any[]) {
    if (l.school_id) schoolIdsNeeded.add(l.school_id);
    if (l.matched_school_id) schoolIdsNeeded.add(l.matched_school_id);
  }
  for (const u of users as any[]) if (u.school_id) schoolIdsNeeded.add(u.school_id);
  const schoolNameById = new Map<string, string>();
  if (schoolIdsNeeded.size) {
    const ids = [...schoolIdsNeeded];
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await sb.from('schools').select('id, name').in('id', ids.slice(i, i + 100));
      for (const s of data ?? []) schoolNameById.set(s.id, s.name);
    }
  }

  const programIds = [...new Set((enrollments as any[]).map((e) => e.program_id).filter(Boolean))];
  const programNameById = new Map<string, string>();
  if (programIds.length) {
    for (let i = 0; i < programIds.length; i += 100) {
      const { data } = await sb.from('programs').select('id, name').in('id', programIds.slice(i, i + 100));
      for (const p of data ?? []) programNameById.set(p.id, p.name);
    }
  }

  const programByUserId = new Map<string, string>();
  for (const e of enrollments as any[]) {
    if (!e.user_id || !e.program_id) continue;
    const name = programNameById.get(e.program_id);
    if (!name) continue;
    const prev = programByUserId.get(e.user_id);
    programByUserId.set(e.user_id, prev ? `${prev}; ${name}` : name);
  }
  for (const s of studentRows as any[]) {
    if (!s.user_id || !s.course_interest) continue;
    if (!programByUserId.has(s.user_id)) {
      programByUserId.set(s.user_id, formatProgram(s.course_interest));
    }
  }

  type LeadMeta = {
    source: 'QR Claim' | 'Consent form';
    program: string;
    school: string;
    schoolId: string | null;
    parentId: string | null;
  };
  const metaByStudentId = new Map<string, LeadMeta>();
  const metaByParentId = new Map<string, LeadMeta>();
  const leadEmails = new Set((leads as any[]).map((l) => norm(l.email)).filter(Boolean));
  const bulkEmails = new Set((regResults as any[]).map((r) => norm(r.email)).filter(Boolean));
  const accountEmails = new Set((users as any[]).map((u) => norm(u.email)).filter(Boolean));

  const remember = (studentId: string | null | undefined, meta: LeadMeta) => {
    if (!studentId) return;
    const prior = metaByStudentId.get(studentId);
    // QR Claim wins over Consent form when both exist.
    if (prior?.source === 'QR Claim' && meta.source === 'Consent form') return;
    metaByStudentId.set(studentId, {
      source: meta.source,
      program: meta.program || prior?.program || '',
      school: meta.school || prior?.school || '',
      schoolId: meta.schoolId || prior?.schoolId || null,
      parentId: meta.parentId || prior?.parentId || null,
    });
  };

  for (const l of leads as any[]) {
    const rd = (l.response_data ?? {}) as Record<string, any>;
    const form = formById.get(l.form_id);
    const qr = isQrClaimLead(rd, form?.form_type, l.match_notes);
    const schoolId = l.matched_school_id || l.school_id || form?.school_id || null;
    const school =
      String(rd.school_name || rd.child_current_school || l.child_current_school || '').trim()
      || (schoolId ? schoolNameById.get(schoolId) || '' : '')
      || '';
    const program = formatProgram(rd.program_category || rd.course_interest || '');
    const meta: LeadMeta = {
      source: qr ? 'QR Claim' : 'Consent form',
      program,
      school,
      schoolId,
      parentId: l.matched_parent_id || null,
    };
    remember(l.matched_student_id, meta);
    if (l.matched_parent_id) {
      const prior = metaByParentId.get(l.matched_parent_id);
      if (!prior || (meta.source === 'QR Claim' && prior.source !== 'QR Claim')) {
        metaByParentId.set(l.matched_parent_id, meta);
      }
    }
  }

  for (const link of childLinks as any[]) {
    const lead = (leads as any[]).find((l) => l.id === link.lead_id);
    if (!lead || !link.student_portal_user_id) continue;
    const rd = (lead.response_data ?? {}) as Record<string, any>;
    const form = formById.get(lead.form_id);
    const qr = isQrClaimLead(rd, form?.form_type, lead.match_notes)
      || String(link.source || '').toLowerCase().includes('result_scan');
    const schoolId = lead.matched_school_id || lead.school_id || form?.school_id || null;
    const school =
      String(rd.school_name || rd.child_current_school || lead.child_current_school || '').trim()
      || (schoolId ? schoolNameById.get(schoolId) || '' : '')
      || '';
    remember(link.student_portal_user_id, {
      source: qr ? 'QR Claim' : 'Consent form',
      program: formatProgram(rd.program_category || rd.course_interest || ''),
      school,
      schoolId,
      parentId: lead.matched_parent_id || null,
    });
  }

  const sourceFor = (u: any): string => {
    const fromLead = metaByStudentId.get(u.id);
    if (fromLead?.source) return fromLead.source;
    if (u.role === 'parent') {
      const fromParent = metaByParentId.get(u.id);
      if (fromParent?.source) return fromParent.source;
    }
    if (bulkEmails.has(norm(u.email))) return 'Bulk register';
    // Legacy email match (parent email on lead vs student login is uncommon)
    if (leadEmails.has(norm(u.email))) return 'Consent form';
    const et = String(u.enrollment_type || '').toLowerCase();
    if (et.includes('summer')) return 'Summer';
    if (et.includes('online')) return 'Online';
    if (et) return 'School';
    return 'Direct';
  };

  const records: any[] = [];

  // 1. Portal accounts (live source of truth).
  for (const u of users as any[]) {
    if (visibleStudentIds && u.role === 'student' && !visibleStudentIds.has(u.id)) continue;

    if (u.role === 'parent') {
      const parentMeta = metaByParentId.get(u.id);
      const parentInScope =
        !scopeSchoolIds
        || inScope(u.school_id)
        || (parentMeta?.schoolId != null && inScope(parentMeta.schoolId));
      if (!parentInScope) continue;
    } else if (!inScope(u.school_id)) {
      continue;
    }

    const role = u.role ?? 'student';
    const leadMeta = role === 'student' ? metaByStudentId.get(u.id) : metaByParentId.get(u.id);
    const studentRow = (studentRows as any[]).find((s) => s.user_id === u.id);
    const school =
      leadMeta?.school
      || u.school_name
      || studentRow?.school_name
      || (u.school_id ? schoolNameById.get(u.school_id) : '')
      || '';
    const program = role === 'student'
      ? (programByUserId.get(u.id) || leadMeta?.program || '')
      : '';

    records.push({
      id: u.id,
      type: role.charAt(0).toUpperCase() + role.slice(1),
      name: u.full_name || '(no name)',
      email: u.email || '',
      school,
      // Prefer specific grade; fall back to section/cohort only when grade is missing.
      klass: u.grade || u.section_class || '',
      program,
      source: role === 'student' || role === 'parent' ? sourceFor(u) : '—',
      status: u.is_active === false ? 'Inactive' : 'Active',
      registered: u.created_at || null,
      href: role === 'student' ? `/dashboard/students?focus=${u.id}` : `/dashboard/directory`,
    });
  }

  // 2. Consent-form / QR leads that have NOT become an account yet (pending registrations).
  const crmHref = profile.role === 'admin' ? '/dashboard/office?workspace=crm' : '/dashboard/crm';
  for (const l of leads as any[]) {
    if (norm(l.email) && accountEmails.has(norm(l.email))) continue; // already an account
    if (l.matched_student_id && (users as any[]).some((u) => u.id === l.matched_student_id)) continue;
    if (!inScope(l.school_id) && !inScope(l.matched_school_id)) continue;
    const rd = (l.response_data ?? {}) as Record<string, any>;
    const form = formById.get(l.form_id);
    const qr = isQrClaimLead(rd, form?.form_type, l.match_notes);
    const schoolId = l.matched_school_id || l.school_id || null;
    const school =
      String(rd.school_name || rd.child_current_school || l.child_current_school || '').trim()
      || (schoolId ? schoolNameById.get(schoolId) || '' : '')
      || '';
    records.push({
      id: l.id,
      type: 'Lead',
      name: rd.child_name || rd.parent_name || '(unnamed lead)',
      email: l.email || rd.parent_email || '',
      school,
      klass: rd.child_class || '',
      program: formatProgram(rd.program_category || rd.course_interest || ''),
      source: qr ? 'QR Claim' : 'Consent form',
      status: l.match_status === 'approved' ? 'Matched' : (l.status || 'New'),
      registered: l.submitted_at || null,
      href: qr ? `/dashboard/parent-claims` : (l.school_id ? `/dashboard/consent-forms` : crmHref),
    });
  }

  // 3. CRM prospects not yet an account and not already represented by a lead.
  for (const p of prospects as any[]) {
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
      program: formatProgram(p.course_interest || ''),
      source: 'Prospect',
      status: p.status || 'Enquiry',
      registered: p.created_at || null,
      href: crmHref,
    });
  }

  // Newest first.
  records.sort((a, b) => String(b.registered || '').localeCompare(String(a.registered || '')));

  return NextResponse.json({ records, count: records.length, scope: profile.role });
}
