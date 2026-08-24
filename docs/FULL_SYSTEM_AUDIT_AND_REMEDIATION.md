# Rillcod Full-System Audit and Remediation Register

Last evidence capture: 22 August 2026  
Production platform: Cloudflare Containers  
Application stack: Next.js App Router, Supabase, Paystack, LiveKit, R2, Capacitor  
Repository baseline reviewed: `main` at `3f823f87`, plus the explicitly listed uncommitted work below

## 1. Purpose and rules

This is the single source of truth for the full product audit. It covers UX, UI, mobile and
desktop behaviour, business logic, database integrity, automation, finance, onboarding,
teaching, evaluation, reporting, communications, native applications, security, operations,
performance, accessibility, testing, release safety, and documentation.

This register does **not** describe an area as complete merely because a page exists or a type
check passes. Every statement uses one of these evidence states:

| State | Meaning |
| --- | --- |
| **Verified** | Directly inspected or exercised with current evidence. |
| **Confirmed defect** | Reproduced, directly observed, or rejected by a current automated check. |
| **User-reported** | Reported in production use but not yet reproduced in this audit. |
| **At risk** | Static evidence shows a credible failure, inconsistency, security, or maintenance risk. |
| **Blocked** | The audit could not reach the area; it must not be counted as passed. |
| **Historical/resolved** | Earlier defect with current evidence that its original failure no longer occurs. |

No customer credential, token, database password, or API secret may be copied into this
document. Student marks and other protected academic evidence must never be changed or deleted
as part of cleanup.

## 2. Executive verdict

Rillcod has a broad and valuable product foundation, with a large academic, operational, and
financial surface. Current automated evidence is strong in type safety, unit/integration tests,
database query compatibility, write compatibility, route export hygiene, and basic shared UI
rules. It is not yet responsible to describe the entire system as bulletproof.

The main remaining risks are:

1. Production authentication state can fail at the entrance gate, which also blocks trustworthy
   private-page visual verification.
2. Several very large client pages combine presentation, direct database access, API calls, and
   workflow state. This creates lag, retry, race-condition, and consistency risk.
3. Platform security lacks verified CSP, HSTS, a central state-changing-request origin/CSRF
   policy, durable global rate limiting, dependency-update automation, code scanning, and
   external error tracking.
4. Native display branding still says **Rillcod Academy** while the approved public brand is
   **Rillcod Technologies**.
5. Accessibility and responsive conformance are not tested with a real axe/Lighthouse-style
   browser gate. The existing UI audit is useful but shallow.
6. There are 175 hard-delete call sites, 22 empty catch blocks, 2,761 `any` escapes, 70 client
   pages with direct database reads, and 112 source files at least 700 lines long.
7. Private role journeys, PDFs, retries, concurrency, offline/reconnect behaviour, and
   cross-domain automation are not yet comprehensively certified end to end.
8. Several “complete” documents are historical and can create false confidence. This register
   supersedes status claims in those documents.

## 3. Evidence captured

### 3.1 Verified automated evidence

| Check | Current result | What it proves | What it does not prove |
| --- | --- | --- | --- |
| TypeScript | Pass | Current checked tree is type-correct. | Runtime data and browser flows. |
| Vitest | 333 files discovered; latest full run passed 333 files and 2,357 tests | Covered business rules, integrations, and collected TSX report rendering behave as asserted. | Untested paths and visual usability. |
| Focused report tests | 6 files and 40 tests passed | Host-paper, taught-assessment, complement, publication, scoring, and three report-card renderers are under test. | Full browser and binary PDF journeys. |
| ESLint | 0 errors, 7,991 warnings | No configured lint error blocks. | Warning debt is still substantial. |
| UI standards inventory | 229 pages passed current script | Basic shell, shared control, overflow, theme, and filter conventions. | Accessibility, visual hierarchy, real tap targets, or full responsive correctness. |
| Encoding audit | 2,195 files passed | No detected encoding corruption. | Copy quality and translation quality. |
| API route export audit | 531 route files found with no illegal export issue in the current scan | App Router route shape. | Authorization or business correctness. |
| Supabase relationship/embed audit | Pass | Checked relationship selections are valid. | Permission and workflow correctness. |
| Live schema-drift audit | 1,693 distinct queries accepted | Referenced live columns/embeds currently exist. | Correct returned values or role access. |
| Live write audit | Literal writes accepted across 114 constrained tables | Static write payloads agree with live schema. | Dynamic payloads, transactional correctness, or authorization. |

The earlier `lessons.customized_at` and `assignments.customized_at` schema-drift failures are
therefore **historical/resolved** under the latest live-schema check. They must stay covered by
the schema audit so they cannot silently return.

### 3.2 Production public-page evidence

Production pages were inspected at a 390 × 844 mobile viewport.

| Route | Evidence |
| --- | --- |
| `/` | No horizontal overflow and no missing image alt text detected. The “EducationAcross” report was a **false positive**: the heading carries a real `<br />` between “STEM Education” and “Across Africa”, so it renders correctly. Only `textContent` joins them, because `<br>` contributes no whitespace to it. Contact fields use placeholders without programmatic labels. Carousel controls, indicators, social icons, and footer links include sub-44px targets. |
| `/consent` | No horizontal overflow; form reference is labelled; initial primary control was not undersized. |
| `/student-registration` | No horizontal overflow; clear “Enrol a learner” entry; initial screen had no immediate field-level defect. The complete journey remains unverified. |
| `/login` | No horizontal overflow and form fields are labelled. Desktop and mobile headings both remain in the DOM, producing duplicate H1 semantics. Several links and the password-visibility control are undersized. |

### 3.3 Confirmed authentication blocker

The production login entrance emitted:

`AuthApiError: Invalid Refresh Token: Refresh Token Not Found`

This is a confirmed production auth-state failure. Automated browser text entry also did not
persist in the audited browser session, so authenticated role journeys were not completed. The
browser session was not destructively cleared during the audit. Therefore all private visual
coverage is **blocked/unverified**, not passed.

Required resolution:

1. Reproduce with a clean browser profile and with a deliberately stale refresh token.
2. On missing/invalid refresh tokens, clear only the invalid local auth state and return the user
   to a usable login form without a runtime error loop.
3. Preserve `redirectedFrom` only when the target is a validated internal path.
4. Verify login, logout, password reset, expired session, role change, revoked account, and
   account-deletion states.
5. Add automated browser coverage for admin, teacher, parent, student, finance, and restricted
   role access.
6. Record a human-readable audit event without exposing token values or internal stack traces.

## 4. Complete application inventory

The codebase currently contains **229 pages**: **180 dashboard pages** and **49 public pages**,
plus **531 API route files** and **145 database migrations**.

### 4.1 All public page routes

```text
/
/about
/account-deletion
/c/[token]
/careers
/consent
/consent/[code]
/contact
/curriculum
/events
/faq
/forms/[id]
/gallery
/implementation
/login
/media
/online-registration
/p
/p/[token]
/parent-claim
/partnership
/portal
/portfolio/[token]
/privacy-policy
/programs
/programs/[slug]
/reset-password
/result-check
/result-check/[code]
/school-registration
/services
/showcase
/signup
/special/[slug]
/student-journey
/student-projects
/student-registration
/student-registration/pay-balance
/student/[id]
/student/login
/summer-school
/summer-school/pay-balance
/team
/terms-of-service
/testimonials
/verify
/verify/[code]
/verify/school-report
/verify/school-report/[code]
```

### 4.2 All dashboard top-level route groups

```text
dashboard root, academic, account-deletion-requests, accountability, activity-hub,
activity-logs, admin, analytics, announcements, approvals, assignments, attendance,
balance-reminders, billing, billing-automation, card-studio, cases, cbt, certificates,
classes, consent-forms, courses, crm, curriculum, customer-book, directory, email-log,
engage, engagement, exams, feedback, finance, flashcards, gamification, generate-content,
grades, grading, identity-cards, inbox, leaderboard, learner-progress, learner-safety,
learning, lesson-plans, lessons, library, live-sessions, messages, missions, moderation,
money, my-card, my-children, my-payments, newsletters, notifications, office, overview,
parent-attendance, parent-card, parent-certificates, parent-claims, parent-feedback,
parent-grades, parent-invoices, parent-path-progress, parent-results, parents, partnerships,
path-progress, payments, platform-operations, playground, portfolio, profile, programs,
progress, progression, projects, protocol, records, reports, results, school-billing,
school-overview, school-reports, school-teacher-messages, schools, settings, showcase,
slides, special-programs, students, study-groups, subscriptions, support, teachers,
teaching, timetable, transactions, users, vault, whatsapp-groups
```

Every route above must be assigned an owner, permitted roles, primary task, mobile state,
desktop state, empty state, loading state, error/retry state, audit event, and retention rule.
Presence in this list is not a pass.

### 4.3 Largest API domains

The broadest API groups include admin (29), live sessions (24), payments (23), cron (22),
consent forms (15), inbox (15), school performance reports (15), lesson plans (15), classes
(13), flashcards (12), curricula (12), billing (12), exams (12), students (11), AI (11),
progression (10), curriculum governance (10), cards (9), CRM (9), parent claim (8),
summer school (8), parents (7), partnerships (7), discussions (7), notifications (6),
customer book (6), schools (6), invoices (6), public (6), content library (6), assignments
(6), files (5), analytics (5), lessons (5), courses (5), attendance (5), and auth (5).

## 5. Cross-system architecture findings

### 5.1 Centralization and duplicate-world risk

**Verified strength:** several old finance paths are aliases into the central finance
workspace rather than independent implementations:

- `/dashboard/money` → finance “today”
- `/dashboard/payments` → finance collections
- `/dashboard/billing` → finance settings
- `/dashboard/transactions` → finance “today”
- `/dashboard/subscriptions` → finance settings

These aliases should remain thin redirects. They must not regain separate totals, invoice rules,
account settings, or payment mutations.

**At risk:** 70 client pages read Supabase directly; dashboard pages contain roughly 362 direct
`.from()` calls and 784 `fetch()` calls. Pages that mix direct database reads with API calls
can receive inconsistent snapshots, duplicate authorization rules, and show stale success.

Required architecture:

1. Define one server-side domain service/gateway for each authority: identity, enrolment,
   consent, parent-child link, curriculum, teaching content, submission, grading, result,
   finance, notification, and audit.
2. Put authorization, transaction boundaries, validation, idempotency, and audit emission inside
   those services.
3. Let browser pages consume task-oriented APIs or server actions; do not reimplement table joins
   and policy decisions inside page components.
4. Give every mutation an idempotency key or deterministic uniqueness rule where retries are
   possible.
5. Return typed public error codes and human messages. Log internal context only server-side.
6. Use one canonical identity key and preserve the academic linkage keys:
   `class_id + lesson_plan_id + curriculum_week_number + lesson_id`.
7. Derived views may cache, but source records must have a named authority and deterministic
   rebuild path.

### 5.2 Complexity and performance hotspots

There are **112 source files with at least 700 lines**. The largest current hotspots are:

| Area | Approximate lines | Primary risk | Required split |
| --- | ---: | --- | --- |
| Academic builder | 9,298 | Fetch fan-out, state coupling, slow interaction | Route shell, curriculum source, generation job, review, publishing, content adapters |
| Lesson detail | 6,458 | All learning-content tools in one client surface | Lesson core, resources, delivery, assessment, learner preview, activity timeline |
| Lesson-plan detail | 6,210 | Plan/edit/generate/publish states intermixed | Plan query, editor, AI job, validation, publish, class linkage |
| Report builder | 5,190 | Curriculum, marks, narratives, publication coupled | Selection, subject grid, autofill, validation, preview, publication |
| Settings panel | 4,336 | Unrelated policy authorities combined | Organization, academic, finance, messaging, security, integrations |
| Student bulk registration | 3,687 | Large form and partial-failure complexity | Import, validate, match, preview, commit, receipt |
| Class detail | 3,699 | Rosters, teaching, visibility, progress compete | Class overview, teaching workspace, learners, progress, settings |
| Inbox | 3,377 | Query and UI complexity | Thread list, thread detail, composer, delivery status |
| Consent responses | 3,131 | Intake, linkage, review, and exports coupled | Queue, response detail, matching, decision, audit |
| Card studio | 2,903 | Editor/load/state complexity | Data source, designer, preview, export |
| Results | 2,853 | Multiple result authorities can blur | Result source, validation, publish/share, correction |
| Students | 2,827 | Search/filter/action density | Query model, list, learner quick view, safe actions |
| Finance | 2,423 | Many tasks in one workspace | Today, collections, invoices, reconciliation, settings, reports |

Refactoring must be vertical and tested: extract a domain operation with its tests and monitoring,
then replace one caller. A visual component split without moving business rules out of the page
does not solve the risk.

### 5.3 UI consistency debt

Current static inventory:

| Finding | Count |
| --- | ---: |
| Pages using raw `button` elements | 146 |
| Pages using raw `input` elements | 114 |
| Pages with hard-coded color tokens | 32 |
| Pages using tiny 8–11px text | 136 |
| Pages using horizontal-scroll fallback | 46 |
| Client pages | 173 |

Raw elements are not automatically wrong, but every occurrence must either use the design-system
contract or document why a semantic native element needs a specialized implementation.

The product-wide UI contract is:

- One primary page title and one primary action.
- One search per task surface. A second search is allowed only when it searches a clearly
  separate scoped object and is labelled accordingly.
- 44 × 44px minimum interactive target on touch devices.
- 16px minimum mobile input font to avoid browser zoom.
- No information conveyed by color alone.
- No full-page tabs for status explanations or “what was used” notices; use compact status,
  provenance, or activity details.
- Prefer one responsive card/list composition to separate desktop and mobile business flows.
- Tables may scroll only when column comparison is essential. Otherwise collapse to labelled
  cards or prioritised columns.
- Every async surface needs loading, empty, retryable error, permission, and successful return
  states.
- Customer-facing errors must be plain, actionable, and free of internal provider names, stack
  traces, SQL details, policy names, or debug codes.
- Returning users must land on the last safe task state or a clear next action, never a stale
  modal or dead tab.

## 6. Domain-by-domain audit and required completion

### 6.1 Authentication, authorization, and account lifecycle — **Confirmed defect / blocked**

Scope: login, signup, reset password, portal, student login, roles, route access, session expiry,
account deletion, protected APIs, and redirects.

Required completion:

- Resolve invalid-refresh-token recovery described in section 3.3.
- Generate a role-route matrix from `route-access.ts` and verify both page and API enforcement.
- Eliminate authorization decisions that exist only in hidden buttons or client redirects.
- Test direct URL access, API access, revoked role, inactive school, deleted account, expired
  session, and multiple-tab session changes.
- Use one role model. Do not create duplicate “admin-like” roles merely to expose a page.
- Make access denials explain the next legitimate action without exposing internal permission
  names.
- Audit login and role changes using human labels, actor, target, time, outcome, and correlation
  ID.

### 6.2 Onboarding, consent, parent claim, and retention — **Partially verified**

Scope: student/school/online registration, consent QR and typed reference, public forms, parent
claim, parent-child linkage, approvals, balance payment, welcome communications, and retention.

The intended central lifecycle must be:

`invited/intake → identity match → consent/claim → enrolment → finance state → permitted access → retained relationship`

Required completion:

- One canonical learner/person record; typed reference, QR scan, registration, consent, and
  parent claim must resolve to it rather than create parallel people.
- Consent response and parent claim must remain separate legal/business events but share the
  central identity/linkage service.
- QR and typed reference must produce the same validated outcome and audit trail.
- References must be short enough for manual entry, rate-limited, non-sequential, expiring where
  appropriate, and revocable.
- Parent quick view must show matched child, relationship, consent state, claim state, finance
  gate, and next action without exposing unrelated learner data.
- Counts on consent and claim dashboards should open a pre-filtered contact/response list.
- Duplicate matching must be explicit and reversible; never silently merge two learners.
- Finance may gate paid services, but must not block consent capture, claim review, legitimate
  report access, or support recovery unless the product rule explicitly requires it.
- Every gate needs reason, owner, safe override/escalation, audit record, and customer-facing
  recovery instruction.
- Test mass distribution, QR, typed code, duplicate phone/email, absent email, guardian with
  multiple children, changed guardian, partially paid registration, expired link, and retry.
- Retention automation must consume central lifecycle events rather than infer state from page
  visits.

### 6.3 Users, records, accountability, approvals, and administration — **At risk**

Required completion:

- Keep identity/users, staff records, operational accountability, and audit history related but
  distinct; do not merge their meanings into one generic table or page.
- One staff/user quick view should link profile, roles, school scope, open approvals, assigned
  work, activity, and account state.
- Make bulk actions preview exact impact and require explicit confirmation for destructive or
  role-changing operations.
- Accountability items need owner, due date, evidence, status, escalation, and closure reason.
- Approvals must be idempotent and reject stale decisions.
- Activity labels must be human (“Invoice resent to parent”) rather than implementation names
  (“invoice.send invoked”).
- Audit logs must be append-only to ordinary users and record actor, target, before/after summary,
  source, reason, result, and correlation ID.
- Search must cover human identifiers but avoid exposing sensitive records outside scope.

### 6.4 Finance, billing, payments, invoices, and reconciliation — **Partially centralized; E2E unverified**

Required completion:

- Preserve the central finance workspace and thin legacy redirects.
- Define one invoice source of truth for account details, line items, discounts, tax, balance,
  payment allocation, status, and PDF snapshot.
- **User-reported re-verification:** after correcting and saving/resending an invoice, account
  details may disappear from the regenerated PDF. Reproduce against production-like data.
- PDF generation must use the persisted invoice/account snapshot or an explicitly versioned
  organization setting, not transient editor state.
- Saving, previewing, downloading, emailing, and resending the same invoice version must produce
  the same totals and account details.
- A resend must not create a second invoice, charge, or payment allocation.
- Webhooks and manual verification must converge through one idempotent payment-posting service.
- Reconciliation must show unmatched, duplicated, reversed, refunded, partial, and overpaid
  states with controlled resolution.
- Finance gates must publish one normalized status consumed by onboarding, parent access, school
  billing, special programs, and reporting.
- Test Paystack success, pending, abandoned, duplicate webhook, delayed webhook, refund retry,
  instalment, balance payment, manual payment, correction, resend, PDF, and ledger totals.
- Financial corrections require reason and immutable audit evidence. Do not hard-delete posted
  money movements.

### 6.5 Curriculum, classes, class plans, and academic governance — **At risk**

Required completion:

- Curriculum remains the source of expected outcomes/weeks; a class plan binds it to a real
  class/session; a lesson is a deliverable teaching instance.
- Preserve linkage with `class_id`, `lesson_plan_id`, `curriculum_week_number`, and
  `lesson_id`.
- A standalone lesson may exist, but the UI must clearly offer “attach to class plan” and record
  provenance; it must not become a separate content world.
- One class roster only. Path visibility is a setting/filter on the learner roster, not a second
  competing roster.
- Class landing hierarchy: attention needed, next teaching action, upcoming assessment, recent
  learner signal, then roster and settings.
