import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("academic identity authority", () => {
  it("keeps class plans as the only plan parent", () => {
    const route = read("src/app/api/lesson-plans/route.ts");
    expect(route).not.toContain("searchParams.get(\"lesson_id\")");
    expect(route).not.toContain("onConflict: \"lesson_id\"");
    expect(route).not.toContain("lesson_id,\n");
  });

  it("requires every newly created lesson to enter through a class plan", () => {
    const route = read("src/app/api/lessons/route.ts");
    expect(route).toContain("code: \"CLASS_PLAN_REQUIRED\"");
    expect(route).toContain("payload.lesson_plan_id = plan.id");
    expect(route).not.toContain(".from(\"lesson_plans\").insert");
  });

  it("stores the detailed guide on the lesson without creating a reverse row", () => {
    const route = read("src/app/api/lessons/[id]/route.ts");
    expect(route).toContain("teaching_guide");
    expect(route).toContain("metadataWithLessonTeachingGuide");
    expect(route).not.toContain("onConflict: 'lesson_id'");
    expect(route).not.toContain(".from('lesson_plans').upsert");
  });

  it("prevents the retired reverse column from being dropped over live data", () => {
    const migration = read(
      "supabase/migrations/20260929000124_remove_reverse_lesson_plan_identity.sql",
    );
    expect(migration).toContain("reverse-linked plan row(s) require migration first");
    expect(migration).toContain("drop column if exists lesson_id");
    expect(migration).toContain("metadata - ''lesson_plan_id''");
    expect(migration).toContain("drop trigger if exists sync_teaching_content_metadata_identity");
    expect(migration).toContain("drop function if exists public.sync_teaching_content_metadata_identity()");
    expect(migration).toContain("drop index if exists public.idx_lessons_metadata_lesson_plan_id");
  });

  it("points the editor back to the class plan and release boundary", () => {
    const route = read("src/app/api/lessons/[id]/route.ts");
    const editor = read("src/app/dashboard/lessons/[id]/edit/page.tsx");
    expect(route).toContain("class_plan:lesson_plans");
    expect(editor).toContain("Controlled by class plan release");
    expect(editor).toContain("Open class plan");
  });

  it("keeps generated assignment blocks inside the class plan", () => {
    const editor = read("src/app/dashboard/lessons/[id]/edit/page.tsx");
    expect(editor).toContain("lesson_plan_id: lesson.lesson_plan_id");
    expect(editor).toContain("curriculum_week_number: lesson.curriculum_week_number");
    expect(editor).toContain("assignmentErrors");
  });

  it("does not present an editable lesson form to school reviewers", () => {
    const editor = read("src/app/dashboard/lessons/[id]/edit/page.tsx");
    expect(editor).toContain("profile?.role === 'school'");
    expect(editor).toContain("Lesson preview only");
  });

  it("resolves the class when an assignment starts from a plan link", () => {
    const assignmentPage = read("src/app/dashboard/assignments/new/page.tsx");
    expect(assignmentPage).toContain("select('id, class_id, course_id')");
    expect(assignmentPage).toContain("setClassId(current => current || planRow.class_id || '')");
  });

  it("keeps one everyday interface for the five-part teaching package", () => {
    const detail = read("src/app/dashboard/lesson-plans/[id]/page.tsx");
    const list = read("src/app/dashboard/lesson-plans/page.tsx");
    const workspace = read("src/components/classes/ClassTeachingWorkspace.tsx");
    const hrefs = read("src/lib/curriculum/href.ts");
    expect(detail).toContain("router.replace(");
    expect(detail).toContain("buildClassTeachingHref");
    expect(list).toContain("buildClassTeachingHref");
    expect(hrefs).toContain("?view=advanced");
    expect(workspace).toContain("Core package:");
    expect(workspace).toContain("Assessment stays separate");
  });

  it("sanitises AI metadata before generated rows are written", () => {
    const helper = read("src/lib/academic/content-identity.ts");
    expect(helper).toContain("delete record.lesson_plan_id");
    expect(read("src/app/api/lesson-plans/[id]/generate-assignments/route.ts")).toContain("withoutLegacyLessonPlanMetadata");
    expect(read("src/app/api/lesson-plans/[id]/generate-projects/route.ts")).toContain("withoutLegacyLessonPlanMetadata");
  });
});
