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
import { decideProjectSource } from "@/lib/academic/project-canon";
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
import { extractCronSecret, isValidCronSecret } from "@/lib/server/cron-auth";

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
        // classes.program_id is what links a plan to its project catalogue. The
        // registry is keyed by programme, and no plan carries a track — all 58
        // have metadata.track empty, so matching on track resolved nothing.
        "*, courses(title, programs(name)), classes!lesson_plans_class_id_fkey(name, program_id), official_curriculum:academic_curriculum_releases!lesson_plans_curriculum_release_id_fkey(content, release_number, title), curriculum:course_curricula(content, version)"
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
      period: {
        class_id: (plan as { class_id?: string | null }).class_id ?? null,
        school_id: planSchoolId,
        academic_offering_id:
          (plan as { academic_offering_id?: string | null })
            .academic_offering_id ?? null,
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
    // Omitting is_active used to inherit the DB default (true), so unattended
    // sweeps with hold-for-approval still put projects in front of students.
    const projectActive = body.auto_publish === true;
    const weeks = extractLessonPlanOperationWeeks(plan.plan_data) as Array<{
      week: number;
      topic: string;
      objectives?: string;
      activities?: string;
      notes?: string;
      project?: {
        title?: string;
        description?: string;
        deliverables?: string[];
      };
      practical_assessment?: {
        skill_checkpoints?: string[];
        max_score?: number;
      };
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
        .eq("assignment_type", "project")
        .or(`lesson_plan_id.eq.${id},metadata->>lesson_plan_id.eq.${id}`),
      supabase
        .from("lessons")
        .select("id,curriculum_week_number,metadata")
        .or(`lesson_plan_id.eq.${id},metadata->>lesson_plan_id.eq.${id}`)
        .order("created_at", { ascending: false }),
    ]);
    const existingProjects = existingResult.data ?? [];
    const lessonsByWeek = indexFirstByWeekSession<any>(
      linkedLessonResult.data ?? []
    );

    const existingWeekSet = new Set<string>(
      (existingProjects ?? [])
        // Use the shared helper, which also understands the legacy metadata
        // shape that only carries `week`. Reading week_number alone made every
        // older project invisible to this check and silently duplicated it.
        .map((a) =>
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
          target: "projects",
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
      const failures: { week: number; topic: string; reason: string }[] = [];

      for (const week of targetWeeks) {
        try {
          emit({
            generated,
            total,
            current: week.week,
            status: `Generating project for Week ${week.week}: ${week.topic}...`,
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
          dueDate.setDate(dueDate.getDate() + week.week * cadenceDays + 7);

          // Copy this week's project from a class that already has it. Matched
          // on the project marker so this can only ever copy a project — the
          // assignments route shares this table and generates homework into it.
          const reuse = await reuseWeekContent({
            db: supabase as never,
            table: "assignments",
            releaseId: (plan as { curriculum_release_id?: string | null })?.curriculum_release_id ?? null,
            week: week.week,
            targetPlanId: plan.id,
            classId: plan.class_id ?? null,
            match: { "metadata->>generated_from": "progression_project_route" },
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
              is_active: projectActive,
            },
          });

          if (reuse.copied) {
            generated++;
            emit({
              generated,
              total,
              current: week.week,
              status: `Week ${week.week} project copied from this curriculum (no AI needed)`,
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

          // Before asking the AI, look for a brief the Academic Office already
          // wrote for this week.
          //
          // curriculum_project_registry holds 21,354 authored slots and has
          // never been read once, while this route has invented a project per
          // class per week the whole time. Neither choice was right on its own:
          // an authored brief is better where it exists, and it does not exist
          // everywhere. So the canon wins when it is real and the AI covers the
          // rest — the same rule content-reuse.ts applies to lessons.
          //
          // 20,520 of those rows still hold a 71-character placeholder, which
          // is worse than what the AI writes, so decideProjectSource ignores
          // anything under SUBSTANTIVE_BRIEF_CHARS. Rewrite a shape in the
          // Project Library and every slot sharing it starts winning here
          // automatically — no flag, no migration between the two states.
          let canon: ReturnType<typeof decideProjectSource> = {
            source: "ai",
            reason: "no_match",
          };
          const planProgramId = (plan as any)?.classes?.program_id ?? null;
          if (planProgramId) {
            const { data: briefs } = await (supabase as any)
              .from("curriculum_project_registry")
              .select("id,title,classwork_prompt,estimated_minutes,concept_tags,difficulty_level")
              .eq("program_id", planProgramId)
              .ilike("title", `%Week ${week.week}:%`)
              .limit(10);
            canon = decideProjectSource(briefs ?? [], { week: week.week });
          }

          // The canon wins: no model call at all for this week.
          let aiData: { success: true; data: unknown };
          if (canon.source === "canon") {
            aiData = {
              success: true,
              data: {
                title: canon.title,
                description: canon.brief,
                instructions: canon.brief,
                estimated_minutes: canon.minutes,
              },
            };
            emit({
              generated,
              total,
              current: week.week,
              status: `Week ${week.week} project taken from the Project Library (no AI needed)`,
            });
          } else try {
            aiData = await fetchAIGenerate({
              type: "assignment",
              topic: week.topic,
              gradeLevel: plan.classes?.name || "Basic 1–SS3",
              subject: plan.courses?.title || "Coding & Technology",
              courseName: plan.courses?.title,
              assignmentType: "project",
              programName,
              syllabusReference,
              planWeekObjectives:
                typeof week.objectives === "string" ? week.objectives : "",
              planWeekActivities:
                typeof week.activities === "string" ? week.activities : "",
              projectTitle: week.project?.title || `${week.topic} Project`,
              projectDescription:
                week.project?.description || week.notes || "",
              projectDeliverables: Array.isArray(week.project?.deliverables)
                ? week.project!.deliverables
                : [],
              practicalCheckpoints: Array.isArray(
                week.practical_assessment?.skill_checkpoints
              )
                ? week.practical_assessment!.skill_checkpoints
                : [],
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
              // The join added by 20260929000005 and never once populated. It
              // is what turns "the catalogue is used" from a claim into a
              // countable fact.
              ...(canon.source === "canon"
                ? { project_template_id: canon.templateId }
                : {}),
              created_by: isCron ? plan.created_by : staff.id,
              school_id: planSchoolId,
              term_id: assignmentTermId,
              lesson_plan_id: plan.id,
              curriculum_release_id: plan.curriculum_release_id,
              academic_offering_id: plan.academic_offering_id,
              offering_period_id: plan.offering_period_id,
              curriculum_week_number: week.week,
              title: (d.title ||
                week.project?.title ||
                `${week.topic} Project`) as string,
              description: (d.description ||
                week.project?.description ||
                "") as string,
              instructions: (d.instructions ||
                (Array.isArray(week.project?.deliverables)
                  ? week.project!.deliverables.join("\n")
                  : "")) as string,
              assignment_type: "project",
              due_date: dueDate.toISOString(),
              max_points: week.practical_assessment?.max_score || 100,
              is_active: projectActive,
              metadata: {
                ...(d.metadata as Record<string, unknown> | undefined),
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
                generated_from: "progression_project_route",
                // Which of the two sources wrote this week, and why. Without it
                // an authored brief and a generated one are indistinguishable
                // afterwards, and there is no way to see whether rewriting the
                // catalogue is actually reaching classes.
                project_source: canon.source,
                ...(canon.source === "ai" ? { canon_miss: canon.reason } : {}),
                ...(assignmentTermId ? { term_id: assignmentTermId } : {}),
              } as import("@/types/supabase").Json,
              questions: (d.questions ||
                []) as import("@/types/supabase").Json[],
            });

          if (insertErr) {
            console.error(
              `Failed to save project for week ${week.week}:`,
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

          generated++;
          emit({
            generated,
            total,
            current: week.week,
            status: `Generated Week ${week.week}`,
          });
          if (maxWeeks && generated >= maxWeeks) break;
        } catch (err: unknown) {
          console.error(`Error generating project for week ${week.week}:`, err);
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
        const currentMetadata =
          (plan as any)?.metadata && typeof (plan as any).metadata === "object"
            ? ((plan as any).metadata as Record<string, unknown>)
            : {};
        const existingErrors =
          currentMetadata.last_generation_errors &&
          typeof currentMetadata.last_generation_errors === "object"
            ? (currentMetadata.last_generation_errors as Record<string, unknown>)
            : {};
        await supabase
          .from("lesson_plans")
          .update({
            metadata: {
              ...currentMetadata,
              last_generation_errors: {
                ...existingErrors,
                projects: failures,
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
    console.error("Bulk project generation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
