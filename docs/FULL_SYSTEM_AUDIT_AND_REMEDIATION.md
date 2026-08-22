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
| `/` | No horizontal overflow and no missing image alt text detected. Confirmed copy defect: “EducationAcross” lacks a space. Contact fields use placeholders without programmatic labels. Carousel controls, indicators, social icons, and footer links include sub-44px targets. |
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

### 6.9 Results, report builder, school reports, publish/share/autofill — **Active uncommitted work; E2E unverified**

Current uncommitted implementation work separates compulsory host papers from optional Rillcod
six-box evidence and includes focused tests. It must be preserved, reviewed, type-checked, tested,
committed, and deployed as its own milestone.

Required completion:

- One result authority consumes validated assessment/grading outputs.
- Builder stages: choose session/class/learner → load curriculum/subjects → optional autofill →
  edit/validate → preview → publish → share.
- Autofill is optional and must show source/provenance. It must never overwrite a manual score
  silently.
- **User-reported re-verification:** the start of the school report builder can be stale and
  manual curriculum selection may fail to load, while later draft stages work better.
- Returning to a learner must restore current draft state without duplicating reports.
- Switching Rillcod optional evidence on/off must not alter compulsory host-school marks.
- Publication produces an immutable version; a correction creates a traceable new version.
- Share links require scoped token, revocation, expiry policy, access audit, and no wider learner
  disclosure.
- Verify parent-results, result-check, school-report verification, PDF, print, email/share,
  unpublished access, corrected version, and revoked link.
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

- Fix “EducationAcross” spacing.
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
| SYS-004 | P0 | At risk | No verified central CSRF/origin guard | Unsafe route inventory and attack tests pass |
| SYS-005 | P0 | Confirmed defect | Limiter is a process-local `Map` and covers only `/api/inbox` | Shared-store, all-sensitive-action inventory, concurrency, and bypass tests pass |
| SYS-006 | P0 | Locally remediated; production resend proof pending | Financial correction/resend now uses one canonical document route and a trusted issued-account snapshot | Deploy and prove the same invoice version matches save/preview/download/email/resend |
| SYS-007 | P0 | Partially remediated; full call-site classification pending | Student deletion and school wipe now fail closed for immutable academic/posted-finance evidence; cleanup policy remains flexible for build-time mistakes | Every remaining literal/dynamic delete site classified and database migration deployed/tested |
| SYS-008 | P0 | At risk | Submission/grading/result authority can fragment | One policy/service and complete assignment/project/CBT/result E2E |
| SYS-009 | P1 | Confirmed gap | CSP and HSTS absent/unverified | Report-only observation, enforced CSP, HTTPS/HSTS verification |
| SYS-010 | P1 | Locally remediated; device proof pending | Android, iOS, and Capacitor now display Rillcod Technologies and regenerated native assets are checked in | Android/iOS/PWA installed-app visual proof |
| SYS-011 | P1 | At risk | 70 client pages directly query database | Critical paths migrated to domain gateways with parity tests |
| SYS-012 | P1 | At risk | Large academic/lesson/report/settings pages | Vertical service/component split and performance baselines |
| SYS-013 | P1 | User-reported | AI generation fails and prior content is hard to find | Durable job, retry, persistence, provenance, discovery tests |
| SYS-014 | P1 | User-reported | Report builder start/manual curriculum loading unreliable | Fresh/return/manual/autofill browser flows pass |
| SYS-015 | P1 | At risk | Content types not always carried together | Unified lesson-content contract and learner publication tests |
| SYS-016 | P1 | At risk | Consent/claim/registration/finance gates can conflict | Central lifecycle state-machine and multi-entry E2E tests |
| SYS-017 | P1 | Confirmed gap | External error tracking/alerting absent | Release-linked errors and alerts verified |
| SYS-018 | P0 | Dependency tree remediated; CI security gate pending | Full and production npm audits now report zero findings; dependency/code/container scanning still needs a required CI gate | Patched lockfile, zero accepted critical/high findings or documented exception, CI gates and ownership active |
| SYS-019 | P1 | At risk | Cron operational guarantees undocumented | Job registry, run ledger, alerts, replay and overlap tests |
| SYS-020 | P1 | At risk | WhatsApp/message failures can be swallowed | No empty catches; delivery ledger and partial-failure UI |
| SYS-021 | P1 | At risk | PDF parity across invoice/report/exam/certificate | Golden/semantic PDF checks and version linkage |
| SYS-022 | P1 | Locally remediated; deployment proof pending | Source-controlled worker replaces Workbox/fallback artifacts, excludes private/API traffic, and has update/push/cleanup guards | Clean checkout/build owns all worker assets; cache-upgrade and old-client deploy tests pass |
| SYS-023 | P2 | Confirmed UI | Public home copy “EducationAcross” | Corrected production copy |
| SYS-024 | P2 | Confirmed a11y | Public contact fields lack programmatic labels | Accessible-name browser check passes |
| SYS-025 | P2 | Confirmed a11y | Small public/login touch targets | 44px target audit passes |
| SYS-026 | P2 | Confirmed a11y | Duplicate login H1 semantics | One exposed document H1 |
| SYS-027 | P2 | At risk | 146 pages with raw buttons, 114 raw inputs | Design-system exception or migration per occurrence |
| SYS-028 | P2 | At risk | Tiny text on 136 pages | Readability review and token enforcement |
| SYS-029 | P2 | At risk | Horizontal-scroll fallback on 46 pages | Mobile task review and justified table exceptions |
| SYS-030 | P2 | At risk | 22 empty catches | Expected fallback/metric, retry UI, or typed error |
| SYS-031 | P2 | At risk | 2,761 `any` escapes | Remove at authority boundaries first; type budget trends down |
| SYS-032 | P2 | At risk | Password minimum differs between Supabase and app | One documented and enforced password policy |
| SYS-033 | P2 | At risk | Settings/policies duplicated or unclear | One authority per configuration and reader/writer map |
| SYS-034 | P2 | At risk | Learner-progress route overlap/noise | Unique task map, merge true duplicates, central read model |
| SYS-035 | P2 | At risk | Class roster and path visibility can compete | One roster with scoped visibility controls |
| SYS-036 | P2 | At risk | Customer errors can expose internal concepts | Public error-code/message contract and UX review |
| SYS-037 | P2 | At risk | No enforced accessibility browser gate | axe/browser gate plus manual audit |
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

- enforced Content Security Policy;
- configured HTTP Strict Transport Security;
- a clearly centralized state-changing-request origin/CSRF guard;
- external error aggregation/release tracking such as Sentry or an OpenTelemetry exporter;
- dependency update automation such as Dependabot/Renovate;
- an automated code-scanning workflow;
- an automated container vulnerability scanning gate;
- a browser accessibility gate using axe or an equivalent engine.

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
