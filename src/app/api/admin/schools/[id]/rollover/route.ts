import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSpecializedProgramRecord, reinstateStudentToClass } from '@/lib/students/reinstate-to-class';
import { getSessionBoundary } from '@/lib/academic/session-scope';
import { logAudit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

const GRADE_LADDER = [
  'Basic 1',
  'Basic 2',
  'Basic 3',
  'Basic 4',
  'Basic 5',
  'Basic 6',
  'JSS 1',
  'JSS 2',
  'JSS 3',
  'SS 1',
  'SS 2',
  'SS 3',
] as const;

type CanonicalGrade = (typeof GRADE_LADDER)[number];

function canonicalizeSingleGrade(raw: string | null | undefined): CanonicalGrade | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  const ssMatch = s.match(/\b(?:sss|ss)\s*([1-3])\b/i);
  if (ssMatch) return `SS ${ssMatch[1]}` as CanonicalGrade;
  const jssMatch = s.match(/\b(?:jss|js)\s*([1-3])\b/i);
  if (jssMatch) return `JSS ${jssMatch[1]}` as CanonicalGrade;
  const basicMatch = s.match(/\b(?:basic|primary|pry|grade)\s*([1-6])\b/i);
  if (basicMatch) return `Basic ${basicMatch[1]}` as CanonicalGrade;
  return null;
}

/**
 * Parse every canonical grade covered by a class name — works for both
 * single-grade classes ("SS 1", "Basic 4") and multi-grade bands ("Basic 1-3", "JSS 1–3", "SS 1 & 2").
 */
function parseClassGrades(name: string | null | undefined): { grades: CanonicalGrade[]; isBand: boolean } {
  const s = String(name || '').trim();
  if (!s) return { grades: [], isBand: false };

  // Band range: e.g. "Basic 1-3", "Primary 4–6", "JSS 1 to 3", "SS 1 & 2"
  const rangeMatch = s.match(/\b(basic|primary|pry|grade|jss|js|sss|ss)\s*(\d+)\s*(?:[-–—&/,]|to)\s*(\d+)\b/i);
  if (rangeMatch) {
    const rawPrefix = rangeMatch[1].toLowerCase();
    const low = Math.min(Number(rangeMatch[2]), Number(rangeMatch[3]));
    const high = Math.max(Number(rangeMatch[2]), Number(rangeMatch[3]));
    const prefix = rawPrefix.startsWith('ss') ? 'SS' : rawPrefix.startsWith('js') ? 'JSS' : 'Basic';
    const max = prefix === 'Basic' ? 6 : 3;
    const grades: CanonicalGrade[] = [];
    for (let n = Math.max(1, low); n <= Math.min(max, high); n++) {
      grades.push(`${prefix} ${n}` as CanonicalGrade);
    }
    if (grades.length > 0) return { grades, isBand: grades.length > 1 };
  }

  const single = canonicalizeSingleGrade(s);
  if (single) return { grades: [single], isBand: false };
  return { grades: [], isBand: false };
}

type PlanRow = {
  row_key: string;
  from_class_id: string;
  from_class_name: string;
  from_grade: string;
  to_class_id: string | null;
  to_class_name: string | null;
  to_grade: string | null;
  action: 'promote' | 'upgrade_in_place' | 'archive_graduated' | 'mark_inactive';
  student_count: number;
  student_ids: string[];
};

type RolloverOverride = {
  row_key: string;
  enabled?: boolean;
  action?: PlanRow['action'];
  to_class_id?: string | null;
};

