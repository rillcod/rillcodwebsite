import type { SupabaseClient } from '@supabase/supabase-js';
import { classMemberIds } from '@/lib/rosters/membership';
import {
  buildClassPromotionPlan,
  type PromotionClassRow,
  type PromotionStudentRow,
} from '@/lib/classes/class-promotion';
import type { ProgrammeCatalogRow } from '@/lib/classes/programme-transition';
import { reinstateStudentToClass } from '@/lib/students/reinstate-to-class';
import {
  advanceCurriculumTrackOnClassPromote,
  nextTermLabelForClassPromotion,
} from '@/lib/progression/advance-on-class-promote';
import {
  enrichPromotionPlanWithIntelligence,
  type IntelligentClassPromotionPlan,
  type SmartPromotionOptions,
} from '@/lib/progression/enrich-class-promotion';
import { loadPromotionEvidenceByStudent, loadPromotionRules } from '@/lib/progression/promotion-settings';
import {
  ensureTeenProgrammeEnrollment,
  suspendProgrammeEnrollment,
} from '@/lib/progression/enroll-teen-entry';

export type PromotionContext = {
  sourceClass: PromotionClassRow;
  programName: string | null;
  students: PromotionStudentRow[];
  schoolClasses: PromotionClassRow[];
  programs: ProgrammeCatalogRow[];
};

export type PromotionApplyResult = {
  student_id: string;
  ok: boolean;
  error?: string;
  to_class_id?: string;
  curriculum_advanced?: boolean;
  programme_transition?: boolean;
};

export function parseSmartPromotionOptions(input: {
  searchParams?: URLSearchParams;
  body?: Record<string, unknown>;
}): SmartPromotionOptions {
  const sp = input.searchParams;
  const b = input.body ?? {};
  const advanceRaw = String(sp?.get('advance_curriculum') ?? b.advance_curriculum ?? 'auto');
  const advance_curriculum =
    advanceRaw === 'always' || advanceRaw === 'never' ? advanceRaw : 'auto';
  return {
    smart_mode: sp?.get('smart_mode') !== '0' && b.smart_mode !== false,
    strict_class_gate: sp?.get('strict_class_gate') === '1' || b.strict_class_gate === true,
    advance_curriculum,
  };
}

export async function loadProgramCatalog(
  admin: SupabaseClient,
  seedProgramIds: Array<string | null | undefined>,
): Promise<ProgrammeCatalogRow[]> {
  const programIds = [...new Set(seedProgramIds.filter(Boolean) as string[])];
  let programs: ProgrammeCatalogRow[] = [];
  if (programIds.length) {
    const { data: programRows } = await admin.from('programs').select('id, name').in('id', programIds);
    programs = (programRows ?? []) as ProgrammeCatalogRow[];
  }
  const { data: tierPrograms } = await admin
    .from('programs')
    .select('id, name')
    .eq('is_active', true)
    .or('name.ilike.%teen%,name.ilike.%young%,name.ilike.%innovator%,name.ilike.%developer%');
  for (const p of tierPrograms ?? []) {
    if (!programs.some((x) => x.id === p.id)) programs.push(p as ProgrammeCatalogRow);
  }
  return programs;
}

export async function loadPromotionContext(
  admin: SupabaseClient,
  classId: string,
  studentIds?: string[],
): Promise<PromotionContext | { error: string }> {
  const { data: sourceClass, error: clsErr } = await admin
    .from('classes')
    .select('id, name, school_id, program_id, term_id, teacher_id, qa_grade_key, qa_grade_band, programs:program_id(name)')
    .eq('id', classId)
    .maybeSingle();
  if (clsErr || !sourceClass) return { error: 'Class not found' };

  let programName: string | null = null;
  const prog = (sourceClass as { programs?: { name?: string | null } | null }).programs;
  if (prog && typeof prog === 'object' && 'name' in prog) programName = prog.name ?? null;

  const { data: rosterRows } = await (admin as any)
    .from('class_term_rosters')
    .select('class_id, student_id, term_id, status')
    .eq('class_id', classId);

  const { data: learners } = await admin
    .from('portal_users')
    .select('id, full_name, email, grade, class_id, is_deleted, is_active')
    .eq('class_id', classId)
    .eq('role', 'student')
    .eq('is_deleted', false);

  const memberIds = classMemberIds({
    classId,
    termId: sourceClass.term_id ?? null,
    rosterRows: rosterRows ?? [],
    learners: (learners ?? []).map((l: { id: string; class_id: string | null; is_active: boolean | null; is_deleted: boolean | null }) => ({
      id: l.id,
      class_id: l.class_id,
      is_active: l.is_active,
      is_deleted: l.is_deleted,
    })),
  });

  let students: PromotionStudentRow[] = (learners ?? [])
    .filter((l: { id: string }) => memberIds.has(l.id))
    .map((l: { id: string; full_name: string | null; email: string | null; grade: string | null }) => ({
      id: l.id,
      full_name: l.full_name,
      email: l.email,
      grade: l.grade,
    }));

  if (studentIds?.length) {
    const allow = new Set(studentIds);
    students = students.filter((s) => allow.has(s.id));
  }

  const { data: schoolClasses } = await admin
    .from('classes')
    .select('id, name, school_id, program_id, term_id, teacher_id, qa_grade_key, qa_grade_band, band_lvl, band_low, band_high, status')
    .eq('school_id', sourceClass.school_id)
    .neq('status', 'archived');

  const programs = await loadProgramCatalog(
    admin,
    [sourceClass.program_id, ...(schoolClasses ?? []).map((c: { program_id?: string | null }) => c.program_id)],
  );

  return {
    sourceClass: sourceClass as PromotionClassRow,
    programName,
    students,
    schoolClasses: (schoolClasses ?? []) as PromotionClassRow[],
    programs,
  };
}

