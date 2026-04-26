# Lesson Plans & Projects — Audit Fix Tracker

> Start each fix session by reading this file. Tick `[x]` as each item is done.  
> Phases are sequential. Within a phase, items are independent unless noted.

---

## Phase A — Critical Business Logic

- [x] **A1 · Cascade deletes** ✅ — `DELETE /api/lesson-plans/[id]` only removes the plan row. Lessons and assignments linked via `metadata->>lesson_plan_id` become orphaned. Fix: delete them first.  
  _File:_ `src/app/api/lesson-plans/[id]/route.ts` · DELETE handler (~line 257)

- [x] **A2 · Bulk generation silent failures** — When AI calls fail mid-loop the server only `console.warn`s; the teacher sees "Done" even when weeks were skipped. Fix: collect failures, include them in the final SSE `done` event, and persist them to `lesson_plan.metadata.last_generation_errors`.  
  _Files:_ `src/app/api/lesson-plans/[id]/generate-lessons/route.ts`  
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`src/app/api/lesson-plans/[id]/generate-assignments/route.ts`

- [x] **A3 · Status mismatch (UI vs API)** — Edit modal offers `draft / active / completed`; API-meaningful values are `draft / published / archived`. Sending `active` or `completed` silently persists invalid state. Fix: update the `<select>` options to match the real status vocabulary.  
  _File:_ `src/app/dashboard/lesson-plans/page.tsx` · edit modal (~line 1242)

- [x] **A4 · Form date validation** — `save()` does not check `term_end > term_start` or enforce a minimum term length. Fix: add those guards before POST.  
  _File:_ `src/app/dashboard/lesson-plans/page.tsx` · `save()` (~line 316)

- [x] **A5 · Project group scoring without member check** — PATCH `/api/project-groups` applies `individual_scores` without verifying the `student_id` belongs to the group. Silent no-op on unknown students hides mis-grading. Fix: load group members first and reject unknown student IDs.  
  _File:_ `src/app/api/project-groups/route.ts` · PATCH handler (~line 178)

---

## Phase B — UX Gaps

- [x] **B1 · Delete confirmation detail** ✅ _Modal now loads deletion_summary from GET /api/lesson-plans/[id] and shows lessons/assignments/audit counts before confirming_  
  _File:_ `src/app/dashboard/lesson-plans/page.tsx` · delete confirm UI

- [x] **B2 · Generation failure toast on client** ✅ _SSE done event includes failures[]; UI shows collapsible list with week number + reason when skipped > 0_  
  _File:_ `src/app/dashboard/lesson-plans/[id]/page.tsx` · SSE consumer

- [x] **B3 · Project group delete — active submission guard** ✅ _DELETE checks project_submissions count; blocks with 409 unless ?force=true_  
  _File:_ `src/app/api/project-groups/route.ts` · DELETE handler

- [x] **B4 · Lesson plan form — sessions_per_week range guard** ✅ _Already enforced by type="range" min="1" max="5" slider — no change needed_  
  _File:_ `src/app/dashboard/lesson-plans/page.tsx` · create form

- [x] **B5 · Empty state — no lesson plans** ✅ _Already implemented with actionable links to Syllabus and Create — no change needed_  
  _File:_ `src/app/dashboard/lesson-plans/page.tsx`

---

## Phase C — Mobile Responsiveness

- [x] **C1 · Student-projects page gap** ✅ _gap-8 → gap-4 md:gap-6 lg:gap-8 on all three grids; stats grid now 2-col on xs_  
  _File:_ `src/app/student-projects/page.tsx`

- [x] **C2 · Lesson plan list touch targets** ✅ _ChipGroup buttons: py-1 → py-2 min-h-[36px] sm:min-h-[44px]_  
  _File:_ `src/app/dashboard/lesson-plans/page.tsx` · ChipGroup

- [x] **C3 · Lesson plan modal — iOS keyboard safe area** ✅ _Edit modal + delete confirm footers now have pb-[max(...,env(safe-area-inset-bottom))]_  
  _File:_ `src/app/dashboard/lesson-plans/page.tsx` · modal footers

- [x] **C4 · Projects dashboard — missing md breakpoint** ✅ _All project grids already use sm:grid-cols-2 — no jump; no change needed_  
  _File:_ `src/app/dashboard/projects/page.tsx`

- [x] **C5 · Lesson plan page heading overflow** ✅ _h1 now text-2xl sm:text-3xl lg:text-4xl with break-words; plan card titles use line-clamp-2 break-words_  
  _File:_ `src/app/dashboard/lesson-plans/page.tsx` · page heading

---

## Notes

- All `generate-*` endpoints use SSE (Server-Sent Events). The frontend consumer is in `src/app/dashboard/lesson-plans/[id]/page.tsx`.
- Progression generation (`generate-progression`) uses a separate preflight system — do not conflate with lessons/assignments bulk gen.
- WhatsApp, certificate template, and studio-editor hex colors are intentional — do not change.
