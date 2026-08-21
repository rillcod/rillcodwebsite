# Workflow ownership

This document prevents duplicate pages, policies and data stores from growing
back into the application. A setting or record has one owner. Other routes may
link or redirect to that owner, but must not render a second copy of its editor.

## Canonical workspaces

| Concern | Canonical route | Authoritative data / logic |
| --- | --- | --- |
| Staff learner outcomes | `/dashboard/learner-progress` | submissions, enrollments, reports and scoped analytics |
| Student learning progress | `/dashboard/progress` | learner-owned submissions and reports |
| Student pathway | `/dashboard/path-progress` | pathway enrolment, official curriculum and delivery tracking |
| Parent pathway | `/dashboard/parent-path-progress` | the same pathway read model, limited to linked children |
| Class teaching | class → Teaching | `buildTeachingWeekRows` and the five-asset week package |
| Lesson plans | `/dashboard/lesson-plans` | one class + course + academic term plan |
| Platform configuration | `/dashboard/platform-operations` | allowlisted `app_settings` platform keys only |
| Academic rules | Learner Progress → More academic tools → Academic rules | academic terms, programme policy and progression settings |
| Office automation | Office Center → Settings → Automations | communication automation controls and event outcomes |
| Finance rules | `/dashboard/finance?workspace=settings` | accounts, billing cycles and reminder policy |
| Account preferences | `/dashboard/settings` | profile, security and personal notification preferences |

Legacy dashboard URLs must use server redirects to these routes. They must not
re-export or remount the same large client page under a different pathname.

## Teaching-content invariant

A teaching slot is one identity:

`class_id + lesson_plan_id + curriculum_week_number + session_number + lesson_id`

Its package has five assets: lesson, slides, flashcards, assignment and project.
`summarisePlanContent` and `buildTeachingWeekRows` are the shared readiness
contract. A page must not calculate readiness from a smaller subset.

- Newly generated content remains held until teacher review.
- At 80% prepared, the plan is labelled **Ready for review**; this does not make
  any asset public.
- Release uses the shared week-package release service.
- Existing learner scores, submissions, reports and delivery evidence are never
  deleted as content cleanup.

## Configuration boundary

`app_settings` contains several technical namespaces, but Platform
Configuration may read or write only `PLATFORM_CONFIGURATION_KEYS`.

- AI secrets are write-only and never returned to the browser or audit text.
- Cron timestamps are runtime state, not editable policy.
- Per-class or per-student pathway visibility lives in
  `progression_path_visibility`, not global settings.
- Academic, communication and finance rules stay with their owning workflow.

## Cleanup rules

Only exact duplicates with preserved references may be merged automatically.
Rows that merely share a week or title are not duplicates. Held work may be
cleaned or regenerated; published learner evidence and manual scores are
protected records.
