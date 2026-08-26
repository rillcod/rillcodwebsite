import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
import { reuseWeekContent } from "@/lib/academic/content-reuse-server";
import { parseRequestSession } from "@/lib/academic/session-identity";
import {
  extractLessonPlanOperationWeeks,
  filterPlanOperationWeeks,
  getMetadataWeekCompositeKey,
  getPlanWeekSession,
  getWeekCompositeKey,
  parseWeekTermRefs,
  planWeekSessionMetadata,
} from "@/lib/progression/lessonPlanOperation";
import {
  canAccessLessonScope,
  requireStaffUser,
} from "@/app/api/lesson-plans/authz";
import {
  indexFirstByWeekSession,
  weekSessionLookupKey,
} from "@/lib/academic/week-package";
import { getTeacherSchoolIds } from "@/lib/auth-utils";
import { createSSEResponse } from "@/lib/sse-stream";
import { nextGenerationIncidentMetadata } from "@/lib/operations/generation-incidents";
import { extractCronSecret, isValidCronSecret } from "@/lib/server/cron-auth";

/**
 * Assignment kinds this generator is allowed to write.
 *
 * "project" is deliberately absent: projects are a separate week asset with
 * their own generator, and a project written here is invisible to the dedup
 * check below, which excludes projects by design.
 */
const HOMEWORK_TYPES = ["homework", "quiz", "coding", "presentation", "exam"];

