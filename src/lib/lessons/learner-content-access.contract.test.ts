import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

describe("released lesson content contract", () => {
  it("re-applies release and exact-class gates in the service-role slide proxy", () => {
    const route = read("src/app/api/slides/[...key]/route.ts");

    expect(route).toContain("slideDeckMayStream");
    expect(route).toContain("learnerMatchesLessonClass");
    expect(route).toContain("course_id, school_id, class_id, status");
    expect(route).toContain("file_url, is_public");
    expect(route).toContain("matchingDeck.is_public");
  });

  it("holds manually added class-plan material for the package release", () => {
    const route = read("src/app/api/lessons/[id]/materials/route.ts");

    expect(route).toContain("curriculum_week_number,session_number");
    expect(route).toContain("session_number: lesson.session_number ?? 1");
    expect(route).toContain("is_public: isPlanMaterial ? false");
  });

  it("uses the same released-lesson gate in database policies", () => {
    const migration = read(
      "supabase/migrations/20260929000121_tighten_released_lesson_content_access.sql"
    );

    expect(migration).toContain("can_read_released_lesson");
    expect(migration).toContain("l.status = 'active'");
    expect(migration).toContain("viewer.class_id = l.class_id");
    expect(migration).toContain("get_parent_child_user_ids()");
    expect(migration).toContain('DROP POLICY IF EXISTS "lessons_select_scoped"');
    expect(migration).toContain('DROP POLICY IF EXISTS "read_public_materials"');
    expect(migration).toContain("is_public = true");
  });
});
