import { describe, expect, it, vi } from "vitest";
import {
  relinkTeachingWeekAssets,
  teachingWeekAssetScope,
} from "./teaching-scope";

describe("teachingWeekAssetScope", () => {
  it("writes the four canonical identifiers used across class and lesson views", () => {
    expect(
      teachingWeekAssetScope({
        classId: "class-1",
        lessonPlanId: "plan-1",
        curriculumWeekNumber: "4",
        lessonId: "lesson-1",
      })
    ).toEqual({
      class_id: "class-1",
      lesson_plan_id: "plan-1",
      curriculum_week_number: 4,
      lesson_id: "lesson-1",
    });
  });

  it("normalises invalid optional scope without inventing identifiers", () => {
    expect(teachingWeekAssetScope({ curriculumWeekNumber: 0 })).toEqual({
      class_id: null,
      lesson_plan_id: null,
      curriculum_week_number: null,
      lesson_id: null,
    });
  });
});

describe("relinkTeachingWeekAssets", () => {
  it("relinks only unassigned teaching assets for the same plan and week", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const db = {
      from: vi.fn((table: string) => {
        const call: Record<string, unknown> = { table, filters: [] };
        calls.push(call);
        const chain: any = {
          update: vi.fn((values: unknown) => {
            call.update = values;
            return chain;
          }),
          eq: vi.fn((column: string, value: unknown) => {
            (call.filters as unknown[]).push(["eq", column, value]);
            return chain;
          }),
          is: vi.fn((column: string, value: unknown) => {
            (call.filters as unknown[]).push(["is", column, value]);
            return chain;
          }),
          select: vi.fn(async () => ({
            data: [{ id: `${table}-1` }],
            error: null,
          })),
        };
        return chain;
      }),
    };

    const result = await relinkTeachingWeekAssets(db, {
      lessonPlanId: "plan-1",
      curriculumWeekNumber: 3,
      lessonId: "lesson-3",
    });

    expect(result).toEqual({ linked: 3, errors: [] });
    expect(calls.map((call) => call.table)).toEqual([
      "assignments",
      "flashcard_decks",
      "lesson_materials",
    ]);
    expect(calls[0]).toMatchObject({
      update: { lesson_id: "lesson-3" },
      filters: [
        ["eq", "lesson_plan_id", "plan-1"],
        ["eq", "curriculum_week_number", 3],
        ["eq", "session_number", 1],
        ["is", "lesson_id", null],
      ],
    });
  });
});
