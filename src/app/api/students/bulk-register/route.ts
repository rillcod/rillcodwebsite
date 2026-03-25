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
    // Priority: 1. ID from request body (selected in UI) 2. ID from caller's own profile
    const rId = body.school_id?.toString().trim() || null;
    const cId = caller.school_id?.toString().trim() || null;
    
    const resolvedSchoolId: string | null = rId || cId;
    const resolvedSchoolName: string | null = (body.school_name?.trim() ? body.school_name : null) ?? caller.school_name ?? null;

    console.log('[BulkRegister] Auth User:', user.id);
    console.log('[BulkRegister] Request Body School ID:', body.school_id);
    console.log('[BulkRegister] Caller Profile School ID:', caller.school_id);
    console.log('[BulkRegister] Resolved School ID:', resolvedSchoolId);
    console.log('[BulkRegister] Resolved School Name:', resolvedSchoolName);

    if (!resolvedSchoolId) {
      return NextResponse.json(
        { error: 'A school must be selected before registering students. Create or select a school first.' },
        { status: 400 },
      );
    }

    const programId: string | null = (body.program_id as string | undefined) ?? null;
    const batchClassId: string | null = (body.class_id as string | undefined) ?? null;
    const batchClassName: string | null = (body.class_name as string | undefined) ?? null;

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
            school_id: resolvedSchoolId,
            school_name: resolvedSchoolName,
            section_class: class_name || batchClassName || null,
            class_id: batchClassId || null,
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

        const effectiveClass = class_name || batchClassName || undefined;
        results.push({ full_name, email, password, class_name: effectiveClass, status, userId: authUserId });
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
          user_id: userId,
          program_id: programId,
          status: 'active',
          role: 'student',
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

    // Sync current_students count if class_id was provided
    if (batchClassId) {
      try {
        const { data: studentsInClass } = await supabaseAdmin
          .from('portal_users')
          .select('id', { count: 'exact' })
          .eq('class_id', batchClassId)
          .eq('role', 'student');
        
        const actualCount = studentsInClass?.length || 0;
        await supabaseAdmin
          .from('classes')
          .update({ current_students: actualCount })
          .eq('id', batchClassId);
      } catch (err) {
        console.error('[BulkRegister] Failed to sync class count:', err);
      }
    }

    // Include portal_user_id so frontend can display RC-XXXXXXXX student codes
    const publicResults = results.map(({ userId, ...rest }) => ({
      ...rest,
      portal_user_id: userId || null,
      batch_id: body.batch_id || null
    }));

    // ── Save to Official Registry (History) ──────────────────────────────────
    const batchId = body.batch_id;
    if (batchId) {
      try {
        // 1. Upsert batch metadata
        await supabaseAdmin.from('registration_batches').upsert({
          id: batchId,
          created_by: user.id,
          school_id: resolvedSchoolId,
          school_name: resolvedSchoolName,
          program_id: programId,
          class_id: batchClassId,
          class_name: batchClassName || null,
        }, { onConflict: 'id' });

        // 2. Map results to history entries
        const historyEntries = results.map(r => ({
          batch_id: batchId,
          full_name: r.full_name,
          email: r.email,
          password: r.password,
          class_name: r.class_name || null,
          status: r.status,
          error: r.error || null
        }));
        
        // 3. Insert results
        await supabaseAdmin.from('registration_results').insert(historyEntries);
        
        // 4. Update student count on batch
        await supabaseAdmin
          .from('registration_batches')
          .update({ student_count: historyEntries.length })
          .eq('id', batchId);
          
      } catch (histErr) {
        console.error('[BulkRegister] Failed to save history:', histErr);
        // We don't fail the whole request if history saving fails, 
        // as students were already created.
      }
    }

    return NextResponse.json({ results: publicResults });
  } catch (err: any) {
    console.error('Bulk register error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();

    if (body.type === 'batch') {
      const { id, class_name, school_id, school_name } = body.data;
      const { error } = await supabaseAdmin
        .from('registration_batches')
        .update({ class_name: class_name || null, school_id: school_id || null, school_name: school_name || null })
        .eq('id', id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (body.type === 'result') {
      const r = body.data;
      const { error: resErr } = await supabaseAdmin
        .from('registration_results')
        .update({ full_name: r.full_name, class_name: r.class_name || null, email: r.email })
        .eq('id', r.id);
      if (resErr) throw resErr;

      const { data: existingUser } = await supabaseAdmin
        .from('portal_users')
        .select('id').eq('email', r.email).single();
      if (existingUser) {
        await supabaseAdmin.from('portal_users').update({ full_name: r.full_name, section_class: r.class_name || null }).eq('id', existingUser.id);
      }
      return NextResponse.json({ success: true });
    }

    const results: any[] = body.results;
    if (Array.isArray(results)) {
       for (const r of results) {
          await supabaseAdmin.from('registration_results').update({ full_name: r.full_name, class_name: r.class_name || null, email: r.email }).eq('batch_id', r.batch_id).eq('email', r.email);
       }
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Bulk update error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batchId');
    const resultId = searchParams.get('resultId');

    if (batchId && !resultId) {
      // Delete whole batch
      const { error: resErr } = await supabaseAdmin
        .from('registration_results')
        .delete()
        .eq('batch_id', batchId);
      if (resErr) throw resErr;

      const { error: batErr } = await supabaseAdmin
        .from('registration_batches')
        .delete()
        .eq('id', batchId);
      if (batErr) throw batErr;

      return NextResponse.json({ success: true });
    }

    if (resultId) {
      if (resultId.includes(',')) {
        // Bulk delete multiple result entries
        const ids = resultId.split(',').filter(Boolean);
        const { error } = await supabaseAdmin
          .from('registration_results')
          .delete()
          .in('id', ids);
        if (error) throw error;
        return NextResponse.json({ success: true, count: ids.length });
      }

      // Delete single result
      const { error } = await supabaseAdmin
        .from('registration_results')
        .delete()
        .eq('id', resultId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Batch ID or Result ID required' }, { status: 400 });
  } catch (err: any) {
    console.error('Bulk delete error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
