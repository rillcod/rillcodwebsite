import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface StudentEntry {
  full_name: string;
  email: string;
  password: string;
  class_name?: string; // maps to portal_users.section_class
}

export async function POST(request: Request) {
  try {
    // Verify caller is admin or teacher
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: caller } = await supabase
      .from('portal_users')
      .select('role, school_id, school_name')
      .eq('id', user.id)
      .single();

    if (!caller || (caller.role !== 'admin' && caller.role !== 'teacher')) {
      return NextResponse.json(
        { error: 'Only admins and teachers can bulk-register students' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const students: StudentEntry[] = body.students;

    if (!Array.isArray(students) || students.length === 0) {
      return NextResponse.json({ error: 'No students provided' }, { status: 400 });
    }

    if (students.length > 200) {
      return NextResponse.json({ error: 'Maximum 200 students per batch' }, { status: 400 });
    }

    // Determine which school to assign:
    //   - teacher → always use their own school (cannot be overridden)
    //   - admin   → use the school_id/school_name from request body (if provided), else their own
    let resolvedSchoolId: string | null;
    let resolvedSchoolName: string | null;
    if (caller.role === 'teacher') {
      resolvedSchoolId   = caller.school_id   ?? null;
      resolvedSchoolName = caller.school_name ?? null;
    } else {
      resolvedSchoolId   = (body.school_id   as string | undefined) ?? caller.school_id   ?? null;
      resolvedSchoolName = (body.school_name as string | undefined) ?? caller.school_name ?? null;
    }

    if (!resolvedSchoolId) {
      return NextResponse.json(
        { error: 'A school must be selected before registering students. Create or select a school first.' },
        { status: 400 },
      );
    }

    const programId: string | null = (body.program_id as string | undefined) ?? null;

    const results: Array<{
      full_name: string;
      email: string;
      password: string;
      class_name?: string;
      status: 'created' | 'updated' | 'failed';
      error?: string;
      userId?: string;
    }> = [];

    for (const student of students) {
      const { full_name, email, password, class_name } = student;

      if (!full_name?.trim() || !email?.trim() || !password) {
        results.push({ full_name, email, password, class_name, status: 'failed', error: 'Missing fields' });
        continue;
      }

      try {
        // Attempt to create auth user
        const { data: authData, error: signupErr } = await supabaseAdmin.auth.admin.createUser({
          email: email.trim().toLowerCase(),
          password,
          email_confirm: true,
          user_metadata: { full_name: full_name.trim(), role: 'student', must_change_password: true },
        });

        let authUserId: string | null = null;
        let status: 'created' | 'updated' | 'failed' = 'created';

        if (signupErr) {
          if (
            signupErr.message.toLowerCase().includes('already') ||
            signupErr.message.toLowerCase().includes('exists')
          ) {
            // User exists — look them up and update their password
            const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
            const existing = listData?.users?.find(
              (u) => u.email?.toLowerCase() === email.trim().toLowerCase(),
            );
            if (existing) {
              authUserId = existing.id;
              await supabaseAdmin.auth.admin.updateUserById(authUserId, {
                password,
                user_metadata: { must_change_password: true },
              });
              status = 'updated';
            } else {
              results.push({
                full_name, email, password, class_name, status: 'failed',
                error: 'Auth conflict — could not resolve existing user',
              });
              continue;
            }
          } else {
            results.push({ full_name, email, password, class_name, status: 'failed', error: signupErr.message });
            continue;
          }
        } else {
          authUserId = authData.user?.id ?? null;
        }

        if (!authUserId) {
          results.push({ full_name, email, password, class_name, status: 'failed', error: 'No user ID returned' });
          continue;
        }

        // Upsert into portal_users
        const { error: profileErr } = await supabaseAdmin.from('portal_users').upsert(
          {
            id: authUserId,
            email: email.trim().toLowerCase(),
            full_name: full_name.trim(),
            role: 'student',
            school_id:     resolvedSchoolId,
            school_name:   resolvedSchoolName,
            section_class: class_name || null,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' },
        );

        if (profileErr) {
          results.push({
            full_name, email, password, class_name, status: 'failed',
            error: `Profile error: ${profileErr.message}`,
          });
          continue;
        }

        results.push({ full_name, email, password, class_name, status, userId: authUserId });
      } catch (err: any) {
        results.push({ full_name, email, password, class_name, status: 'failed', error: err.message });
      }
    }

    // Auto-enroll into programme if one was selected
    if (programId) {
      const successIds = results
        .filter((r) => r.status !== 'failed' && r.userId)
        .map((r) => r.userId as string);

      if (successIds.length > 0) {
        const enrollments = successIds.map((userId) => ({
          user_id:    userId,
          program_id: programId,
          status:     'active',
          role:       'student',
        }));

        // Insert only those not already enrolled
        const { data: alreadyEnrolled } = await supabaseAdmin
          .from('enrollments')
          .select('user_id')
          .eq('program_id', programId)
          .in('user_id', successIds);
        const enrolledSet = new Set((alreadyEnrolled ?? []).map((e: any) => e.user_id));
        const toInsert = enrollments.filter((e) => !enrolledSet.has(e.user_id));
        if (toInsert.length > 0) {
          await supabaseAdmin.from('enrollments').insert(toInsert);
        }
      }
    }

    // Strip internal userId from results before returning
    const publicResults = results.map(({ userId: _uid, ...rest }) => rest);

    return NextResponse.json({ results: publicResults });
  } catch (err: any) {
    console.error('Bulk register error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
