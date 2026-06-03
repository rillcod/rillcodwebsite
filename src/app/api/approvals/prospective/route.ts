import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Caller = { role: string; id: string; school_id: string | null };

async function getCaller(): Promise<Caller | null> {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users').select('role, id, school_id').eq('id', user.id).single();
  if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) return null;
  return caller as Caller;
}

// POST /api/approvals/prospective
// Body: { id: string; action: 'approved' | 'rejected' }
// School boundary: non-admin callers can only action records from their own school.
export async function POST(request: NextRequest) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

    const { id, action } = await request.json();
    if (!id || !['approved', 'rejected'].includes(action)) {
      return NextResponse.json({ error: 'id and valid action required' }, { status: 400 });
    }

    const admin = adminClient();

    // Fetch the prospective student to check existence and school boundary
    const { data: record } = await admin
      .from('prospective_students')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!record) return NextResponse.json({ error: 'Prospective student not found' }, { status: 404 });

    // School boundary: non-admin may only action records from their own school
    if (caller.role !== 'admin' && record.school_id && record.school_id !== caller.school_id) {
      return NextResponse.json(
        { error: 'Access denied: this record belongs to a different school' },
        { status: 403 },
      );
    }

    if (action === 'rejected') {
      const { error } = await admin
        .from('prospective_students')
        .update({ is_deleted: true, is_active: false })
        .eq('id', id);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // ── Approval path ──
    if (record.status === 'unpaid') {
      return NextResponse.json(
        { error: 'Cannot approve: applicant has not completed online payment. Reject the record or ask them to finish checkout.' },
        { status: 400 },
      );
    }

    const loginEmail = record.email || record.parent_email;
    if (!loginEmail) {
      return NextResponse.json({ error: 'Applicant has no email to create an account' }, { status: 400 });
    }

    const password = crypto.randomBytes(8).toString('base64url').slice(0, 10);
    const normalizedEmail = loginEmail.trim().toLowerCase();
    let authUserId: string | null = null;

    // Parse student phone if present in notes
    const notesStr = record.notes || '';
    const studentPhoneMatch = notesStr.match(/\[Student Phone:\s*([^\]]+)\]/i);
    const studentPhone = studentPhoneMatch ? studentPhoneMatch[1].trim() : null;
    const studentPhoneOrParentPhone = studentPhone || record.parent_phone || null;

    // Check portal_users by email first
    const { data: existingPortal } = await admin
      .from('portal_users')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existingPortal) {
      // Update existing portal user
      const { error: updateErr } = await admin.from('portal_users').update({
        role: 'student',
        full_name: record.full_name,
        school_name: record.school_name || 'Direct / Summer School',
        school_id: record.school_id || null,
        class_id: null,
        date_of_birth: record.age ? `${new Date().getFullYear() - record.age}-01-01` : null,
        section_class: record.grade || null,
        is_active: true,
        enrollment_type: 'summer_school',
        phone: studentPhoneOrParentPhone,
        updated_at: new Date().toISOString(),
      }).eq('id', existingPortal.id);

      if (updateErr) {
        return NextResponse.json({ error: `Failed to link portal account: ${updateErr.message}` }, { status: 500 });
      }

      // Update auth user with new password & metadata
      await admin.auth.admin.updateUserById(existingPortal.id, {
        password,
        user_metadata: { full_name: record.full_name, role: 'student' },
      });

      authUserId = existingPortal.id;
    } else {
      // Create new auth user
      const { data: authData, error: authErr } = await admin.auth.admin.createUser({
        email: loginEmail,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: record.full_name,
          role: 'student',
        },
      });

      if (authErr) {
        if (!authErr.message.includes('already been registered') && !authErr.message.includes('already exists')) {
          return NextResponse.json({ error: `Auth creation failed: ${authErr.message}` }, { status: 500 });
        }
        const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 });
        const existing = listData?.users?.find(
          u => u.email?.trim().toLowerCase() === normalizedEmail
        );
        if (existing) {
          authUserId = existing.id;
          await admin.auth.admin.updateUserById(authUserId, {
            password,
            user_metadata: { full_name: record.full_name, role: 'student' },
          });
        }
      } else {
        authUserId = authData?.user?.id ?? null;
      }

      if (!authUserId) {
        return NextResponse.json({ error: 'Could not resolve auth user ID' }, { status: 500 });
      }

      // Upsert portal_users row
      const { error: portalErr } = await admin.from('portal_users').upsert({
        id: authUserId,
        email: normalizedEmail,
        full_name: record.full_name,
        role: 'student',
        school_name: record.school_name || 'Direct / Summer School',
        school_id: record.school_id || null,
        class_id: null,
        date_of_birth: record.age ? `${new Date().getFullYear() - record.age}-01-01` : null,
        section_class: record.grade || null,
        is_active: true,
        enrollment_type: 'summer_school',
        phone: studentPhoneOrParentPhone,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      if (portalErr) {
        return NextResponse.json({ error: `Portal account synchronization failed: ${portalErr.message}` }, { status: 500 });
      }
    }

    // Check if student record already exists in students table
    const { data: existingStudent } = await admin
      .from('students')
      .select('id')
      .eq('user_id', authUserId)
      .maybeSingle();

    const studentPayload = {
      full_name: record.full_name,
      name: record.full_name,
      email: record.email || record.parent_email,
      student_email: record.email || null,
      parent_name: record.parent_name,
      parent_email: record.parent_email,
      parent_phone: record.parent_phone,
      phone: studentPhoneOrParentPhone,
      age: record.age,
      gender: record.gender,
      grade: record.grade,
      grade_level: record.grade,
      current_class: record.grade,
      school_id: record.school_id || null,
      school_name: record.school_name || 'Direct / Summer School',
      course_interest: record.course_interest || 'Summer School 2026',
      preferred_schedule: record.preferred_schedule,
      enrollment_type: 'summer_school',
      status: 'approved',
      is_active: true,
      is_deleted: false,
      user_id: authUserId,
      approved_by: caller.id,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (existingStudent) {
      await admin.from('students').update(studentPayload).eq('id', existingStudent.id);
    } else {
      await admin.from('students').insert({
        ...studentPayload,
        created_at: new Date().toISOString(),
      });
    }

    // Mark prospective student active
    const isInstallmentPlan = (record.notes || '').includes('[Plan: installment]');
    const { error: prospectiveErr } = await admin
      .from('prospective_students')
      .update({
        is_active: true,
        status: isInstallmentPlan ? 'partially_paid' : 'paid',
      })
      .eq('id', id);

    if (prospectiveErr) {
      console.error('Failed to update prospective_students row status:', prospectiveErr);
    }

    // Sync to CRM Contact Book
    try {
      const { harnessProspectToContactBook } = await import('@/lib/crm/sync-prospect');
      await harnessProspectToContactBook(id, authUserId);
    } catch (syncErr) {
      console.error('Failed to sync approved summer student to CRM contact book:', syncErr);
    }

    // Send email to parent on manual approval
    try {
      const { notificationsService } = await import('@/services/notifications.service');
      const { buildRillcodTransactionalEmailHtml } = await import('@/lib/email/rillcod-transactional-email');
      
      const parentHtml = buildRillcodTransactionalEmailHtml({
        eyebrow: 'Admissions',
        title: 'Summer School Enrolment Approved',
        bodyHtml: `<p style="margin:0 0 10px;">We have verified your bank transfer payment. We are happy to confirm your child's seat in the Rillcod AI Summer School 2026!</p>
                   <p style="margin:0 0 10px;">An academy portal student account has been successfully configured. They can log in to begin their learning journey.</p>
                   ${isInstallmentPlan ? `<p style="margin:0 0 10px;color:#92400e;"><strong>Installment note:</strong> Your deposit has been verified. The remaining balance is due by week 3. <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://www.rillcod.com'}/summer-school/pay-balance?email=${encodeURIComponent(loginEmail)}" style="color:#2563eb;">Pay balance online →</a></p>` : ''}
                   <div style="margin:20px 0;padding:15px;background-color:#f4f4f5;border:1px solid #e4e4e7;border-radius:8px;">
                     <h4 style="margin:0 0 10px;color:#18181b;">Portal Access Credentials</h4>
                     <p style="margin:8px 0;font-size:14px;color:#18181b;font-family:monospace;"><strong>Email (Username):</strong> ${loginEmail}</p>
                     <p style="margin:8px 0;font-size:14px;color:#18181b;font-family:monospace;"><strong>Temporary Password:</strong> ${password}</p>
                     <p style="margin:5px 0 0;font-size:12px;color:#a1a1aa;">Please log in at <a href="https://www.rillcod.com/login" style="color:#2563eb;">rillcod.com/login</a> to access class materials. You may change this password in the student profile settings.</p>
                   </div>`,
        summaryRows: [
          { label: 'Student', value: record.full_name },
          { label: 'Tuition Plan', value: record.notes?.includes('[Plan: installment]') ? 'Installment Deposit' : 'Full Tuition' },
          { label: 'Status', value: 'Active / Onboarded' }
        ],
        footerNote: 'rillcod technologies limited • summer school admissions'
      });

      await notificationsService.sendExternalEmail({
        to: loginEmail,
        subject: `Admission Confirmed — Rillcod AI Summer School 2026`,
        fromName: 'Rillcod Technologies',
        fromEmail: 'support@rillcod.com',
        html: parentHtml,
      });
    } catch (mailErr) {
      console.error('Failed to send onboarding email on manual approval:', mailErr);
    }

    return NextResponse.json({
      success: true,
      credentials: { email: loginEmail, password },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

