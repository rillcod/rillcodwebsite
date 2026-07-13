import { createAdminClient } from '@/lib/supabase/admin';
import {
  promoteBookLeadToPortalIfLinked,
  resolveCanonicalCrmContactId,
  upsertBookParent,
} from '@/lib/crm/contact-book';
import { insertCrmInteraction, upsertCrmPipeline } from '@/lib/crm/pipeline';
import { crmContactTypeFromRole } from '@/lib/crm/stages';

export async function harnessProspectToContactBook(prospectId: string, authUserId?: string | null) {
  const admin = createAdminClient();

  const { data: record, error: fetchErr } = await admin
    .from('prospective_students')
    .select('*')
    .eq('id', prospectId)
    .maybeSingle();

  if (fetchErr || !record) {
    console.error(`Failed to fetch prospective student ${prospectId} for contact book sync:`, fetchErr);
    return;
  }

  const notesStr = record.notes || '';
  const studentPhoneMatch = notesStr.match(/\[Student Phone:\s*([^\]]+)\]/i);
  const studentPhone = studentPhoneMatch ? studentPhoneMatch[1].trim() : null;
  const studentPhoneOrParentPhone = studentPhone || record.parent_phone || null;

  try {
    if (authUserId) {
      await upsertBookParent(admin, {
        fullName: record.full_name,
        email: record.email || record.parent_email || null,
        phone: studentPhoneOrParentPhone,
        schoolName: record.school_name || 'Direct / Special Programme',
        className: record.grade || null,
        source: 'special_program',
        lastChannel: 'portal',
        role: 'student',
        userId: authUserId,
      });
    }
  } catch (err) {
    console.error('Error during student contact book sync:', err);
  }

  let bookId: string | null = null;
  if (record.parent_email || record.parent_phone) {
    try {
      bookId = await upsertBookParent(admin, {
        fullName: record.parent_name || 'Parent/Guardian',
        email: record.parent_email,
        phone: record.parent_phone,
        schoolName: record.school_name || 'Direct / Special Programme',
        className: record.grade || null,
        source: 'special_program',
        lastChannel: 'portal',
        childEntry: {
          name: record.full_name,
          class: record.grade,
          program: 'Summer School 2026',
          school: record.school_name,
        },
      });
    } catch (err) {
      console.error('Error during parent contact book sync:', err);
    }
  }

  try {
    const promo = await promoteBookLeadToPortalIfLinked(admin, {
      bookId,
      email: record.parent_email,
      phone: record.parent_phone,
    });
    const canonical = promo.portalId
      ? { contactId: promo.portalId, kind: 'portal' as const }
      : await resolveCanonicalCrmContactId(admin, {
          email: record.parent_email,
          phone: record.parent_phone,
          bookId,
        });

    if (canonical.contactId) {
      const parentName = record.parent_name || 'Parent/Guardian';
      const contactType = crmContactTypeFromRole(canonical.kind === 'portal' ? 'parent' : 'form_lead');
      await upsertCrmPipeline(admin, {
        contactId: canonical.contactId,
        contactName: parentName,
        contactType,
        stage: 'won',
        promoteOnly: true,
      });
      await insertCrmInteraction(admin, {
        contactId: canonical.contactId,
        contactName: parentName,
        contactType,
        type: 'enrollment',
        direction: 'internal',
        content: `${record.full_name} onboarded as a student (${record.course_interest || 'programme'}). Account created and credentials sent.`,
      });
    }
  } catch (crmErr) {
    console.error('Error during CRM pipeline/interaction sync:', crmErr);
  }
}