export async function buildSmartPromotionPlan(
  admin: SupabaseClient,
  ctx: PromotionContext,
  destinationClassId: string | null,
  smartOpts: SmartPromotionOptions,
): Promise<IntelligentClassPromotionPlan> {
  const base = buildClassPromotionPlan({
    sourceClass: ctx.sourceClass,
    students: ctx.students,
    schoolClasses: ctx.schoolClasses,
    destinationClassId,
    programName: ctx.programName,
    programs: ctx.programs,
  });
  const ids = ctx.students.map((s) => s.id);
  const [rules, evidence] = await Promise.all([
    loadPromotionRules(admin),
    loadPromotionEvidenceByStudent(admin, ids, ctx.sourceClass.term_id ?? null),
  ]);
  return enrichPromotionPlanWithIntelligence(base, evidence, rules, smartOpts);
}

export async function applyIntelligentPromotionPlan(
  admin: SupabaseClient,
  ctx: PromotionContext,
  plan: IntelligentClassPromotionPlan,
  caller: { id: string; role: string },
  opts: { forceCrossTeacher?: boolean } = {},
): Promise<PromotionApplyResult[]> {
  const forceCrossTeacher = opts.forceCrossTeacher ?? (caller.role === 'admin' || caller.role === 'school');
  const nextTermLabel = nextTermLabelForClassPromotion();
  const results: PromotionApplyResult[] = [];

  for (const move of plan.moves) {
    if (move.skipped) continue;

    if (caller.role === 'teacher' && !forceCrossTeacher) {
      const dest = ctx.schoolClasses.find((c) => c.id === move.destination_class_id);
      if (dest?.teacher_id && dest.teacher_id !== caller.id) {
        results.push({
          student_id: move.student_id,
          ok: false,
          error: `Destination "${move.destination_class_name}" is owned by another teacher.`,
        });
        continue;
      }
    }

    const outcome = await reinstateStudentToClass(admin, {
      studentId: move.student_id,
      classId: move.destination_class_id,
      actor: { id: caller.id, role: caller.role },
      grade: move.to_grade,
      forceCrossTeacher,
    });

    if (outcome.ok) {
      let curriculum_advanced = false;
      const dest = ctx.schoolClasses.find((c) => c.id === move.destination_class_id);

      if (move.programme_transition && ctx.sourceClass.program_id) {
        await suspendProgrammeEnrollment(admin, move.student_id, ctx.sourceClass.program_id);
      }

      // Category change into Teen: seed entry course (not the same as mid-year program speed).
      if (move.programme_transition && dest?.program_id) {
        const teen = await ensureTeenProgrammeEnrollment(
          admin,
          move.student_id,
          dest.program_id,
          ctx.sourceClass.school_id ?? null,
          nextTermLabel,
        );
        curriculum_advanced = teen.enrolled;
      } else if (move.curriculum_planned) {
        const curriculum = await advanceCurriculumTrackOnClassPromote(admin, move.student_id, nextTermLabel);
        curriculum_advanced = curriculum.advanced;
      }
      results.push({
        student_id: move.student_id,
        ok: true,
        to_class_id: move.destination_class_id,
        curriculum_advanced,
        programme_transition: move.programme_transition,
      });
    } else {
      results.push({ student_id: move.student_id, ok: false, error: outcome.error });
    }
  }

  return results;
}

export async function resyncSourceClassCount(admin: SupabaseClient, classId: string) {
  const { data: afterCount } = await (admin as any).rpc('active_class_student_count', { p_class_id: classId });
  await admin.from('classes').update({ current_students: Number(afterCount ?? 0) }).eq('id', classId);
}
