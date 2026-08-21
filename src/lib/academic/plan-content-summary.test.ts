import { describe, expect, it } from "vitest";
import {
  summarisePlanContent,
  TEACHING_PACKAGE_REVIEW_THRESHOLD,
} from "./plan-content-summary";

const week = { week: 1, session: 1, topic: "Algorithms" };

describe("plan content summary", () => {
  it("uses the five-asset teaching contract", () => {
    const summary = summarisePlanContent({
      planWeeks: [week],
      lessons: [{ curriculum_week_number: 1, session_number: 1, status: "draft" }],
      slideDecks: [{ curriculum_week_number: 1, session_number: 1 }],
      flashcardDecks: [
        { curriculum_week_number: 1, session_number: 1, is_public: false },
      ],
      assignments: [
        { curriculum_week_number: 1, session_number: 1, is_active: false },
      ],
    });

    expect(summary.prepared_pct).toBe(TEACHING_PACKAGE_REVIEW_THRESHOLD);
    expect(summary.review_ready).toBe(true);
    expect(summary.state).toBe("ready_to_review");
    expect(summary.by_asset.project.prepared).toBe(0);
  });

  it("calls a package released only when every slot asset is live", () => {
    const summary = summarisePlanContent({
      planWeeks: [week],
      lessons: [{ curriculum_week_number: 1, session_number: 1, status: "active" }],
      slideDecks: [{ curriculum_week_number: 1, session_number: 1 }],
      flashcardDecks: [
        { curriculum_week_number: 1, session_number: 1, is_public: true },
      ],
      assignments: [
        { curriculum_week_number: 1, session_number: 1, is_active: true },
      ],
      projects: [
        { curriculum_week_number: 1, session_number: 1, is_active: true },
      ],
    });

    expect(summary.prepared_pct).toBe(100);
    expect(summary.released_pct).toBe(100);
    expect(summary.state).toBe("released");
  });

  it("does not expose a partly live package as complete", () => {
    const summary = summarisePlanContent({
      planWeeks: [week],
      lessons: [{ curriculum_week_number: 1, status: "active" }],
      assignments: [{ curriculum_week_number: 1, is_active: false }],
    });

    expect(summary.state).toBe("mixed");
    expect(summary.released_pct).toBe(20);
  });
});
