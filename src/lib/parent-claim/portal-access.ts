import type { SupabaseClient } from '@supabase/supabase-js';
import { accessCardCodeForStudent } from '@/lib/access-card-code';
import { isParentCaptured } from '@/lib/parent-claim/captured';
import { deliverResultCheckerCredentials, type CredentialDelivery } from '@/lib/parent-claim/deliver-credentials';

type AnySupabase = SupabaseClient<any>;

export type PortalAccessInfo = {
  parentId: string;
  parentEmail: string;
  studentEmail: string | null;
  parentLoginUrl: string;
  studentLoginUrl: string | null;
};

function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://www.rillcod.com').replace(/\/$/, '');
}

function loginUrl(type: 'parent' | 'student', email: string, password?: string | null) {
  const base = `${appBaseUrl()}/login?type=${type}&email=${encodeURIComponent(email)}`;
  return password ? `${base}&pw=${encodeURIComponent(password)}` : base;
}

/** Login shortcuts for a child whose parent is already linked (re-scan — no temp password). */
export async function resolveLinkedPortalAccess(
  admin: AnySupabase,
  studentUserId: string,
): Promise<PortalAccessInfo | null> {
  if (!(await isParentCaptured(admin, studentUserId))) return null;

  const { data: sRow } = await admin.from('students').select('id').eq('user_id', studentUserId).maybeSingle();
  if (!sRow?.id) return null;

  const { data: link } = await admin
    .from('parent_student_links')
    .select('parent_id')
    .eq('student_id', sRow.id)
    .limit(1)
    .maybeSingle();
  if (!link?.parent_id) return null;

  const [{ data: parentPU }, { data: studentPU }] = await Promise.all([
    admin.from('portal_users').select('id, email, full_name, phone').eq('id', link.parent_id).maybeSingle(),
    admin.from('portal_users').select('email, full_name').eq('id', studentUserId).maybeSingle(),
  ]);

  if (!parentPU?.email) return null;

  return {
    parentId: parentPU.id,
    parentEmail: parentPU.email,
    studentEmail: studentPU?.email ?? null,
    parentLoginUrl: loginUrl('parent', parentPU.email),
    studentLoginUrl: studentPU?.email ? loginUrl('student', studentPU.email) : null,
  };
}

/**
 * Re-send portal logins after a valid scan + linked parent email match.
 * Issues fresh temp passwords for never-signed-in accounts (same policy as initial claim).
 */
export async function resendPortalLoginsForScan(
  admin: AnySupabase,
  input: {
    studentUserId: string;
    parentEmail: string;
    accessAuthorized: boolean;
  },
): Promise<{ ok: boolean; error?: string; status?: number; credentials?: CredentialDelivery }> {
  if (!input.accessAuthorized) {
    return { ok: false, status: 403, error: 'Invalid scan code.' };
  }

  const access = await resolveLinkedPortalAccess(admin, input.studentUserId);
  if (!access) {
    return { ok: false, status: 403, error: 'Link your parent account first using the form below.' };
  }

  const email = input.parentEmail.trim().toLowerCase();
  if (email !== access.parentEmail.trim().toLowerCase()) {
    return { ok: false, status: 403, error: 'Email does not match the linked parent account.' };
  }

  const { data: parentPU } = await admin
    .from('portal_users')
    .select('full_name, phone')
    .eq('id', access.parentId)
    .maybeSingle();
  const { data: studentPU } = await admin
    .from('portal_users')
    .select('full_name, school_name')
    .eq('id', input.studentUserId)
    .maybeSingle();

  const credentials = await deliverResultCheckerCredentials(admin, {
    parentId: access.parentId,
    studentUserId: input.studentUserId,
    parentEmail: access.parentEmail,
    parentPhone: parentPU?.phone ?? null,
    parentName: parentPU?.full_name ?? 'Parent',
    childName: studentPU?.full_name ?? null,
    schoolName: studentPU?.school_name ?? null,
    newParentPassword: null,
  });

  return { ok: true, credentials };
}

export type UnlinkedStudentRow = {
  studentUserId: string;
  studentRowId: string;
  fullName: string;
  schoolName: string | null;
  className: string | null;
  parentEmail: string | null;
  parentPhone: string | null;
  scanCode: string;
  scanUrl: string;
};

