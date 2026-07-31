import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveOnlineSchool } from '@/lib/schools/resolve-online-school';
import { inferProgramme, canonicalTier, buildClassName, bandForGrade } from '@/lib/classes/naming';
import { syncExplicitParentStudentLink } from '@/lib/parents/links';
import { logAudit } from '@/lib/audit/log';

type AnySupabase = SupabaseClient<any>;

export interface HealResult {
  healedCount: number;
  healedStudents: Array<{
    studentId: string;
    studentName: string;
    classId: string;
    className: string;
    schoolName: string;
  }>;
}

/**
 * Centralized Class Healer — scans for active students who lack a class_id
 * and automatically assigns them to their canonical class cohort & school.
 */
export async function healUnassignedStudents(admin: AnySupabase): Promise<HealResult> {
  const onlineSchool = await resolveOnlineSchool(admin);
  const result: HealResult = {
    healedCount: 0,
    healedStudents: [],
  };

  // 1. Fetch unassigned portal users
  const { data: unassignedUsers } = await admin
    .from('portal_users')
    .select('id, full_name, email, role, school_id, school_name, section_class, grade, is_active, is_deleted')
    .eq('role', 'student')
    .eq('is_active', true)
    .or('is_deleted.is.null,is_deleted.eq.false')
    .or('class_id.is.null,class_id.eq.');

  if (!unassignedUsers || unassignedUsers.length === 0) {
    return result;
  }

  // 2. Resolve default lead teacher fallback
  let fallbackTeacherId: string | null = null;
  const { data: leadTeacher } = await admin
    .from('portal_users')
    .select('id')
    .eq('email', 'marvel@rillcod.com')
    .maybeSingle();

  if (leadTeacher?.id) {
    fallbackTeacherId = leadTeacher.id;
  } else {
    const { data: anyTeacher } = await admin
      .from('portal_users')
      .select('id')
      .eq('role', 'teacher')
      .limit(1)
      .maybeSingle();
    fallbackTeacherId = anyTeacher?.id ?? null;
  }

  // 3. Heal each unassigned student
  for (const user of unassignedUsers) {
    const schoolId = user.school_id || onlineSchool.id;
    const schoolName = user.school_name || onlineSchool.name;
    const rawGrade = user.grade || user.section_class || 'General';

    // Infer program track & canonical tier
    const prog = inferProgramme(rawGrade);
    const band = bandForGrade(rawGrade, user.section_class);
    const tier = canonicalTier(rawGrade);

    // Build canonical class name using central naming helper
    const targetClassName = buildClassName({
      programme: prog,
      range: tier,
      schoolName: schoolName,
    });

    // Find or create class
    let targetClassId: string | null = null;
    const { data: existingClass } = await admin
      .from('classes')
      .select('id')
      .eq('school_id', schoolId)
      .ilike('name', targetClassName)
      .maybeSingle();

    if (existingClass?.id) {
      targetClassId = existingClass.id;
    } else {
      const { data: createdClass, error: createErr } = await admin
        .from('classes')
        .insert({
          name: targetClassName,
          school_id: schoolId,
          teacher_id: fallbackTeacherId,
          program_track: prog,
          qa_grade_band: band,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (!createErr && createdClass?.id) {
        targetClassId = createdClass.id;
      }
    }

    if (targetClassId) {
      // Update portal_users
      await admin
        .from('portal_users')
        .update({
          class_id: targetClassId,
          school_id: schoolId,
          school_name: schoolName,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      // Update students table row if exists
      // students has no parent_id column — the parent is reached by parent_email, or through
      // parent_student_links. Asking for it failed this read, so studentRow came back null and the
      // whole block below was skipped: the school was never written to the students row and the
      // parent link was never synced.
      const { data: studentRow } = await admin
        .from('students')
        .select('id, parent_email')
        .eq('user_id', user.id)
        .maybeSingle();

      if (studentRow?.id) {
        await admin
          .from('students')
          .update({
            school_id: schoolId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', studentRow.id);

        // Sync parent_student_links if parent account exists
        if (studentRow.parent_email) {
          const { data: pUser } = await admin
            .from('portal_users')
            .select('id')
            .eq('email', studentRow.parent_email)
            .maybeSingle();
          const pId = pUser?.id ?? null;
          if (pId) {
            try {
              await syncExplicitParentStudentLink(admin, pId, studentRow.id);
            } catch (e) {
              // Ignore duplicate link conflict gracefully
            }
          }
        }
      }

      // Log audit entry
      await logAudit(admin, {
        action: 'class_healer_auto_assigned',
        actorId: null,
        tableName: 'portal_users',
        recordId: user.id,
        newValues: {
          student_id: user.id,
          student_name: user.full_name,
          class_id: targetClassId,
          class_name: targetClassName,
          school_name: schoolName,
        },
      });

      result.healedCount++;
      result.healedStudents.push({
        studentId: user.id,
        studentName: user.full_name || 'Student',
        classId: targetClassId,
        className: targetClassName,
        schoolName,
      });
    }
  }

  return result;
}
