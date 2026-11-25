import type { SupabaseClient } from '@supabase/supabase-js';
import { normalisePhone } from './send';
import { classifyStudentSessionStatus } from '@/lib/academic/session-scope';

export type ConsentCandidate = { userId: string; phone: string | null; optedIn: boolean; name?: string | null; source: 'parent' | 'student' | 'legacy_parent' };
export type WhatsAppAudienceRecipient = { studentId: string; recipientUserId: string; phone: string; recipientName: string | null; source: ConsentCandidate['source'] };

export function chooseConsentedRecipient(candidates: ConsentCandidate[], conversations: Map<string, { optedOut: boolean; optedInAt: string | null }>): ConsentCandidate | null {
  for (const candidate of candidates) {
    const phone = candidate.phone ? normalisePhone(candidate.phone) : '';
    if (phone.length < 10) continue;
    const conversation = conversations.get(phone);
    if (conversation?.optedOut) continue;
    const hasExactConsent = candidate.optedIn || (candidate.source === 'legacy_parent' && Boolean(conversation?.optedInAt));
    if (hasExactConsent) return { ...candidate, phone };
  }
  return null;
}

export async function resolveClassWhatsAppAudience(admin: SupabaseClient<any>, classId: string) {
  const [{ data: cls }, { data: students, error }, { data: rosterRows }] = await Promise.all([
    admin
      .from('classes')
      .select('id, academic_offerings:academic_offering_id(enrollment_type)')
      .eq('id', classId)
      .maybeSingle(),
    admin.from('portal_users').select(`
      id, full_name, phone, whatsapp_opt_in, is_active, created_at, metadata, enrollment_type,
      students!portal_users_student_id_fkey(id, parent_phone, parent_name, phone)
    `).eq('class_id', classId).eq('role', 'student').neq('is_deleted', true).or('is_active.eq.true,is_active.is.null'),
    (admin as any)
      .from('class_term_rosters')
      .select('student_id, status, term_id, started_at, reinstated_at, updated_at')
      .eq('class_id', classId),
  ]);
  if (error) throw error;

  const classEnrollmentType = (cls as any)?.academic_offerings?.enrollment_type ?? null;
  const latestRosterByStudent = new Map<string, any>();
  for (const r of (rosterRows ?? []) as any[]) {
    if (!r?.student_id) continue;
    const prev = latestRosterByStudent.get(r.student_id);
    const rMs = Date.parse(r.reinstated_at || r.updated_at || r.started_at || '') || 0;
    const pMs = Date.parse(prev?.reinstated_at || prev?.updated_at || prev?.started_at || '') || 0;
    if (!prev || rMs >= pMs) latestRosterByStudent.set(r.student_id, r);
  }

  const confirmedRaw = (students ?? []).filter((s: any) => {
    const ar = latestRosterByStudent.get(s.id) ?? null;
    if (ar && ['withdrawn', 'ended', 'removed', 'completed'].includes(String(ar.status ?? '').toLowerCase())) {
      return false;
    }
    const sessionStatus = classifyStudentSessionStatus(
      { is_active: s.is_active, created_at: s.created_at ?? null, metadata: s.metadata ?? null, enrollment_type: s.enrollment_type ?? null },
      ar ? { status: ar.status ?? null, term_id: ar.term_id ?? null, started_at: ar.reinstated_at ?? ar.started_at ?? null } : null,
      { classEnrollmentType },
    );
    return sessionStatus === 'confirmed_current';
  });

  // Also resolve shadow `students` rows by `user_id` for intake-created students whose `portal_users.student_id` FK is null
  const missingStudentRowUserIds = confirmedRaw
    .filter((s: any) => !(Array.isArray(s.students) ? s.students[0] : s.students))
    .map((s: any) => s.id);
  const shadowByUserId = new Map<string, any>();
  if (missingStudentRowUserIds.length > 0) {
    const { data: shadowRows } = await admin
      .from('students')
      .select('id, user_id, parent_phone, parent_name, phone')
      .in('user_id', missingStudentRowUserIds);
    for (const row of shadowRows ?? []) {
      if ((row as any).user_id) shadowByUserId.set((row as any).user_id, row);
    }
  }

  const normalizedStudents = confirmedRaw.map((student: any) => ({
    ...student,
    studentRow: (Array.isArray(student.students) ? student.students[0] : student.students) ?? shadowByUserId.get(student.id) ?? null,
  }));
  const studentRowIds = normalizedStudents.map((row: any) => row.studentRow?.id).filter(Boolean);
  const { data: links } = studentRowIds.length
    ? await admin.from('parent_student_links').select('student_id, parent_id').in('student_id', studentRowIds)
    : { data: [] as any[] };
  const parentIds = [...new Set((links ?? []).map((row: any) => row.parent_id).filter(Boolean))] as string[];
  const { data: parents } = parentIds.length
    ? await admin.from('portal_users').select('id, full_name, phone, whatsapp_opt_in').in('id', parentIds).eq('role', 'parent')
    : { data: [] as any[] };
  const parentMap = new Map((parents ?? []).map((row: any) => [row.id, row]));
  const linksByStudent = new Map<string, any[]>();
  for (const link of links ?? []) {
    const list = linksByStudent.get((link as any).student_id) ?? [];
    list.push(link); linksByStudent.set((link as any).student_id, list);
  }

  const allPhones = new Set<string>();
  for (const student of normalizedStudents) {
    if (student.phone) allPhones.add(normalisePhone(student.phone));
    if (student.studentRow?.phone) allPhones.add(normalisePhone(student.studentRow.phone));
    if (student.studentRow?.parent_phone) allPhones.add(normalisePhone(student.studentRow.parent_phone));
    for (const link of linksByStudent.get(student.studentRow?.id) ?? []) {
      const parent = parentMap.get(link.parent_id);
      if (parent?.phone) allPhones.add(normalisePhone(parent.phone));
    }
  }
  const phones = [...allPhones].filter((phone) => phone.length >= 10);
  const { data: conversationRows } = phones.length
    ? await admin.from('whatsapp_conversations').select('phone_number, opted_out, opted_in_at').in('phone_number', phones)
    : { data: [] as any[] };
  const conversations = new Map<string, { optedOut: boolean; optedInAt: string | null }>();
  for (const row of conversationRows ?? []) conversations.set(normalisePhone((row as any).phone_number), { optedOut: Boolean((row as any).opted_out), optedInAt: (row as any).opted_in_at ?? null });

  const recipients: WhatsAppAudienceRecipient[] = [];
  const whatsappCoveredStudentIds: string[] = [];
  const fallbackStudentIds: string[] = [];
  const usedPhones = new Set<string>();
  for (const student of normalizedStudents) {
    const candidates: ConsentCandidate[] = [];
    for (const link of linksByStudent.get(student.studentRow?.id) ?? []) {
      const parent = parentMap.get(link.parent_id);
      if (parent) candidates.push({ userId: parent.id, phone: parent.phone, optedIn: parent.whatsapp_opt_in === true, name: parent.full_name, source: 'parent' });
    }
    candidates.push({ userId: student.id, phone: student.phone || student.studentRow?.phone, optedIn: student.whatsapp_opt_in === true, name: student.full_name, source: 'student' });
    candidates.push({ userId: student.id, phone: student.studentRow?.parent_phone, optedIn: false, name: student.studentRow?.parent_name, source: 'legacy_parent' });
    const chosen = chooseConsentedRecipient(candidates, conversations);
    if (!chosen?.phone) { fallbackStudentIds.push(student.id); continue; }
    const phone = normalisePhone(chosen.phone);
    whatsappCoveredStudentIds.push(student.id);
    if (usedPhones.has(phone)) continue;
    usedPhones.add(phone);
    recipients.push({ studentId: student.id, recipientUserId: chosen.userId, phone, recipientName: chosen.name ?? null, source: chosen.source });
  }
  return { totalStudents: normalizedStudents.length, recipients, whatsappCoveredStudentIds, fallbackStudentIds };
}