/** Students with a portal account but no verified parent_student_links row. */
export async function listUnlinkedStudents(
  admin: AnySupabase,
  opts: { schoolId?: string | null; schoolName?: string | null; limit?: number },
): Promise<UnlinkedStudentRow[]> {
  const limit = Math.min(500, opts.limit ?? 200);
  let query = admin
    .from('students')
    .select('id, user_id, full_name, school_name, school_id, current_class, section_class, grade_level, parent_email, parent_phone')
    .not('user_id', 'is', null)
    .order('full_name')
    .limit(limit * 3);

  if (opts.schoolId) query = query.eq('school_id', opts.schoolId);
  else if (opts.schoolName) query = query.ilike('school_name', opts.schoolName);

  const { data: students } = await query;
  if (!students?.length) return [];

  const studentRowIds = students.map(s => s.id);
  const { data: links } = await admin
    .from('parent_student_links')
    .select('student_id')
    .in('student_id', studentRowIds);

  const linked = new Set((links ?? []).map(l => l.student_id));
  const appUrl = appBaseUrl();

  return students
    .filter(s => s.user_id && !linked.has(s.id))
    .slice(0, limit)
    .map(s => {
      const code = accessCardCodeForStudent(s.user_id!);
      return {
        studentUserId: s.user_id!,
        studentRowId: s.id,
        fullName: s.full_name ?? 'Student',
        schoolName: s.school_name ?? null,
        className: s.current_class ?? s.section_class ?? s.grade_level ?? null,
        parentEmail: s.parent_email ?? null,
        parentPhone: s.parent_phone ?? null,
        scanCode: code,
        scanUrl: `${appUrl}/result-check/${encodeURIComponent(code)}`,
      };
    });
}

/** Email + optional WhatsApp invite to scan QR and self-link (staff backfill). */
export async function sendUnlinkedParentInvite(
  admin: AnySupabase,
  row: UnlinkedStudentRow,
): Promise<{ email: boolean; whatsapp: boolean }> {
  const sent = { email: false, whatsapp: false };
  if (!row.parentEmail) return sent;

  const { notificationsService } = await import('@/services/notifications.service');
  const { sendWhatsApp } = await import('@/lib/whatsapp/send');
  const { buildRillcodTransactionalEmailHtml } = await import('@/lib/email/rillcod-transactional-email');

  const html = buildRillcodTransactionalEmailHtml({
    eyebrow: 'Link your parent account',
    title: `Results & portal access — ${row.fullName}`,
    bodyHtml: `
      <p style="margin:0 0 14px;font-size:15px;color:#d4d4d8;">
        Your child's school results are ready on Rillcod. Scan or tap the link below to link your parent account,
        view results, and receive parent + student portal logins.
      </p>
      <p style="margin:0;font-size:13px;color:#a1a1aa;"><strong style="color:#fff;">Child:</strong> ${row.fullName}${row.className ? ` · ${row.className}` : ''}${row.schoolName ? ` · ${row.schoolName}` : ''}</p>
    `,
    cta: { href: row.scanUrl, label: 'Link my account & view result', color: '#10b981' },
    footerNote: 'Rillcod Technologies · +234 811 660 0091',
  });

  try {
    await notificationsService.sendExternalEmail({
      to: row.parentEmail,
      subject: `Link your parent account — ${row.fullName}`,
      html,
      fromName: row.schoolName ? `${row.schoolName} via Rillcod` : 'Rillcod Technologies',
      fromEmail: 'support@rillcod.com',
    });
    sent.email = true;
  } catch (err) {
    console.error('[sendUnlinkedParentInvite] email failed:', err);
  }

  if (row.parentPhone) {
    try {
      const msg = [
        `Hello! ${row.fullName}'s school result is on Rillcod.`,
        `Tap to link your parent account and get portal logins:`,
        row.scanUrl,
      ].join('\n');
      sent.whatsapp = await sendWhatsApp(row.parentPhone, msg);
    } catch (err) {
      console.error('[sendUnlinkedParentInvite] whatsapp failed:', err);
    }
  }

  return sent;
}