- AI generation must run as a durable job with progress, retry, validation, provenance, and
  recoverable output. “Failed to fetch” is not an acceptable final message.
- Generated work must persist before navigation and be discoverable from class, plan, lesson,
  learner, and content-library contexts.
- Validate week/session numbering, class/session ownership, optional versus compulsory pathway,
  and school-specific curriculum overrides on the server.
- Test new class, existing class, no curriculum, changed curriculum, partially generated plan,
  duplicate generation request, reconnect, reattach lesson, archive, and return.

### 6.6 Teaching content, lesson engine, flashcards, projects, assignments, and slides — **At risk**

The product should have one content engine with multiple content types, not lesson-only
automation plus disconnected tools.

Required model:

`plan → lesson → content items (lesson material, flashcards, assignment, project, slides, resources) → delivery → learner activity → evidence → evaluation`

Required completion:

- Reuse the strongest legacy lesson-plan generation logic only after moving it behind the current
  domain contract; do not revive a separate legacy page or duplicate data model.
- Every content item records class, plan, week, lesson, creator/generator, version, status,
  visibility, and learner audience where applicable.
- AI generation validates each content type as it is produced, stores structured validation
  results, and surfaces only useful teacher feedback.
- Slides should be an optional generated content type using the same prompt context, provenance,
  review, publication, and learner visibility rules.
- “Add lesson” opens the same rich builder in a suitable mode; it must not lead to a weaker
  isolated editor.
- Teachers can generate all recommended items or select individual types.
- Learner preview is part of the publish flow for every content type.
- Content at 80% readiness may be placed on hold, but “hold” needs validation reasons and a clear
  route to completion. It must not silently publish.
- Deleting duplicate learning content requires evidence that it is not referenced by delivery,
  submissions, results, or audit history.
- Mobile create/edit surfaces need progressive sections, sticky save state, visible validation,
  and no off-screen controls.

### 6.7 Assignments, projects, submissions, grading, and evaluation — **Partially strengthened; E2E unverified**

Verified strength: inspected assignment/submission/progress-report delete routes protect graded
academic evidence and only permit deletion of ungraded evidence, returning
`PROTECTED_ACADEMIC_EVIDENCE`.

Required completion:

- One submission authority supports assignment and project evidence; content-type differences
  should be configuration, not duplicated upload/grading engines.
- One grading policy service owns scale, weighting, rubric, pass rule, late rule, moderation,
  rounding, and result contribution.
- Do not calculate weights separately in assignment, grading, CBT, result, and report pages.
- Teacher view prioritises unreviewed/returned work, learner context, rubric, evidence, feedback,
  and next submission.
- Student view prioritises instruction, due date, rubric, allowed evidence, save/upload state,
  submission receipt, feedback, and resubmit status.
- All uploads require durable status, checksum/key, ownership validation, virus/content policy
  where appropriate, and retry without duplicated submissions.
- Scores require range validation, version/concurrency control, actor, timestamp, rubric detail,
  moderation state, and audit reason for changes.
- Manual scores are protected. Cleanup must never modify or delete them.
- “Returned”, “resubmission requested”, “graded”, “moderated”, and “published” must be distinct
  states with valid transitions.
- Verify assignment/project creation, learner visibility, late submission, offline retry,
  duplicate upload, teacher grading, rubric, feedback, return, resubmit, moderation, result
  contribution, notification, and parent view.

### 6.8 CBT, exams, school examination papers, and assessments — **E2E unverified**

Required completion:

- Define one assessment model for question source, sitting, attempt, response, marking, score,
  moderation, and publication.
- CBT and uploaded/manual school papers may have different capture methods but must feed the same
  grading/result authority.
- Host-school compulsory papers and optional Rillcod learning evidence must remain distinguishable.
- Examination paper rendering in reports must be deliberate: subject/result contribution and
  optional evidence appendix are separate concerns.
- Verify whether each exam produces a candidate paper, marking evidence, result contribution,
  and permitted PDF. Record exact retention rules.
- Protect attempt integrity with server time, attempt ownership, resume policy, randomized
  question snapshot, idempotent submission, and finalization lock.
- Test no network, reconnect, timeout, duplicate submit, invalid question, manual marking,
  moderation, correction, publication, and report rendering.

### 6.9 Results, report builder, school reports, publish/share/autofill — **Active; SYS-014 walked locally; complement entry walked locally**

Host papers stay on the same Rillcod progress report as classwork, assignments and projects.
Write, Auto-fill and Publish land on one row via `findCanonicalProgressReport`. A published
row is locked; corrections unpublish in Publish & Share and edit that same row. That is the
current correction model — not a second versioned-row table.

Required completion:

- One result authority consumes validated assessment/grading outputs.
- Builder stages: choose session/class/learner → load curriculum/subjects → optional autofill →
  edit/validate → preview → publish → share.
- Autofill is optional and must show source/provenance. It must never overwrite a manual score
  silently.
- **User-reported re-verification (walked 23 August 2026, local admin session):** Write start
  is programme then course. A Christ the Redeem Teen Dev class filled Teen Developers →
  Python for Beginners and Start grading opened the roster. Refresh restored that class,
  programme, course, and the open learner (`Session restored`). Switching programme changes
  the course list. Persist no longer writes an empty seat before restore. Autofill, after
  the account finished loading, listed 58 classes; Abundant Grace Teen Dev offered only
  Python for Beginners, four learners, and Fill from class work. Typed/published copy is
  present. Scores were not written. Production deploy is still outstanding.
- Returning to a learner must restore current draft state without duplicating reports.
  POST `/api/progress-reports` retargets `findCanonicalProgressReport` when `existing_id` is
  missing. Browser return-to-learner without a second row is still to walk.
- Switching Rillcod optional evidence on/off must not alter compulsory host-school marks.
  `mergeHostSchoolMetrics` now keeps stored First/Second/Exam papers when classwork or an
  empty CBT snapshot is saved. Write hydrate also prefers stored hall marks over empty CBT.
  Unit-tested. A hide/show toggle and a second “One total” calculator were rejected — they
  made Write look like a rival system.
- Compulsory Write now has a real entry path, not a dead-end “entered on the paper” note.
  Each First / Second / Exam row links to the existing hall-mark surface (`/dashboard/cbt/{id}`
  or `buildCbtNewHref` with `host_assessment`). Classwork, assignments and projects stay
  visible and enterable on Write beside that paper total. Walked 23 August 2026 as admin on
  Gabus High Teen Dev JSS 1–3 (`programme_standing=compulsory`): Start grading opened Abolo
  Chukwuzite Antonia; Write showed **Open paper** (no papers exist yet) and **Enter classwork,
  assignments and projects**; First Test opened `/dashboard/cbt/new?host_assessment=first_test`
  titled First Test. Saving classwork on a row that already has hall marks was not re-walked
  here — that merge is unit-tested only.
- Publication produces an immutable family-visible record. Correction is unpublish, then edit
  the same row. Do not invent a parallel version table unless product asks for it.
  Walked 23 August 2026 as admin: Publish showed 898 students / 523 published / 39 drafts
  for 2025/2026 Third Term. Opening Aghafedo Elliot showed **Unpublish to edit**.
- Share and verify already use `/result-check/{verification_code}` plus access-card codes,
  public DTOs, access audit, unpublished filter (`is_published = true`), and card
  revoke/expiry. Do not add a second progress-report share-token system.
  Walked: parent-results refuses staff; result-check gate loads; a bogus `RPT-` code
  returns 404. Live published-code open, revoked card, PDF/print totals, and email/share
  still required. The opened Publish card did not print the `RPT-` code in page text
  (QR only), so that live check was not completed in this pass.
- PDFs must match visible totals, labels, pathway rules, organization identity, and publication
  version.

### 6.10 Learner progress, progression, analytics, and pathways — **At risk**

Required completion:

- One learner-progress read model combines authoritative attendance, content activity,
  submissions, assessments, results, and teacher observations.
- Rillcod and compulsory/school pathways are labelled dimensions or filters, not duplicate learner
  profiles.
- Progress, learner-progress, progression, path-progress, parent-path-progress, analytics, and
  leaderboard pages must each have a unique job. Merge or redirect true duplicates.
- Confidence and prediction must show supporting evidence, freshness, and limitations.
- Teacher predictive suggestions should propose the next likely grade, rubric level, comment, or
  intervention, but require confirmation before writing protected evidence.
- Never rank learners using missing data as failure.
- Parents see human summaries and next actions, not internal confidence values or debug metadata.
- Verify recalculation after late grading, corrected attendance, unpublished result, pathway
  toggle, learner transfer, and archival.

### 6.11 Communications, inbox, CRM, WhatsApp, notifications, and support — **At risk**

Required completion:

- One message/delivery ledger records channel, recipient, consent/legal basis, template/version,
  provider ID, status, retry count, sent time, delivered time, failure reason, and correlation.
- Inbox, messages, announcements, newsletters, notifications, school-teacher messages, CRM,
  engage/engagement, WhatsApp groups, cases, and support may present different tasks but must not
  invent separate delivery truth.
- A queued provider request is not “delivered”. UI wording must reflect accepted, sent, delivered,
  read, or failed accurately.
- Empty catch blocks in WhatsApp class, assignment, and broadcast paths must be replaced with
  structured logging and visible recoverable status.
- Customer-facing failures remain simple; internal provider details remain in restricted logs.
- Respect consent, opt-out, quiet periods, school scope, and parent/learner safety.
- Retries must be idempotent and use backoff/dead-letter handling.
- Verify broadcast recipient preview, duplicate recipient suppression, opt-out, partial failure,
  retry, provider callback, and activity-trail labels.

### 6.12 Attendance, timetable, live sessions, and delivery — **E2E unverified**

Required completion:

- Timetable defines expected delivery; live sessions and lesson delivery attach to class, plan,
  week, lesson, teacher, and learner audience.
- Attendance has one authority and explicit sources: manual, live session, import, or approved
  correction.
- Session series creation and webhook updates must be idempotent.
- Recording access follows class membership, safeguarding, retention, and consent.
- Book/session compilation should be optional. It is useful only if it is a generated view of
  approved content, not a new authority or mandatory teacher burden.
- Optional/compulsory pathways control visibility through the central audience service.
- Verify reschedule, substitute teacher, cancelled class, late join, disconnect/reconnect,
  attendance correction, recording processing, learner access, and session-book generation.

### 6.13 Cards, certificates, identity, portfolio, and showcase — **E2E unverified**

Required completion:

- Shareable cards/certificates/portfolio items reference central learner and achievement records.
- Templates store version, organization brand, source evidence, issuer, issue time, and revocation.
- Public tokens reveal only the intended artifact and support revocation.
- Card/certificate counts link to filtered records or quick views.
- Fix empty catches in my-card and card-studio load paths so failures do not appear as empty data.
- Verify PDF/image export, mobile view, print, revoked token, changed learner name, replaced
  template, and expired artifact.

### 6.14 Special programs, summer school, and partnerships — **E2E unverified**

Required completion:

- Each program keeps its own enrolment, pricing, schedule, curriculum, and pathway configuration
  while reusing central identity, consent, finance, teaching, submission, grading, communication,
  and reporting services.
- Program-specific pages must not create duplicate learner, parent, invoice, or result authorities.
- Verify registration, partial payment, class assignment, program content, attendance, submission,
  certificate/result, parent access, withdrawal, transfer, and return to the main school pathway.

### 6.15 Platform configuration and operations — **At risk**

Required completion:

- Consolidate rules by authority: organization, academic calendar, grading, finance, messaging,
  security, integrations, and feature release.
- Remove duplicate policy/event/pattern settings only after mapping every reader and writer.
- Each setting needs type, scope, default, validation, version, owner, audit event, and effective
  date where relevant.
- Configuration UI must explain impact and show affected users/workflows before save.
- High-risk changes require preview, confirmation, and rollback/version history.
- Feature flags must never silently lock customers into an incomplete path.
- Platform operations must expose job failures, schema drift, webhook backlog, storage issues,
  delivery failures, and degraded dependencies without exposing internals to customers.

### 6.16 Public site, brand, and acquisition — **Partially verified**

Required completion:

- Add programmatic labels to contact fields.
- Raise all public touch targets to the product standard.
- Remove duplicate login H1 semantics.
- Test all 49 public pages at 320, 390, 768, 1024, and wide desktop widths.
- Verify navigation, forms, validation, success, errors, rate limiting, email delivery, privacy
  links, keyboard access, focus order, contrast, metadata, social sharing, and slow connection.
- Public forms must use centralized intake, identity matching, spam protection, consent, audit,
  and safe customer feedback.

### 6.17 Native applications and PWA — **Confirmed brand mismatch / release audit required**

Confirmed mismatch:

- `capacitor.config.ts`: display name “Rillcod Academy”; app ID `com.rillcod.academy`.
- Android strings: “Rillcod Academy”.
- iOS display name: “Rillcod Academy”.
- Approved customer brand: **Rillcod Technologies**.

Required completion:

- Change user-visible Android, iOS, and Capacitor display names to Rillcod Technologies.
- Do **not** change application/bundle IDs without a store identity, installed-user, deep-link,
  push-token, and migration plan.
- Test safe areas, keyboard, back navigation, deep links, QR/camera permission, file upload,
  download/share, authentication persistence, offline state, reconnect, push notification,
  payment handoff, and external-link return.
- Treat `public/sw.js` as generated release output. Verify cache versioning and stale-chunk
  recovery so users do not see webpack “undefined call” failures after deploy.
- Define a web/PWA/Android/iOS release matrix and record the tested version for every release.

### 6.18 Database, data integrity, retention, and deletion — **Schema compatibility verified; semantic audit incomplete**

There are 145 migrations and 175 hard-delete call sites.

Required completion:

- Produce a table-by-table authority, foreign-key, uniqueness, RLS, retention, archival, and
  deletion policy.
- Categorize every hard delete as safe ephemeral cleanup, restricted administrative erasure, or
  defect requiring soft delete/archive.
- Protect scores, grades, results, posted finance records, consent evidence, delivery records,
  and audit events.
- Use database constraints for identities and invariants that must survive all clients.
- Use transactions/RPC/domain commands for multi-table workflows; never depend on browser call
  order for consistency.
- Re-run schema-drift, write, relationship, generated-type, RLS, and migration-order checks in CI
  against a disposable database and a read-only production schema check.
- Test concurrent update, retry, duplicate webhook, partial failure, deletion with references,
  restore/archive, school tenant boundary, and privileged service-role boundary.
- Backup and restore must be exercised, timed, and documented; backup existence alone is not a
  recovery proof.

### 6.19 Security and privacy — **Confirmed control gaps**

Verified present: clickjacking, MIME-sniffing, referrer, and permissions headers exist in current
Next configuration.

Not verified/present in the current audit:

- Content Security Policy
- HTTP Strict Transport Security
- Central origin/CSRF protection for cookie-authenticated state changes
- Proven durable global rate limiting across container instances
- Automated dependency update workflow
- Code/dependency/container scanning
- External error monitoring

Current production dependency audit (verified with `npm audit --omit=dev --json` against the
checked-in lockfile on 22 August 2026): **21 findings — 10 moderate, 10 high, 1 critical**.
Confirmed production chains include Next 15.5.23 → PostCSS/Sharp, `next-pwa` → Workbox →
`serialize-javascript`, and Capacitor CLI / `@mapbox/node-pre-gyp` → `tar`. The critical rating
is currently carried by `tar`; the reported direct-package remediations for Next and Capacitor
are major upgrades. Firebase Admin and Monaco chains account for additional moderate findings.
This is live remediation debt, not merely missing dependency-update automation.

The current middleware limiter is also confirmed to be a process-local `Map`, limited to
`/api/inbox`; it resets per container/cold start and does not protect the other API families.
Authenticated dashboard navigation also performs a `portal_users.role` lookup on every matched
request. The database check is correct but needs a measured, invalidation-safe role/session
strategy so security is not traded for latency.

Additional inconsistency: Supabase configuration minimum password length is 6 while current app
flows use 8. Align the platform minimum to the approved policy after verifying existing-user
impact.

Required completion:

- Add CSP in report-only mode, observe violations, then enforce a minimal source policy compatible
  with Supabase, Paystack, LiveKit, R2, and required media.
- Add HSTS only after confirming all production/subdomain traffic is HTTPS.
- Centralize request-origin/CSRF enforcement for unsafe methods where cookie credentials apply.
- Back rate limits with a durable shared store and specific identity/IP/action keys.
- Add secret scanning, dependency review/update automation, static code scanning, and container
  image scanning to the Cloudflare release pipeline.
- Upgrade vulnerable dependency chains in isolated, tested steps: first resolve safe
  non-breaking overrides/direct upgrades, then migrate Next, Capacitor, Firebase Admin, Monaco,
  and PWA tooling with framework/native/offline regression matrices. Do not use a blind
  `npm audit fix --force` on production.
- Review service-role usage, signed URLs, public buckets, webhook signatures, file access, PII in
  logs, data export, deletion, and tenant isolation.
- Run an independent penetration test before describing the system as bulletproof.

### 6.20 Reliability, automation, cron, and external jobs — **Partially implemented; operational proof required**

There are 22 cron API groups. Cron-job.org or another scheduler can trigger jobs, but the scheduler
is not the source of business truth.

Required completion:

- Each job needs a stable endpoint, authentication/signature, durable run record, idempotency key,
  lease/overlap prevention, timeout, retry/backoff, dead-letter state, metrics, alert, and manual
  replay.
- Record scheduler name, cadence, timezone, owner, last success, next run, maximum delay, and
  customer impact.
- A missed or duplicated scheduler request must not duplicate invoices, messages, grades, or
  enrolments.
- Background AI generation must use the same job discipline.
- Expose professional customer states (“Still preparing—retrying automatically”) while keeping
  provider/debug details in restricted operations views.
- Test job overlap, delayed trigger, invalid signature, dependency outage, partial batch, replay,
  and deploy during execution.

### 6.21 Observability and audit trail — **Confirmed gap**

The current structured logger primarily writes JSON to console; instrumentation is limited and
the audit found approximately 397 API `console.error`/`console.warn` usages and 22 empty catch
blocks.

Required completion:

- Centralize structured logs with environment, service, route/job, severity, request/correlation
  ID, tenant, actor ID where lawful, outcome, duration, and safe error code.
- Never log secrets, refresh tokens, payment authorization data, or unnecessary learner PII.
- Add external error aggregation, alerting, and release correlation.
- Replace empty catches with one of: expected fallback plus metric, user-visible retry state, or
  propagated typed error.
- Audit/activity UI translates machine events into human action, object, result, time, and reason.
- Establish service-level indicators for auth success, form completion, payment posting, content
  generation, submission, grading, report publishing, messaging, job success, and PDF generation.

### 6.22 Accessibility, international usability, and visual QA — **At risk**

No dedicated axe/Lighthouse-style dependency or enforced browser accessibility gate was found.

Required completion:

- Meet WCAG 2.2 AA for keyboard operation, focus, labels, semantics, contrast, reflow, target size,
  errors, status announcements, and reduced motion.
