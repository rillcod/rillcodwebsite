import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const home = read("src/components/dashboard/StudentDashboard.tsx");
const learning = read("src/app/dashboard/learning/page.tsx");
const results = read("src/app/dashboard/results/page.tsx");
const finance = read("src/app/dashboard/finance/page.tsx");
const waec = read("src/app/dashboard/grades/waec/page.tsx");
const palette = read("src/components/layout/CommandPalette.tsx");
const recs = read("src/app/api/recommendations/route.ts");
const topNav = read("src/components/layout/DesktopTopNavbar.tsx");

describe("student workspace UX", () => {
  it("keeps the home launcher on the daily loop", () => {
    expect(home).toContain("Continue learning");
    expect(home).toContain("My assignments");
    expect(home).toContain("My grades");
    expect(home).toContain("loadLearnerClassWeek");
    expect(home).toContain("thisWeekLessons");
    expect(home).not.toContain("/dashboard/leaderboard");
    expect(home).not.toContain("/dashboard/activity-hub");
    expect(home).not.toContain("/dashboard/study-groups");
    expect(home).not.toContain("My Programme");
    expect(home).not.toContain("RecommendedForYou");
    expect(home).not.toContain("+15 XP");
  });

  it("does not send learners to staff lesson or curriculum lists", () => {
    expect(learning).not.toContain("href: '/dashboard/lessons'");
    expect(learning).not.toContain('href="/dashboard/lessons"');
    expect(learning).not.toContain("buildCurriculumHref");
    expect(learning).not.toContain("/dashboard/courses/${c.id}");
    expect(learning).toContain("/dashboard/lessons/${nextLesson.id}");
    expect(learning).toContain("loadLearnerClassWeek");
    expect(learning).toContain("thisWeekLessons");
    expect(learning).toContain("Your teacher has not shared a week yet.");
    expect(learning).toContain("lesson.learner_package?.[key] === true");
    expect(learning).toContain("Open class session");
    expect(learning).not.toContain("['Lesson', 'Slides', 'Practice', 'Assignment', 'Project'].map");
    expect(learning).toContain("All learning tools");
    expect(learning).toContain("fetch('/api/flashcards/stats'");
    expect(learning).not.toContain("db.from('flashcard_decks')");
    expect(learning).not.toContain("/dashboard/learning/stats");
    expect(learning).not.toContain(".order('id', { ascending: true })");
    expect(learning).not.toContain("Skill Revision Gym");
    expect(learning).not.toContain("Active Persona");
    expect(learning).not.toContain("Enrolled");
    expect(learning).not.toContain("class-week-package");
    expect(home).not.toContain("class-week-package");
  });

  it("opens a lesson only if it sits on this class plan", () => {
    const lessonPlayer = read("src/app/dashboard/lessons/[id]/page.tsx");
    expect(lessonPlayer).toContain("filterLessonsForClassPlans");
    expect(lessonPlayer).toContain("loadLessonsForClassPlans");
    expect(lessonPlayer).toContain("learningAssetMatchesLesson");
    expect(lessonPlayer).toContain("handleGenerateHook");
    expect(lessonPlayer).not.toContain("Auto-fetch lesson hook");
    expect(lessonPlayer).toContain('materialsQuery.eq("is_public", true)');
    expect(lessonPlayer).toContain('flashcardQuery.eq("is_public", true)');
    expect(lessonPlayer).toContain('scopedAssignmentQuery.eq("is_active", true)');
    expect(lessonPlayer).toContain('quizQuery.eq("is_active", true)');
    expect(lessonPlayer).toContain("lesson_plan_id.eq.${lessonObj.lesson_plan_id}");
    expect(lessonPlayer).not.toContain("class-week-package");
  });

  it("shows a report card, not a publish desk, to learners", () => {
    expect(results).toContain("My Report Card");
    expect(results).toContain("Your report card has not been published yet.");
    expect(results).not.toContain(
      '<h1 className="text-lg font-extrabold tracking-tight">Publish &amp; Share</h1>'
    );
  });

  it("calls student finance My Fees instead of the staff queue", () => {
    expect(finance).toContain("My Fees");
    expect(finance).toContain("See what you owe and pay from here.");
  });

  it("hides the grading queue from the learner grading guide", () => {
    expect(waec).toContain("isStaff && (");
    expect(waec).toContain("How your grades are calculated");
    expect(waec).toContain('href="/dashboard/grading"');
  });

  it("does not label a learner report card as Publish", () => {
    expect(topNav).toContain("My Report Card");
    expect(topNav).toContain("My Fees");
    expect(topNav).toContain("STUDENT_PATH_LABELS");
  });

  it("does not bounce learners from search into settings or staff exams", () => {
    const start = palette.indexOf("student: [");
    const end = palette.indexOf("parent: [");
    const studentPages = palette.slice(start, end);
    expect(studentPages).toContain("href: '/dashboard/profile'");
    expect(studentPages).not.toContain("href: '/dashboard/settings'");
    expect(recs).toContain("`/dashboard/cbt/${ex.id}`");
    expect(recs).not.toContain("`/dashboard/exams/${ex.id}`");
  });
});
