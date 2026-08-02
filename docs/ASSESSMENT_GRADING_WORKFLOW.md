# Assessment and grading workflow

This document is the product and engineering source of truth for assignments, projects, CBT, grading, and report calculations. New evaluation features must follow these rules so the learner, teacher, gradebook, and report views cannot drift into separate systems.

## Canonical learning context

Every generated or teacher-authored activity should retain the complete teaching context whenever it is available:

- `class_id`
- `lesson_plan_id`
- `curriculum_week_number`
- `lesson_id`

This context lets a teacher move from the class plan to a lesson and then create an assignment, project, flashcard deck, slide deck, or CBT without losing where the evidence belongs.

## Official score model

`src/lib/grading.ts` owns the report component weights and grade-band presentation. Official scores are calculated from academic evidence only. Submission rate and engagement are coaching signals; they never silently cap, raise, or overwrite a recorded mark.

For an individual assignment or project, the teacher records a mark against `max_points`. The server derives its weighted contribution:

`weighted contribution = (grade / max_points) × assignment weight`

`src/lib/assignments/grading.ts` owns that transition. Clients must not supply or override `weighted_score`.

## Assignment and project states

- Fully objective activities may be automatically finalized when every question type is supported.
- Mixed objective and open-ended activities enter `pending_review`; a partial automatic result is never presented as a final mark.
- Any numeric teacher mark finalizes the submission as `graded` and records the authenticated grader and timestamp.
- Removing a mark clears its derived weighted contribution and finalization metadata.
- AI grading is a suggestion. A teacher must review and save it before it becomes official.
- Submitted files remain attached after grading so the decision is auditable.

## CBT states

`src/lib/cbt/grading.ts` is the shared engine for submission-time grading, teacher preview, and final manual review.

- Objective questions use one answer matcher across API and UI.
- Written/manual questions keep a session in `pending_grading` until all required marks are supplied.
- Manual question marks are bounded by each question's points.
- Section weighting is applied once by the shared engine.
- The saved score becomes final only after the manual evidence is complete.

## Authority and record protection

- `admin` and `teacher` may grade.
- Partner-school accounts may review in-scope outcomes but may not award or change marks.
- Students and parents may see only records available to them through scoped APIs.
- Historical manual scores must not be rewritten by migrations, cleanup scripts, AI jobs, or UI normalization.
- Grade changes must remain attributable through grader metadata and audit logging.

## Integration checklist

Before adding or changing an evaluation workflow:

1. Carry the canonical learning context.
2. Use the shared assignment or CBT grading engine.
3. Enforce the `grade` capability in both UI and API.
4. Keep AI output provisional until human approval.
5. Preserve submitted evidence and historical manual marks.
6. Verify the gradebook and report builder consume the same official calculation.
7. Add tests for state transitions, boundaries, and mixed manual/automatic content.