- Replace placeholder-only labels.
- Maintain one semantic H1.
- Verify screen reader names for icon controls.
- Test zoom to 200%, narrow reflow, long names, long grade labels, dates/numbers, and low bandwidth.
- Mobile student search placeholders/results must expose both learner name and grade/class where
  that disambiguates the learner.
- Add automated accessibility checks to representative public and authenticated routes, plus
  manual keyboard and screen-reader review.

### 6.23 Testing, release, deployment, and documentation — **Strong base; coverage gap**

Cloudflare Containers is the only production deployment target. Do not reintroduce Vercel.

Required release gate:

1. Cleanly identify the files included in the milestone; preserve unrelated work.
2. Run focused tests for changed business rules.
3. Run full `npm test` when shared authority, schema, security, finance, grading, or routing
   changes.
4. Run encoding, UI, route export, relationship/embed, schema-drift, write compatibility, and
   type checks.
5. Run authenticated browser smoke tests for all roles and public critical journeys.
6. Verify mobile and desktop screenshots for changed pages.
7. Verify PDF/output parity when reports, invoices, cards, certificates, or exams change.
8. Push to `main`; require CI pass before Cloudflare deploy.
9. Run post-deploy auth, onboarding, finance, teaching, submission, grading, report, and messaging
   canaries.
10. Confirm monitoring, job health, error rate, and rollback readiness.

Historical documents named “complete”, “final”, or “production ready” are implementation
snapshots, not current certification. This register is the current product-level authority.

## 7. Prioritized issue register

| ID | Priority | State | Issue | Required proof to close |
| --- | --- | --- | --- | --- |
| SYS-001 | P0 | Verified locally; deployment pending | Invalid refresh-token failure at production login | Deploy and repeat stale-session production canary |
| SYS-002 | P0 | Partially verified | Admin login/sign-out passed locally; other private role journeys remain | Teacher, partner school, parent, student, and restricted route journeys pass |
| SYS-003 | P0 | Verified locally; production proof pending | Report authority/pathway split protects compulsory papers and optional six-box results | Deploy, role E2E, and binary PDF parity |
| SYS-004 | P0 | Partially remediated; observation and route inventory pending | Common API boundary now has settings-based off/observe/enforce origin decisions with same-origin, native, configured-origin, and non-browser handling; default is non-blocking observation | Review observations, inventory direct unsafe routes and signed exemptions, then pass same-site/cross-site/native/webhook/cron attack tests before enforcement |
| SYS-005 | P0 | Partially remediated; shared-store deployment proof pending | Central wrapper and sensitive public routes use the Upstash-aware limiter; reads no longer consume write capacity, authenticated writers use per-user/per-feature counters, and the policy is administrator-configurable. Direct-route inventory and shared-store production proof remain | Configure the shared store, finish all-sensitive-action inventory, then pass concurrency, school-NAT, disable/tune, and bypass tests |
| SYS-006 | P0 | Locally remediated; production resend proof pending | Financial correction/resend now uses one canonical document route and a trusted issued-account snapshot | Deploy and prove the same invoice version matches save/preview/download/email/resend |
| SYS-007 | P0 | Class merge/delete verified against the live schema; remaining call sites unclassified | Atomic `merge_duplicate_classes` and `delete_rebuildable_class` are applied and live (migrations 100–102). **Verified against the live database, not by reading the SQL**: all 32 foreign keys referencing `classes` are accounted for by the merge — none cascades without being re-pointed first — and the four learner-evidence tables (`academic_assessment_evidence`, `exams`, `student_progress_reports`, `student_transfer_requests`) are ON DELETE RESTRICT, so the database itself refuses to drop a class while evidence exists. The four deletes inside the merge are conditional dedupe (`and exists (…)`), removing a source row only where an equivalent survivor row already exists. The `students.class_id` write is guarded by a table-and-column check, which matters because that column does not exist on this database; `current_class`, `section` and `user_id` do | Classify the remaining literal and dynamic delete sites outside the class/lesson-plan paths, and exercise a real merge and a real class delete against a disposable database before trusting either in production |
| SYS-008 | P0 | Partially remediated; full evaluation E2E pending | Assignment grading now routes through the canonical submission-review authority. A staff mark without a portal submission is recorded as staff-entered work, not fabricated as a learner submission, and optimistic-version checks remain central | Complete assignment/project/CBT/result role E2E and production proof without changing historical manual scores |
| SYS-009 | P1 | Partially remediated; observation/deployment proof pending | CSP report-only policy, sanitized observation ledger, Operations Health summary, and production HSTS are implemented locally; CSP is deliberately not enforced yet | Apply migration 99, deploy, inspect real browser/native violations, tighten directives, then enforce CSP and verify HTTPS/HSTS |
| SYS-010 | P1 | Locally remediated; device proof pending | Android, iOS, and Capacitor now display Rillcod Technologies and regenerated native assets are checked in | Android/iOS/PWA installed-app visual proof |
| SYS-011 | P1 | At risk | 70 client pages directly query database | Critical paths migrated to domain gateways with parity tests |
| SYS-012 | P1 | At risk | Large academic/lesson/report/settings pages | Vertical service/component split and performance baselines |
| SYS-013 | P1 | Locally remediated; deployment and interruption proof pending | The tracked generator now inventories the exact plan/week/session, reuses existing content, repairs only missing or safely stale generated items, preserves teacher-customized work, and declines a concurrent duplicate run | Apply migration 103, deploy, then prove interrupted-run recovery and browser discovery against production-like data |
| SYS-014 | P1 | Locally walked | Persist no longer wipes programme on remount. Walked as admin: Write class→programme→course→start and refresh restore; Autofill after account load listed 58 classes, Abundant Grace Teen Dev offered only Python, four learners, Fill from class work, no score writes | Production deploy |
| SYS-015 | P1 | Locally remediated; learner publication E2E pending | The weekly preparation and approval flow treats lesson, slides, practice cards, assignment, and project as one package; completeness is visible and partial sharing is an explicit teacher choice | Prove teacher approval and learner visibility for all five content kinds in role E2E |
| SYS-016 | P1 | At risk | Consent/claim/registration/finance gates can conflict | Central lifecycle state-machine and multi-entry E2E tests |
| SYS-017 | P1 | Correlation repaired; external aggregation still absent | The reference shown to a customer was generated *after* the error had already been logged without it, so "I got error abc123" pointed at nothing in any log. It is now generated once, logged, and returned, and is covered by `src/proxies/error.proxy.test.ts`. That makes a reported failure traceable by hand. It is not monitoring: `src/lib/logger.ts` still only writes JSON to the console, which on Cloudflare Containers means stdout on an instance that sleeps, and there are 732 `console.error` calls of which 358 are server-side | Wire a real aggregator (Sentry or an OTel exporter), attach release and requestId, and alert on rate. Until then nobody learns a production error happened unless a customer says so |
| SYS-018 | P0 | Scanning gates added locally; first run and ownership pending | Full and production npm audits report zero findings. `.github/dependabot.yml` schedules weekly npm and monthly action updates, with Next/React/Capacitor majors excluded as coordinated upgrades. `.github/workflows/security-scan.yml` adds CodeQL (`security-extended`), a two-tier npm audit, and a Trivy scan of the `Dockerfile.cf` image the deploy actually ships. Kept out of `ci.yml` on purpose: that workflow gates the Cloudflare deploy, so an overnight advisory must not be able to block a release on its own | Confirm the first scheduled run is green, assign an owner for each alert stream, and decide which findings become release-blocking | Patched lockfile, zero accepted critical/high findings or documented exception, CI gates and ownership active |
| SYS-019 | P1 | At risk | Cron operational guarantees undocumented | Job registry, run ledger, alerts, replay and overlap tests |
| SYS-020 | P1 | Broadcast truthfulness fixed; provider delivery ledger still absent | The group broadcast surface stamped `last_broadcast_at` whether or not the ledger POST succeeded, so a failed record still rendered "broadcast just now" and the stamp then disappeared on reload. All four broadcast paths now stamp only on a confirmed 2xx, and both multi-group paths name the groups that were not recorded instead of reporting a clean send. Load failures for classes and assignments are traced rather than presenting as "none" | Provider-side delivery ledger (recipient, consent, channel, provider ID, accepted/sent/delivered/failed timestamps) is still missing; this covers our own record, not WhatsApp's |
| SYS-021 | P1 | At risk | PDF parity across invoice/report/exam/certificate | Golden/semantic PDF checks and version linkage |
| SYS-022 | P1 | Locally remediated; deployment proof pending | Source-controlled worker replaces Workbox/fallback artifacts, excludes private/API traffic, and has update/push/cleanup guards | Clean checkout/build owns all worker assets; cache-upgrade and old-client deploy tests pass |
| SYS-023 | P2 | **Withdrawn — false positive** | “EducationAcross” is a `textContent` artifact of a real `<br />` in `src/components/landing/About.tsx`; the rendered copy is correct | None. Re-verified 23 August 2026. A scan reading `textContent` must not treat a `<br>` join as a copy defect |
| SYS-024 | P1 | Far larger than recorded; entry points fixed, backlog gated | Recorded as a contact-form defect. A full scan found **1,553 of 1,668 form controls (93%) with no programmatic accessible name** across 214 files. The public contact form is fixed, and all five shared primitives in `src/components/ui/Form.tsx` (Input, Textarea, Select, Checkbox, Radio) now pair label and control through `useId` and wire `aria-invalid`/`aria-describedby`, which fixes every consumer of those components at once. Raised to P1: this is the product's largest single WCAG 1.3.1/4.1.2 exposure, not a cosmetic one | Pay the 1,553 down against the ratchet in `npm run audit:a11y`, worst files first, then confirm with a real browser accessible-name check. **The static count overstates what is left**: the learner and school enrolment forms are fixed through their `Field` wrapper, which injects the id at runtime, and a source scan cannot see that. Trust `src/components/ui/form-accessible-names.test.tsx` over the counter for anything routed through a wrapper |
| SYS-025 | P2 | Public and login targets raised; full sweep pending | Login was already at 44px from the auth work (14 min-h-11 targets; the password toggle is h-11 w-11 with aria-label and aria-pressed). The landing footer was not: social icons were 40x40 and both link columns plus the bottom legal strip were bare text with no target height. Social icons are now 44x44 and every footer link is inline-flex with min-h-11; the lists were retightened from space-y-4 to space-y-0 so the rhythm stays close to what it was | Sweep carousel controls and indicators, then confirm with a real 44px browser audit across viewports |
| SYS-026 | P2 | Verified fixed | `src/app/login/page.tsx` now exposes exactly one `<h1>`; the desktop panel heading is an `<h2>`. Re-verified 23 August 2026 | Deploy and confirm one exposed document H1 in a browser |
| SYS-027 | P2 | At risk | 146 pages with raw buttons, 114 raw inputs | Design-system exception or migration per occurrence |
| SYS-028 | P2 | At risk | Tiny text on 136 pages | Readability review and token enforcement |
| SYS-029 | P2 | At risk | Horizontal-scroll fallback on 46 pages | Mobile task review and justified table exceptions |
| SYS-030 | P2 | Classified; 8 remain and are documented as deliberate | 22 matches were 20 real sites (2 were prose in comments). Sites that hid a genuine failure now log a typed, contextual error: card studio lookups, my-card load, WhatsApp class/assignment loads, and the broadcast ledger under SYS-020. The 8 that remain are expected-fallback by design and now say so in place — the three-strategy `safeParseJSON` ladder, and single-line localStorage guards on public pages where storage throws in private mode | Keep the count at zero undocumented. A new empty catch needs a comment saying which fallback it is, or it is a swallowed error |
| SYS-031 | P2 | At risk | 2,761 `any` escapes | Remove at authority boundaries first; type budget trends down |
| SYS-032 | P2 | Config aligned; hosted project setting pending | `supabase/config.toml` raised from 6 to 8, matching the 8-character minimum the application already enforces in signup, reset, parent provisioning and settings. The hosted project’s own Auth setting lives in the dashboard, not this file | Set the linked project’s minimum password length to 8, then confirm a 7-character password is refused through a hosted reset link and not only by the app form |
| SYS-033 | P2 | Partially remediated | Platform Operations now owns traffic/origin controls and optional accountability class repair with audit evidence; the full policy reader/writer map remains incomplete | Complete one-authority inventory and remove or redirect remaining duplicate settings |
| SYS-034 | P2 | At risk | Learner-progress route overlap/noise | Unique task map, merge true duplicates, central read model |
| SYS-035 | P2 | At risk | Class roster and path visibility can compete | One roster with scoped visibility controls |
| SYS-036 | P2 | Central handler fixed; per-route messages unreviewed | The shared API error handler returned an `AppError` message to the customer whether or not it was operational, so a message written for us went out to the public unchanged. Non-operational and unhandled errors now return one generic sentence and keep the detail in the log; operational messages, which are written for the customer, pass through untouched. Verified no non-operational `AppError` is constructed anywhere today, so no existing response changed shape | 471 of 532 routes do not use the shared wrapper and write their own error text. Review those, and define the public error-code contract |
| SYS-037 | P2 | Static gate enforced in CI; browser gate still absent | `npm run audit:a11y` runs as a required CI step. It is a ratchet: it fails when the count of unlabelled controls rises above the committed baseline, so the backlog can only be paid down. It was tested against a deliberate regression and exits 1, rather than being assumed to work — the lint gate had silently stopped executing for an entire dependency upgrade. Runtime association is proved by `src/components/ui/form-accessible-names.test.tsx`, which renders each primitive and reads the markup back, including that two instances on one page do not share an id | A static scan cannot compute an accessibility tree. A real axe/browser run against a deployed build is still required for contrast, focus order, reflow and announcement |
| SYS-038 | P2 | At risk | Special-program path may duplicate main system | Shared-service E2E verification |
| SYS-039 | P3 | Governance | Historical completion documents create stale truth | Mark historical when touched; link back to this register |
| SYS-040 | P3 | Governance | Page ownership and task definition incomplete | Owner/role/task/status recorded for all 229 pages |
| SYS-041 | P1 | Verified locally; deployment pending | Duplicate `UserRole` type omitted `parent` in `src/types/auth.ts` | Deploy and keep exhaustive role tests green |
| SYS-042 | P1 | Verified locally | Vitest excluded `.test.tsx`; report-card PDF renderer guard never ran | TSX collection remains enabled and full CI reports 333 files including the guard |
| SYS-043 | P1 | At risk | Dashboard middleware performs a role database read on each matched navigation | Measured latency budget and invalidation-safe role authorization with revoked/changed-role tests |

## 8. Mandatory journey certification matrix

Each critical journey must be tested against this matrix. A happy-path desktop screenshot alone
cannot close an issue.

| Dimension | Required cases |
| --- | --- |
| Roles | Admin, teacher, student, parent, finance/operations, restricted or inactive user |
| Viewports | 320px, 390px, tablet, desktop, wide desktop |
| Input | Touch, mouse, keyboard, screen-reader-accessible names |
| Data | Empty, one item, many items, duplicate-like records, long names/grades, archived record |
| Network | Normal, slow, request failure, retry, reconnect, duplicate request |
| Session | Fresh, stale refresh token, expired, revoked, role changed, multiple tabs |
| Mutation | Success, validation error, permission error, stale version, concurrent edit, idempotent retry |
| Return | Refresh, back/forward, deep link, reopen draft, post-login redirect |
| Output | Screen, print, PDF, email/share, public token, native download |
| Audit | Human label, actor, target, result, time, reason, correlation |
| Privacy | Correct tenant, minimum data, revoked access, safe log/error |
| Automation | Trigger, overlap, failure, retry, replay, alert, customer state |

## 9. Implementation order

### Milestone 1 — Entrance and protected evidence

- Fix auth-state recovery and certify role access.
- Complete and commit the report authority work without touching manual scores.
- Reproduce/fix finance invoice PDF regeneration.
- Classify delete sites that touch academic, finance, consent, identity, or audit data.

### Milestone 2 — One workflow authority

- Centralize onboarding lifecycle and gates.
- Centralize submission, grading policy, assessment, result, and publication.
- Centralize invoice/payment/reconciliation and customer finance state.
- Centralize message delivery truth and audit events.

### Milestone 3 — Teaching engine

- Extract curriculum/class/plan/lesson/content domain services.
- Create durable AI generation jobs.
- Harmonize lesson material, flashcards, assignments, projects, and optional slides.
- Simplify class and lesson UX around next action and attention needed.

### Milestone 4 — Operational hardening

- CSP, HSTS, CSRF/origin, durable rate limit, scanning, external monitoring.
- Cron registry, run ledger, alerts, idempotency, replay.
- Database deletion/retention/RLS certification and backup restore exercise.
- PWA stale-client and native release matrix.

### Milestone 5 — Whole-product UX and accessibility

- Resolve confirmed public defects.
- Migrate critical raw controls and tiny text.
- Remove unjustified mobile horizontal scrolling.
- Run all 229 pages through role, responsive, accessibility, state, and task review.
- Merge only true duplicates and retain deliberate role/path distinctions.

## 10. Definition of “solid”

The product may be called solid only when:

- Every one of the 229 pages has a named task, owner, role scope, responsive result, and complete
  async states.
- Every critical lifecycle has one named source of truth and is tested across UI, API, database,
  automation, audit, and output.
- Admin, teacher, student, parent, finance, and restricted-role journeys pass in production.
- Manual scores and other protected evidence cannot be silently changed or deleted.
- Finance totals and invoice PDFs remain consistent after correction, save, download, and resend.
- Consent, parent claim, registration, finance gating, and report access agree without duplicate
  identities or deadlocks.
- Lesson plans, lessons, all learning-content types, delivery, submissions, grading, and results
  share durable linkage and provenance.
- Security, rate limiting, monitoring, jobs, backups, and rollback have operational proof.
- Customer interfaces show professional human feedback while internal diagnostics remain
  restricted.
- CI, Cloudflare deploy, and post-deploy canaries all pass for the released commit.

Until those proofs exist, the honest state is **strong foundation with documented high-priority
gaps**, not “everything complete.”

## 11. Protected current worktree

The audit observed uncommitted changes in report/result authority files, report tests, the
Cloudflare gateway, a generated service worker, Supabase CLI temp metadata, and an untracked
image. They are not deleted, reset, or bundled into this document. Before any future commit:

- review and stage exact intended files only;
- never stage temporary Supabase metadata or an unexplained image automatically;
- confirm whether the generated service worker belongs to the release;
- preserve the report tests and protected-score behaviour;
- run the required type and test gates.

This section records preservation boundaries only; it is not evidence that the uncommitted
implementation has been deployed.

## 12. Capability truth table: present, incomplete, absent, or unverified

This classification prevents an engineer from rebuilding something that already exists and also
prevents an existing filename from being mistaken for a completed business capability.

### 12.1 Present foundations that should be reused

Static inspection found real foundations for:

- authentication services, post-login redirects, school scoping, and capability rules;
- consent access codes, parent attachment, identity matching, child linkage, throttling, result
  access, pathway gateway, and notification helpers;
- curriculum governance, rollout, delivery scheduling, quality gates, repair, and session-aware
  scheduling;
