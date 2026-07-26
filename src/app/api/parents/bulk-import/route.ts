import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isParentLinkConflict, syncExplicitParentStudentLink } from '@/lib/parents/links';
import { findOrCreateParentPortal } from '@/lib/parents/provision';

async function requireStaff(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 };
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('portal_users')
    .select('id, role, school_name')
    .eq('id', user.id)
    .single();
  if (!profile || !['admin', 'teacher'].includes(profile.role)) {
    return { error: 'Forbidden', status: 403 };
  }
  return { profile };
}


// POST — Bulk import parents
// Body: { rows: Array<{ full_name, email, phone?, student_name?, relationship?, school_id? }> }
// Parents must resolve to a school via linked student or explicit school_id.
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const guard = await requireStaff(supabase);
    if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: (guard as any).status });

    const { rows } = await req.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
    }
    if (rows.length > 200) {
      return NextResponse.json({ error: 'Max 200 rows per import' }, { status: 400 });
    }

    const admin = createAdminClient();
    const results: { email: string; status: 'created' | 'skipped' | 'error'; message?: string; password?: string }[] = [];

    for (const row of rows) {
      const email = (row.email ?? '').trim().toLowerCase();
      const full_name = (row.full_name ?? '').trim();
      const phone = (row.phone ?? '').trim() || null;
      const relationship = (row.relationship ?? 'Guardian').trim();
      const explicitSchoolId = (row.school_id ?? '').trim() || null;

      if (!email || !full_name) {
        results.push({ email: email || '(blank)', status: 'error', message: 'Missing email or name' });
        continue;
      }
      const { isValidParentPhone, PARENT_PHONE_REQUIRED_MSG } = await import('@/lib/parents/contact');
      if (!isValidParentPhone(phone)) {
        results.push({ email, status: 'error', message: PARENT_PHONE_REQUIRED_MSG });
        continue;
      }

      try {
        // Resolve school from student link first, then explicit school_id.
        let parentSchoolId: string | null = explicitSchoolId;
        let parentSchoolName: string | null = null;
        let linkedStudentId: string | null = null;

        const studentName = (row.student_name ?? '').trim();
        if (studentName) {
          const { data: student } = await admin
            .from('students')
            .select('id, school_id, school_name')
            .ilike('full_name', studentName)
            .limit(1)
            .maybeSingle();
          if (student) {
            linkedStudentId = student.id;
            if (student.school_id) {
              parentSchoolId = student.school_id;
              parentSchoolName = student.school_name ?? null;
            }
          }
        }

        if (!parentSchoolId) {
          results.push({
            email,
            status: 'error',
            message: studentName
              ? 'Linked student has no school — assign the student to a school/class first'
              : 'school_id or a student with a school is required',
          });
          continue;
        }

        if (!parentSchoolName) {
          const { data: sch } = await admin.from('schools').select('name').eq('id', parentSchoolId).maybeSingle();
          parentSchoolName = sch?.name ?? null;
        }

        const provisioned = await findOrCreateParentPortal(admin as any, {
          email,
          fullName: full_name,
          phone,
          schoolId: parentSchoolId,
          schoolName: parentSchoolName,
          passwordPolicy: 'set',
          preserveExistingProfile: false,
          archiveCredentials: false,
          batchLabel: 'Parent Bulk Import',
        });
        if (!provisioned.ok || !provisioned.parentId) {
          results.push({
            email,
            status: provisioned.status === 409 ? 'skipped' : 'error',
            message: provisioned.error || 'Could not provision parent',
          });
          continue;
        }

        const portalUserId = provisioned.parentId;
        if (provisioned.created && provisioned.password) {
          results.push({ email, status: 'created', password: provisioned.password });
        } else {
          results.push({ email, status: 'skipped', message: 'Parent account already exists — updated name/phone/school' });
        }

        if (linkedStudentId) {
          await admin.from('students').update({
            parent_email: email,
            parent_name: full_name,
            parent_phone: phone,
            parent_relationship: relationship,
            updated_at: new Date().toISOString(),
          }).eq('id', linkedStudentId);

          try {
            await syncExplicitParentStudentLink(admin as any, portalUserId, linkedStudentId, {
              actorId: guard.profile.id,
              source: 'parents.bulk-import',
            });
          } catch (linkErr: any) {
            if (isParentLinkConflict(linkErr)) {
              results.push({
                email,
                status: 'error',
                message: 'Student is already linked to another parent — unlink first',
              });
              continue;
            }
            throw linkErr;
          }
        }
      } catch (err: any) {
        results.push({ email, status: 'error', message: err.message ?? 'Unknown error' });
      }
    }

    const created = results.filter(r => r.status === 'created').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const errors = results.filter(r => r.status === 'error').length;

    return NextResponse.json({ results, summary: { created, skipped, errors } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Server error' }, { status: 500 });
  }
}