function assignmentTypeFor(raw: unknown): string {
  const value = String(raw ?? "").toLowerCase();
  return HOMEWORK_TYPES.includes(value) ? value : "homework";
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const sessionClient = await createServerClient();
    const cronSecret = extractCronSecret(req);
    const isCron = isValidCronSecret(cronSecret);
    const staff = isCron
      ? { id: "cron", role: "admin", school_id: null }
      : await requireStaffUser(sessionClient);
    if (!staff)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Identity from the session client, data work on the admin client — the
    // same split generate-slides uses. Without it a cron run has no session,
    // RLS returns zero rows, and a plan that exists reports as not found.
    const supabase = createAdminClient();

    const { data: plan, error: planErr } = await (supabase as any)
      .from("lesson_plans")
      .select(
        "*, courses(title, programs(name)), classes!lesson_plans_class_id_fkey(name,teacher_id), official_curriculum:academic_curriculum_releases!lesson_plans_curriculum_release_id_fkey(content, release_number, title), curriculum:course_curricula(content, version)"
      )
      .eq("id", id)
      .single();

    const validationError = validateLessonPlanForGeneration(
      planErr ? null : plan
    );
    if (validationError) {
      const { status, ...payload } = validationError;
      return NextResponse.json(payload, { status });
    }
    if (!isCron && staff.role !== "admin") {
      const klass = Array.isArray(plan?.classes)
        ? plan.classes[0]
        : plan?.classes;
      const teacherSchoolIds =
        staff.role === "teacher"
          ? await getTeacherSchoolIds(staff.id, staff.school_id)
          : [];
      const allowed = canAccessLessonScope(
        staff,
        {
          school_id: plan?.school_id ?? null,
          created_by: plan?.created_by ?? null,
          class_id: plan?.class_id ?? null,
          class_teacher_id: klass?.teacher_id ?? null,
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
    // Special / duration offerings often have no school term. Do not stamp the
    // live term — that mixes holiday work into the school gradebook.
    const planOfferingId = (plan as { academic_offering_id?: string | null })
      .academic_offering_id;
    const assignmentTermId = await resolveAssignmentTermId(supabase as any, {
      classId: (plan as { class_id?: string | null }).class_id ?? null,
      period: {
        class_id: (plan as { class_id?: string | null }).class_id ?? null,
        school_id: planSchoolId,
        academic_offering_id: planOfferingId ?? null,
        offering_period_id:
          (plan as { offering_period_id?: string | null }).offering_period_id ??
          null,
      },
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
    const onlySession = parseRequestSession(body as Record<string, unknown>);
    // Opt-in publish: anything other than an explicit true is held for approval.
    // Matches auto-generate-settings and generate-projects — missing must not go live.
    const assignmentActive = body.auto_publish === true;
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
    const targetWeeks = filterPlanOperationWeeks(
      weeks as unknown as Array<Record<string, unknown>>,
      { onlyWeeks, onlySession }
    ) as typeof weeks;

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
    const lessonsByWeek = indexFirstByWeekSession<any>(
      linkedLessonResult.data ?? []
    );

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

          // Copy this week's assignment from a class that already has it,
          // rather than paying the AI for the same homework once per class.
          //
          // Matched on the generated_from marker, not assignment_type: both
          // this route and generate-projects write to `assignments`, and
          // copying a project over homework would leave the week with two
          // projects and no exercise — the exact failure assignmentTypeFor
          // above exists to prevent.
          //
          // due_date is the copying class's own, because the source class's
          // term started on a different day.
          const reuse = await reuseWeekContent({
            db: supabase as never,
            table: "assignments",
            releaseId: (plan as { curriculum_release_id?: string | null })?.curriculum_release_id ?? null,
            week: week.week,
            session:
              getPlanWeekSession(
                week as unknown as Record<string, unknown>
              ) || 1,
            targetPlanId: plan.id,
            classId: plan.class_id ?? null,
            match: { "metadata->>generated_from": "progression_assignment_route" },
            scope: {
              schoolId: planSchoolId,
              schoolName: null,
              termId: assignmentTermId,
              courseId: planCourseId,
              createdBy: (isCron ? plan.created_by : staff.id) as string | null,
              lessonId:
                lessonsByWeek.get(
                  weekSessionLookupKey(
                    Number(week.week),
                    getPlanWeekSession(week as unknown as Record<string, unknown>)
                  )
                )?.id ?? null,
              offeringId: (plan as any).academic_offering_id ?? null,
              periodId: (plan as any).offering_period_id ?? null,
            },
            overrides: {
              due_date: dueDate.toISOString(),
              is_active: assignmentActive,
            },
          });

          if (reuse.copied) {
            generated++;
            emit({
              generated,
              total,
              current: week.week,
              status: `Week ${week.week} assignment copied from this curriculum (no AI needed)`,
            });
            continue;
          }

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
            aiData = await fetchAIGenerate({
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
            });
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
              lesson_id:
                lessonsByWeek.get(
                  weekSessionLookupKey(
                    Number(week.week),
                    getPlanWeekSession(
                      week as unknown as Record<string, unknown>
                    )
                  )
                )?.id ?? null,
              class_id: plan.class_id,
              created_by: isCron ? plan.created_by : staff.id,
              school_id: planSchoolId,
              term_id: assignmentTermId,
              lesson_plan_id: plan.id,
              curriculum_release_id: plan.curriculum_release_id,
              academic_offering_id: plan.academic_offering_id,
              offering_period_id: plan.offering_period_id,
              curriculum_week_number: week.week,
              session_number:
                getPlanWeekSession(
                  week as unknown as Record<string, unknown>
                ) || 1,
              title: (d.title || `${week.topic} Assignment`) as string,
              description: (d.description || "") as string,
              instructions: (d.instructions || "") as string,
              // The route decides this, not the model. Asked for homework, the
              // model sometimes answered "project" — which stored a project,
              // left the week with two projects and no homework, and then hid
              // the row from this generator's own dedup check (it excludes
              // projects). The sweep therefore produced another one every
              // night, without limit.
              assignment_type: assignmentTypeFor(d.assignment_type),
              due_date: dueDate.toISOString(),
              max_points: 100,
              is_active: assignmentActive,
              metadata: {
                ...(d.metadata as Record<string, unknown> | undefined),
                generated_from: "progression_assignment_route",
                lesson_plan_id: plan.id,
                week: week.week,
                week_number: week.week,
                ...planWeekSessionMetadata(
                  week as unknown as Record<string, unknown>
                ),
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

      const { error: incidentError } = await supabase
        .from("lesson_plans")
        .update({
          metadata: nextGenerationIncidentMetadata((plan as any)?.metadata, "assignments", failures),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .eq("id", id);
      if (incidentError) {
        console.error("Could not update assignment generation incident state:", incidentError);
        emit({ warning: "The assignments finished, but their health status could not be refreshed." });
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