- lesson services, lesson-plan generation modes, AI fetch handling, lesson scope, and lesson
  fallback tests;
- assignment authorization, grading rules, grading queue/rubric tests, learner feedback, and
  project/submission integrity tests;
- general grading schemes, written-exam grading, CBT grading, and review queues;
- finance invoice state/input/account helpers, creation, settlement, allocation, reconciliation,
  refunds, supersession, billing cycles, reminders, and tests;
- report publication, revisions, verification, wording, curriculum scope, source query,
  deduplication, recommendations, and PDF/render components;
- audit logging, scope, query, humanisation, categories, and tests;
- cron authentication, daily guards, fan-out, registry, monitor, and tests.

**Recommendation:** consolidate and connect these modules before introducing new abstractions.
The defect is often competing callers, incomplete workflow composition, or weak operational proof,
not the total absence of domain code.

### 12.2 Existing but incomplete or not yet proven end to end

| Capability | Evidence it exists | Missing proof or integration |
| --- | --- | --- |
| Role/capability control | Auth and capability helpers | Full page/API role matrix and stale-session recovery |
| Consent and parent onboarding | Rich consent/linkage modules | Same outcome across QR, typed code, claim, finance gate, and report access |
| Curriculum governance | Extensive governance and quality modules | Class/plan/lesson/content browser lifecycle and concurrency |
| Unified lesson content | Lesson, flashcard, assignment, project, slide features | One durable provenance/publication model across all content types |
| Grading | General, assignment, written, and CBT grading modules | One weighting/policy authority and result contribution |
| Finance | Extensive finance modules and central workspace | Correction/resend/PDF/reconciliation consistency |
| Reporting | Strong report modules and current focused tests | Reliable builder entrance, autofill protection, publication/share/PDF E2E |
| Audit trail | Log and humanisation modules | Complete mutation coverage and customer-safe/operations-safe presentation |
| Job operations | Cron registry/monitor/guards | External scheduler inventory, run evidence, alerting, replay, overlap proof |
| Submission integrity | Tests and shared preview components | Assignment/project/CBT evidence lifecycle across all roles |
| Native/PWA | Capacitor projects and service worker | Brand alignment, offline/stale release, store/device matrix |

### 12.3 Confirmed absent from the inspected repository configuration

These are confirmed code/repository gaps; an external infrastructure control could exist, but it
is not connected or provable from the application:

- an **enforced** Content Security Policy. A report-only policy and a sanitized
  observation ledger now exist; nothing is blocked yet, so this stays absent until the
  observations justify enforcement;
- external error aggregation/release tracking such as Sentry or an OpenTelemetry exporter;
- a browser accessibility gate using axe or an equivalent engine.

Two entries were removed from this list on 23 August 2026 because they are no longer
absent. HSTS is configured for production responses in `next.config.ts`. A centralized
origin guard for state-changing requests exists at the common API boundary
(`evaluateMutationOrigin`, with off/observe/enforce modes); it defaults to
non-blocking observation, which is a deployment decision tracked by SYS-004, not a
missing control.

### 12.4 Operational claims still unverified

Do not mark these absent and do not mark them complete until infrastructure evidence is collected:

- Cloudflare production secret rotation and least-privilege access;
- database point-in-time recovery, backup restore success, and recovery time;
- cron-job.org job inventory, signatures, last-run reliability, and alert ownership;
- Paystack webhook production delivery/replay history;
- LiveKit webhook/recording retention and access enforcement;
- R2 lifecycle, object retention, signed URL expiry, and orphan cleanup;
- Android/iOS store signing, upgrade path, crash reporting, and push delivery;
- domain, TLS, HSTS subdomain suitability, DNS failover, and rollback timing.

### 12.5 Business capabilities that are truly needed

These capabilities are necessary for a professional end-to-end product. Some have partial code,
but none should be considered available until their full acceptance test passes.

| Capability | Why the business needs it | Minimum acceptable solution |
| --- | --- | --- |
| Identity resolution workbench | Mass onboarding creates duplicates and ambiguous matches | Ranked candidates, evidence, explicit merge/link choice, undo/audit, tenant guard |
| Gate explanation and override | Finance/consent/access gates otherwise deadlock customers | One reason code, human message, owner, expiry, permitted override, audit |
| Data-quality exception queue | Silent empty results look like “no data” | Domain exception, severity, affected record, owner, retry/repair, closure evidence |
| Idempotency and operation receipt | Network and webhook retries can duplicate money/content/messages | Stable request key, stored outcome, safe replay, customer receipt/correlation |
| Versioned correction workflow | Scores, reports, invoices, and published content need safe changes | Immutable published version, correction reason, successor link, effective state |
| Provenance/lineage | AI/autofill/derived values must be explainable | Source IDs, generator/rule version, actor, time, confidence where relevant |
| Job operations console | Automation without run truth fails silently | Schedule, last/next run, duration, outcome, retry, replay, alert owner |
| Delivery ledger | Email/WhatsApp/push status must be truthful | Recipient, consent, channel, provider ID, accepted/sent/delivered/failed timestamps |
| Unified policy registry | Scattered weights/gates/rules cause contradiction | Scoped typed policy, effective date, version, owner, reader map, audit |
| Publication registry | Public/share/PDF outputs must match an approved version | Artifact version, source snapshot, token scope, publish/revoke time, checksum |
| Safe bulk-operation preview | Admin/import work can damage many records quickly | Validation, conflict list, exact impact, partial-failure plan, confirmation, receipt |
| Customer recovery path | Professional UX must not expose internal dead ends | Plain error, preserved input, retry, alternative path, support reference |

### 12.6 Features that should not be added as separate worlds

Avoid these because they increase noise and contradict centralization:

- a second roster solely for pathway visibility;
- a second grading/weighting system for each assessment type;
- a second invoice/payment authority behind legacy finance pages;
- a standalone “book” database that duplicates approved session content;
- a legacy lesson builder with its own storage and publication rules;
- separate assignment and project upload engines;
- a separate special-program identity, consent, finance, or result system;
- a role created only to work around an incorrect permission rule;
- a full navigation tab merely to show which automation or content source was used;
- autonomous predictive scoring that writes a protected score without teacher confirmation.

## 13. Canonical target contracts

These are conceptual contracts, not instructions to rename existing tables blindly. An engineer
must map existing tables/services to each authority, then migrate callers with tests.

### 13.1 Authority map and invariants

| Authority | Owns | Non-negotiable invariant |
| --- | --- | --- |
| Person/identity | Human identity and verified contact methods | One canonical identity per real scoped person; merges are explicit and audited |
| Learner | Learner profile and school/program association | A learner is not recreated by consent, claim, registration, or payment |
| Guardian link | Guardian-child relationship and access scope | Access requires a valid relationship state and tenant scope |
| Consent | Legal/operational consent event and version | Consent history is append-only; withdrawal does not erase evidence |
| Enrolment | Program/class/session admission lifecycle | Finance and consent influence state through explicit gates, not duplicated flags |
| Finance account | Customer/school financial relationship | Balance derives from posted documents/allocations, not mutable page totals |
| Invoice | Versioned charge document and snapshot | Save/download/resend for one version has identical content and totals |
| Payment/ledger | Received, allocated, refunded, voided money | Posted money is corrected by traceable entries, never silent deletion |
| Curriculum | Expected program outcomes and schedule | Class-specific changes retain source/version and effective scope |
| Class plan | Curriculum delivery plan for class/session | Plan is bound to class, academic session, week sequence, and owner |
| Lesson | Deliverable teaching unit | Standalone lessons can be attached without losing provenance |
| Content item | Lesson material, flashcard, assignment, project, slide, resource | Every item has type, version, visibility, source, and class/plan/week/lesson links |
| Delivery | What was actually taught/released | Delivery records approved content version, audience, time, and teacher |
| Submission | Learner evidence for an activity | Retry cannot create multiple active submissions accidentally |
| Grade/evaluation | Reviewed evidence and policy application | Protected values are range-checked, versioned, attributable, and audited |
| Assessment sitting | Exam/CBT attempt and response snapshot | Finalization is idempotent and cannot be overwritten silently |
| Result | Authoritative calculated/approved outcome | Result derives from named graded sources and one grading policy version |
| Report publication | Human/PDF/share representation of a result version | Published artifact is immutable; correction creates a successor |
| Message delivery | Per-recipient channel delivery truth | “Delivered” is used only with delivery evidence |
| Job run | Durable automation execution | Every retry/replay refers to one logical job occurrence |
| Audit event | Security/business action evidence | Ordinary application users cannot rewrite historical events |

### 13.2 Required lifecycle state machines

Implement transitions server-side and reject invalid transitions. Labels may vary, but meanings
must not.

**Onboarding**

`intake → identity_matched → consent_pending/consented → claim_pending/linked → finance_pending/clear → enrolled → active`

Side outcomes: `needs_review`, `declined`, `withdrawn`, `suspended`. Each requires a reason
and recovery rule.

**Teaching content**

`draft → generating → generated_needs_review → approved → scheduled → published → delivered → archived`

Side outcomes: `generation_failed`, `on_hold`, `superseded`. Learners never see unapproved
content.

**Submission and grading**

`not_started → draft → submitted → under_review → returned_for_revision → resubmitted → graded → moderated → published`

Late, excused, missing, and invalid evidence are attributes/reasons, not ambiguous replacements
for the core lifecycle.

**Invoice and payment**

`invoice draft → issued → partially_paid/paid → overdue → superseded/voided`

`payment initiated → pending → verified → posted → allocated → refunded/partially_refunded`

Provider webhooks, manual verification, and customer return must converge on the same payment
operation.

**Result and report**

`result draft → validated → approved → published → corrected/superseded`

`report draft → previewed → validated → published → shared → revoked/superseded`

Autofill changes only a draft and records provenance. It cannot bypass validation or publication.

### 13.3 Standard mutation contract

Every important mutation should have:

- authenticated actor and tenant/school scope;
- explicit capability check;
- validated typed input;
- current version or expected state;
- idempotency key for retryable actions;
- transaction boundary for related writes;
- protected-record and retention checks;
- structured result with stable public error code;
- audit event and correlation ID;
- asynchronous job/delivery reference where applicable;
- customer-safe next action.

An HTTP 200 response is not success if a required write, job, audit event, or delivery record
failed. Partial success must be explicit.

### 13.4 Standard query contract

Every task-oriented read should provide:

- a consistent scoped snapshot;
- explicit pagination and stable ordering;
- server-enforced tenant/role filtering;
- freshness or generated-at time for derived data;
- provenance for calculated/predictive values;
- distinct loading, empty, permission, degraded, and error states;
- cancellation or stale-response protection in interactive clients.

## 14. Repair protocol for any AI model or software engineer

No issue in this register is closed by changing copy, adding a column, hiding a control, or making
TypeScript pass unless that is the whole documented defect.

### Step 1 — Establish the exact baseline

1. Read this document and the current `AGENTS.md`.
2. Run `git status --short` and preserve unrelated/uncommitted work.
3. Identify the current commit and deployment.
4. Reproduce the issue with role, record IDs, state, viewport, network condition, and observed
   result.
5. Classify evidence as verified, confirmed defect, user-reported, at risk, or blocked.

### Step 2 — Trace the whole vertical slice

For the affected task, trace:

`page/control → hook/client call → route/server action → domain helper → database/RLS/constraint → job/provider → audit event → output/PDF/notification`

Search all readers and writers before changing a table, enum, policy, or helper. Map aliases and
legacy redirects. Identify the actual source of truth and every derived consumer.

Useful starting points include:

| Concern | Starting points |
| --- | --- |
| Authentication | `src/contexts/auth-context.tsx`, `src/services/auth.service.ts`, `src/app/login/page.tsx`, `src/lib/auth/`, route-access policy |
| Consent/onboarding | `src/lib/consent/`, public consent/claim/registration routes, consent and parent-claim APIs |
| Teaching | academic builder, class detail, lesson-plan detail, lesson detail, `src/services/lessons.service.ts`, `src/lib/learning/` |
| Submission/grading | assignment/project/CBT routes, `src/lib/assignments/`, `src/lib/grading*.ts`, `src/services/grading.service.ts` |
| Finance | central finance page, invoice/payment APIs, `src/lib/finance/`, billing helpers and templates |
| Reports/results | report builder, parent results, academic spine, progress-report APIs, `src/lib/reports/`, `src/lib/school-reports/` |
| Audit/operations | `src/lib/audit/`, `src/lib/operations/`, `src/lib/server/cron-*.ts`, platform operations |

### Step 3 — Write failure-focused tests first

Tests must cover the reported failure and the protected invariant, not only a successful helper
call. Include:

- permission and cross-tenant rejection;
- duplicate/retry/idempotency;
- stale or concurrent update;
- partial downstream failure;
- protected evidence;
- human error response;
- audit/job/output side effect;
- return/reload behaviour.

For database changes, add constraint/RLS/migration tests or executable checks. For UI defects,
add browser/accessibility coverage when feasible and record a visual before/after.

### Step 4 — Design the smallest complete vertical correction

- Reuse the canonical domain helper.
- Move policy out of the page if multiple callers need it.
- Add a database constraint only for a true invariant, not to silence a query.
- Add a column only when a named writer, reader, lifecycle, retention rule, and migration require it.
- Prefer version/correction to destructive mutation of published evidence.
- Preserve backward-compatible reads during staged migration when necessary.
- Define rollback and repair for partially migrated data.

### Step 5 — Implement professional UX with the business fix

- Put the primary task first.
- Preserve user input on recoverable failure.
- Show plain outcome, reason, and next action.
- Keep internal errors in structured restricted logs.
- Support mobile touch, desktop keyboard, focus, labels, loading, empty, error, retry, and return.
- Remove obsolete duplicate UI only after all links, permissions, data, and deep links migrate.

### Step 6 — Verify the complete effect

Run commands applicable to the change:

```text
npm run lint:encoding
npm run audit:ui
npm run check:routes
npm run audit:embeds
npm run check:schema
npm run check:writes
npm run typecheck
npm test
```

Live schema/write checks require correctly authorized environment access. Do not fake a pass when
credentials or network access are unavailable. The standing local instruction for this work is
typecheck rather than a local production build; Cloudflare CI/deployment remains responsible for
the production build gate.

Then exercise the relevant rows of the journey certification matrix in section 8. Compare screen,
database state, audit event, job/delivery record, and generated output.

### Step 7 — Commit and deploy safely

- Stage exact intended files; never use an unrelated dirty worktree as permission to bundle work.
- Name the business outcome in the commit.
- Push to `main` only after required checks pass.
- Require CI success before Cloudflare deployment.
- Run post-deploy canaries and observe production signals.
- If a migration or release fails, stop and repair; do not hide the failure with an empty state.

### Step 8 — Close the register item honestly

For each closed SYS item, record:

- commit and deployed version;
- files/migrations changed;
- root cause;
- tests and exact results;
- roles/viewports/journeys exercised;
- database/output/audit evidence;
- known limitation and follow-up, if any.

If any required layer remains untested, change the state to **partially verified**, not complete.

## 15. End-to-end UX and workflow by actual user role

The implemented portal roles are:

`admin | teacher | school | parent | student`

The `school` role is a partner-school account, not a Rillcod staff administrator. Finance or
support operators are operational personas within the existing capability model; do not create
duplicate roles merely to simplify a menu.

### 15.1 Confirmed role-model smell

`src/types/auth.types.ts` correctly defines all five roles, but `src/types/auth.ts` defines only
`admin | teacher | student | school` and omits `parent`. Multiple role authorities create
exhaustiveness gaps and can make parent behaviour silently fall into an unknown/default branch.

Required fix:

1. Select one canonical exported `UserRole`/`PortalRole` definition.
2. Replace duplicate role unions with imports from that authority.
3. Add exhaustive compile-time and runtime tests for all five roles plus unknown/null.
4. Keep unknown roles default-denied.
5. Do not change stored role values without a migration and backward-compatibility plan.

### 15.2 Current capability intent

The following matrix reflects the central capability file and must be reconciled with every page,
API, database policy, and visible control.

| Capability | Admin | Teacher | Partner school | Parent | Student |
| --- | :---: | :---: | :---: | :---: | :---: |
| Grade or change marks | Yes | Yes | No | No | No |
| Publish reports | Yes | Yes | No | No | No |
| Upload teaching library content | Yes | Yes | No | No | No |
| View scoped reports | Yes | Yes | Yes | No through staff API | No through staff API |
| Open cross-school accountability | Yes | No | No | No | No |
| View scoped records index | Yes | Yes | Yes | No | No |
| Reveal registration credentials | Yes | No | Yes, own scope | No | No |
| Create scoped accounts | Yes | No | Yes, own scope | No | No |
| Reset scoped passwords | Yes | Yes | Yes | No | No |
| Manage platform users/roles | Yes | No | No | No | No |
| Manage authoritative finance | Yes | No | No | No | No |
| Manage own school payment settings | Yes | No | Yes | No | No |
| Delete permitted records | Yes | Yes | No | No | No |
| View school-level finance | Yes | No | Yes, own scope | No | No |
| View family finance amounts | Yes | No | No | Own family surface only | Own permitted surface only |
| View student paid/unpaid status | Yes | Yes | Yes, own scope | Own child | Own account |

“No through staff API” does not mean parents/students cannot see their own published output.
Their family/learner portals must use separately scoped read models. Any difference between this
intent, route access, API guards, or RLS is a security and UX defect.

### 15.3 Shared role-entry experience

All authenticated roles require the same entrance quality:

1. Login accepts valid credentials and recovers safely from stale local sessions.
2. Profile and real role load before protected content; no flash of admin or another tenant.
3. Post-login redirect returns only to a permitted internal route.
4. Landing page shows role-relevant next work, not the full product catalogue.
5. Navigation contains only useful, permitted destinations.
6. Direct links either open safely or explain why access changed and provide a legitimate route.
7. Logout clears session state, cached private data, role simulation, and back-navigation access.

Admin/teacher “view as role” is explicitly UI-only; server APIs continue to use the real role.
It needs a persistent, unmistakable banner and one-click exit. It is useful for visual support,
but it is **not** authorization evidence and must never enable or disable real server actions.
Security tests require actual accounts for each role.

### 15.4 Admin end-to-end workflow

**Purpose:** govern platform identity, schools, operations, finance, policies, exceptions, and
protected cross-school actions.

**Recommended landing**

- Critical failures and exceptions first: authentication, payments, jobs, data quality,
  safeguarding, publication, and delivery.
- Today’s approvals and overdue accountability items.
- Financial and enrolment reconciliation requiring action.
- System health and recent material changes.
- Quick create/search only after attention-needed work.

**Primary journey**

`login → operations overview → exception/work queue → scoped record → review evidence → perform or assign action → verify downstream result → audit closure`

**Required UX**

- One global entity search for learner, guardian, school, invoice, class, or reference; results
  grouped by type. Do not add a second competing dashboard search.
- Every destructive, role, finance, publication, or merge action shows target, impact, reason,
  and confirmation.
