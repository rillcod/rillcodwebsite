import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET /api/admin/fix-school-mismatch
// Scans for students who are enrolled in a class belonging to a different school.
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    const { data: caller } = await admin.from('portal_users').select('role').eq('id', user.id).single();
    if (!caller || caller.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Fetch students who have a class assigned
    const { data: students, error: stuErr } = await admin
      .from('portal_users')
      .select('id, full_name, email, school_id, school_name, class_id, section_class')
      .eq('role', 'student')
      .not('class_id', 'is', null);

    if (stuErr) return NextResponse.json({ error: stuErr.message }, { status: 500 });

    // Fetch all classes that have a school assigned (include teacher_id for conflict detection)
    const { data: classes, error: clsErr } = await admin
      .from('classes')
      .select('id, name, school_id, teacher_id')
      .not('school_id', 'is', null);

    if (clsErr) return NextResponse.json({ error: clsErr.message }, { status: 500 });

    const classMap = new Map(classes.map(c => [c.id, c]));

    // Fetch report authorship so we can flag students whose class teacher ≠ report teacher
    const studentIds = students.map(s => s.id);
    const { data: allReports } = await admin
      .from('student_progress_reports')
      .select('student_id, teacher_id')
      .in('student_id', studentIds)
      .not('teacher_id', 'is', null);

    // Build student_id → primary report teacher
    const reportCountMap = new Map<string, Map<string, number>>();
    (allReports ?? []).forEach((r: any) => {
      const tc = reportCountMap.get(r.student_id) || new Map<string, number>();
      tc.set(r.teacher_id, (tc.get(r.teacher_id) || 0) + 1);
      reportCountMap.set(r.student_id, tc);
    });
    const primaryReportTeacherMap = new Map<string, string>();
    for (const [sid, tc] of reportCountMap.entries()) {
      const top = [...tc.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top) primaryReportTeacherMap.set(sid, top[0]);
    }

    // Identify mismatches
    const mismatches = students.filter(s => {
      const cls = classMap.get(s.class_id!);
      if (!cls) return false;
      return s.school_id !== cls.school_id;
    }).map(s => {
      const cls = classMap.get(s.class_id!)!;
      const primaryReportTeacher = primaryReportTeacherMap.get(s.id);
      // Flag if student is also in the wrong class (class teacher ≠ report teacher)
      const classTeacherConflict = !!(cls.teacher_id && primaryReportTeacher && primaryReportTeacher !== cls.teacher_id);
      return {
        student_id: s.id,
        student_name: s.full_name,
        student_school_id: s.school_id,
        student_school_name: s.school_name,
        class_id: s.class_id,
        class_name: s.section_class || cls.name,
        class_school_id: cls.school_id,
        // When true: heal tool must fix class first before alignment can run
        class_teacher_conflict: classTeacherConflict,
      };
    });

    return NextResponse.json({
      count: mismatches.length,
      mismatches
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/admin/fix-school-mismatch
// Generates intelligent restoration suggestions using report authorship as the primary truth signal.
// Report authorship outweighs registration history — a batch-enroll overwrite corrupts history
// but cannot corrupt who actually wrote the student's progress reports.
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    const { data: caller } = await admin.from('portal_users').select('role').eq('id', user.id).single();
    if (!caller || caller.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Fetch all students
    const { data: students } = await admin
      .from('portal_users')
      .select('id, full_name, email, school_id, school_name, class_id, section_class')
      .eq('role', 'student');

    const allStudentIds = students?.map(s => s.id) ?? [];

    // Fetch registration history — group by email so we handle multiple batches per student
    const { data: histResults } = await admin.from('registration_results').select('email, batch_id');
    const batchIds = [...new Set(histResults?.map(r => r.batch_id) ?? [])];
    const { data: batches } = await admin.from('registration_batches').select('*').in('id', batchIds);

    // email → Set of batch_ids (student may have been registered multiple times)
    const studentHistMultiMap = new Map<string, string[]>();
    histResults?.forEach(r => {
      const email = r.email.toLowerCase();
      const existing = studentHistMultiMap.get(email) || [];
      existing.push(r.batch_id);
      studentHistMultiMap.set(email, existing);
    });

    // Forensic: activity logs per user per school
    const { data: activityLogs } = await admin
      .from('activity_logs')
      .select('user_id, school_id')
      .in('user_id', allStudentIds)
      .not('school_id', 'is', null);

    // Report authorship — the highest-trust signal for class/school assignment.
    // A batch-enroll overwrite corrupts class_id and may add a new registration_results row,
    // but it cannot retroactively change who wrote prior progress reports.
    const { data: allReports } = await admin
      .from('student_progress_reports')
      .select('student_id, teacher_id')
      .in('student_id', allStudentIds)
      .not('teacher_id', 'is', null);

    const { data: allSchools } = await admin.from('schools').select('id, name');
    // Include teacher_id so we can match batches to report authors
    const { data: allClasses } = await admin.from('classes').select('id, name, school_id, teacher_id');

    const batchMap = new Map(batches?.map(b => [b.id, b]) ?? []);
    const schoolMap = new Map(allSchools?.map(s => [s.id, s.name]) ?? []);

    // Build student_id → primary report teacher_id
    const reportCountMap = new Map<string, Map<string, number>>();
    (allReports ?? []).forEach((r: any) => {
      const tc = reportCountMap.get(r.student_id) || new Map<string, number>();
      tc.set(r.teacher_id, (tc.get(r.teacher_id) || 0) + 1);
      reportCountMap.set(r.student_id, tc);
    });
    const primaryReportTeacherMap = new Map<string, string>();
    const reportCountTotalMap = new Map<string, number>();
    for (const [sid, tc] of reportCountMap.entries()) {
      const top = [...tc.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top) {
        primaryReportTeacherMap.set(sid, top[0]);
        reportCountTotalMap.set(sid, top[1]);
      }
    }

    // Build teacher_id → classes[]
    const teacherClassesMap = new Map<string, typeof allClasses>();
    (allClasses ?? []).forEach((c: any) => {
      if (c.teacher_id) {
        const arr = teacherClassesMap.get(c.teacher_id) || [];
        arr.push(c);
        teacherClassesMap.set(c.teacher_id, arr);
      }
    });

    // Activity map: user_id → school_id → count
    const activityMap = new Map<string, Map<string, number>>();
    (activityLogs ?? []).forEach((log: any) => {
      const userSchools = activityMap.get(log.user_id) || new Map<string, number>();
      userSchools.set(log.school_id, (userSchools.get(log.school_id) || 0) + 1);
      activityMap.set(log.user_id, userSchools);
    });

    const suggestions = (students ?? []).map(s => {
      const emailKey = s.email?.toLowerCase() || '';
      const candidateBatchIds = studentHistMultiMap.get(emailKey) || [];
      const userActivity = activityMap.get(s.id);
      const primaryReportTeacher = primaryReportTeacherMap.get(s.id);
      const reportCount = reportCountTotalMap.get(s.id) || 0;

      let bestSchoolId: string | null = s.school_id;
      let finalTargetClassId: string | null = s.class_id;
      let score = 0;
      const evidence: string[] = [];

      // ── Signal 1: Report Authorship (Weight 150 — highest trust) ──────────
      // Who wrote this student's progress reports? That teacher's class is the correct placement.
      // This signal cannot be corrupted by a batch-enroll overwrite.
      if (primaryReportTeacher && reportCount > 0) {
        const teacherClasses = teacherClassesMap.get(primaryReportTeacher) || [];
        // Prefer a class at the student's current school, otherwise take first available
        const bestClass = teacherClasses.find((c: any) => c.school_id === s.school_id) || teacherClasses[0];
        if (bestClass) {
          bestSchoolId = bestClass.school_id;
          finalTargetClassId = bestClass.id;
          score += 150;
          evidence.push(`Report Author (${reportCount} report${reportCount !== 1 ? 's' : ''})`);
        }
      }

      // ── Signal 2: Registration History + Batch Creator (Weight 100–200) ──
      // When there are multiple batches (re-registrations), prefer the batch whose
      // creator matches the primary report teacher — that's the original teacher's batch.
      // If only batch creator matches (no reports yet), that alone scores 120.
      // If still ambiguous, fallback to the first/earliest batch (original enrollment).
      let selectedBatch: any = null;
      if (candidateBatchIds.length > 0) {
        if (candidateBatchIds.length === 1) {
          selectedBatch = batchMap.get(candidateBatchIds[0]);
        } else {
          // Multiple batches: prefer by creator = report teacher, then by class teacher = report teacher
          for (const bid of candidateBatchIds) {
            const b = batchMap.get(bid);
            if (!b) continue;
            // Strongest: batch was created BY the same teacher who wrote the reports
            if (primaryReportTeacher && b.created_by === primaryReportTeacher) {
              selectedBatch = b;
              break;
            }
          }
          if (!selectedBatch) {
            for (const bid of candidateBatchIds) {
              const b = batchMap.get(bid);
              if (!b) continue;
              const bClass = allClasses?.find((c: any) =>
                c.id === b.class_id || (c.name === b.class_name && c.school_id === b.school_id)
              );
              if (bClass && primaryReportTeacher && bClass.teacher_id === primaryReportTeacher) {
                selectedBatch = b;
                break;
              }
            }
          }
          // Fallback: first batch (earliest = original registration before any overwrite)
          if (!selectedBatch) selectedBatch = batchMap.get(candidateBatchIds[0]);
        }

        if (selectedBatch) {
          const batchCreatorMatchesReportTeacher = primaryReportTeacher && selectedBatch.created_by === primaryReportTeacher;

          if (score === 0) {
            // No report signal yet — use batch creator as the ownership signal
            bestSchoolId = selectedBatch.school_id;
            // Resolve class from history
            let histClassId = selectedBatch.class_id || null;
            if (!histClassId && selectedBatch.class_name && selectedBatch.school_id) {
              const mc = allClasses?.find((c: any) => c.school_id === selectedBatch.school_id && c.name === selectedBatch.class_name);
              if (mc) histClassId = mc.id;
            }
            finalTargetClassId = histClassId;
            if (batchCreatorMatchesReportTeacher) {
              // Batch creator = report teacher: very high confidence
              score += 200;
              evidence.push('Batch Creator + Report Author agree');
            } else if (selectedBatch.created_by) {
              // Batch creator is known — teacher who registered them is the likely owner
              score += 120;
              evidence.push('Batch Creator (original registrar)');
            } else {
              score += 100;
              evidence.push('Registration Record');
            }
          } else {
            if (batchCreatorMatchesReportTeacher) {
              // Batch creator confirms the report-based result — strongest possible agreement
              score += 80;
              evidence.push('Batch Creator confirms Report Author');
            } else if (selectedBatch.school_id === bestSchoolId) {
              score += 50;
              evidence.push('Confirmed by Registration Record');
            }
          }
        }
      }

      // ── Signal 3: Activity Logs (Weight 30) ───────────────────────────────
      if (userActivity && score < 80) {
        let topActivitySchool = '';
        let maxLogs = 0;
        for (const [schId, count] of userActivity.entries()) {
          if (count > maxLogs) { maxLogs = count; topActivitySchool = schId; }
        }
        if (topActivitySchool) {
          if (topActivitySchool === bestSchoolId) {
            score += 30;
            evidence.push(`Activity Confirmed (${maxLogs} events)`);
          } else if (score === 0) {
            bestSchoolId = topActivitySchool;
            score += 30;
            evidence.push(`Primary Activity School (${maxLogs} events)`);
          }
        }
      }

      const needsRepair = s.school_id !== bestSchoolId || s.class_id !== finalTargetClassId;
      if (!needsRepair || score === 0) return null;

      return {
        student_id: s.id,
        student_name: s.full_name,
        email: s.email,
        score,
        evidence,
        // Flag so UI can warn: heal tool must run first if report ≠ current class teacher
        report_teacher_conflict: !!(
          primaryReportTeacher &&
          s.class_id &&
          (() => { const cls = allClasses?.find((c: any) => c.id === s.class_id); return cls?.teacher_id && cls.teacher_id !== primaryReportTeacher; })()
        ),
        current: {
          school_id: s.school_id,
          school_name: s.school_name,
          class_id: s.class_id,
          class_name: s.section_class,
        },
        suggested: {
          school_id: bestSchoolId,
          school_name: schoolMap.get(bestSchoolId || '') || selectedBatch?.school_name || 'Unknown School',
          class_id: finalTargetClassId,
          class_name: finalTargetClassId ? allClasses?.find((c: any) => c.id === finalTargetClassId)?.name : null,
        },
        batch_id: selectedBatch?.id,
      };
    }).filter(Boolean);

    return NextResponse.json({ suggestions });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/admin/fix-school-mismatch
// Repairs mismatches.
// Body: { action: 'align_student' | 'restore_from_history' | 'unenroll', studentIds: string[] }
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    const { data: caller } = await admin.from('portal_users').select('role').eq('id', user.id).single();
    if (!caller || caller.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { action, studentIds } = await request.json();
    if (!action || !Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json({ error: 'action and studentIds required' }, { status: 400 });
    }

    let successCount = 0;
    const errors: string[] = [];

    if (action === 'restore_from_history') {
      const { data: students } = await admin.from('portal_users').select('id, email, full_name').in('id', studentIds);
      const emails = students?.map(s => s.email?.toLowerCase()).filter(Boolean) as string[];

      const { data: histResults } = await admin.from('registration_results').select('email, batch_id').in('email', emails);
      const batchIds = [...new Set(histResults?.map(r => r.batch_id) ?? [])];
      const { data: batches } = await admin.from('registration_batches').select('*').in('id', batchIds);
      // Include teacher_id so we can match against report authorship
      const { data: allClasses } = await admin.from('classes').select('id, name, school_id, teacher_id');

      const batchMap = new Map(batches?.map(b => [b.id, b]) ?? []);

      // Group by email → multiple batch_ids (handles re-registration after overwrite)
      const studentHistMultiMap = new Map<string, string[]>();
      histResults?.forEach(r => {
        const email = r.email.toLowerCase();
        const existing = studentHistMultiMap.get(email) || [];
        existing.push(r.batch_id);
        studentHistMultiMap.set(email, existing);
      });

      // Fetch progress reports for all these students to determine primary report teacher
      const { data: allReports } = await admin
        .from('student_progress_reports')
        .select('student_id, teacher_id')
        .in('student_id', studentIds)
        .not('teacher_id', 'is', null);

      const reportCountMap = new Map<string, Map<string, number>>();
      (allReports ?? []).forEach((r: any) => {
        const tc = reportCountMap.get(r.student_id) || new Map<string, number>();
        tc.set(r.teacher_id, (tc.get(r.teacher_id) || 0) + 1);
        reportCountMap.set(r.student_id, tc);
      });
      const primaryReportTeacherMap = new Map<string, string>();
      for (const [sid, tc] of reportCountMap.entries()) {
        const top = [...tc.entries()].sort((a, b) => b[1] - a[1])[0];
        if (top) primaryReportTeacherMap.set(sid, top[0]);
      }

      const skippedConflict: string[] = [];

      for (const s of (students ?? [])) {
        try {
          const emailKey = s.email?.toLowerCase() || '';
          const candidateBatchIds = studentHistMultiMap.get(emailKey) || [];
          if (candidateBatchIds.length === 0) {
            errors.push(`No history for ${s.email}`);
            continue;
          }

          const primaryReportTeacher = primaryReportTeacherMap.get(s.id);

          // When there are multiple batches, pick the one whose class teacher = primary report teacher.
          // This ensures we restore to the original correct enrollment, not an overwrite batch.
          let selectedBatch: any = null;
          if (candidateBatchIds.length === 1) {
            selectedBatch = batchMap.get(candidateBatchIds[0]);
          } else {
            for (const bid of candidateBatchIds) {
              const b = batchMap.get(bid);
              if (!b) continue;
              const bClass = allClasses?.find((c: any) =>
                c.id === b.class_id || (c.name === b.class_name && c.school_id === b.school_id)
              );
              if (bClass && primaryReportTeacher && bClass.teacher_id === primaryReportTeacher) {
                selectedBatch = b;
                break;
              }
            }
            // Fallback to first batch (earliest = original registration before any overwrite)
            if (!selectedBatch) selectedBatch = batchMap.get(candidateBatchIds[0]);
          }

          if (!selectedBatch) {
            errors.push(`Batch not found for ${s.email}`);
            continue;
          }

          let targetClassId = selectedBatch.class_id;
          const targetClassName = selectedBatch.class_name;

          // Resolve class by name if ID missing
          if (!targetClassId && targetClassName && selectedBatch.school_id) {
            const matchedClass = allClasses?.find((c: any) =>
              c.school_id === selectedBatch.school_id && c.name === targetClassName
            );
            if (matchedClass) targetClassId = matchedClass.id;
          }

          // Guard: if the target class teacher ≠ this student's primary report teacher,
          // the history is pointing to a corrupt batch (an overwrite).
          // Skip and direct admin to the heal tool.
          if (targetClassId && primaryReportTeacher) {
            const targetClass = allClasses?.find((c: any) => c.id === targetClassId);
            if (targetClass?.teacher_id && targetClass.teacher_id !== primaryReportTeacher) {
              skippedConflict.push(s.full_name || s.email || s.id);
              continue;
            }
          }

          const update = {
            school_id: selectedBatch.school_id,
            school_name: selectedBatch.school_name,
            class_id: targetClassId || null,
            section_class: targetClassName || null,
          };

          await admin.from('portal_users').update(update).eq('id', s.id);
          await admin.from('students').update(update).eq('user_id', s.id);

          successCount++;
        } catch (e: any) {
          errors.push(`Failed for ${s.id}: ${e.message}`);
        }
      }

      if (skippedConflict.length > 0) {
        errors.push(
          `Skipped ${skippedConflict.length} student(s) whose registration history points to a different teacher than their report author — the history likely reflects a batch-enroll overwrite. Fix class assignments in the Class Health & Repair tool first, then re-run: ${skippedConflict.join(', ')}`
        );
      }

    } else if (action === 'align_student') {
      // Sync school_id to match the student's current class school.
      // SAFE GUARD: if the student's current class is owned by Teacher A but their
      // progress reports were primarily written by Teacher B, the class assignment is
      // likely wrong (a batch-enroll overwrite). Skip those students and flag them —
      // they should be fixed in the Class Health tool first, then re-aligned here.
      const skippedConflict: string[] = [];
      for (const sid of studentIds) {
        try {
          const { data: student } = await admin.from('portal_users').select('class_id, full_name').eq('id', sid).single();
          if (!student?.class_id) continue;

          const { data: cls } = await admin.from('classes').select('school_id, name, teacher_id').eq('id', student.class_id).single();
          if (!cls?.school_id) continue;

          // Check if class teacher matches primary report teacher
          if (cls.teacher_id) {
            const { data: rpts } = await admin.from('student_progress_reports').select('teacher_id').eq('student_id', sid).not('teacher_id', 'is', null);
            const counts: Record<string, number> = {};
            (rpts ?? []).forEach((r: any) => { counts[r.teacher_id] = (counts[r.teacher_id] || 0) + 1; });
            const topEntry = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
            const primaryReportTeacher = topEntry?.[0];
            if (primaryReportTeacher && primaryReportTeacher !== cls.teacher_id) {
              // Class teacher ≠ report teacher → student is likely in the wrong class
              // Skip this student; use Class Health & Repair to fix the class first
              skippedConflict.push(student.full_name || sid);
              continue;
            }
          }

          const { data: school } = await admin.from('schools').select('name').eq('id', cls.school_id).single();
          await admin.from('portal_users').update({ school_id: cls.school_id, school_name: school?.name ?? null }).eq('id', sid);
          await admin.from('students').update({ school_id: cls.school_id, school_name: school?.name ?? null }).eq('user_id', sid);
          successCount++;
        } catch (e: any) {
          errors.push(`Failed for ${sid}: ${e.message}`);
        }
      }
      if (skippedConflict.length > 0) {
        errors.push(`Skipped ${skippedConflict.length} student(s) whose class teacher doesn't match their report teacher — fix class assignment in Class Health first: ${skippedConflict.join(', ')}`);
      }
    } else if (action === 'unenroll') {
      // Remove student from the class
      for (const sid of studentIds) {
        try {
          const { data: student } = await admin.from('portal_users').select('class_id').eq('id', sid).single();
          const prevClassId = student?.class_id;

          await admin.from('portal_users').update({
            class_id: null,
            section_class: null
          }).eq('id', sid);

          if (prevClassId) {
             // Resync class count
             const { count } = await admin.from('portal_users').select('id', { count: 'exact', head: true }).eq('class_id', prevClassId).eq('role', 'student');
             await admin.from('classes').update({ current_students: count ?? 0 }).eq('id', prevClassId);
          }

          successCount++;
        } catch (e: any) {
          errors.push(`Failed for ${sid}: ${e.message}`);
        }
      }
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      applied: successCount,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
