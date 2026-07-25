import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateTempPassword as genPassword } from '@/lib/utils/password';
import { isParentLinkConflict, syncExplicitParentStudentLink } from '@/lib/parents/links';

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

        // Check existing portal user (admin bypasses RLS)
        const { data: existing } = await admin
          .from('portal_users')
          .select('id, role')
          .eq('email', email)
          .maybeSingle();

        if (existing && existing.role !== 'parent') {
          results.push({ email, status: 'skipped', message: `Already registered as ${existing.role}` });
          continue;
        }

        const password = genPassword();
        let portalUserId: string;

        if (existing) {
          portalUserId = existing.id;
          await admin.from('portal_users').update({
            full_name,
            phone,
            school_id: parentSchoolId,
            school_name: parentSchoolName,
            is_active: true,
            updated_at: new Date().toISOString(),
          }).eq('id', portalUserId);
          results.push({ email, status: 'skipped', message: 'Parent account already exists — updated name/phone/school' });
        } else {
          const { data: authData, error: authErr } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name, role: 'parent', school_id: parentSchoolId },
          });
          if (authErr || !authData.user) {
            results.push({ email, status: 'error', message: authErr?.message ?? 'Auth creation failed' });
            continue;
          }
          portalUserId = authData.user.id;

          const { error: upsertErr } = await admin.from('portal_users').upsert({
            id: portalUserId,
            email,
            full_name,
            phone,
            role: 'parent',
            school_id: parentSchoolId,
            school_name: parentSchoolName,
            is_active: true,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });
          if (upsertErr) {
            try { await admin.auth.admin.deleteUser(portalUserId); } catch { /* best-effort */ }
            results.push({ email, status: 'error', message: upsertErr.message });
            continue;
          }

          results.push({ email, status: 'created', password });
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
            await syncExplicitParentStudentLink(admin as any, portalUserId, linkedStudentId);
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
