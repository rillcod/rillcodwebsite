import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { ensureStudentCardIssued } from '@/lib/cards/auto-issue';

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

    // Teachers must be assigned to the school they're registering students under
    if (caller.role === 'teacher' && rId) {
      const { data: tsRows } = await supabaseAdmin
        .from('teacher_schools')
        .select('school_id')
        .eq('teacher_id', user.id);
      const assignedIds = new Set<string>();
      if (caller.school_id) assignedIds.add(caller.school_id);
      for (const r of (tsRows ?? [])) {
        if ((r as any).school_id) assignedIds.add((r as any).school_id);
      }
      if (!assignedIds.has(rId)) {
        return NextResponse.json(
          { error: 'You are not assigned to the school you selected for registration.' },
          { status: 403 },
        );
      }
    }

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
    const allowSameName: boolean = body.allow_same_name === true; // user confirmed different students share a name

    // Resolve the batch class's teacher — used to stamp primary_teacher_id on NEW students only
    let batchClassTeacherId: string | null = null;
    if (batchClassId) {
      const { data: batchCls } = await supabaseAdmin.from('classes').select('teacher_id').eq('id', batchClassId).single();
      batchClassTeacherId = batchCls?.teacher_id ?? null;
    }

    const results: Array<{
      full_name: string;
      email: string;
      password: string;
      class_name?: string;
      status: 'created' | 'updated' | 'skipped' | 'failed' | 'name_swap_conflict';
      error?: string;
      userId?: string;
      cardIssued?: boolean;
      cardId?: string | null;
    }> = [];

    // ── Duplicate barricade: fetch existing students at this school OR any school with same name ──
    // Rule: same full_name + same school_name = strict duplicate, even across different school_ids
    const { data: existingStudents } = await supabaseAdmin
      .from('portal_users')
      .select('id, full_name, email, school_id, school_name')
      .eq('role', 'student')
      .eq('is_deleted', false)
      .or(`school_id.eq.${resolvedSchoolId},school_name.ilike.${resolvedSchoolName ?? ''}`);

    // Build lookup maps for exact name AND reversed-name (first/last swapped)
    const existingByName = new Map<string, { id: string; email: string; full_name: string }>();
    const existingByReversedName = new Map<string, { id: string; email: string; full_name: string }>();
    for (const s of (existingStudents ?? [])) {
      const norm = s.full_name.trim().toLowerCase();
      existingByName.set(norm, { id: s.id, email: s.email, full_name: s.full_name });
      // Build reversed version: "Ada Ngozi" → "Ngozi Ada"
      const parts = norm.split(/\s+/);
      if (parts.length >= 2) {
        const reversed = [...parts].reverse().join(' ');
        existingByReversedName.set(reversed, { id: s.id, email: s.email, full_name: s.full_name });
      }
    }

    // allowNameSwap: caller explicitly confirmed this is a different student from the name-swapped match
    const allowNameSwap: boolean = body.allow_name_swap === true;

    for (const student of students) {
      const { full_name, email, password, class_name } = student;

      if (!full_name?.trim() || !email?.trim() || !password) {
        results.push({ full_name, email, password, class_name, status: 'failed', error: 'Missing fields' });
        continue;
      }

      const nameKey = full_name.trim().toLowerCase();

      // 1. Exact name match — block unless caller confirmed same name = different student
      const exactMatch = existingByName.get(nameKey);
      if (exactMatch && !allowSameName) {
        results.push({
          full_name, email, password, class_name,
          status: 'skipped',
          error: `Already registered at this school as "${exactMatch.full_name}" (login: ${exactMatch.email}). If this is a different student with the same name, re-upload with "allow same name" confirmed.`,
          userId: exactMatch.id,
        });
        continue;
      }

      // 2. Swapped first/last name — block unless caller confirmed it's intentional
      const swapMatch = !exactMatch ? existingByReversedName.get(nameKey) : null;
      if (swapMatch && !allowNameSwap && !allowSameName) {
        results.push({
          full_name, email, password, class_name,
          status: 'name_swap_conflict',
          error: `Possible duplicate: "${full_name}" looks like "${swapMatch.full_name}" with first and last name swapped (existing login: ${swapMatch.email}). Confirm this is a different student to proceed.`,
          userId: swapMatch.id,
        });
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

        // Ghost-row guard: if portal_users already has a NON-DELETED row with this email
        // but a DIFFERENT id (created outside the auth flow or by a stale import), that row
        // would become an unreachable duplicate. Soft-delete it so the auth user's row wins.
        const { data: ghostRows } = await supabaseAdmin
          .from('portal_users')
          .select('id, primary_teacher_id')
          .ilike('email', email.trim())
          .eq('is_deleted', false)
          .neq('id', authUserId);
        for (const ghost of (ghostRows ?? [])) {
          // Don't silently nuke a protected student — flag instead
          if (ghost.primary_teacher_id) {
            results.push({
              full_name, email, password, class_name, status: 'skipped',
              error: `Duplicate account conflict: existing protected account (${ghost.id}) for this email. Resolve in Class Health & Repair first.`,
            });
            continue;
          }
          await supabaseAdmin.from('portal_users')
            .update({ is_deleted: true, is_active: false, class_id: null })
            .eq('id', ghost.id);
          await supabaseAdmin.from('students')
            .update({ status: 'inactive' })
            .eq('user_id', ghost.id);
        }

        // Upsert into portal_users — never include primary_teacher_id here so that
        // existing students' ownership is never overwritten by a batch registration.
        // primary_teacher_id is stamped separately below, only for newly created students.
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
            enrollment_type: 'in_person',
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

        // For NEW students only: stamp primary_teacher_id so the DB trigger protects them
        // going forward. Never do this for existing students (status = 'updated').
        if (status === 'created' && batchClassTeacherId) {
          await supabaseAdmin.from('portal_users')
            .update({ primary_teacher_id: batchClassTeacherId })
            .eq('id', authUserId)
            .is('primary_teacher_id', null); // safety: only if not already set
        }

        // --- NEW: Also ensure a record exists in the 'students' table ---
        // This is crucial because the parents management logic and other dashboard features
        // expect students to have a record in the 'students' table for linkage.
        const { error: studentErr } = await supabaseAdmin.from('students').upsert({
          user_id: authUserId,
          name: full_name.trim(),
          full_name: full_name.trim(),
          student_email: email.trim().toLowerCase(),
          school_id: resolvedSchoolId,
          school_name: resolvedSchoolName,
          current_class: class_name || batchClassName || null,
          grade_level: class_name || batchClassName || null,
          enrollment_type: 'in_person',
          status: 'approved', // Bulk-registered students are pre-approved
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' }); // Use user_id as conflict target

        if (studentErr) {
           console.error('[BulkRegister] Student table sync error:', studentErr);
           // We don't fail the registration if students table sync fails, 
           // but we log it for admin review.
        }

        const effectiveClass = class_name || batchClassName || undefined;
        let cardIssued = false;
        let cardId: string | null = null;

        try {
          const card = await ensureStudentCardIssued(supabaseAdmin as any, {
            holderId: authUserId,
            schoolId: resolvedSchoolId,
            classId: batchClassId || null,
            actorId: user.id,
            metadata: {
              source: 'bulk_register',
              class_name: effectiveClass || null,
              batch_id: body.batch_id || null,
            },
          });
          cardIssued = card.created;
          cardId = card.id;
        } catch (cardErr) {
          console.error('[BulkRegister] Card auto-issue failed:', cardErr);
        }

        results.push({ full_name, email, password, class_name: effectiveClass, status, userId: authUserId, cardIssued, cardId });
      } catch (err: any) {
        results.push({ full_name, email, password, class_name, status: 'failed', error: err.message });
      }
    }

    // Auto-enroll into programme if one was selected
    if (programId) {
      const successIds = results
        .filter((r) => r.status === 'created' || r.status === 'updated')
        .filter((r) => r.userId)
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
      cardIssued: rest.cardIssued ?? false,
      cardId: rest.cardId ?? null,
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

    const { data: patchCaller } = await supabase.from('portal_users').select('role').eq('id', user.id).single();
    if (!patchCaller || !['admin', 'teacher'].includes(patchCaller.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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

    // Assign all students from a batch to a class (sets class_id, school_id, section_class).
    // Safe: only targets portal_users with role='student' and email in the batch.
    // Protected students (primary_teacher_id set to a different teacher) are skipped.
    if (body.type === 'batch_assign_class') {
      const { batchId, classId } = body;
      if (!batchId || !classId) return NextResponse.json({ error: 'batchId and classId required' }, { status: 400 });

      const { data: cls } = await supabaseAdmin.from('classes').select('school_id, name, teacher_id').eq('id', classId).single();
      if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

      const { data: results } = await supabaseAdmin.from('registration_results').select('email').eq('batch_id', batchId);
      const emails = (results ?? []).map((r: any) => r.email).filter(Boolean);
      if (emails.length === 0) return NextResponse.json({ updated: 0 });

      const { data: users } = await supabaseAdmin
        .from('portal_users')
        .select('id, primary_teacher_id')
        .in('email', emails)
        .eq('role', 'student')
        .eq('is_deleted', false);

      // Skip students protected by a different teacher
      const allowedIds = (users ?? [])
        .filter((u: any) => !u.primary_teacher_id || u.primary_teacher_id === cls.teacher_id)
        .map((u: any) => u.id);
      const protectedCount = (users ?? []).length - allowedIds.length;

      if (allowedIds.length === 0) {
        return NextResponse.json({
          updated: 0,
          protected: protectedCount,
          message: `All ${protectedCount} student(s) in this batch belong to a different teacher's class and are protected. Use the Class Health tool to transfer them.`,
        });
      }

      const { error } = await supabaseAdmin.from('portal_users').update({
        class_id: classId,
        school_id: cls.school_id,
        section_class: cls.name,
        primary_teacher_id: cls.teacher_id ?? null,
        updated_at: new Date().toISOString(),
      }).in('id', allowedIds).eq('role', 'student');
      if (error) throw error;

      // Also update the batch record so future exports reflect the class
      await supabaseAdmin.from('registration_batches').update({
        class_name: cls.name,
        school_id: cls.school_id,
      }).eq('id', batchId);

      return NextResponse.json({ success: true, updated: allowedIds.length, protected: protectedCount });
    }

    // Activate or deactivate all students in a batch
    if (body.type === 'batch_toggle_active') {
      const { batchId, isActive } = body;
      if (!batchId || typeof isActive !== 'boolean') return NextResponse.json({ error: 'batchId and isActive required' }, { status: 400 });

      const { data: results } = await supabaseAdmin.from('registration_results').select('email').eq('batch_id', batchId);
      const emails = (results ?? []).map((r: any) => r.email).filter(Boolean);
      if (emails.length === 0) return NextResponse.json({ updated: 0 });

      const { data: users } = await supabaseAdmin.from('portal_users').select('id').in('email', emails).eq('role', 'student').eq('is_deleted', false);
      const userIds = (users ?? []).map((u: any) => u.id);
      if (userIds.length === 0) return NextResponse.json({ updated: 0 });

      const { error } = await supabaseAdmin.from('portal_users').update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      }).in('id', userIds);
      if (error) throw error;
      return NextResponse.json({ success: true, updated: userIds.length });
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

    const { data: deleteCaller } = await supabase.from('portal_users').select('role').eq('id', user.id).single();
    if (!deleteCaller || !['admin', 'teacher'].includes(deleteCaller.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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
