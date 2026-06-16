import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

function adminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function harnessProspectToContactBook(prospectId: string, authUserId?: string | null) {
  const admin = adminClient();

  // 1. Fetch prospective student record
  const { data: record, error: fetchErr } = await admin
    .from('prospective_students')
    .select('*')
    .eq('id', prospectId)
    .maybeSingle();

  if (fetchErr || !record) {
    console.error(`Failed to fetch prospective student ${prospectId} for contact book sync:`, fetchErr);
    return;
  }

  // Parse student phone if present in notes
  const notesStr = record.notes || '';
  const studentPhoneMatch = notesStr.match(/\[Student Phone:\s*([^\]]+)\]/i);
  const studentPhone = studentPhoneMatch ? studentPhoneMatch[1].trim() : null;
  const studentPhoneOrParentPhone = studentPhone || record.parent_phone || null;

  // 2. Student Contact in customer_contact_book
  try {
    if (authUserId) {
      const { error: studentBookErr } = await admin.from('customer_contact_book').upsert({
        user_id: authUserId,
        role: 'student',
        full_name: record.full_name,
        email: record.email || record.parent_email || null,
        phone: studentPhoneOrParentPhone,
        school_name: record.school_name || 'Direct / Summer School',
        class_name: record.grade || null,
        source: 'summer_school',
        last_channel: 'portal',
        confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

      if (studentBookErr) {
        console.error('Failed to upsert student contact book entry:', studentBookErr);
      }
    }
  } catch (err) {
    console.error('Error during student contact book sync:', err);
  }

  // 3. Parent Contact in customer_contact_book
  if (record.parent_email || record.parent_phone) {
    try {
      let existingParent: { id: string; metadata: any } | null = null;
      const normalizedParentEmail = record.parent_email?.trim().toLowerCase();
      const normalizedParentPhone = record.parent_phone?.replace(/\D/g, '') || null;

      // Search by email
      if (normalizedParentEmail) {
        const { data } = await admin
          .from('customer_contact_book')
          .select('id, metadata')
          .eq('email', normalizedParentEmail)
          .maybeSingle();
        existingParent = data;
      }
      // Search by phone if not found by email
      if (!existingParent && normalizedParentPhone) {
        const { data } = await admin
          .from('customer_contact_book')
          .select('id, metadata')
          .eq('phone', record.parent_phone!)
          .maybeSingle();
        existingParent = data;
      }

      const childEntry = { 
        name: record.full_name, 
        class: record.grade, 
        program: 'Summer School 2026', 
        school: record.school_name 
      };

      if (existingParent) {
        const meta = existingParent.metadata || {};
        const children = Array.isArray(meta.children) ? meta.children : [];
        const idx = children.findIndex((c: any) => String(c.name || '').toLowerCase() === record.full_name.toLowerCase());
        if (idx >= 0) children[idx] = { ...children[idx], ...childEntry };
        else children.push(childEntry);

        const { error: parentUpdateErr } = await admin
          .from('customer_contact_book')
          .update({
            full_name: record.parent_name || 'Parent/Guardian',
            email: record.parent_email || undefined,
            phone: record.parent_phone || undefined,
            updated_at: new Date().toISOString(),
            metadata: { ...meta, children },
          })
          .eq('id', existingParent.id);

        if (parentUpdateErr) {
          console.error('Failed to update parent contact book entry:', parentUpdateErr);
        }
      } else {
        const { error: parentInsertErr } = await admin
          .from('customer_contact_book')
          .insert({
            role: 'parent',
            full_name: record.parent_name || 'Parent/Guardian',
            email: record.parent_email || null,
            phone: record.parent_phone || null,
            school_name: record.school_name || 'Direct / Summer School',
            class_name: record.grade || null,
            source: 'summer_school',
            last_channel: 'portal',
            metadata: { children: [childEntry] },
            confirmed_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (parentInsertErr) {
          console.error('Failed to insert parent contact book entry:', parentInsertErr);
        }
      }
    } catch (err) {
      console.error('Error during parent contact book sync:', err);
    }
  }

  // ── CRM pipeline + interaction (parity with the consent-form flow) ──────────
  // Summer onboarding previously only wrote the contact book; now it also moves
  // the parent into the CRM pipeline ('enrolled') and logs an interaction, so
  // both onboarding sources produce a consistent CRM trail.
  try {
    const now = new Date().toISOString();
    const normalizedParentEmail = record.parent_email?.trim().toLowerCase() || null;
    let contactId: string | null = null;
    if (normalizedParentEmail) {
      const { data } = await admin.from('customer_contact_book').select('id').eq('email', normalizedParentEmail).maybeSingle();
      contactId = (data as any)?.id ?? null;
    }
    if (!contactId && record.parent_phone) {
      const { data } = await admin.from('customer_contact_book').select('id').eq('phone', record.parent_phone).maybeSingle();
      contactId = (data as any)?.id ?? null;
    }

    if (contactId) {
      const parentName = record.parent_name || 'Parent/Guardian';
      const { data: pipe } = await admin.from('crm_pipeline').select('id, stage').eq('contact_id', contactId).maybeSingle();
      if (pipe) {
        await admin.from('crm_pipeline').update({ stage: 'enrolled', contact_name: parentName, contact_type: 'form_lead', updated_at: now }).eq('contact_id', contactId);
      } else {
        await admin.from('crm_pipeline').insert({ contact_id: contactId, contact_name: parentName, contact_type: 'form_lead', stage: 'enrolled', created_at: now, updated_at: now });
      }
      await admin.from('crm_interactions').insert({
        contact_id: contactId,
        contact_name: parentName,
        contact_type: 'form_lead',
        type: 'enrollment',
        direction: 'internal',
        content: `${record.full_name} onboarded as a student (${record.course_interest || 'programme'}). Account created and credentials sent.`,
        created_at: now,
      });
    }
  } catch (crmErr) {
    console.error('Error during CRM pipeline/interaction sync:', crmErr);
  }
}
