import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { canonicalPlanCurriculum } from "@/lib/curriculum/official-direction";

export const dynamic = "force-dynamic";
import {
  buildSyllabusAnchorText,
  findSyllabusWeek,
  inferTermNumberFromPlanTerm,
  type SyllabusContentImport,
} from "@/lib/lesson-plans/syllabusImport";
import { AIFetchError, fetchAIGenerate } from "@/lib/lesson-plans/ai-fetch";
import { validateLessonPlanForGeneration } from "@/lib/api-guards";
import {
  extractLessonPlanOperationWeeks,
  getMetadataWeekCompositeKey,
  getWeekCompositeKey,
  parseWeekTermRefs,
} from "@/lib/progression/lessonPlanOperation";
import {
  canAccessLessonScope,
  requireStaffUser,
} from "@/app/api/lesson-plans/authz";
import { indexFirstByWeek } from "@/lib/academic/week-package";
import { getTeacherSchoolIds } from "@/lib/auth-utils";
import { createSSEResponse } from "@/lib/sse-stream";
import { extractCronSecret, isValidCronSecret } from "@/lib/server/cron-auth";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const supabase = await createServerClient();
    const cronSecret = extractCronSecret(req);
    const isCron = isValidCronSecret(cronSecret);
    const staff = isCron
      ? { id: "cron", role: "admin", school_id: null }
      : await requireStaffUser(supabase);
    if (!staff)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: plan, error: planErr } = await (supabase as any)
      .from("lesson_plans")
      .select(
        "*, courses(title, programs(name)), classes!lesson_plans_class_id_fkey(name), official_curriculum:academic_curriculum_releases!lesson_plans_curriculum_release_id_fkey(content, release_number, title), curriculum:course_curricula(content, version)"
      )
      .eq("id", id)
      .single();

    const validationError = validateLessonPlanForGeneration(
      planErr ? null : plan
    );
    if (validationError)
      return NextResponse.json(
        { error: validationError.error },
        { status: validationError.status }
      );
    if (!isCron && staff.role !== "admin") {
      const teacherSchoolIds =
        staff.role === "teacher"
          ? await getTeacherSchoolIds(staff.id, staff.school_id)
          : [];
      const allowed = canAccessLessonScope(
        staff,
        {
          school_id: plan?.school_id ?? null,
          created_by: plan?.created_by ?? null,
        },
        teacherSchoolIds
      );
      if (!allowed)
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const planCourseId = plan.course_id as string;
    const planSchoolId = plan.school_id as string;
    const { resolveAssignmentTermId } = await import(
      "@/lib/assignments/session"
    );
    const assignmentTermId = await resolveAssignmentTermId(supabase as any, {
      classId: (plan as { class_id?: string | null }).class_id ?? null,
    });

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const dryRun = body.dry_run === true;
    const maxWeeks =
      typeof body.max_weeks === "number" && body.max_weeks > 0
        ? body.max_weeks
        : undefined;

    // Optional single-week (or subset) targeting, so a per-week UI can drive
    // the same grounded generator the bulk run uses.
    const onlyWeeks = Array.isArray((body as any).only_weeks)
      ? ((body as any).only_weeks as unknown[])
          .map((w) => Number(w))
          .filter((w) => Number.isFinite(w))
      : null;
    // Auto-publish generated assignments by default (visible to students).
    // Pass auto_publish:false to keep them hidden for manual review.
    const assignmentActive = body.auto_publish !== false;
    const extraHeaders = isCron ? { "x-cron-secret": cronSecret } : undefined;
    const weeks = extractLessonPlanOperationWeeks(plan.plan_data) as Array<{
      week: number;
      topic: string;
      objectives?: string;
      activities?: string;
      syllabus_ref?: {
        year_number?: number;
        term_number?: number;
        week_number?: number;
      };
    }>;
    const targetWeeks =
      onlyWeeks && onlyWeeks.length
        ? weeks.filter((w) => onlyWeeks.includes(Number(w.week)))
        : weeks;

    const [existingResult, linkedLessonResult] = await Promise.all([
      supabase
        .from("assignments")
        .select(
          "id,metadata,assignment_type,lesson_plan_id,curriculum_week_number"
        )
        .neq("assignment_type", "project")
        .or(`lesson_plan_id.eq.${id},metadata->>lesson_plan_id.eq.${id}`),
      supabase
        .from("lessons")
        .select("id,curriculum_week_number,metadata")
        .or(`lesson_plan_id.eq.${id},metadata->>lesson_plan_id.eq.${id}`)
        .order("created_at", { ascending: false }),
    ]);
    const existingAssignments = existingResult.data ?? [];
    const lessonsByWeek = indexFirstByWeek<any>(linkedLessonResult.data ?? []);

    const existingWeekSet = new Set<string>(
      (existingAssignments ?? []).map((a) =>
        getMetadataWeekCompositeKey({
          ...((a.metadata as Record<string, unknown> | null) ?? {}),
          ...(a.curriculum_week_number
            ? { week: a.curriculum_week_number }
            : {}),
        })
      )
    );

    const projectedSkips = targetWeeks.filter((w) =>
      existingWeekSet.has(
        getWeekCompositeKey(w as unknown as Record<string, unknown>)
      )
    ).length;

    if (dryRun) {
      return NextResponse.json({
        data: {
          dry_run: true,
          total_weeks: targetWeeks.length,
          projected_generations: targetWeeks.length - projectedSkips,
          projected_skips: projectedSkips,
          target: "assignments",
        },
      });
    }

    if (targetWeeks.length === 0) {
      return NextResponse.json(
        {
          error: onlyWeeks?.length
            ? "That week is not in this teaching plan"
            : "No weeks defined in plan",
        },
        { status: 422 }
      );
    }

    const curriculumContent = canonicalPlanCurriculum(plan)?.content as
      | SyllabusContentImport
      | undefined;
    const termNum = inferTermNumberFromPlanTerm(plan.term);
    const programName = (
      plan.courses as { programs?: { name?: string | null } | null } | null
    )?.programs?.name;
    const termStart = plan.term_start ? new Date(plan.term_start) : new Date();
    const cadenceDays = 7;
    const appBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    const cookieHeader = req.headers.get("cookie") || "";

    return createSSEResponse(async (emit) => {
      let generated = 0;
      let skipped = 0;
      const total = targetWeeks.length;
      const titlesThisRun: string[] = [];
      const failures: { week: number; topic: string; reason: string }[] = [];

      for (const week of targetWeeks) {
        try {
          emit({
            generated,
            total,
            current: week.week,
            status: `Generating assignment for Week ${week.week}: ${week.topic}...`,
          });

          if (
            existingWeekSet.has(
              getWeekCompositeKey(week as unknown as Record<string, unknown>)
            )
          ) {
            emit({
              generated,
              total,
              current: week.week,
              status: `Skipped Week ${week.week} (already exists)`,
            });
            skipped++;
            continue;
          }

          const dueDate = new Date(termStart);
          dueDate.setDate(dueDate.getDate() + week.week * cadenceDays);

          const { yearNumber, effectiveTermNum } = parseWeekTermRefs(
            week,
            termNum,
            (plan.plan_data as any)?.curriculum_year ?? 1
          );
          const syllabusWeek = findSyllabusWeek(
            curriculumContent,
            effectiveTermNum,
            week.week,
            yearNumber
          );
          const syllabusReference = buildSyllabusAnchorText(syllabusWeek);

          let aiData: { success: true; data: unknown };
          try {
            aiData = await fetchAIGenerate(
              appBaseUrl,
              cookieHeader,
              {
                type: "assignment",
                topic: week.topic,
                gradeLevel: plan.classes?.name || "Basic 1–SS3",
                subject: plan.courses?.title || "Coding & Technology",
                courseName: plan.courses?.title,
                programName,
                assignmentType: "homework",
                syllabusReference,
                planWeekObjectives:
                  typeof week.objectives === "string" ? week.objectives : "",
                planWeekActivities:
                  typeof week.activities === "string" ? week.activities : "",
                priorAssignmentTitlesThisRun: [...titlesThisRun],
              },
              extraHeaders
            );
          } catch (err) {
            const reason =
              err instanceof AIFetchError ? err.reason : "Unexpected AI error";
            failures.push({ week: week.week, topic: week.topic, reason });
            emit({
              generated,
              total,
              current: week.week,
              status: `Skipped Week ${week.week} — ${reason}`,
            });
            skipped++;
            continue;
          }

          const d = aiData.data as Record<string, unknown>;
          const { error: insertErr } = await supabase
            .from("assignments")
            .insert({
              course_id: planCourseId,
              lesson_id: lessonsByWeek.get(Number(week.week))?.id ?? null,
              class_id: plan.class_id,
              created_by: isCron ? plan.created_by : staff.id,
              school_id: planSchoolId,
              term_id: assignmentTermId,
              lesson_plan_id: plan.id,
              curriculum_release_id: plan.curriculum_release_id,
              academic_offering_id: plan.academic_offering_id,
              offering_period_id: plan.offering_period_id,
              curriculum_week_number: week.week,
              title: (d.title || `${week.topic} Assignment`) as string,
              description: (d.description || "") as string,
              instructions: (d.instructions || "") as string,
              assignment_type: (d.assignment_type || "homework") as string,
              due_date: dueDate.toISOString(),
              max_points: 100,
              is_active: assignmentActive,
              metadata: {
                ...(d.metadata as Record<string, unknown> | undefined),
                lesson_plan_id: plan.id,
                week: week.week,
                week_number: week.week,
                year_number:
                  Number.isFinite(yearNumber) && yearNumber > 0
                    ? yearNumber
                    : null,
                term_number:
                  Number.isFinite(effectiveTermNum) && effectiveTermNum > 0
                    ? effectiveTermNum
                    : null,
                ...(assignmentTermId ? { term_id: assignmentTermId } : {}),
              } as import("@/types/supabase").Json,
              questions: (d.questions ||
                []) as import("@/types/supabase").Json[],
            });

          if (insertErr) {
            console.error(
              `Failed to save assignment for week ${week.week}:`,
              insertErr
            );
            failures.push({
              week: week.week,
              topic: week.topic,
              reason: "Database save failed",
            });
            emit({
              generated,
              total,
              current: week.week,
              status: `Skipped Week ${week.week} — save error`,
            });
            skipped++;
            continue;
          }

          titlesThisRun.push((d.title || `${week.topic} Assignment`) as string);
          generated++;
          emit({
            generated,
            total,
            current: week.week,
            status: `Generated Week ${week.week}`,
          });
          if (maxWeeks && generated >= maxWeeks) break;
        } catch (err: unknown) {
          console.error(
            `Error generating assignment for week ${week.week}:`,
            err
          );
          failures.push({
            week: week.week,
            topic: week.topic,
            reason: "Unexpected error",
          });
          emit({
            generated,
            total,
            current: week.week,
            status: `Skipped Week ${week.week} — unexpected error`,
          });
          skipped++;
        }
      }

      if (failures.length > 0) {
        await supabase
          .from("lesson_plans")
          .update({
            metadata: {
              last_generation_errors: {
                assignments: failures,
                generated_at: new Date().toISOString(),
              },
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any)
          .eq("id", id);
      }

      emit({
        done: true,
        generated,
        skipped,
        total,
        failures,
        truncated: maxWeeks ? generated >= maxWeeks : false,
      });
    });
  } catch (err: unknown) {
    console.error("Bulk assignment generation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