/**
 * POST /api/admin/schools/[id]/rollover
 * { dry_run?: boolean } (defaults to true)
 *
 * Admin-only top-down school-wide session rollover (supports single-grade AND multi-grade band classes):
 *   1. SS 3 → archive_graduated (inactive, graduated archive)
 *   2. Any grade whose next grade has a matching class in this school:
 *      - Different class (e.g. JSS 3 → SS 1 tier, Basic 3 → Basic 4–6) → promote (moved into target class for teacher confirmation)
 *      - Same band class (e.g. Basic 1 → Basic 2 inside Basic 1–3) → upgrade_in_place
 *   3. Any grade whose next grade has NO class in this school (e.g. Basic 6 in a Primary-only school or JSS 3 with no SS 1) → mark_inactive
 *
 * Strictly skips specialized classes (Summer School / Bootcamp / Online / Coding Club).
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: schoolId } = await context.params;
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: caller } = await admin
      .from('portal_users')
      .select('id, role, full_name')
      .eq('id', user.id)
      .maybeSingle();

    if (!caller || !['admin', 'teacher'].includes(caller.role)) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run !== false;
    const scopedClassId = typeof body?.class_id === 'string' && body.class_id.trim() ? body.class_id.trim() : null;

    // Teachers may ONLY roll over their own assigned class — never another teacher's class.
    if (caller.role === 'teacher' && !scopedClassId) {
      return NextResponse.json(
        { error: 'Teachers must specify class_id to roll over their own assigned class.' },
        { status: 403 },
      );
    }

    const { data: school, error: schoolErr } = await admin
      .from('schools')
      .select('id, name')
      .eq('id', schoolId)
      .maybeSingle();

    if (schoolErr) return NextResponse.json({ error: schoolErr.message }, { status: 500 });
    if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 });

    const { data: classes, error: clsErr } = await admin
      .from('classes')
      .select('id, name, program_id, term_id, school_id, teacher_id, status')
      .eq('school_id', schoolId)
      .order('name');

    if (clsErr) return NextResponse.json({ error: clsErr.message }, { status: 500 });

    const activeClasses = (classes ?? []).filter(
      (c: any) =>
        !['archived', 'inactive', 'completed'].includes(String(c.status || '').toLowerCase()) &&
        !isSpecializedProgramRecord(null, c.name),
    );

    if (caller.role === 'teacher' && scopedClassId) {
      const owned = activeClasses.find((c: any) => c.id === scopedClassId && c.teacher_id === caller.id);
      if (!owned) {
        return NextResponse.json(
          { error: 'You can only run rollover for a class assigned to you.' },
          { status: 403 },
        );
      }
    }

    type ParsedClass = { cls: any; grades: CanonicalGrade[]; isBand: boolean };
    const parsedClasses: ParsedClass[] = [];
    const skippedClasses: Array<{ id: string; name: string; reason: string }> = [];

    for (const cls of activeClasses) {
      const parsed = parseClassGrades(cls.name);
      if (parsed.grades.length === 0) {
        skippedClasses.push({
          id: cls.id,
          name: cls.name,
          reason: 'Custom / non-grade class (manage manually inside Class Intake)',
        });
        continue;
      }
      parsedClasses.push({ cls, ...parsed });
    }

    /**
     * Find the best destination class in this school for `nextGrade`.
     * Priority:
     *   1. Exact single-grade class covering `nextGrade` (same teacher > same programme > any)
     *   2. Band class covering `nextGrade` (same class > same teacher > same programme > any)
     */
    const findTargetClass = (nextGrade: CanonicalGrade, fromCls: any): any | null => {
      const candidates = parsedClasses.filter((p) => p.grades.includes(nextGrade));
      if (candidates.length === 0) return null;

      candidates.sort((a, b) => {
        // Prefer exact single-grade tier (e.g. dedicated SS 1 class) over a wide band
        const exactA = a.isBand ? 1 : 0;
        const exactB = b.isBand ? 1 : 0;
        if (exactA !== exactB) return exactA - exactB;
        // Prefer same class if staying inside the same band
        const sameClsA = a.cls.id === fromCls.id ? 0 : 1;
        const sameClsB = b.cls.id === fromCls.id ? 0 : 1;
        if (sameClsA !== sameClsB) return sameClsA - sameClsB;
        // Prefer same teacher
        const sameTeacherA = fromCls.teacher_id && a.cls.teacher_id === fromCls.teacher_id ? 0 : 1;
        const sameTeacherB = fromCls.teacher_id && b.cls.teacher_id === fromCls.teacher_id ? 0 : 1;
        if (sameTeacherA !== sameTeacherB) return sameTeacherA - sameTeacherB;
        // Prefer same programme
        const sameProgA = fromCls.program_id && a.cls.program_id === fromCls.program_id ? 0 : 1;
        const sameProgB = fromCls.program_id && b.cls.program_id === fromCls.program_id ? 0 : 1;
        return sameProgA - sameProgB;
      });
      return candidates[0].cls;
    };

    const currentSession = getSessionBoundary().periodLabel;
    const sourceClasses = scopedClassId
      ? parsedClasses.filter((p) => p.cls.id === scopedClassId)
      : parsedClasses;
    const classIds = sourceClasses.map((p) => p.cls.id);
    const studentsByClass = new Map<string, Array<{ id: string; full_name: string | null; grade: string | null; email: string | null }>>();
    const alreadyRolledOverIds = new Set<string>();

    if (classIds.length > 0) {
      const { data: activeStudents } = await admin
        .from('portal_users')
        .select('id, full_name, email, class_id, grade')
        .eq('role', 'student')
        .eq('is_active', true)
        .in('class_id', classIds);

      const allStudentIds = ((activeStudents ?? []) as any[]).map((s) => s.id).filter(Boolean);

      // DOUBLE-PROMOTION GUARD: check students.session_history for currentSession so
      // if either the teacher OR admin already promoted/confirmed a student this session,
      // they are automatically skipped and can NEVER be promoted twice!
      if (allStudentIds.length > 0) {
        const { data: studentRecords } = await (admin as any)
          .from('students')
          .select('user_id, session_history')
          .in('user_id', allStudentIds);
        for (const rec of (studentRecords ?? []) as any[]) {
          const hist = Array.isArray(rec.session_history) ? rec.session_history : [];
          const doneThisSession = hist.some(
            (h: any) =>
              String(h?.session || '') === currentSession &&
              ['promoted', 'upgraded', 'confirmed_current', 'rollover_promoted', 'rollover_upgraded', 'rollover_graduated'].includes(
                String(h?.action || ''),
              ),
          );
          if (doneThisSession && rec.user_id) {
            alreadyRolledOverIds.add(rec.user_id);
          }
        }
      }

      for (const st of (activeStudents ?? []) as any[]) {
        if (alreadyRolledOverIds.has(st.id)) continue;
        const cid = String(st.class_id || '');
        if (!cid) continue;
        const arr = studentsByClass.get(cid) ?? [];
        arr.push({ id: st.id, full_name: st.full_name, grade: st.grade, email: st.email });
        studentsByClass.set(cid, arr);
      }
    }

    // Group transitions by (from_class_id, from_grade) and sort strictly top-down (SS 3 → Basic 1)
    const planBuckets = new Map<string, PlanRow & { ladderIndex: number }>();

    for (const pc of sourceClasses) {
      const roster = studentsByClass.get(pc.cls.id) ?? [];
      for (const st of roster) {
        const currentGrade =
          canonicalizeSingleGrade(st.grade) ??
          (!pc.isBand ? pc.grades[0] : pc.grades[0]);
        const ladderIndex = GRADE_LADDER.indexOf(currentGrade);
        if (ladderIndex < 0) continue;

        let action: PlanRow['action'];
        let targetClass: any = null;
        let nextGrade: CanonicalGrade | null = null;

        if (ladderIndex === GRADE_LADDER.length - 1) {
          action = 'archive_graduated';
        } else {
          nextGrade = GRADE_LADDER[ladderIndex + 1];
          targetClass = findTargetClass(nextGrade, pc.cls);
          if (!targetClass) {
            action = 'mark_inactive';
          } else if (targetClass.id === pc.cls.id) {
            action = 'upgrade_in_place';
          } else {
            action = 'promote';
          }
        }

        const bucketKey = `${pc.cls.id}::${currentGrade}::${action}::${targetClass?.id || 'none'}`;
        const existing = planBuckets.get(bucketKey);
        if (existing) {
          existing.student_count += 1;
          existing.student_ids.push(st.id);
        } else {
          planBuckets.set(bucketKey, {
            row_key: bucketKey,
            from_class_id: pc.cls.id,
            from_class_name: pc.cls.name,
            from_grade: currentGrade,
            to_class_id: targetClass?.id ?? null,
            to_class_name:
              action === 'archive_graduated'
                ? 'Graduated Archive'
                : action === 'mark_inactive'
                  ? `Inactive (no ${nextGrade} class)`
                  : targetClass?.name ?? null,
            to_grade: action === 'archive_graduated' ? 'Graduated' : nextGrade,
            action,
            student_count: 1,
            student_ids: [st.id],
            ladderIndex,
          });
        }
      }
    }

    // Top-down execution order (SS 3 first, Basic 1 last) so promotions never collide!
    const sortedPlan = Array.from(planBuckets.values()).sort((a, b) => b.ladderIndex - a.ladderIndex);
    const totalStudentsAffected = sortedPlan.reduce((sum, p) => sum + p.student_count, 0);
    const availableClasses = activeClasses.map((c: any) => ({ id: c.id, name: c.name }));

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        school_id: school.id,
        school_name: school.name,
        current_session: currentSession,
        already_rolled_over_count: alreadyRolledOverIds.size,
        plan: sortedPlan.map(({ student_ids: _ids, ladderIndex: _idx, ...rest }) => rest),
        available_classes: availableClasses,
        skipped_classes: skippedClasses,
        total_students_affected: totalStudentsAffected,
      });
    }

    const rawOverrides: RolloverOverride[] = Array.isArray(body?.overrides) ? body.overrides : [];
    const overrideMap = new Map<string, RolloverOverride>();
    for (const ov of rawOverrides) {
      if (ov?.row_key) overrideMap.set(String(ov.row_key), ov);
    }
    const validClassIds = new Set(activeClasses.map((c: any) => c.id));
    const requireTeacherConfirmation = body?.require_teacher_confirmation !== false;

    const effectivePlan = sortedPlan
      .map((step) => {
        const ov = overrideMap.get(step.row_key);
        if (!ov) return step;
        if (ov.enabled === false) return null;
        const nextAction = ov.action ?? step.action;
        let nextToClassId = ov.to_class_id !== undefined ? ov.to_class_id : step.to_class_id;
        if (nextAction === 'promote') {
          if (!nextToClassId || !validClassIds.has(nextToClassId)) return null;
          if (nextToClassId === step.from_class_id) {
            return { ...step, action: 'upgrade_in_place' as const, to_class_id: step.from_class_id };
          }
        } else if (nextAction === 'archive_graduated' || nextAction === 'mark_inactive') {
          nextToClassId = null;
        }
        return { ...step, action: nextAction, to_class_id: nextToClassId };
      })
      .filter((s): s is NonNullable<typeof s> => Boolean(s));

    let promoted = 0;
    let upgradedInPlace = 0;
    let archived = 0;
    let inactivated = 0;
    let failed = 0;
    const touchedClassIds = new Set<string>();
    const nowIso = new Date().toISOString();

    const appendSessionHistory = async (
      studentIds: string[],
      entryAction: string,
      fromGrade: string,
      toGrade: string | null,
      toClassId: string | null,
    ) => {
      if (studentIds.length === 0) return;
      const { data: rows } = await (admin as any)
        .from('students')
        .select('id, user_id, session_history')
        .in('user_id', studentIds);
      for (const r of (rows ?? []) as any[]) {
        const hist = Array.isArray(r.session_history) ? r.session_history : [];
        const nextEntry = {
          session: currentSession,
          action: entryAction,
          from_grade: fromGrade,
          to_grade: toGrade,
          class_id: toClassId,
          actor_id: caller.id,
          at: nowIso,
        };
        await (admin as any)
          .from('students')
          .update({ session_history: [...hist, nextEntry] })
          .eq('id', r.id);
      }
    };

    for (const step of effectivePlan) {
      touchedClassIds.add(step.from_class_id);
      if (step.to_class_id) touchedClassIds.add(step.to_class_id);

      if (step.action === 'archive_graduated' || step.action === 'mark_inactive') {
        const isGrad = step.action === 'archive_graduated';
        await (admin as any)
          .from('class_term_rosters')
          .update({ status: 'withdrawn', ended_at: nowIso, updated_by: caller.id })
          .eq('class_id', step.from_class_id)
          .in('student_id', step.student_ids);

        const { error: clearErr } = await admin
          .from('portal_users')
          .update({
            class_id: null,
            is_active: false,
            section_class: isGrad ? `Graduated (${currentSession})` : `Inactive — Awaiting ${step.to_grade} (${currentSession})`,
            updated_at: nowIso,
          })
          .in('id', step.student_ids);

        await admin
          .from('students')
          .update({
            is_active: false,
            status: isGrad ? 'graduated' : 'inactive',
            updated_at: nowIso,
          })
          .in('user_id', step.student_ids);

        if (clearErr) failed += step.student_ids.length;
        else if (isGrad) archived += step.student_ids.length;
        else inactivated += step.student_ids.length;
        continue;
      }

      if (step.action === 'upgrade_in_place' && step.to_grade) {
        const { error: upgErr } = await admin
          .from('portal_users')
          .update({ grade: step.to_grade, updated_at: nowIso })
          .in('id', step.student_ids);

        await admin
          .from('students')
          .update({ grade: step.to_grade, grade_level: step.to_grade, updated_at: nowIso })
          .in('user_id', step.student_ids);

        if (upgErr) failed += step.student_ids.length;
        else {
          upgradedInPlace += step.student_ids.length;
          await appendSessionHistory(step.student_ids, 'rollover_upgraded', step.from_grade, step.to_grade, step.from_class_id);
        }
        continue;
      }

      if (step.action === 'promote' && step.to_class_id) {
        const promotedIds: string[] = [];
        for (const sid of step.student_ids) {
          const result = await reinstateStudentToClass(admin as any, {
            studentId: sid,
            classId: step.to_class_id,
            actor: { id: caller.id, role: 'admin' },
            grade: step.to_grade,
            forceCrossTeacher: true,
          });
          if (result.ok) {
            promoted += 1;
            promotedIds.push(sid);
          } else {
            failed += 1;
          }
        }
        await appendSessionHistory(promotedIds, 'rollover_promoted', step.from_grade, step.to_grade, step.to_class_id);
      }
    }

    for (const cid of touchedClassIds) {
      const { data: activeCount } = await (admin as any).rpc('active_class_student_count', {
        p_class_id: cid,
      });
      await admin
        .from('classes')
        .update({ current_students: Number(activeCount ?? 0) })
        .eq('id', cid);
    }

    await logAudit(admin as any, {
      actorId: caller.id,
      action: 'school_session_rollover',
      resourceType: 'school',
      resourceId: school.id,
      newValues: {
        school_name: school.name,
        session: currentSession,
        require_teacher_confirmation: requireTeacherConfirmation,
        promoted,
        upgraded_in_place: upgradedInPlace,
        archived,
        inactivated,
        failed,
      },
    });

    return NextResponse.json({
      ok: true,
      dry_run: false,
      school_id: school.id,
      school_name: school.name,
      promoted,
      upgraded_in_place: upgradedInPlace,
      archived,
      inactivated,
      failed,
      message: `Rollover complete for ${school.name}: ${promoted} moved to next class, ${upgradedInPlace} upgraded in band, ${archived} graduated, ${inactivated} marked inactive${failed ? `, ${failed} skipped` : ''}.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Rollover failed' }, { status: 500 });
  }
}
