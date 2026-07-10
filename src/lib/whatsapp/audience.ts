import type { SupabaseClient } from '@supabase/supabase-js';
import { normalisePhone } from './send';

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
  const { data: students, error } = await admin.from('portal_users').select(`
    id, full_name, phone, whatsapp_opt_in,
    students(id, parent_phone, parent_name, phone)
  `).eq('class_id', classId).eq('role', 'student').or('is_active.eq.true,is_active.is.null');
  if (error) throw error;

  const normalizedStudents = (students ?? []).map((student: any) => ({
    ...student,
    studentRow: Array.isArray(student.students) ? student.students[0] : student.students,
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