- Cross-school context is always visible. Never rely on colour alone to show tenant scope.
- Admin may switch task workspaces without losing queue filters or return position.
- Internal diagnostics are available only in restricted operations details, not customer output.

**Must verify**

- create/recover user; assign/change/revoke role; deactivate/reactivate;
- create/scope school; inspect school without leaking another school;
- identity duplicate review and safe linkage/merge;
- consent/claim exception and permitted override;
- finance issue, correction, allocation, refund, resend, reconciliation;
- job failure, retry/replay, webhook exception, delivery failure;
- audit search and human-readable before/after summary;
- protected delete refusal and allowed ephemeral cleanup;
- account deletion request and retention/legal hold.

**Must never happen**

- admin action succeeds only in the UI while API/database rejects it;
- broad query exposes private data without task need;
- delete removes protected scores, posted money, consent proof, or audit history;
- role simulation is mistaken for actual impersonation;
- an override has no reason, expiry, or audit record.

### 15.5 Teacher end-to-end workflow

**Purpose:** plan, teach, evaluate, support, and publish within assigned scope.

**Recommended landing**

- Classes or learners requiring attention.
- Next scheduled lesson and incomplete plan/content.
- Ungraded or returned submissions.
- Attendance or progress exceptions.
- Draft reports awaiting validation.
- Recent parent/student communication requiring reply.

The roster and configuration are secondary; they should not dominate the first screen.

**Primary teaching journey**

`login → attention/next class → class workspace → class plan/week → lesson and all content types → learner preview → publish/deliver → attendance/activity evidence → review submissions → grade/feedback → report → communicate`

**Required UX**

- One class workspace with one roster.
- Path visibility is a filter/settings control, not a second roster.
- Maintain context chips or breadcrumb for class, plan, week, and lesson.
- “Add lesson” and AI generation use the same rich engine and durable save model.
- Teacher can generate/review lesson material, flashcards, assignment, project, and optional
  slides together or individually.
- Save status, generation status, visibility, and learner preview stay visible on mobile.
- Grading predicts/suggests repetitive values or feedback only to accelerate entry; the teacher
  confirms protected scores.
- The next ungraded learner is one action away; returning preserves filter and position.

**Primary evaluation journey**

`review queue → learner evidence → rubric/policy → suggested starting point → teacher score and feedback → validate → save receipt → next learner → moderation/publication`

**Must verify**

- assigned versus unassigned class access;
- curriculum load, plan generation, generation retry, saved-content discovery;
- all content types carried into learner view;
- schedule/deliver lesson and record attendance;
- assignment/project creation, submission receipt, grade, return, resubmit;
- written/CBT marking and result contribution;
- manual score preservation, weighting, correction, moderation;
- report draft/autofill/manual edit/publish/share;
- parent message and delivery status;
- mobile creation and grading with keyboard/connection interruptions.

**Must never happen**

- teacher reaches platform admin, user management, cross-school logs, or platform operations;
- teacher sees or changes work outside assignment/scope;
- AI publishes or writes a score without review;
- “failed to fetch” loses generated content;
- optional Rillcod evidence overwrites compulsory school marks.

### 15.6 Partner-school end-to-end workflow

**Purpose:** manage the school’s own relationship, people access, programme visibility, payment
settings/status, and published outcomes without becoming Rillcod teaching or platform staff.

**Recommended landing**

- School onboarding/readiness and unresolved learner links.
- Own students needing registration, consent, or credential recovery.
- Paid/unpaid status without exposing Rillcod family-price details.
- Upcoming delivery and published school reports.
- Messages/cases requiring school response.
- Own school invoice/billing position.

**Primary journey**

`login → school overview → learner/registration readiness → scoped learner → delivery/progress/published outcome → payment status or school billing → communicate/escalate`

**Required UX**

- School name/scope is permanently visible.
- One scoped student directory with fast name + grade/class search.
- Account creation and credential recovery clearly show which learner/guardian will be affected.
- Published reports are read-only, with an escalation/correction request rather than a hidden edit.
- Own payment destination/contact settings are separate from Rillcod’s authoritative ledger.
- Family price/margin remains redacted while paid/unpaid operational status remains useful.

**Must verify**

- school cannot access another school by search, changed URL, API ID, export, or public token;
- scoped account creation and credential reset;
- learner registration/consent/claim readiness;
- view curriculum/delivery and published reports;
- view school finance and student payment status with correct redaction;
- update only permitted school payment/contact settings;
- send/receive messages and correction requests;
- mobile directory and report/PDF experience.

**Must never happen**

- school authors Rillcod content, grades, publishes reports, deletes records, manages platform
  users, or accesses accountability/platform operations;
- school sees family invoice figures when only payment status is permitted;
- school can use an API that the dashboard correctly blocks;
- an unpublished or superseded report appears as current.

### 15.7 Student end-to-end workflow

**Purpose:** understand what to do next, learn, submit evidence, take assessments, and view
published progress safely.

**Recommended landing**

- Next class/session and one primary continue-learning action.
- Due/overdue assignments or projects.
- Returned work requiring revision.
- New feedback/results.
- Current pathway progress and earned artifact.
- Support/safety access.

**Primary journey**

`login → today/continue → lesson and resources → flashcards/practice → assignment/project/CBT → save/upload → submit receipt → feedback/resubmit → published grade/result/progress`

**Required UX**

- Language and labels are age-appropriate and plain.
- Search/list results show both learner/content name and grade/class/context when ambiguity exists.
- Instructions, rubric, due date, allowed file types, upload status, and submission state are
  visible before action.
- Draft work survives refresh/reconnect where product rules allow.
- A final submission has a clear receipt and timestamp.
- Returned work explains what to change and how to resubmit.
- Unpublished scores or teacher-only AI/provenance details remain hidden.
- Finance and consent prompts explain whether they block the current task and who can resolve it.

**Must verify**

- learner sees only assigned/published class/path content;
- lesson, slides, flashcards, library, live session, and timetable;
- assignment/project draft, upload, duplicate retry, submit, late state, return, resubmit;
- CBT start/resume/finalize/time expiry;
- attendance, grades, results, certificates, portfolio, card, and pathway progress;
- inbox/notifications/support with abuse/safety limits;
- direct editor/admin URL rejection;
- mobile/offline/reconnect and shared-device logout.

**Must never happen**

- student sees another learner’s work, result, invoice, or personal details;
- student sees draft/unpublished content or answer keys;
- double-click/retry creates duplicate submissions or attempts;
- a network error discards evidence without warning;
- payment or consent gate presents an unexplained dead end.

### 15.8 Parent end-to-end workflow

**Purpose:** link to children safely, complete required consent/onboarding, monitor published
progress, handle permitted finance, and communicate with the school/Rillcod.

**Recommended landing**

- Child selector with name and grade/class.
- Any claim/consent/access issue requiring action.
- New published result/report or feedback.
- Attendance/progress concern.
- Invoice/balance/payment state.
- Messages/support.

**Primary onboarding journey**

`public claim/consent/registration → typed code or QR → identity/relationship verification → child link → finance/access state → parent dashboard`

**Primary returning journey**

`login → select child → result/grade/attendance/progress/certificate → invoice/payment if permitted → feedback/message/support`

**Required UX**

- QR and typed references reach the same verified relationship outcome.
- Multiple children use one parent identity and a clear child switcher.
- Quick references and counts open filtered contacts/responses or child records.
- Every pending claim/consent/finance gate gives reason, owner, next action, and support reference.
- Published outcomes use human language; internal score composition/provenance is optional detail.
- Financial pages distinguish charge, amount paid, balance, pending payment, and receipt.
- Parent inputs are preserved through recoverable form errors.

**Must verify**

- new parent, existing parent, Google/standard sign-in where supported;
- one/multiple children, ambiguous match, wrong code, expired/revoked code;
- claim pending/approved/rejected/corrected and consent given/withdrawn;
- result/report/grade/attendance/path/certificate access only for linked children;
- invoice, partial payment, balance payment, pending/delayed webhook, receipt;
- feedback, school message, support, notification preferences;
- removed relationship and revoked report/share access;
- mobile QR-to-browser and typed-code journeys.

**Must never happen**

- parent claim alone exposes child information before valid linkage;
- one parent can alter or view another family through an ID or code;
- finance blocks legitimate consent capture, claim review, or permitted published report without
  an explicit policy and recovery path;
- duplicate parent/learner records are silently created;
- internal audit/AI/provider errors appear in customer output.

### 15.9 Public/prospective-user end-to-end workflow

This is not a stored portal role, but it is a complete user journey and must be certified.

**Primary journeys**

- discover programme → understand fit/cost/process → contact/register → confirmation and next step;
- receive QR/reference → consent or claim → verify → create/use correct account;
- receive result/report/artifact link → verify token → view permitted output;
- school/partner enquiry → submit → tracked CRM follow-up.

**Required UX**

- One clear primary action per page.
- Accurate Rillcod Technologies brand and programme terminology.
- Accessible labelled forms with progress for multi-step intake.
- Plain validation, preserved input, spam/rate-limit protection, duplicate intake handling, and
  confirmation reference.
- Public tokens are scoped, revocable, non-enumerable, and reveal minimum data.
- Acquisition data enters central CRM/intake once and later links to canonical identity.

**Must verify**

- all 49 public routes, navigation, metadata, mobile/desktop, keyboard, form success/failure;
- registration/consent/claim/result-check/verification token expiry and revocation;
- duplicate email/phone, missing optional contact, slow network, retry, and confirmation delivery;
- privacy, terms, account deletion, and consent wording/version.

### 15.10 Operational personas without duplicate roles

Finance, support, content review, safeguarding, and delivery coordination are real work, but the
current product should express them through capabilities, assignment queues, and scope rather than
new duplicate role strings.

Before adding a role:

1. Prove a stable set of responsibilities cannot be represented by existing role + capability +
   tenant/school scope.
2. Define least privilege and segregation of duties.
3. Update the canonical role type, route matrix, API guards, RLS, navigation, onboarding,
   offboarding, audit, and tests in one change.
4. Provide migration for existing accounts and deny unknown legacy values.

### 15.11 Role workflow certification checklist

For every role above, capture:

| Check | Evidence required |
| --- | --- |
| Landing relevance | First screen’s top three tasks match the role |
| Navigation | All visible links permitted/useful; all hidden paths server-protected |
| Scope | Own learner/class/school/family boundaries tested by URL and API substitution |
| Create/read/update/delete | Only legitimate operations; protected evidence guarded |
| Search | Scoped, debounced/paginated, name + grade/class disambiguation |
| Handoff | Next role receives correct task, notification, and context |
| Return | Refresh/back/deep link restores safe task state |
| Failure | Plain message, preserved work, retry/support route, internal log |
| Audit | Human action, actor, target, outcome, reason, correlation |
| Mobile | Touch targets, keyboard, safe area, upload/camera/QR, no hidden action |
| Desktop | Efficient queue, keyboard/focus, useful density, no duplicate search |
| Output | Screen/PDF/share/email reflects same approved version |
| Accessibility | Labels, semantics, focus, status announcement, contrast, reflow |
| Security | Actual-role account, not UI simulation; direct API and tenant isolation tests |

The role is complete only when its full primary journey and its handoffs to the next role pass.
For example, “teacher submitted a grade” is incomplete until the result authority receives it,
publication controls it, the permitted student/parent can see the right version, and the audit
trail explains the change.

## 16. Remediation progress evidence

### 16.1 Authentication and role-entry milestone — verified locally on 22 August 2026

Implemented:

- invalid/missing/already-used refresh-token classification;
- targeted browser/server auth-artifact cleanup that preserves unrelated drafts/preferences;
- middleware recovery from stale auth cookies with a professional login notice;
- preservation of the original permitted dashboard destination after session expiry;
- unconditional Supabase auth-cookie expiry on sign-out, including chunked cookies;
- default-deny dashboard behaviour when the portal role/profile is missing;
- one canonical five-role TypeScript authority including `parent`;
- role-neutral password login—the account’s stored role now selects the workspace;
- clearly labelled parent-only Google entry;
- one semantic login H1, responsive no-overflow layout, and 44px minimum interactive controls;
- safe missing-profile dashboard feedback and a valid return-to-login action.

Local browser evidence:

- a real stale refresh cookie produced the former `refresh_token_not_found` condition;
- middleware cleared it and returned `/login?session_recovered=1`;
- the login page showed customer-safe recovery feedback without an internal error;
- admin password login reached `/dashboard` without role selection;
- secure sign-out returned to a clean login with confirmation;
- 390 × 844 and 1440 × 900 checks had no horizontal overflow, one H1, no role picker, and no
  interactive target below 44px.

Automated evidence:

- focused authentication/role suite: 39 tests passed;
- full suite: 332 files and 2,352 tests passed;
- TypeScript: passed;
- encoding: 2,198 files passed;
- UI standards: 229 pages passed the current static baseline;
- route exports: 534 route files passed.

The full suite initially produced five 5-second source-scan/import timeouts under parallel load.
All 26 affected tests passed in isolation. Only those five slow inventory tests were given a
15-second limit, their assertions were unchanged, and the complete suite then passed.

Remaining before SYS-001/SYS-002 are production-complete:

- deploy through Cloudflare after the broader local work is approved;
- repeat stale/fresh login and sign-out canaries in production;
- certify teacher, partner-school, parent, student, expired, revoked, inactive, and cross-tenant
  journeys with actual accounts—not UI role simulation.

### 16.2 Protected report/result authority milestone — verified locally on 22 August 2026

Implemented:

- one explicit result authority derived from school programme standing: compulsory schools use
  First Test + Second Test + Examination; optional schools retain the Rillcod six-box policy;
- teacher-set paper maxima and earned marks add together without averaging percentages or
  forcing a fixed 20 + 20 + 60 template;
- compulsory papers no longer feed the six-box theory/assessment fields;
- partial school papers remain draft evidence and cannot become an official 0/F9 or preserve a
  stale prior total;
- edited papers recompute the official total from the current three paper rows before any legacy
  stored-total fallback;
- partial engagement-metric saves merge with stored evidence instead of erasing other paper or
  classroom evidence;
- direct saves, PATCH corrections, academic-spine writes, batch preparation, Builder bulk work,
  publication validation, parent view, and all three report-card renderers use the same pathway;
- published and manually typed academic evidence remains protected from autofill replacement;
- customer-facing compulsory reports show the three official papers separately from classwork,
  assignments, projects/practical, and attendance.

Test infrastructure correction:

- Vitest now collects both `.test.ts` and `.test.tsx`;
- Vitest transforms component TSX even though Next keeps JSX in `preserve` mode;
- the previously uncollected report-card pathway test now runs four assertions across Standard,
  Modern, Printable, and optional-path layouts.

Automated evidence:

- focused reporting suite: 6 files and 40 tests passed;
- full suite: 333 files and 2,357 tests passed;
- TypeScript: passed;
- `git diff --check`: passed apart from line-ending notices.

Remaining production proof:

- run teacher/admin/parent role journeys using real compulsory and optional schools;
- generate and semantically compare the actual downloadable/share PDF against the screen record;
- run Cloudflare canaries after deployment. A concurrent workspace process committed this
  milestone as `a7999058` and its Git reflog records an `origin/main` update by push; this audit
  agent did not invoke that remote operation and will make subsequent milestone commits locally
  only as instructed.

### 16.3 Newly verified security, CI, and PWA debt — active

- `npm audit --omit=dev` reproduced 21 production findings: 10 moderate, 10 high, 1 critical;
- the TSX report renderer test was excluded by the old Vitest include glob; this is fixed locally;
- the four reported source-scan timeout flakes were already corrected in milestone 16.1 with
  per-test 15-second limits and unchanged assertions; the full suite is deterministic locally;
- `public/sw.js` is a committed generated build artifact that imports an ignored
  `fallback-*.js`; it cannot be considered reproducible from a clean checkout in its current
  form;
- the middleware rate limit is in-process and inbox-only;
- dashboard route authorization performs a role lookup per navigation.

These findings are now part of SYS-005, SYS-018, SYS-022, SYS-042, and SYS-043. They remain in
the workload and will be remediated through isolated security/PWA milestones rather than an
unreviewed forced major upgrade.

### 16.4 Dependency, PWA, push, and native foundation milestone — verified locally on 22 August 2026

Implemented:

- upgraded Next.js from the vulnerable 15.5.23 line to 16.3.2 and aligned its ESLint package;
- upgraded Monaco and Capacitor, removed `next-pwa`, Workbox, Firebase Admin, and the vulnerable
  Capacitor asset helper dependency chains, and pinned patched transitive packages where the
  direct owners have not yet released compatible ranges;
- replaced the committed generated Workbox worker and missing ignored fallback with one
  source-controlled service worker that never caches API or dashboard responses, uses
  network-first navigation, supports push/notification clicks, cleans legacy caches, and waits
  for explicit update activation;
- centralized production registration in `ServiceWorkerRegistrar`, removed the update-banner
  registration race, and made development unregister stale workers instead of serving old code;
- replaced Firebase Admin delivery with a small JOSE-based OAuth service-account signer and FCM
  HTTP v1 sender while preserving stale-token detection;
- aligned Android, iOS, and Capacitor display names to Rillcod Technologies and regenerated the
  native icon/splash assets from the canonical artwork;
- upgraded the Android Capacitor target to Java 21 and successfully synchronized all five native
  plugins;
- set the full-suite timeout to 60 seconds for architecture tests that intentionally scan the
  repository, including every test that previously overrode the harness with a 15-second cap.

Automated evidence:

- complete `npm audit`: 0 critical, high, moderate, low, or total findings across 1,389
  production/development/optional dependencies;
- focused PWA/push/auth/report suite: 4 files and 10 tests passed;
- focused source-inventory stability suite: 4 files and 14 tests passed;
- full suite: 335 files and 2,361 tests passed under concurrent load;
- TypeScript: passed;
- service-worker JavaScript syntax check: passed;
- Android Capacitor sync: passed with five plugins; Capacitor Doctor reports Android configured.

Remaining production/device proof:

- exercise install, offline navigation, update activation, push receipt, and old-worker cleanup in
  deployed Chrome/Safari and on physical Android/iOS devices;
- build iOS on a macOS/Xcode runner (Xcode is unavailable on this Windows workstation);
- add required dependency, secret, static-analysis, and container-image scanners to CI with named
  owners and documented exception expiry; zero local npm findings do not replace those controls;
- deploy only through the Cloudflare pipeline after the remaining local milestones are approved.

### 16.5 Invoice document authority and live-session runtime milestone — verified locally on 22 August 2026

Implemented:

- removed the second persisted-invoice renderer from the finance operations panel; preview,
  print, download, email, and resend now consume the canonical `/api/invoices/[id]/pdf` document
  route instead of reconstructing a different invoice from transient browser state;
- introduced a server-trusted, immutable `payment_account_snapshot` in invoice metadata. New and
  corrected bank-transfer invoices resolve an active Rillcod account on the server, reject
  missing accounts, ignore forged client snapshot fields, and preserve unrelated invoice metadata;
- made the canonical invoice loader prefer the issued snapshot and retain a controlled legacy
  fallback for invoices created before snapshots existed;
- added explicit account/payment-method selection and fail-closed feedback to both the full
  invoice editor and quick individual-invoice flow, and made previews show the exact selected
  payment instructions before issuance;
- restricted invoice correction to the central finance permission and replaced stale “Rillcod
  Academy” document copy with “Rillcod Technologies”;
- stabilized the Next.js 16 development runtime by using the configured Webpack compiler and by
  leaving development chunk cache headers under Next.js control. Cleared only the generated
  `.next` cache, then cold-compiled and reloaded `/dashboard/live-sessions` without the reported
  `options.factory`/undefined-module runtime crash;
- accepted Next.js 16's generated React JSX compiler setting and repository agent guidance so
  clean developer runs do not continually mutate tracked configuration.

Automated and runtime evidence:

- clean cold request to `/dashboard/live-sessions`: HTTP 200; subsequent browser reload had no
  runtime-error overlay or module-factory exception;
- focused live-session and invoice suite: 12 files and 105 tests passed;
- full suite: 337 files and 2,370 tests passed;
- TypeScript: passed;
- no production build or remote push was performed, in accordance with the current instruction.

Remaining production proof and finance scope:

- deploy through Cloudflare and repeat authenticated admin/teacher/student host/join/end/recording
  journeys; the local browser check proved chunk stability and controlled signed-out behavior but
  did not transmit stored credentials without an immediate confirmation;
- perform a production-like correction, save, browser preview, binary PDF download, email, and
  resend comparison for the same invoice version, including an old invoice without a snapshot;
- extend immutable account snapshotting to billing-cycle invoices created by the database RPC;
  those invoices currently retain the legacy server-side active-account fallback and therefore do
  not yet preserve the exact account version atomically at cycle creation;
- complete reconciliation, refund/reversal/overpayment, onboarding-gate, and role-level finance
  journeys before declaring section 6.4 fully closed.

### 16.6 Policy-driven protected deletion milestone — verified locally on 22 August 2026

Implemented:

- removed public, anonymous, and authenticated execution rights from the two `SECURITY DEFINER`
  account/school hard-delete RPCs; only trusted server/database roles may invoke them;
- added a database-owned `school_protected_evidence` preflight and repeated it inside
  `hard_delete_school`, so direct RPC callers cannot bypass the record guard;
- kept the product practical during active development with a Platform Settings cleanup policy:
  **Flexible** (default), **Standard**, or **Strict**. Flexible permits deletion of setup mistakes,
  narrative-only drafts, unpaid invoices, and test consent data; later policies retain more
  operational documents;
- made student/manual assignment scores, CBT attempts, published or scored reports, moderated term
  grades, posted payment transactions, legacy posted payments, and receipts immutable in every
  cleanup mode;
- moved the school evidence check ahead of R2 deletion, preventing cloud files from disappearing
  when the database later refuses a wipe;
- changed the school danger-zone UI to explain the blocking evidence, distinguish an immutable
  lock from a configurable policy lock, and direct administrators to the cleanup setting;
- routed the old dashboard submission-delete helper through the protected API and made failed
  registration-payment cleanup delete only still-pending, unposted transactions;
- routed single-student deletion through the shared protected-evidence wipe command, propagated
  RPC failures, and protected manual/weighted submissions linked through the legacy `students.id`
  key as well as modern portal-user keys.

Automated evidence so far:

- focused deletion/retention/settings suite: 5 files and 18 tests passed;
- full suite: 338 files and 2,375 tests passed;
- TypeScript: passed;
- direct literal-table inventory currently finds 145 database delete call sites; the prior broad
  count of 175 included a mixture of dynamic/query variants. The remaining literal and dynamic
  sites still require table-by-table classification before SYS-007 is closed;
- the migration is preserved locally and has not been pushed to the live database.

Remaining proof:

- apply the migration to a disposable database and prove Flexible/Standard/Strict behavior with
  scored and unscored schools, followed by a read-only production schema verification;
- classify all remaining delete calls as ephemeral cleanup, conditional domain deletion, archive,
  or forbidden protected-evidence deletion, and enforce the manifest in CI;
- exercise backup/restore and account-deletion/legal-retention journeys before declaring the
  broader database-retention section complete.

### 16.7 Family onboarding, consent, claim and access milestone — verified locally on 22 August 2026

Implemented:

- introduced one parent-facing lifecycle state covering identity match, parent claim, optional
  school forms, enrolment, finance attention and the next useful action; finance and optional
  forms are explicitly unable to hide otherwise available learning records;
- changed lifecycle failures from silent empty states into a visible retry action while preserving
  parent access, and added compact next-step guidance to each learner card rather than another
  full navigation tab;
- fixed the signed-parent consent check by supplying the authenticated parent identity, so an
  explicit parent-child link plus a recorded response no longer remains incorrectly pending;
- separated registration, assessment and general-consent worklist items while preserving the
  existing single compatibility gate. Publishing an additional form therefore does not silently
  introduce a new result lock while the product is still being configured;
- made the staff onboarding-health counters actionable. Consent review, claim delivery/completion,
  credential, finance and legacy-account counts now open their relevant workspaces, with URL-driven
  review filters where those workspaces support an exact server worklist;
- added child-scoped consent responses. A parent can now submit the same form separately for two
  linked children; the database validates the parent-child junction and school boundary, maintains
  one response per form/parent/child, and removes anonymous access to the response table;
- preserved existing parent-level signatures and added old-schema fallbacks to keep application
  and migration deployment order safe. Legacy responses remain accepted rather than becoming a
  surprise lock;
- corrected the consent-form purpose vocabulary so the database-backed `general` type participates
  as the ordinary consent form, alongside registration and assessment.

Automated evidence:

- focused onboarding/consent/UI suite: 4 files and 19 tests passed;
- full suite: 340 files and 2,383 tests passed;
- TypeScript: passed after the child-scoped schema and API contract change;
- database inspection confirms unique parent-child links, form-lead child provenance, role guards,
  consent identity guards and one-payment/one-invoice protection already exist in the committed
  schema; the new migration extends those invariants to direct portal signatures;
- no production build, remote push or live database mutation was performed.

Remaining production proof and onboarding scope:

- apply migration `20260929000092_scope_consent_signatures_to_children.sql` to a disposable database,
  test a two-child parent, a preserved legacy signature, cross-parent rejection and cross-school
  rejection, then apply through the controlled live migration process;
- exercise QR, typed code, parent claim, direct portal signature, registration and assessment from
  fresh mobile browsers and confirm the same learner/parent/form identifiers reach the audit trail;
- validate email/WhatsApp delivery receipts and retry recovery with real provider callbacks; local
  tests cannot prove provider acceptance or handset delivery;
- finish exact deep-link filters for health worklists whose underlying pages currently provide only
  the correct workspace landing, then complete retention and finance reconciliation journeys before
  marking the entire onboarding/finance vertical closed.

### 16.8 Submission and grading authority milestone — verified locally on 22 August 2026

Implemented:

- removed the unused parallel `AssignmentsService`, including its direct grade writer and unsafe
  “keep graded while replacing submission evidence” resubmission behavior;
- removed legacy direct grade/update/upsert writers from the dashboard service. Learner evidence
  now enters through the scoped assignment submission API, and teacher/project grading uses the
  canonical assignment-submission review API;
- introduced one additive assignment/project review lifecycle: draft, submitted/late, review,
  returned for revision, resubmitted, graded, moderated and published. The simple submit/grade path
  remains available, while invalid jumps such as raw submission directly to publication are denied;
- added database-enforced transition rules and monotonic review versions, plus atomic version checks
  in the grading API so concurrent teacher saves cannot silently overwrite one another;
- recorded the review actor and a human-readable change reason, with safe automatic reasons for
  initial grading and corrections; return-for-revision requires useful learner feedback;
- made learner assignment cards explain returned and resubmitted work, provide a clear revise action,
  and treat moderated/published scores as final outcomes; project status labels now use the same
  lifecycle vocabulary;
- preserved rolling-deploy compatibility: an old schema retains submitted behavior until the
  additive migration arrives, while protected score evidence continues to block replacement.

Automated evidence:

- focused submission/grading/retention suite: 6 files and 26 tests passed;
- full suite: 341 files and 2,389 tests passed;
- TypeScript: passed;
- no production build, remote push or live database mutation was performed.

Remaining evaluation scope:

- apply migration `20260929000093_unify_submission_review_lifecycle.sql` to a disposable database
  and test simultaneous graders, return/resubmit, moderation/publication and old-schema fallback;
- connect client `expected_version` values for long-lived grading canvases so a stale tab is rejected
  even when its request begins after another reviewer has saved;
- complete upload checksum/scanning and durable retry receipts, then verify assignment/project parent
  notifications and result contribution end to end;
- continue into CBT and written-exam sitting/finalization/moderation authority before SYS-008 closes.

### 16.9 CBT finalization integrity milestone — verified locally on 23 August 2026

Implemented:

- made normal CBT submission and deadline auto-finalization conditional on the sitting still being
  `in_progress` at the final database update, closing the race where two requests could both pass
  an earlier status read and overwrite the result;
- made duplicate/retried final submissions return the first durable final outcome with a clear
  customer message instead of changing answers, score, manual-mark state or completion time;
- kept the existing server deadline, ownership, randomized sitting, question grading and manual
  review behavior intact.

Automated evidence:

- focused CBT/written-exam suite: 4 files and 12 tests passed;
- full suite: 342 files and 2,391 tests passed;
- TypeScript: passed;
- no production build, remote push or live database mutation was performed.

Remaining assessment scope:

- add optimistic versions and correction reasons to staff CBT/manual-exam grading, then connect
  moderated/published assessment evidence to the central result contribution authority;
- run real browser/device no-network, reconnect, timer-expiry and double-submit journeys;
- verify candidate paper/PDF output, question snapshot retention and school-paper evidence parity.

### 16.10 CBT marking and moderation milestone — verified locally on 23 August 2026

Implemented:

- added a monotonic staff-marking version that changes only when score, manual marks, grading notes,
  review requirement or moderation changes; learner autosave does not create false grading versions;
- made staff marking updates atomic against the current grading version and return a stable stale-
  review response when another reviewer saved first;
- recorded the responsible staff member, timestamp and human-readable reason for initial marking or
  correction;
- added optional `unreviewed → reviewed/approved/returned` moderation state without forcing schools
  to use moderation, and prevented approval while subjective questions still need manual marking;
- preserved rolling-deploy compatibility until the additive migration is applied.

Automated evidence:

- focused CBT marking/finalization suite: 3 files and 10 tests passed;
- full suite: 342 files and 2,393 tests passed;
- TypeScript: passed;
- no production build, remote push or live database mutation was performed.

Remaining proof:

- apply migration `20260929000094_version_cbt_grading_and_moderation.sql` to a disposable database
  and prove concurrent correction, manual-question completion, approval and returned-review behavior;
- send `expected_version` from long-lived staff grading canvases for explicit stale-tab protection;
- connect approved CBT/manual-paper evidence to the shared result contribution ledger and PDF proof.

### 16.11 Central evaluation evidence milestone — verified locally on 23 August 2026

Implemented:

- repaired the database bridge from assignment/project review and CBT/manual-paper review into the
  existing `academic_assessment_evidence` authority consumed by report academic QA;
- maps graded evidence to `graded`, approved moderation/publication to `moderated`, and returned,
  pending-manual or still-in-review evidence to `submitted` rather than incorrectly downgrading or
  prematurely publishing it;
- carries review version, moderation state and human correction reason into the evidence snapshot;
- added a database invariant preventing CBT approval while manual questions remain unmarked;
- reconciles existing rows by replaying metadata triggers only; learner answers, manual marks and
  scores are never rewritten.

Automated evidence:

- focused evaluation-evidence suite: 3 files and 11 tests passed;
- full suite: 343 files and 2,396 tests passed;
- TypeScript: passed;
- no production build, remote push or live database mutation was performed.

Remaining evaluation/result scope:

- apply migrations 93–95 in order on a disposable database and prove report QA sees only eligible
  graded/moderated evidence;
- add equivalent version/moderation/correction authority for written `exam_attempts`;
- verify the weighting policy that turns named evidence into report components, then complete
  candidate-paper/PDF and parent publication journeys.
### 16.12 Written-exam marking authority milestone — verified locally on 23 August 2026

Implemented:

- applied the same monotonic marking version, actor/reason trace, and optional moderation state to written exam attempts;
- rejected stale concurrent saves while retaining server-owned, idempotent question scoring;
- prevented approval until manual marking is complete;
- mapped approved attempts to moderated central academic evidence while preserving learner answers and scores;
- retained old-schema compatibility for rolling deployment.

Verification evidence:

- focused written-exam and evidence checks: 4 files, 13 tests passed;
- full automated suite: 344 files, 2,399 tests passed;
- TypeScript typecheck passed;
- no production build, remote push, or live database migration was run.

Remaining operational work:

- apply migration `20260929000096_version_written_exam_marking.sql` after migrations 93–95 in a disposable environment, then production through the approved migration pipeline;
- expose expected versions and optional moderation controls in the written-review interface;
- verify candidate paper and PDF-output parity across desktop and mobile layouts.

### 16.13 Written-exam review and paper-output milestone — verified locally on 23 August 2026

Implemented:

- connected the staff review screen to written-exam grading versions so a stale browser cannot silently overwrite a newer review;
- exposed optional reviewed, verified, and needs-correction states without requiring a second-review workflow for ordinary marking;
- added a staff-only change note with human-readable audit wording while keeping it out of learner results;
- replaced the combined print document with separate candidate and teacher copies;
- removed answers, explanations, and the marking guide from candidate output, while clearly labelling the answer-bearing teacher copy confidential;
- escaped exam, question, option, answer, and explanation content before placing it in a printable document;
- retained rolling-schema compatibility in the written-attempt worklist until migration 96 is deployed;
- improved mobile print controls and printable A4/mobile layouts with 44-pixel actions.

Verification evidence:

- focused examination suite: 4 files and 14 tests passed;
- full automated suite: 345 files and 2,403 tests passed;
- TypeScript typecheck passed;
- candidate-output tests prove that answer evidence is absent and printable content is HTML escaped;
- no production build, remote push, or live database migration was run.

Remaining operational proof:

- apply migration 96 through the approved pipeline and repeat concurrent staff-review checks against the deployed database;
- visually inspect both browser print previews and saved PDFs on desktop and a physical mobile device;
- connect published written results to the same immutable publication registry planned for report cards and parent sharing.

### 16.14 Live-class entry and recovery milestone — verified locally on 23 August 2026

Implemented:

- changed realtime “session is live” handling from unsolicited full-screen media entry to a learner-controlled invitation; attendance begins only after the learner selects Join and the server accepts it;
- made start, end, and join UI transitions conditional on successful API responses instead of opening or closing a classroom after a refused request;
- removed the participant-side attempt to rewrite a missing session URL and kept the host/server as the session authority;
- added one client/server destination contract that permits secure provider links, local development URLs, and only the exact internal LiveKit room for the current session;
- rejected executable, insecure remote, mismatched internal, and credential-bearing classroom destinations;
- added a live-classroom error boundary so a failed or stale media chunk cannot crash the dashboard, with professional reload, backup-room, and return actions;
- kept `@livekit/components-react` out of production barrel rewriting because it is an isolated dynamic client chunk with stylesheet side effects;
- replaced the raw teaching-delivery database error returned after session completion with a stable staff message and server-side diagnostic code/log;
- retained existing reconnect, duplicate-device, removal, late-join, host-end, and attendance-delivery protections.

Verification evidence:

- focused live-class suite: 6 files and 54 tests passed;
- full automated suite: 347 files and 2,409 tests passed;
- TypeScript typecheck passed;
- local signed-out route returned HTTP 200 with no browser warning, runtime overlay, or client console error after recompilation;
- no production build, remote push, live database mutation, or credential transmission was performed.

Remaining production/device proof:

- repeat authenticated admin host/start/end, teacher host, student invitation/join/reconnect, removal/readmission, attendance, recording, and delivery-evidence journeys after deployment;
- test camera and microphone permission denial/recovery, poor network, duplicate devices, Jitsi backup, iOS/Android backgrounding, and physical-device safe-area controls;
- split the oversized live-session page into independently loaded list, scheduling, moderation, attendance, replay, and classroom modules and establish production bundle/interaction budgets;
- verify Cloudflare LiveKit secrets, websocket reachability, TURN connectivity, webhook delivery, recording storage, and alerting in the deployed environment.

### 16.15 Unified teaching-package operations milestone — typechecked locally on 23 August 2026

Implemented:

- repaired a positional parallel-query defect that labelled slide rows as assignments, flashcard rows as slides, and assignment rows as flashcards on the lesson-plan operations board;
- replaced that separate readiness calculation with the same five-asset contract used by the class teaching workspace: lesson, slides, flashcards, assignment, and project;
- kept year, term, curriculum week, and class-meeting identity together so repeated Week 1 records and multiple meetings in one week do not collapse;
- separated projects from ordinary assignments in both the API response and teacher interface;
- made slide visibility require both a public slide deck and a live lesson, preventing a private deck from being reported as learner-visible;
- added clear 5-item preparation, missing-item, and held-for-release feedback to the weekly visibility interface;
- added focused guards for query-result meaning, five-asset mapping, private slides, multi-meeting weeks, and repeated week numbers across terms.

Verification evidence:

- TypeScript typecheck passed;
- `git diff --check` passed (line-ending conversion notices only);
- focused test files were added, but Vitest could not start because the Windows sandbox returned `spawn EPERM`; the required elevated rerun was then blocked by the desktop approval service usage limit. These tests are **not** claimed as passed;
- no production build, remote push, live database mutation, or credential transmission was performed.

Remaining verification and content-delivery work:

- run the focused academic package tests and full suite as soon as the local execution approval service is available;
- exercise the authenticated teacher operations board against a migrated database and verify all five generated items, partial failure, exact missing-type retry, release, learner discovery, and return-to-edit behaviour;
- make generation attempts durable and observable across request interruption so automatic repair can resume an incomplete package without depending on a browser response;
- complete learner progress/evidence alignment and split the oversized lesson-plan and class-workspace clients into focused, independently loaded surfaces.

### 16.16 Durable teaching-generation lifecycle milestone — typechecked locally on 23 August 2026

Implemented:

- added a non-blocking database lifecycle for every package attempt, scoped by lesson plan, class, curriculum week, and class meeting;
- routed teacher preparation, class-workspace preparation, special-programme launch, first-week school bootstrap, and scheduled generation through one tracked wrapper;
- records requested content types, generated/skipped counts, per-type outcomes, failed types, source, actor, start, heartbeat, and completion without storing prompts or exposing provider diagnostics to customers;
- converts abandoned running attempts to interrupted after 20 minutes during the next scheduled sweep, preventing a permanent false “still preparing” state;
- keeps rolling deployments safe: if migration 97 is not present yet, tracking logs a server-side code and generation continues normally;
- added a professional operations summary for running, successful, partial, failed, and interrupted preparation with explicit safe-retry wording;
- retry remains idempotent through the existing generators: completed items are retained and only missing work is produced;
- generation history cascades only with a deleted lesson plan and never locks content, scores, learner answers, submissions, or report evidence.

Verification evidence:

- TypeScript typecheck passed after every generation entry path was moved to the tracked wrapper;
- source search confirms direct production calls now remain only inside the wrapper (tests and comments excluded);
- focused status and customer-feedback guards were added but could not be executed because the Vitest approval block recorded in 16.15 is still active; they are **not** claimed as passed;
- migration `20260929000097_track_teaching_package_generation.sql` was created but not applied to the live database;
- no production build, remote push, live database mutation, or credential transmission was performed.

Remaining operational proof:

- apply migrations 93–97 in order through the approved database pipeline, regenerate database types, and rerun schema drift;
- run focused and full tests when local execution approval is restored;
- verify success, one-type failure, browser interruption, stale-run recovery, safe retry, cron retry, and teacher-facing feedback against a disposable then deployed database;
- add retention settings for operational attempt history if volume requires it; do not hard-code restrictive retention while the product is still being built.

### 16.17 Learner progress and curriculum-decision milestone — typechecked locally on 23 August 2026

Implemented:

- removed hard-coded skill radar values, unsupported “top 15%” ranking, fixed “Diamond tier” wording, and assignment-title keyword guesses from the customer learner overview;
- stopped presenting the legacy `enrollments.progress_pct` field as authoritative curriculum completion; week delivery remains visible in Teaching coverage and the learner path;
- labels the overview as assignment evidence and explains exactly which graded submissions contribute to its average and which submitted items still await review;
- uses the shared WAEC `A1…F9` grading authority instead of a separate A/B/C/D/F display;
- repaired WAEC failure-code recognition in promotion intelligence so `F9`/`E8` cannot bypass the configured curriculum-advance policy;
- made automated curriculum suggestions use published current-term reports and central promotion settings; missing or draft evidence produces “Review evidence,” never a default promotion;
- kept teacher decisions liberal: promote, repeat, complete, and withdraw remain manual choices, with an optional 2,000-character reason rather than a hard evidence lock;
- replaced service-role close-then-insert writes with one atomic database function that verifies admin/teacher scope, handles an existing destination enrollment safely, and rolls back the whole transition on failure;
- corrected final-level promotion to complete the current track instead of leaving a `promoted` row with no destination;
- added a dedicated curriculum-decision audit and merged it into the existing academic history with human learner, actor, school, course, and teaching-plan labels rather than customer-visible UUIDs;
- separated curriculum-level movement from class-grade promotion and preserved reports, submissions, learner answers, grading, and scores unchanged.

Verification evidence:

- TypeScript typecheck passed after the complete learner-progress and decision change set;
- focused guards were added for absent/draft evidence, settings thresholds, WAEC codes, final-level completion, atomic writes, teacher scope, optional next-term requirements, and human activity history;
- those tests remain unexecuted because the Vitest approval block recorded in 16.15 is still active and are **not** claimed as passed;
- migrations `20260929000098_atomic_curriculum_level_decisions.sql` was created but not applied;
- no production build, remote push, live database mutation, score mutation, or credential transmission was performed.

Remaining operational proof:

- apply migrations 97–98 after the earlier academic migrations in a disposable database, regenerate types, and prove atomic promote/repeat/complete/withdraw including concurrent clicks and existing next-level enrollment;
- run focused/full automated tests and authenticated mobile/desktop journeys when execution approval is restored;
- verify multi-school teacher scope, school-role read-only history, optional notes, current-term matching, published/draft report handling, and class-grade/curriculum-level separation with realistic records;
- decide whether attendance should join curriculum recommendations per school policy; do not silently add a new hard gate while the product is still being configured.

### 16.18 Configurable traffic protection and operational visibility milestone — typechecked locally on 23 August 2026

Implemented:

- removed the duplicate inbox-only middleware `Map`, which counted every read and could block an entire school sharing one internet address;
- retained the existing shared Upstash-aware limiter as the central implementation and changed the common API wrapper to count state-changing requests only;
- keys authenticated write protection by user and feature family, while unauthenticated sensitive routes continue to use IP plus route-specific policies;
- protects the direct inbox send, email, and contact mutations through the same configurable policy rather than recreating another limiter;
- added administrator-owned Platform Settings for on/off, writes-per-window, and window length, with deliberately generous bounded defaults and a one-minute read cache;
- made missing or unreadable settings fall back to a usable default rather than locking staff out during a rolling deployment or database interruption;
- corrected the operations-settings interface contract: teachers and schools can inspect platform policy but only administrators are offered a working save path;
- records human-readable audit evidence when platform operations settings change;
- surfaces whether cross-instance shared protection is actually configured in Operations Health, without showing secrets or internal provider details to customers;
- added one request-origin decision to the common API boundary with administrator-controlled off, observe, and enforce modes; observation is the safe default while the app is still being built;
- permits same-origin browser work, Capacitor/Ionic native origins, explicitly configured origins, and server-to-server clients without browser provenance while identifying explicit cross-site browser writes;
- enforcement returns one professional recovery message and never exposes the observed origin or internal policy details to customers;
- added focused source guards for safe methods, route-family identity, defaults, tunability, and the administrator off switch.

Verification evidence:

- TypeScript typecheck passed for the initial policy refactor; a final rerun covers the Operations Health display and direct inbox integrations;
- `git diff --check` passed (line-ending conversion notices only);
- focused tests were added but remain unexecuted because the Vitest approval block recorded in 16.15 is still active; they are **not** claimed as passed;
- no production build, remote push, live database mutation, or credential transmission was performed.

Remaining proof and coverage:

- configure valid `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in Cloudflare, then confirm Operations Health reports shared protection;
- inventory the remaining direct state-changing routes that do not use the common wrapper or an explicit custom limit, prioritising authentication, file upload, messaging, payment initiation, parent claim, and bulk administration;
- review origin observations before changing the default from `observe` to `enforce`; explicitly certify native, webhook, cron, signed public, and local-development request paths first;
- run multi-instance concurrency, shared-school-network, administrator disable/tune, retry-header, and Redis-outage fallback tests;
- keep deletion and correction workflows available and reversible where business rules allow; rate protection is an abuse brake, not a substitute for authorization, confirmation, audit, or settings-based lifecycle policy.

### 16.19 Settings-based accountability correction milestone — typechecked locally on 23 August 2026

Implemented:

- stopped the Accountability page from rewriting every mismatched student profile class merely because an administrator opened the page;
- retained the active current-term roster as class-placement authority and kept the exact-count one-click repair available;
- added `accountability_auto_fix_class_mismatch` to Platform Settings, defaulting off; when enabled, the existing once-per-visit repair remains available as an explicit administrator policy;
- shows whether automatic class repair is on or off beside the mismatch action so an administrator can understand why work did or did not run;
- made an unreadable or malformed setting fail safely to off without hiding the mismatch or blocking manual correction;
- added human audit labels for successful, partial, and failed class alignment and for Platform Operations setting changes;
- replaced activity-trail database diagnostics with professional retry messages while retaining diagnostics in server logs.

Verification evidence and remaining proof:

- final TypeScript rerun covers the settings payload, optional page automation, visible status, and human audit labels;
- no score, report, submission, answer, assessment evidence, or learner activity was changed;
- focused tests remain blocked as recorded in 16.15 and are not claimed as passed;
- verify setting off/on, conflicting rosters, concurrent roster changes, partial repair, audit wording, and return-to-page behavior against a disposable migrated database.

### 16.20 CSP observation and production transport-header milestone — typechecked locally on 23 August 2026

Implemented:

- added a Content Security Policy in report-only mode so browser, PWA, LiveKit, payment, PDF, and native compatibility can be measured before enforcement;
- added production HSTS for one year without `includeSubDomains` or preload while every subdomain is still being certified;
- created a rate-limited CSP reporting endpoint that always responds safely and never blocks the page being observed;
- sanitizes document, source, and blocked URLs before persistence, removing credentials, query strings, fragments, request payloads, referrers, cookies, account ids, and customer identifiers;
- added migration `20260929000099_record_security_observations.sql` with an admin-readable, service-written observation ledger and useful recent/directive indexes;
- added a human Operations Health summary for setup pending, zero recent conflicts, or observed conflicts and their most common directives; the interface clearly says nothing is blocked;
- added focused sanitization guards for legacy CSP and Reporting API payload shapes.

Verification evidence and remaining proof:

- TypeScript and diff checks are rerun after the complete header/reporting change set;
- focused CSP tests were authored but cannot currently execute because of the approval block recorded in 16.15; they are not claimed as passed;
- migration 99 was created but not applied, no production build was run, and no remote push occurred;
- after deployment, inspect at least seven days of desktop, Android, iOS/PWA, LiveKit, Paystack, PDF/print, public form, and admin observations; narrow broad report-only sources before changing to enforced CSP;
- verify HSTS on the Cloudflare response and certify subdomains before considering `includeSubDomains` or preload.

### 16.21 Settings-based academic cleanup and evidence retention milestone — typechecked locally on 23 August 2026

Implemented:

- made the existing Platform Settings cleanup choice operational across rebuildable assignments,
  empty submission placeholders, unused CBT exams, unscored report drafts, curriculum drafts,
  lessons, lesson plans, consent forms, and classes instead of leaving it as descriptive UI only;
- kept **Flexible** as the missing-setting and build-stage default; **Standard** still allows ordinary
  draft/content cleanup but retains issued consent responses, while **Strict** holds hard deletion of
  rebuildable records until an administrator changes the setting;
- kept irreplaceable evidence outside the configurable switch: learner text/files/answers,
  submissions, assignment/manual scores, CBT sessions, written-exam attempts, published or scored
  reports, term grades, and central assessment evidence cannot be opened by selecting Flexible;
- changed lesson-plan deletion to one database transaction that removes unused generated teaching
  drafts but detaches assignments, written exams, and CBT exams that already contain learner work;
- retained a rolling-deployment fallback with the same learner-evidence behavior before migration 100
  was deployed, and records human-readable preserved/removed counts in the audit trail;
- fixed class deletion's partial-write defect: the previous route cleared student class fields before
  knowing whether the class delete would succeed. Migration 101 now performs scope recheck,
  evidence preflight, roster-label cleanup, and class deletion atomically;
- made the class rolling fallback delete the class before clearing stale text labels and fail closed
  when academic evidence cannot be verified, so a linked teaching plan no longer leaves students
  silently detached after a refused delete;
- made consent deletion inspect signed-response count first. Standard/Strict retain issued responses;
  Flexible permits intentional build/test cleanup, while empty draft forms remain easy to remove;
- moved all cleanup-policy decisions after authentication, record lookup, and school/teacher scope
  checks, preventing policy information from leaking to an out-of-scope caller;
- kept customer errors professional and stable while logging database codes only on the server;
- routed System Health empty-class purge and Classes Heal `delete_class` through the same
  `deleteRebuildableClass` command, so those admin tools can no longer bypass evidence preflight
  or detach a roster before the class row is gone. Inspect lists now exclude classes that still
  hold plans, assignments, exams, or reports;
- closed Classes Heal duplicate-merge's half-write: the previous path moved students, then tried
  to delete the leftover shell. Migration 102 now moves roster, teaching records, and learner
  evidence onto the survivor in one transaction and deletes only the empty shell. If the command
  is not deployed yet, Heal fails that pair closed instead of repeating the sequential write;
- kept programme, certificate, and class-session cleanup usable during build: **Flexible**
  (the default) still clears test programmes, test certificates, and test registers. A
  programme is only turned off when it already holds learner scores or attempts. Standard
  and Strict revoke or retain issued records instead of hard-deleting them;
- stopped curriculum force-cleanup from wiping learner submissions, attempts, or week scores,
  while unused generated drafts remain cleanable.

Verification evidence:

- TypeScript passed for the complete settings/retention/class transaction change set;
- `git diff --check` passed before the final class/consent additions and is rerun for final handoff;
- focused source guards cover policy parsing, build-friendly defaults, issued-record behavior, learner
  submission evidence, and the lesson-plan atomic retention contract. The statement in the original
  milestone that Vitest could not start is retained as historical context; later milestones ran
  focused Vitest suites successfully;
- migrations `20260929000100_delete_lesson_plan_preserve_learner_work.sql`,
  `20260929000101_delete_rebuildable_class_atomically.sql`, and
  `20260929000102_merge_duplicate_classes_atomically.sql` were subsequently applied to the live
  database. The live functions and all 32 foreign keys that reference `classes` were inspected;
- the later database application is recorded in commit `771682c4`. This local milestone itself ran
  no production build, remote push, score mutation, or credential transmission.

Remaining proof and scope:

- exercise a real merge and real class deletion on disposable data to prove rollback,
  Flexible/Standard/Strict behavior, concurrency, and each protected evidence type. Migrations
  100–102 are live, but this destructive rehearsal remains intentionally outstanding;
- complete table-by-table classification of the remaining delete inventory. Current source search
  still finds delete operations across CRM, communication, live-session, timetable, portfolio,
  parent-link, newsletter, file, and ephemeral-token domains; they are not silently declared
  safe by this milestone. Programme, certificate, class-session, and consent now have a retire
  or retain path instead of only hard delete;
- after build data is cleared, switch production from Flexible to Standard and reserve temporary
  Flexible use for an administrator-supervised cleanup window with an audit reason.

### 16.22 Academic workflow, generation-cost, and approval milestone — verified locally and against live read-only data on 24 August 2026

Product model made explicit:

- **Curriculum** is the approved course direction: the concise statement of what should be taught,
  in what order, and to what standard. It is authored once and assigned to teaching contexts;
- **Class plan** expands that curriculum for one class and delivery period. It can adapt pacing and
  examples without cloning or silently changing the curriculum source;
- **Weekly teaching package** is the delivery unit. A complete package can contain a lesson, slides,
  practice cards, assignment, and project. School-required/elective course status, school-paper versus
  Rillcod evidence authority, and flexible versus exact weekly delivery are separate choices;
- returning teachers now resume the selected course, academic year, term, week, and class instead of
  restarting or creating another plan. Primary navigation uses plain Write, Approve, Assign, Plan,
  Teach, Mark, and Results language; detailed diagnostics and secondary records stay available without
  competing with the next teaching action;
- the older Lesson Plans surface is now presented as **Class Plans** and uses the same
  `ensure_class_teaching_plan` database authority as the class workspace. Its previous
  check-then-insert race is closed, and a special-programme plan now carries its delivery-period
  identity instead of relying on a loose term label.

Generation and automation changes:

- the tracked weekly generator now claims a plan/week/session run before invoking AI. A second request
  for the same meeting returns “already preparing” instead of spending on a concurrent duplicate;
- the repair inventory examines the exact weekly package and requests only missing kinds. Existing
  lessons, slides, practice cards, assignments, and projects are reused rather than regenerated;
- stale machine-generated slides or practice cards may be rebuilt from their source, but a stale item
  marked as teacher-customized is preserved. The system never rewrites teacher work merely to make a
  package complete;
- an interrupted running claim older than 20 minutes is marked interrupted so a later retry can repair
  the package. A completed package is recorded as skipped without calling a content generator;
- cross-class reuse remains the first choice: a matching package can be copied for another class,
  while AI is reserved for content that cannot be reused or repaired safely;
- the teacher's older bulk lesson, assignment, and project actions now execute through the same
  tracked per-meeting route. Their preview remains read-only, but actual work can no longer bypass
  the generation claim, missing-only inventory, or teacher-edit protection;
- migration `20260929000103_prevent_duplicate_teaching_generation_runs.sql` adds the database-level
  partial unique index that permits only one running generator for a plan/week/session. The migration
  is committed locally but **has not been applied to the live database in this milestone**;
- `npm run audit:academic-generation` provides a permanent read-only inspection without printing
  customer identifiers or mutating curricula, plans, content, scores, or submissions.

Draft review and approval changes:

- the approval queue inventories all five content kinds and labels each as visible or awaiting review;
- an incomplete week offers **Prepare missing content**, which uses the same missing-only generator;
- bulk approval selects complete packages only. A teacher may deliberately share the available items
  from an incomplete package, but that exception is explicit in the review drawer rather than silent;
- the class workspace displays the weekly teaching plan as the primary task. Curriculum, assessment,
  grading, results, and approval records remain accessible under one secondary records area instead of
  occupying competing full tabs.

Live read-only verification on 24 August 2026:

- 79 lesson plans exist: 61 active and class-linked, 18 archived, 11 published, and 50 draft;
- there are no active standalone plans, no empty active drafts, and no duplicate active
  class/course/period identity. The largest identity group contains one plan;
- 37 tracked generation runs exist and all 37 are succeeded. No meeting had more than one running
  generator when inspected;
- therefore the visible plan count is not evidence of duplicate active plans. No lesson plan was
  deleted, and the audit does not recommend deleting the 50 legitimate drafts without record-level
  product evidence.

Verification and boundaries:

- `npm run typecheck` passed after the grading, academic UX, generation-repair, and approval changes;
- 18 focused submission-authority tests, 34 focused curriculum/class-workspace tests, and 82 focused
  generation/approval tests passed;
- no production build or remote push was run, and no student score, learner answer, submission,
  finance evidence, or report evidence was changed;
- local browser visual proof was blocked by the Windows development process failing with `spawn EPERM`.
  Source, type, focused-test, and live read-only database verification are claimed; complete mobile and
  desktop browser role journeys are still required after deployment;
- local milestone commits: `ff05e8cd` (submission grading authority), `089b4831` (curriculum-to-class
  journey), `5dc2406d` (missing-only generation and approval), and `ed8d6579` (single class-plan
  creation authority for teachers and automation), plus `ce9f6c11` (teacher bulk actions routed
  through tracked repair).

### 16.23 Week-generator connection recovery milestone — typechecked locally on 24 August 2026

Confirmed failure mechanism:

- preparing one complete week is a long request because the central server path may prepare five
  content kinds in sequence. A browser, proxy, or changing mobile connection can end that request
  after the server has already claimed the run and saved some or all content;
- the main generator sheet previously converted that transport error into five red failures and
  exposed the browser wording “Failed to fetch”. Other week-generation buttons used their own
  success/error interpretation, so the same durable server run could look different by screen;
- immediately pressing Try again was unsafe UX: the server might still be working, and the teacher
  could not distinguish a disconnected browser from a failed AI engine.

Implemented:

- added a read-only `GET /api/lesson-plans/[id]/generate-week` handshake. It applies the same
  teacher/admin and class ownership guard as generation, reads the durable run for the exact
  plan/week/session, and inventories which package types are still missing. It never starts AI work;
- recovery status is limited to the request's start window so an old successful run cannot be
  mistaken for the request whose connection just ended;
- added one client authority, `requestTrackedWeekGeneration`, for the generator sheet, class
  workspace, This Week panel, approval repair, complete-package action, and type-level bulk action;
- when the POST connection ends, the client performs only short read-only status checks. A running
  claim is shown as continuing safely, a completed result is recovered, and neither case starts a
  second paid generation request;
- if both the generation connection and status reads remain unavailable, the interface says that
  preparation may still be running and saved items are safe. All five cards show **Continuing
  safely**, and the immediate Try again action is withheld until the teacher refreshes the week;
- authoritative API refusals such as an unpublished plan or an out-of-scope class remain visible and
  are not disguised as connection recovery.

Verification and boundaries:

- four focused suites passed: 4 files and 16 tests, including dropped-POST recovery, delayed run
  claim, successful saved-result recovery, authoritative HTTP refusal, unavailable status, all
  customer entry-point routing, missing-only repair, and concurrent-run protection;
- `npm run typecheck` passed;
- browser visual proof was attempted. The existing local Next development process was registered on
  port 3000 but did not answer within 20 seconds, and Next refused a second server because PID 17724
  already owned the workspace. The process was not terminated without the user's direction, so no
  visual interaction is claimed;
- no database migration, production build, score/evidence mutation, or remote push was performed in
  this milestone.

### 16.24 One evaluation-to-result authority milestone — verified locally on 24 August 2026

Confirmed product and data-flow defect:

- Gradebook exposed a second **Batch-Sync Reports** builder alongside the central Academic
  **Auto-fill** workspace. The older client did not send the selected `class_id`, carried its own
  term/course form, and wrote report drafts through a separate API implementation;
- that retired API averaged all graded assignment submissions into classwork, also derived the
  assignment component from completion count, and converted the number of lab projects into a
  practical mark. One piece of work could therefore influence more than one component, while three
  ungraded projects could appear as 100% practical evidence;
- Write repeated part of that proxy behavior: when a score field was blank it silently filled marks
  from CBT, submission/attendance counts, and project count. It also retained an unreferenced bulk
  builder with the same competing formulas, despite the visible product already using Auto-fill;
- the database's canonical `recalculate_academic_result` function already has the correct separation:
  classwork assignments, ordinary assignments, project/practical evidence, CBT examination,
  CBT evaluation, and attendance are classified once and weighted by the active scheme. The modern
  Academic Auto-fill API also supplies `academic_offering_id` and `offering_period_id`, which that
  calculator requires. The duplication was above this sound database authority, not a need for a
  second scoring model.

Implemented:

- Gradebook is now the one place to review and mark learner work. Its result action is the plainly
  labelled **Prepare results** link and carries the current class/course filters into Academic
  Auto-fill;
- Academic Auto-fill remains the one place to prepare one learner or a whole class, protect typed and
  published reports, distinguish compulsory host-school papers from the optional Rillcod evidence
  path, and invoke the central evidence calculator;
- removed the old modal, its session helpers, its 422-line calculation/write implementation, and the
  obsolete session tests. The old API address remains only as a non-writing HTTP 410 compatibility
  boundary so a stale client receives a professional **Open Auto-fill** destination instead of a
  silent failure or a competing report write;
- removed Write's unused bulk result builder and stopped Write from silently converting activity
  statistics into official scores. Write still shows counts and averages as teacher context, hydrates
  real saved Auto-fill evidence, and protects typed/published rows; a new typed report starts blank;
- added a permanent architecture guard proving that Gradebook cannot call the retired endpoint, the
  compatibility endpoint cannot touch reports or invoke calculation, and central Auto-fill carries
  the academic offering/period keys and calls `recalculate_academic_result`;
- repaired the CI bootstrap test double after tracked generation recovery added its own database
  update. Lesson-plan publish updates and generation-run recovery updates are now observed separately,
  so the tests still prove that draft plans publish once and already-published plans are left alone.
  The reported Docker `/.next/static` and `/.next/standalone` errors were downstream of the failed test
  gate: the Next build artifacts had not been created, rather than the container paths changing.

Verification and boundaries:

- the two previously failing bootstrap cases now pass;
- 5 focused suites and 40 tests passed, covering bootstrap generation, one result authority, session
  workflow, session architecture, and the report-card pathway rendering guard;
- `npm run typecheck` passed after restoring the non-writing compatibility module expected by Next's
  generated route validator;
- no student mark, manual result, submission, report, database row, or schema was changed. No
  production build, deployment, or remote push was performed in this milestone.

### 16.25 Durable assessment-evidence context and staff recovery milestone — verified locally and audited live read-only on 24 August 2026

Confirmed live centralization gap:

- the aggregate-only production audit inspected 57 central evidence rows: 49 CBT sessions and eight
  assignment submissions. All 49 CBT rows and two assignment rows lacked the complete class,
  academic-offering and offering-period identity required by central Auto-fill;
- the evidence trigger refreshed marks when a CBT or written-exam attempt changed, but its conflict
  path did not refresh class, course, term, plan, offering or period. Correcting a parent assessment
  therefore left existing central evidence stale until an unrelated learner update happened;
- the general CBT builder did not ask whether an assessment was an official class result or practice.
  It received a class only when launched from a class-aware page, so assessments created from the CBT
  hub could be visible and gradable while remaining unusable by central results;
- four assignment evidence rows refer to assessment records that are no longer present. They are
  historical evidence, not a safe basis for guessing a replacement assignment or class. They remain
  preserved and visibly classified as legacy/unscoped; no score was deleted or reassigned;
- no surviving assignment, CBT, written-exam, or weekly-practical source was missing its expected
  central evidence row at audit time. The material defect was context handoff, not failed score copy.

Implemented prevention and recovery:

- migration `20260929000104_make_assessment_evidence_context_durable.sql` makes assignment, CBT,
  written-exam and weekly-practical upserts refresh the complete academic lineage on every conflict;
- changing a parent assessment's verified context now repairs all of its existing evidence
  immediately. This context-only propagation does not update raw score, maximum score, answers,
  feedback, moderation, submission content or evidence snapshots;
- the class remains authoritative for academic offering and delivery period, preventing an old
  offering identifier from surviving a deliberate class-link repair;
- new CBT creation asks **Class result** or **Practice only** before publishing. Class result requires
  an accessible class with an academic offering and period. Practice is stored explicitly and its
  evidence status remains `recorded`, so the automatic result calculator cannot consume it;
- staff cannot silently route a result-bearing assessment without a class. API errors explain how to
  resolve a missing class, incomplete class setup, school/programme/term mismatch, or missing course;
- the CBT list labels each assessment as **Class result**, **Practice only**, or **Resolve result
  use**. The edit screen lets staff either link a legacy unscoped assessment to a compatible class or
  deliberately retain it as practice. Linking a new class is permitted only when context matches;
  an assessment already linked to a class cannot be moved after learner evidence exists;
- setting the parent to practice immediately excludes its existing attempts from automatic results;
  linking a previously unscoped result immediately propagates the confirmed class, course, term,
  offering and period to its evidence. Neither action changes the learner's mark;
- only legacy CBT metadata that already contains an exact target class is eligible for automatic
  migration repair, and only when school, programme, term and class offering/period agree. A learner's
  current class is never used to guess where an older sitting belonged;
- `npm run audit:academic-evidence` is the permanent release/readiness check. It reads identifiers
  only to compare relationships and prints aggregate counts by evidence type—never learner names,
  contact details, answers, marks or credentials. Practice evidence and unresolved result evidence
  are reported separately.

Verification and deployment boundary:

- three focused suites passed: 3 files and 14 tests, including complete lineage refresh, practice
  exclusion, score-preserving parent repair, API compatibility guards, staff resolution UX, and the
  aggregate-only audit contract;
- `npm run typecheck` passed for the product change before the final source-only regression test was
  added; the complete type-check is rerun before the milestone commit;
- `git diff --check` passed before documentation and is rerun before commit;
- the production audit was read-only. Migration 104 is local and **has not been applied to the live
  database in this milestone**. Consequently the 49 CBT and two assignment rows remain unscoped in
  production until the migration is deployed and staff classify any genuinely ambiguous legacy CBTs;
- after deployment, rerun `npm run audit:academic-evidence`. A non-zero result means a result-bearing
  assessment still needs an explicit staff decision or another source relationship is broken. Do not
  publish an automatic report from unresolved evidence and do not bulk-assign legacy attempts from
  current enrolment;
- no production build, remote push, database write, learner score mutation, submission mutation or
  report mutation was performed by this milestone.

### 16.26 Assignment-to-result context and practice boundary milestone — verified locally on 24 August 2026

Confirmed workflow defect:

- assignments created from a class or class plan inherited the central class, course, term, offering
  and period correctly. The general **Create Assignment** page, however, had no class choice and sent
  `class_id: null`; this is the source pattern behind the two surviving unscoped assignment-evidence
  rows reported by the aggregate production audit;
- those submissions and grades exist, but Auto-fill correctly refuses to consume them without a
  trustworthy class/offering/period. The prior edit endpoint also treated every class update as a
  scoring-definition change, so staff had no safe way to repair a missing class after grading;
- a programme-wide task and an official class assignment were not explicitly distinguished. Making
  all programme-wide practice count as report evidence would be unsafe, while hiding it completely
  would damage the learner and teacher workflow.

Implemented:

- new assignment creation now asks **Class result** or **Practice only**. Class result requires a
  class with a valid offering and period; class and plan routes still prefill their known context;
- the assignment API independently validates teacher ownership, school, class, lesson plan,
  programme, term, offering and period. A lesson-plan ID alone can no longer target a class the
  teacher does not own, and a multi-school teacher's selected class supplies the correct school;
- official assignments stamp `assessment_scope=class_result` and `result_eligible=true`. Practice
  assignments stamp the opposite and remain available for distribution, submission, marking and
  feedback;
- migration `20260929000105_keep_practice_assignments_out_of_results.sql` changes only the central
  evidence lifecycle label: practice submissions are `recorded`, which the result calculator does
  not consume. Changing the parent setting updates existing evidence eligibility without deleting or
  rewriting a submission, grade, answer, attachment, feedback or moderation record;
- the assignment list labels **Class result**, **Practice only**, or **Resolve result use**. For an
  older unscoped assignment, the edit screen offers two honest resolutions: link the compatible class
  or retain it as practice;
- a null-to-class recovery is exempted from the normal score-definition lock only for academic
  context. School, programme, term, course, offering and period are validated. All actual scoring,
  question, weighting and assignment-type changes remain locked once protected grade evidence exists;
- the permanent aggregate audit now separates practice assignment evidence from unresolved result
  evidence, just as it does for CBT.

Verification and deployment boundary:

- four focused suites passed: 4 files and 15 tests covering creation scope, teacher/plan ownership,
  guarded legacy recovery, protected scores, practice exclusion, grading-mode policy, submission
  authority, and the shared evidence context contract;
- the full `npm run typecheck` passed after the assignment API and UI changes;
- local browser proof could not be completed because PID 17724 still owns this workspace's Next
  development lock while its server no longer answers on port 3000; Next correctly refused a second
  instance. The process was not force-terminated. Source, type and focused-test proof are claimed, not
  a successful interactive mobile/desktop journey;
- migration 105 is local and has not been applied to production. The two existing unscoped assignment
  evidence rows therefore remain unresolved in live data until deployment and an explicit staff
  choice; no class is inferred from current learner enrolment;
- no production build, remote push, database write, learner score, submission, attachment, feedback,
  report, or finance record was changed in this milestone.

### 16.27 Report-builder hydration and local manifest investigation — verified locally on 24 August 2026

Confirmed and fixed:

- the existing Next development log contained React's exact hydration warning that a `<button>` was
  rendered inside another `<button>` in the report builder's collapsible **Setup** section;
- the reusable `BuilderSection` placed its optional `actions` inside the full-width collapse button.
  The report builder supplied **Another class** as a button action, producing invalid HTML and
  potentially unreliable click, focus, keyboard and hydration behavior;
- collapsible headers now render a dedicated title/chevron button and a sibling actions container.
  The collapse control exposes `aria-expanded`; action buttons no longer depend on event propagation
  to escape a parent button;
- a component regression renders a collapsed Setup section with a button action and proves the two
  buttons are siblings rather than nested.

Verification and runtime boundary:

- three focused suites passed: 3 files and 8 tests, including the new interaction-structure test and
  the report-card pathway/PDF guard;
- the full `npm run typecheck` passed;
- the historic log also contains a transient **Manifest file is empty** error. A read-only scan found
  no zero-length manifest in `.next` now. PID 17724 still owns the dev lock but does not answer local
  requests, so this points to stale development-process/build-artifact state rather than an identified
  production source defect. No `.next` directory or process was deleted/terminated automatically;
- after the user restarts the local dev process, repeat the Write/Setup/Another class interaction and
  inspect fresh logs. Production remains Cloudflare Containers and does not depend on this long-lived
  local development process;
- no production build, database mutation, remote push, report write or learner evidence mutation was
  performed in this milestone.

### 16.28 Written-exam result boundary and learner-record protection — verified locally and audited live read-only on 24 August 2026

Confirmed central-system gaps:

- written exams carried course and school data but creation did not ask whether a paper was an
  official class result or practice. The list, detail and start gates checked programme/course scope
  independently and did not enforce the exact target class, so an official paper could be visible to
  another class in the same programme;
- written attempts were synchronized into `academic_assessment_evidence`, but practice eligibility
  was not represented. An unscoped legacy paper could therefore look eligible to Auto-fill even when
  nobody had verified the class, offering or reporting period;
- the permanent learner-deletion guard protected assignment scores, CBT sittings, reports and
  moderated term grades, but omitted `exam_attempts`. A started written paper is learner evidence and
  must be retained even before its final manual grade;
- staff could not repair a missing result class after an attempt existed because the endpoint treated
  every update as a paper-definition change. The UI also kept paper fields editable until the server
  rejected the request, which was safe but confusing;
- the read-only production audit currently finds no written-exam attempt evidence. Prevention is
  therefore being added before this omission creates live score ambiguity; the existing live counts
  remain 57 evidence rows, with 49 CBT and two assignment rows unresolved and four orphaned legacy
  assignment rows preserved.

Implemented prevention and safe recovery:

- `assessmentVisibleToStudent` is now the shared learner gate for CBT and written assessments.
  Written-exam list, detail, attempt-list and start boundaries all enforce active status plus school,
  programme/course and exact class. A guessed URL cannot bypass the class decision;
- written-exam creation now requires **Class result** or **Practice only**. An official paper requires
  an owned class with a compatible school/programme and complete academic offering/reporting period.
  The server derives school, programme, term, offering and period from authoritative course/class
  records rather than trusting browser fields;
- the written-exam list shows staff **Class result**, **Practice only**, or **Resolve result use**.
  The edit page provides the same explicit setting and explains protected attempts in human terms;
- after a learner starts a paper, definition fields are read-only. Staff can still deactivate the
  paper, classify it as practice, or perform a compatible null-to-class context recovery. An existing
  class cannot be moved after evidence exists. No answer, score, feedback or moderation decision is
  recalculated by this recovery;
- migration `20260929000106_keep_practice_written_exams_out_of_results.sql` keeps practice and
  unresolved legacy attempt evidence at `recorded`, outside automatic result calculation. Official
  evidence retains `draft`, `submitted`, `graded` or `moderated` state. Its final `zzz_` trigger order
  is deliberate: eligibility runs after the general evidence and moderation synchronizers so neither
  can silently re-admit practice evidence or erase approved moderation;
- learner account cleanup now resolves both portal-user and student-row identities, checks
  `exam_attempts`, and fails closed when that source cannot be inspected. Started written attempts are
  reported in the same professional protected-record message as the other academic sources;
- the aggregate audit understands written-paper practice and unresolved decisions without selecting
  names, contacts, answers or marks.

Verification and deployment boundary:

- four focused suites passed: 4 files and 15 tests covering shared visibility, exact-class gating,
  explicit creation, protected recovery, database eligibility order, moderation preservation and
  learner-deletion protection;
- the full `npm run typecheck` passed. Targeted ESLint completed with zero errors; remaining warnings
  are pre-existing explicit-`any`/effect-style debt and are not represented as a clean lint gate;
- `git diff --check` passed. A linked Supabase `db push --dry-run --include-all` completed without a
  database write and confirmed migrations 103, 104, 105 and 106 are the pending ordered set;
- the production evidence audit was aggregate-only and read-only. Migration 106 is local and has not
  been applied to production. No database row, learner attempt, answer, score, feedback, moderation,
  report, finance record or remote branch was changed in this milestone.

### 16.29 Class, programme and account-retention agreement — verified locally and audited live read-only on 24 August 2026

Confirmed retention gaps:

- class deletion already protected assignment submissions, CBT sittings, written attempts, scored or
  manual reports, moderated term grades and central evidence in both the application preflight and
  atomic database function;
- programme deletion did not have the same coverage. Its learner-work check ran only when at least
  one class row still existed and then inspected those classes. Course/programme-scoped submissions,
  attempts or reports could be missed after a class was removed or when legacy work had never gained
  a class link;
- a second legacy shape stores an exact class only as `metadata.target_class_id`. The class preflight
  queried only the canonical `class_id`, so an old metadata-targeted assessment needed an additional
  compatibility guard until staff resolves it;
- account cleanup now protects written attempts, but report drafts explicitly authored in manual mode
  also need retention even when every numeric score is still empty. Manual mode represents a human
  academic decision, not disposable generated content.

Implemented agreement and fail-closed behavior:

- programme evidence is now checked directly through programme, course, class and enrollment
  identities. Protected sources include submitted assignment work, CBT sessions, written attempts,
  published/manual/scored reports, enrollment term grades and central assessment evidence. Empty
  assessment definitions remain rebuildable and do not falsely lock development cleanup;
- the programme API no longer gates that check on `usage.classes > 0`. When learner work exists it
  retires the programme (`is_active=false`) instead of deleting it. A foreign-key or database
  retention race also converges on the same professional retire response and an auditable reason;
- migration `20260929000107_protect_programmes_with_learner_evidence.sql` adds the matching database
  backstop. Direct SQL cannot delete a programme while those learner records survive, even if an
  application path is stale;
- the class preflight now resolves both canonical `class_id` and exact legacy
  `metadata.target_class_id` for assignments, CBT and written exams. Migration
  `20260929000108_protect_legacy_class_target_evidence.sql` adds a complementary class-delete trigger;
  because it runs inside the atomic delete transaction, any earlier roster detach is rolled back when
  protected legacy evidence is found;
- account/report retention now treats `calculation_mode=manual` as protected progress-report evidence.
  Every evidence lookup fails closed: a database inspection error returns a retryable professional
  message and performs no delete;
- the aggregate production audit now reports metadata-only class targets separately. The live
  read-only run found zero such targets, so migration 108 is preventive rather than a claim that live
  learner rows were repaired.

Verification and deployment boundary:

- three focused suites passed: 3 files and 12 tests covering programme evidence without a class,
  written attempts, empty definitions, query failure, manual reports, legacy metadata targets and
  application/database policy agreement;
- the linked Supabase dry run completed without writes and confirmed migrations 103 through 108 as
  the ordered pending set;
- the live aggregate evidence totals remain unchanged: 57 rows, 49 CBT and two assignment rows still
  unresolved, four orphaned legacy assignment rows preserved, no missing source evidence, no written
  attempts and no metadata-only class targets;
- migrations 107 and 108 are local and have not been applied to production. No class, programme,
  account, score, attempt, report, finance record, database row or remote branch was changed.
