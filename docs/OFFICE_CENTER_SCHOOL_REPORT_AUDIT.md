# Office Center and School Report System Audit

**Project:** Rillcod Academy  
**Audit scope:** Database, RLS, API routes, domain logic, state management, workflows, UX/UI, reliability, security, maintainability, and testing  
**Audit type:** Read-only architecture and product audit  
**Status:** Recommendations only; no production code changed

---

## 1. Executive Summary

The Office Center and School Report systems need structural improvement before further visual polishing. The visible clutter is a symptom of deeper issues:

- Oversized pages and components combine too many responsibilities.
- Academic-term conventions differ between School Reports and Finance.
- Several data-query failures are silently interpreted as “no data.”
- Published reports are editable after being returned to draft, so they are not truly immutable.
- Shared report editing has no conflict protection.
- Some operational database policies expose fields that should be server-controlled.
- Office Center navigation has too many nested layers.
- Loading, stale-data, error, and recovery states are inconsistent.
- Business rules are duplicated across UI, API, and database layers.

The recommended approach is to fix data integrity, authorization, concurrency, and workflow clarity first. The interface should then be redesigned around those stronger boundaries.

---

## 2. Audit Objectives

This audit examined whether the two systems are:

1. Secure and correctly authorized.
2. Resistant to duplicate or conflicting records.
3. Reliable when source data is missing or a query fails.
4. Easy for staff to understand and operate.
5. Maintainable without continued code bloat.
6. Consistent across database, API, application, and UI layers.
7. Properly tested across important business workflows.

---

## 3. Current System Shape

### 3.1 School Report size indicators

| Module | Approximate size | Concern |
|---|---:|---|
| School Report page | 941 lines | Listing, creation, editing, analytics, finance, and navigation are combined |
| Report builder | 1,479 lines | Excessive UI and workflow responsibility |
| Snapshot aggregator | 775 lines | Many unrelated data sources and rules in one function |
| PDF generator | 1,558 lines | Rendering, data fallbacks, and document business rules are coupled |

### 3.2 Office Center size indicators

| Module | Approximate size | Concern |
|---|---:|---|
| Office Center page | 341 lines | Shell, navigation, access handling, layout, and routing combined |
| Cases panel | 409 lines | List and detail workflow tightly coupled |
| Office Desk panel | 399 lines | Summary, attention queue, and activity mixed together |
| Templates panel | 382 lines | Editing and orchestration combined |
| Operations Health panel | 349 lines | Monitoring and recovery actions combined |
| Office context | 275 lines | URL navigation, snapshots, refresh coordination, and shared state combined |

These sizes do not automatically mean the code is defective, but they are strong indicators of unclear boundaries and difficult change management.

---

## 4. Severity Summary

| Priority | Finding | Primary impact |
|---|---|---|
| Critical | School Report and Finance use inconsistent academic-year contracts | Invoices may not prefill, open, or attach correctly |
| Critical | Published reports are mutable after being unlocked | Previously issued documents can silently change |
| Critical | Teachers can request forced publication | Completeness requirements can be bypassed |
| Critical | Shared report editing uses last-write-wins behavior | One staff member can overwrite another |
| Critical | Duty handover is not atomic | The office can be left without an active primary operator |
| Critical | Staff-settings policies permit unsafe field mutation | Protected operational roles can be influenced directly |
| High | Curriculum detection failures are hidden | Technical failures look like missing curriculum |
| High | Source query failures often become empty data | Reports may look valid while being incomplete |
| High | Autosave failures are invisible | Staff may lose work without knowing |
| High | Office summary failures retain stale values | Old operational counts can appear current |
| High | “Needs attention” includes ordinary open work | The priority queue becomes noisy and unreliable |
| Medium | Nested Office navigation creates clutter | Users struggle to understand where work belongs |
| Medium | Repeated fetch/auth/error logic increases drift | Behavior differs between panels and routes |
| Medium | Mojibake exists in displayed text | Poor visual quality and document professionalism |

---

## 5. Critical Findings

### 5.1 Academic-year contract mismatch

The School Report finance link emits a start-year value such as `2026`, while an existing test expects the full period label `2026/2027`. Finance then performs additional normalization.

Relevant modules:

- `src/lib/school-reports/finance-links.ts`
- `src/lib/school-reports/invoice-match.ts`
- `src/components/finance/ops/InvoicesPanel.tsx`
- `src/lib/school-reports/finance-links.test.ts`

#### Risk

- A report may fail to locate an existing invoice.
- Finance may open a blank invoice builder instead of the matching document.
- The user may create another invoice, contributing to duplicates.
- Different routes may interpret the same parameter differently.

#### Recommendation

Create one canonical academic-period contract:

```ts
type AcademicPeriodKey = {
  academicTermId: string;
  periodLabel: string; // 2026/2027
  startYear: string; // 2026
  termNumber: 1 | 2 | 3;
};
```

Use `academicTermId` as the authoritative relationship wherever possible. Labels should be display values, not relational identifiers.

---

### 5.2 Published reports are not genuinely immutable

The database describes report snapshots as frozen, but a published report can be returned to draft and modified in place.

#### Risk

- The database record can differ from a PDF previously issued to a school.
- There is no reliable historical record of exactly what was published.
- Disputes cannot be resolved through a defensible audit trail.
- Regeneration can replace underlying figures without preserving the prior publication.

#### Recommendation

Introduce immutable report revisions:

```text
school_performance_reports
└── school_report_revisions
    ├── revision_number
    ├── snapshot
    ├── narrative
    ├── design
    ├── publication_status
    ├── published_by
    ├── published_at
    ├── pdf_hash
    └── change_reason
```

Unlocking a report should create a new working revision. It should never modify the previously published revision.

---

### 5.3 Forced publication is insufficiently restricted

The API accepts `forcePublish` for users who can manage a report. It does not reserve that override for administrators.

#### Risk

A teacher can bypass missing-invoice or completeness requirements that were intended as publication gates.

#### Recommendation

- Restrict forced publication to active administrators.
- Require a written override reason.
- Record the missing items, actor, timestamp, and reason in an audit event.
- Show the override prominently in the revision history.

---

### 5.4 Shared report editing has no conflict protection

The unified-book constraint successfully reduces duplicate active reports. However, multiple teachers can edit the same report and autosave over each other.

#### Risk

- Last writer wins silently.
- Staff can lose carefully edited narrative or design changes.
- A stale browser tab can overwrite newer work.

#### Recommendation

- Add `revision_number` or `lock_version` to report drafts.
- Require `expectedRevision` on PATCH requests.
- Return HTTP `409` when a stale revision is submitted.
- Provide compare, reload, and copy-my-changes recovery options.
- Consider section-level ownership or collaborator presence indicators.

---

### 5.5 Duty assignment is not atomic

Starting a new primary duty period first closes an existing primary record and then inserts the new record. These actions are not transactional.

#### Risk

If the insertion fails after the update, no primary operator remains active.

#### Recommendation

- Move the handover into a database transaction or RPC.
- Lock the relevant duty type during handover.
- Enforce one effective primary operator per duty type.
- Record handover events and reasons.
- Return the complete new duty snapshot from the transaction.

---

### 5.6 Unsafe operations staff policy surface

Teachers can insert or update their own operations staff row. The row includes sensitive operational fields such as `is_primary_admin`.

#### Risk

Row ownership alone is not sufficient field-level authorization.

#### Recommendation

- Remove direct authenticated writes to the table.
- Use validated server routes or a narrow database function.
- Permit staff to update only availability and other explicitly safe fields.
- Make `is_primary_admin`, administrative notes, and protected routing fields server-only.
- Require active and non-deleted profiles in all policies.

---

## 6. Reliability and Data-Quality Findings

### 6.1 Curriculum detection hides errors

The client catches curriculum-range errors and removes the detection hint. A failed query is therefore indistinguishable from a school with no tracking records.

#### Recommended status contract

```ts
type CurriculumDetectionStatus =
  | "detected"
  | "no_tracking"
  | "no_curriculum"
  | "query_failed"
  | "migration_missing";
```

The UI should show the real state, the source checked, and the corrective action.

### 6.2 Query errors are frequently treated as empty results

The report aggregator checks some errors but ignores several others. Missing classes, attendance, invoices, curriculum, staff assignments, or tracking can therefore appear as valid zero values.

#### Recommendation

Introduce common source-loading wrappers:

```ts
requiredQuery("students", query);
optionalQuery("payment accounts", query);
```

Every snapshot should contain a data-quality ledger:

```ts
type DataSourceStatus = {
  source: string;
  status: "ok" | "empty" | "partial" | "failed";
  rowCount: number;
  capped: boolean;
  checkedAt: string;
  message?: string;
};
```

Required failures should block publication. Optional failures should be visible warnings.

### 6.3 Autosave failures are invisible

Autosave currently ignores unsuccessful responses and exposes no recovery state.

#### Recommendation

Display one of the following states at all times:

- Saved
- Saving
- Unsaved changes
- Offline
- Save failed — retry
- Conflict detected

Preserve an encrypted local recovery draft where appropriate.

### 6.4 Office summary can become silently stale

The Office context treats the summary as best-effort and swallows failures. Existing values remain on screen without a stale indicator.

#### Recommendation

Track:

- `loading`
- `lastUpdatedAt`
- `stale`
- `error`
- `refreshing`

Operational counts should never appear current when their freshness is unknown.

### 6.5 Attention counts are too broad

Every active case is included in the attention list, including ordinary open work.

#### Recommended attention rules

A case needs attention only if one or more conditions apply:

- It is urgent or restricted.
- It is unassigned beyond a defined threshold.
- Its SLA is breached or close to breach.
- Its next action is overdue.
- A delivery failed.
- The customer has waited beyond the response threshold.
- It was reopened.

---

## 7. Security and Privacy Review

### Strengths

- Server routes generally authenticate with `getUser()`.
- School Report management scope checks assigned teacher schools and class ownership.
- A partial unique index prevents multiple active report books for the same school and term.
- Published reports are hidden from school users until publication.
- Sensitive case mutation permissions were hardened in later migrations.

### Gaps

- Authorization helpers are repeated rather than centralized.
- Service-role queries bypass RLS, increasing the importance of perfect route checks.
- Force publication is not role-restricted enough.
- Operations staff policies expose more columns than necessary.
- Published snapshots may contain full learner-level data accessible through a school account.
- Report mutation and publication events lack a complete audit history.
- Some list endpoints use fixed limits without pagination or truncation disclosure.

### Recommendations

- Centralize active-role authorization.
- Introduce explicit API DTO schemas with Zod.
- Add field-level response shaping; do not return full database rows by default.
- Separate school-visible aggregates from internal learner-level evidence.
- Record all publish, unpublish, regenerate, delete, override, and invoice-link events.
- Add authorization integration tests for every role and report state.

---

## 8. Code-Smell Review

### 8.1 Oversized modules

Large modules mix data loading, policy decisions, business calculations, rendering, and workflow orchestration.

### 8.2 Excessive `any`

The most sensitive aggregation and invoice matching paths frequently use `any`, reducing compiler protection against schema drift.

### 8.3 Repeated fetch-state implementations

Each Office panel independently manages loading, errors, mutations, and refreshing. This produces inconsistent behavior and duplicated requests.

### 8.4 Repeated authentication logic

Several Office admin routes repeat similar profile checks with slightly different error handling.

### 8.5 UI and business logic are coupled

The School Report page manages creation, list sorting, detection, editing, publishing, deletion, regeneration, finance presentation, and analytics.

### 8.6 Legacy and embedded navigation overlap

Standalone pages and Office Center panels represent some of the same workflows, increasing route and maintenance duplication.

### 8.7 Encoding defects

Strings contain mojibake such as:

- em dash mis-encoded as three Latin-1 characters (common in legacy exports)
- middle dot mis-encoded (U+00B7 shown as two-byte Latin-1)
- ellipsis mis-encoded (U+2026 shown as three-byte Latin-1)
- arrow mis-encoded (U+2192 shown as multi-byte Latin-1)

These should be normalized to UTF-8 and prevented through linting or repository checks.

---

## 9. Recommended Target Architecture

### 9.1 School Report architecture

```text
school-reports/
├── domain/
│   ├── academic-period.ts
│   ├── invoice-association.ts
│   ├── curriculum-coverage.ts
│   ├── completeness.ts
│   ├── publication-policy.ts
│   └── report-revision.ts
├── data/
│   ├── report-repository.ts
│   ├── source-loaders/
│   ├── snapshot-repository.ts
│   └── revision-repository.ts
├── application/
│   ├── create-or-open-report.ts
│   ├── run-report-preflight.ts
│   ├── regenerate-snapshot.ts
│   ├── save-draft.ts
│   └── publish-report.ts
├── contracts/
│   ├── report-api.ts
│   └── report-events.ts
└── ui/
    ├── ReportLibrary.tsx
    ├── ReportSetupWizard.tsx
    ├── ReportEditor.tsx
    ├── ReportPreview.tsx
    └── DataQualityDrawer.tsx
```

### 9.2 Office Center architecture

```text
office/
├── shell/
│   ├── OfficeShell.tsx
│   ├── OfficeNavigation.tsx
│   └── OfficeCommandBar.tsx
├── workspaces/
│   ├── today/
│   ├── cases/
│   ├── conversations/
│   ├── relationships/
│   ├── duty/
│   └── system-health/
├── data/
│   ├── office-summary.ts
│   ├── case-queries.ts
│   └── mutation-events.ts
└── contracts/
    └── office-api.ts
```

The Office shell should handle only navigation and workspace composition. Each workspace should own its data and workflow.

---

## 10. Recommended Office Center UX

### 10.1 Navigation

Replace zone tabs, workspace tabs, and subsection tabs with a persistent desktop sidebar and mobile drawer.

```text
Today
├── My queue
├── Unassigned
├── Overdue
└── Recent activity

Conversations
├── Cases
├── WhatsApp
└── Feedback

Relationships
├── CRM
└── Newsletters

Operations
├── Duty roster
├── Automations
├── Templates
├── System health
└── Performance
```

### 10.2 Today screen

The Today screen should contain only:

1. A compact operational header.
2. Four meaningful KPIs.
3. One prioritized action queue.
4. A short activity timeline.
5. A duty coverage card.

### 10.3 Queue behavior

Add:

- Saved views.
- SLA and ownership filters.
- Bulk assignment where safe.
- Explicit next actions.
- Keyboard navigation.
- Clear empty, loading, stale, and failed states.

---

## 11. Recommended School Report UX

Replace the large combined form and editor with a guided workflow.

### Step 1: Select scope

- School
- Academic term
- Report title

Dates should default from the selected canonical academic term.

### Step 2: Run data preflight

Display:

- Learners found
- Classes found
- Staff assignments
- Results coverage
- Attendance coverage
- Curricula found
- Delivery tracking found
- Matching invoice
- Duplicate or near-match invoices
- Source freshness

### Step 3: Confirm curriculum delivery

- Show detected weeks and topics.
- Explain the source of the detection.
- Clearly distinguish “no records” from “system error.”
- Permit documented manual overrides.

### Step 4: Resolve finance association

- Show the matching invoice.
- Show near matches with reasons.
- Open the existing invoice directly when possible.
- Prevent accidental duplicate invoice creation.

### Step 5: Generate the draft

- Produce a traceable snapshot.
- Record all source statuses.
- Mark AI-generated and manually edited sections.

### Step 6: Review sections

- Executive summary
- Topics covered
- Achievements
- Concerns
- Recommendations
- Next-period focus
- Analytics appendix
- Finance appendix

### Step 7: Preview

- Desktop preview
- Print/PDF preview
- Completeness checklist
- Data-quality warnings

### Step 8: Publish

- Create an immutable revision.
- Record publisher and timestamp.
- Generate and hash the final PDF.
- Notify the school.
- Preserve the exact issued version.

---

## 12. Recommended Features

### 12.1 Immediate high-value features

- Data-readiness preflight.
- Curriculum detection diagnostics.
- Canonical invoice-term association.
- Report revision history.
- Autosave failure and conflict recovery.
- Publication approval checklist.
- Staff comments and reviewer assignments.
- Office SLA queues.
- Saved Office filters.
- Universal Office search.
- Source freshness indicators.

### 12.2 Medium-term features

- Scheduled term-end report preparation.
- Notifications when missing data becomes available.
- Side-by-side term comparison.
- Report acknowledgment and download tracking.
- School-specific report templates.
- Controlled AI rewrite with factual-difference highlighting.
- Office command palette.
- Cross-channel customer timeline.

### 12.3 Later enhancements

- Live collaborator presence.
- Section-level approvals.
- Report analytics across multiple academic years.
- Automated anomaly detection.
- School self-service clarification requests.
- Operational capacity forecasting.

---

## 13. Testing Assessment

Focused School Report test execution produced:

- **27 tests discovered**
- **25 passed**
- **2 failed**

### Failing areas

1. Finance deep-link academic-year contract.
2. Risk-insight generation expectation.

The full TypeScript check did not complete within the audit window and should be investigated separately.

### Missing test coverage

- Role-by-role API authorization.
- Forced-publication permissions.
- Concurrent autosave conflicts.
- Duty handover transaction failure.
- Curriculum query failure versus empty curriculum.
- Invoice near-match and duplicate prevention.
- Immutable publication revisions.
- Office stale-summary behavior.
- Responsive Office navigation.
- Keyboard and screen-reader workflows.
- PDF parity with published revision data.

---

## 14. Implementation Roadmap

### Phase 0: Baseline and deployment safety

- Confirm applied migration state in every environment.
- Capture current API contracts.
- Add monitoring for report and Office route failures.
- Add encoding checks.
- Establish test fixtures for schools, terms, invoices, curriculum, and reports.

### Phase 1: Integrity and security

- Canonicalize academic-period identity.
- Fix Finance/report contract tests.
- Restrict forced publication.
- Harden operations staff policies.
- Make duty handover atomic.
- Add optimistic report locking.

### Phase 2: Reliability

- Introduce source-query status accounting.
- Add report preflight.
- Expose curriculum detection failures.
- Add visible autosave recovery.
- Add Office freshness and stale states.

### Phase 3: Report lifecycle

- Introduce immutable revisions.
- Add audit events.
- Add publication comparison and withdrawal workflow.
- Bind PDFs to revisions with hashes.

### Phase 4: Structural refactor

- Split the report aggregator into source loaders.
- Split the report page into library, setup, editor, and preview routes/components.
- Centralize Office authorization and API contracts.
- Replace duplicated panel fetching with a consistent query layer.

### Phase 5: UX redesign

- Implement the Office sidebar/drawer structure.
- Build the prioritized Today queue.
- Implement the School Report guided workflow.
- Improve responsive behavior and accessibility.

### Phase 6: Advanced product features

- Collaboration and review workflow.
- Scheduled report readiness.
- Cross-term analytics.
- Office universal search and command palette.

---

## 15. Definition of Done

The work should not be considered complete until:

- One academic term has one canonical identifier across curriculum, reports, invoices, and billing.
- An existing invoice reliably opens and attaches to its matching report.
- Curriculum query failures cannot be mistaken for empty curriculum.
- Published revisions cannot be edited in place.
- Concurrent report edits cannot silently overwrite one another.
- Only administrators can approve documented completeness overrides.
- Duty handover cannot leave the office without a primary operator.
- Staff cannot modify protected operations fields directly.
- Every report source exposes freshness and success/failure status.
- Office counts display their freshness and stale state.
- The main Office navigation uses one clear hierarchy.
- Critical authorization, concurrency, publication, and detection paths have automated tests.
- Displayed UI text and PDFs contain no encoding corruption.

---

## 16. Recommended First Work Package

The first implementation package should remain narrowly focused:

1. Create the canonical academic-period contract.
2. Fix invoice deep-link and matching behavior.
3. Replace silent curriculum detection failure with diagnostics.
4. Restrict forced publication to administrators.
5. Add report optimistic locking.
6. Make duty handover atomic.
7. Harden operations staff database policies.
8. Add regression tests for all seven changes.

This package addresses the most serious integrity and workflow risks without prematurely redesigning every screen.

---

## 17. Final Recommendation

Do not begin with a cosmetic redesign alone. First stabilize the shared academic-period contract, source diagnostics, publication model, authorization, and concurrency behavior. Once those foundations are reliable, the Office Center and School Report interfaces can be simplified without preserving the current hidden failure modes.

The correct long-term direction is:

> **One canonical academic period, one accountable workflow, explicit source health, immutable publications, conflict-safe editing, and a much calmer interface.**

---

## 18. AI Implementation Specification

This section is the authoritative brief for another AI coding agent. Complete one reviewable work package at a time and do not broaden the rewrite without documenting why.

### Mandatory rules

1. Inspect `git status` and preserve unrelated changes.
2. Read every affected route, component, domain module, migration, and test before editing.
3. Trace changed values from database to API to client state to visible UI.
4. Enforce authorization on the server; hidden controls are not security.
5. Use database transactions and constraints for concurrent invariants.
6. Never convert unexpected database/network errors into empty successful results.
7. Do not add `any` in report, finance, Office, or authorization code.
8. Add tests in the same change as the behavior.
9. Create new migrations; never rewrite applied migrations.
10. Stop and report schema contradictions instead of guessing.
11. Run focused tests, relevant suites, type checking, and production build.
12. Document deployment order, backfills, verification queries, and remaining risks.

### Prohibited shortcuts

- No additional label-substring matching to fix invoices.
- No guessed dates or labels when `academic_term_id` exists.
- No empty `catch` blocks.
- No non-transactional duty handover.
- No mutation of published revisions.
- No client-only `forcePublish` authorization.
- No complete UI redesign before integrity/security corrections.
- No completion claim while required tests fail.

---

## 19. Work Package 1 ? Canonical Academic Period

Use one academic-term identity across Reports, Finance, invoices, billing, curriculum, URLs, and tests.

```ts
export type AcademicPeriodKey = {
  academicTermId: string;
  periodLabel: string; // 2026/2027
  startYear: string; // 2026
  termNumber: 1 | 2 | 3;
  termLabel: string;
};
```

Requirements:

- `academicTermId` is authoritative; other fields are validated or derived.
- Parsing and formatting live in one shared module.
- Invoice lookup uses school ID plus term ID before legacy metadata.
- Match opens directly; no match prefills one builder.
- Near matches appear before another invoice can be created.

Inspect `academic-period.ts`, `school-term.ts`, `invoice-match.ts`, `finance-links.ts`, `InvoicesPanel.tsx`, billing docs data route, and report aggregate.

Tests: year conversion, Term 1 versus Term 12, cross-year mismatch, term-ID precedence, existing-invoice opening, and correct no-match prefill.

Acceptance: no independent period parsing remains; UI distinguishes matched, near-match, and missing invoices.

---

## 20. Work Package 2 ? Curriculum Diagnostics

Required response:

```ts
type CurriculumRangeResponse =
  | { status: "detected"; data: SuggestedCurriculumRange }
  | { status: "no_tracking"; data: SuggestedCurriculumRange; message: string }
  | { status: "no_curriculum"; data: SuggestedCurriculumRange; message: string }
  | { status: "failed"; code: "QUERY_FAILED" | "SCHEMA_MISSING" | "ACCESS_DENIED"; message: string; retryable: boolean };
```

Validate school, term, and scope; check every Supabase error; never return a default after query failure. Render all states differently. Manual range entry is an override with a saved reason. Test every branch plus unauthorized access and client error persistence.

---

## 21. Work Package 3 ? Source Data Preflight

Every source must report its name, required/optional classification, `ok|empty|partial|failed` status, row count, truncation flag, check time, and message.

Split `aggregate.ts` into typed source loaders. Every loader returns data plus status, checks query errors, and reports caps. Required failures block publication; optional failures warn. Run preflight before AI generation and store the ledger in the revision.

Acceptance: every metric has a traceable source and no query failure becomes a zero metric.

---

## 22. Work Package 4 ? Immutable Report Revisions

Create a new revision table containing:

- Report ID and monotonically increasing revision number.
- Status: `working`, `published`, or `withdrawn`.
- Snapshot, narrative, design, and source ledger.
- Creator, publisher, publication time, and change reason.
- Final PDF SHA-256 hash.
- Unique `(report_id, revision_number)`.

Required invariants:

- At most one working revision exists per report.
- Published content cannot be updated.
- Editing published content creates the next working revision.
- Publication and the current-published pointer update atomically.
- PDF routes target a specific revision.
- School users can access published revisions only.

Backfill existing published rows to published revision 1 and drafts to working revision 1. The backfill must be idempotent and report before/after counts.

Tests must cover immutability, revision creation, stable historical PDFs, concurrent revision allocation, school access, and withdrawal history.

---

## 23. Work Package 5 ? Conflict-Safe Autosave

PATCH requests must include `expectedRevision`. Successful responses return the new revision and save timestamp. Stale requests return HTTP 409:

```json
{
  "error": "REPORT_CONFLICT",
  "message": "This report was updated by another staff member.",
  "currentRevision": 8,
  "updatedAt": "ISO_TIMESTAMP"
}
```

Required UI states:

- Saved
- Saving
- Unsaved
- Save failed
- Offline
- Conflict

On conflict, never overwrite automatically. Offer reload latest, copy local changes, and comparison where feasible.

Tests must cover successful saves, stale conflicts, visible failures, report switching, and out-of-order responses.

---

## 24. Work Package 6 ? Publication Authorization

| Action | Admin | Assigned teacher | School account |
|---|---:|---:|---:|
| Create/open working report | Yes | Yes | No |
| Edit working report | Yes | Yes | No |
| Publish complete report | Yes | Yes | No |
| Force-publish incomplete report | Yes, with reason | No | No |
| Withdraw publication | Yes, with reason | No | No |
| View published report | Yes | Yes | Own school only |
| Delete never-published draft | Yes | Creator only | No |

Server requirements:

- Derive roles from authenticated profiles; ignore client-supplied roles.
- Require a reason for forced publication or withdrawal.
- Write the audit event in the same transaction as the state change.
- Return 403 for unauthorized overrides.
- Implement every matrix row as an authorization test.

---

## 25. Work Package 7 ? Atomic Duty Handover

Implement a transactional database RPC that:

1. Validates the active, non-deleted staff member.
2. Locks active primary rows for the duty kind.
3. Supersedes the old primary.
4. Inserts the new duty assignment.
5. Records an audit event.
6. Returns the resulting duty snapshot.
7. Rolls back all steps on failure.

Revoke direct writes if constraints cannot independently prevent overlapping primary assignments.

Required tests:

- Successful handover replaces the primary.
- Insert failure leaves the previous primary active.
- Concurrent requests cannot create two effective primaries.
- Inactive/deleted staff cannot be assigned.
- Non-admin users cannot start duty.

---

## 26. Work Package 8 ? Operations Policy Hardening

Required changes:

- Revoke direct authenticated INSERT/UPDATE on `operations_staff_settings`.
- Permit reads only to active, non-deleted authorized staff.
- Route safe self-service changes through a validated API or narrow RPC.
- Teachers must never set `is_primary_admin`, `updated_by`, administrative notes, or protected routing fields.
- Add RLS/integration tests for administrator, teacher, inactive, deleted, and unauthorized users.

---

## 27. Work Package 9 ? Office Center Refactor

Use four top-level groups:

1. Today
2. Conversations
3. Relationships
4. Operations

Requirements:

- Use a desktop sidebar and mobile drawer; never stack horizontal tab rows.
- Use one cached Office summary query; Provider and Desk must not duplicate it.
- Invalidate the shared query explicitly after mutations.
- Expose loading, refreshing, stale, error, and last-updated states.
- Centralize `caseNeedsAttention()` using urgency, SLA, assignment, overdue action, delivery failure, or reopening.
- Today shows assigned, unassigned, overdue, failed delivery, duty coverage, prioritized actions, and recent activity.
- Preserve deep links and browser history.
- Support keyboard navigation, visible focus, semantic landmarks, `aria-current`, accessible badges, and status beyond color.
- Mobile must not require horizontal navigation scrolling.

Acceptance: one navigation hierarchy is visible, initial loading does not duplicate the summary request, and stale operational data is visibly labeled.

---

## 28. Work Package 10 ? School Report UI Refactor

Use these routes or equivalent deep-linkable states:

```text
/dashboard/school-reports
/dashboard/school-reports/new
/dashboard/school-reports/[id]
/dashboard/school-reports/[id]/preview
/dashboard/school-reports/[id]/history
```

Requirements:

- Library: search, period/status filters, pagination, owner, revision, update time, and active/published/archived views.
- Setup: canonical term selection, term-derived dates, preflight, curriculum resolution, invoice resolution, and explicit shared-book reuse.
- Editor: section navigation, persistent save status, data-quality drawer, comments, checklist, preview, and separate publication action.
- Analytics: separate area, virtualized or paginated learner tables, source/freshness labels, and protection of internal learner evidence.
- Each stage has one unambiguous primary action.

Acceptance: curriculum and invoice gaps are resolved before publication, browser navigation works, and editor, analytics, preview, and history are distinct work areas.

---

## 29. Required API Standard

Successful responses should contain `data` and metadata with a request ID and timestamp. Errors should contain a stable machine code, safe message, retryable flag, optional field errors, and request ID.

Rules:

- Use 401 for unauthenticated requests.
- Use 403 for authenticated but unauthorized requests.
- Use 409 for optimistic-lock and uniqueness conflicts.
- Validate request bodies with schemas.
- Never expose raw database or provider errors.
- Log diagnostic detail using the request ID.

---

## 30. Required Database Standard

Every new migration must:

- Use a new chronological file.
- Repair invalid legacy data before adding constraints.
- Be idempotent where practical.
- Add indexes for actual query shapes.
- Revoke unnecessary direct writes.
- Include active and non-deleted checks in policies.
- Document backfill, verification, and forward-repair steps.
- Regenerate database types.

Required invariants:

- One active report per school and academic term.
- One working revision per report.
- Published revisions are immutable.
- No conflicting primary duty ownership.
- Invoice association uses canonical school/term identity.
- Staff cannot self-promote through operations settings.

---

## 31. Required Observability

Add structured events for:

- Preflight start, completion, and failure.
- Report creation or existing-book reuse.
- Snapshot regeneration.
- Curriculum detection, default, override, and failure.
- Invoice match, near match, creation, and relinking.
- Autosave failure and conflict.
- Publication, forced publication, withdrawal, and deletion.
- Duty handover success and failure.
- Office summary refresh failure and stale state.

Do not unnecessarily log learner records, report narratives, credentials, payment details, or message bodies.

---

## 32. Required Test Matrix

### Roles

- Active administrator
- Assigned teacher
- Unassigned teacher
- Same-school school account
- Other-school school account
- Inactive user
- Deleted user
- Unauthenticated request

### Report and data states

- No report, working draft, incomplete draft, complete draft
- Published revision, newer working revision, withdrawn, archived
- Empty results, empty attendance, no curriculum, no tracking
- Query failure, matching invoice, near match, legacy duplicates, no invoice
- Query limit reached

### Office states

- Empty queue
- Unassigned case
- Overdue case
- Restricted case
- Failed delivery
- Stale summary
- Duty present
- Duty gap
- Concurrent handover

### Responsive verification

- 360px mobile
- 768px tablet
- 1024px desktop
- 1440px large desktop

---

## 33. Required AI Execution Order

1. Inspect schema, migrations, tests, and current worktree.
2. Establish canonical academic-period tests.
3. Implement the shared academic-period contract.
4. Fix invoice association and deep links.
5. Implement curriculum diagnostics.
6. Add the preflight/source ledger.
7. Restrict publication overrides.
8. Harden operations policies.
9. Make duty handover atomic.
10. Add optimistic locking and autosave conflict handling.
11. Add immutable revisions and backfill.
12. Refactor School Report module boundaries.
13. Refactor Office queries and navigation.
14. Verify accessibility and responsive layouts.
15. Run focused tests, broader tests, type checking, and production build.

Each step must remain separately reviewable. Do not combine integrity work and the complete visual redesign into one patch.

---

## 34. Required AI Completion Report

The implementing AI must return:

```md
# Implementation Result

## Completed work package
## Behavior changed
## Database migrations
## API contract changes
## UI changes
## Authorization changes
## Tests added or updated
## Verification commands and results
## Existing unrelated changes preserved
## Deployment order
## Remaining risks or follow-up work
```

It must identify every test or verification step not run and explain why. It must not claim completion while required migrations, tests, or acceptance criteria remain unresolved.


## Implemented consolidation — Finance and School Reports

### Finance target structure

- **Today:** action queue only; no invoice creation or historical reporting.
- **Invoices:** the single invoice and receipt workspace. School-term invoices atomically create or reuse their canonical billing cycle.
- **Collections:** payment proofs, approvals, reminders, and outstanding balances.
- **Reconciliation:** ledger exceptions and settlements for administrators.
- **Reports:** summaries and generated finance documents.
- **Settings:** accounts, subscription rules, automation controls, and reminder policy.

The former top-level Billing workspace is removed. Legacy `workspace=billing`, school-billing, subscription, notification, and dashboard links are routed to Invoices or Settings. Billing cycles remain an internal finance record used by invoices, payments, reminders, overdue promotion, and rollover.

### School Report target structure

- **Library:** search, status/term filtering, creation, and report opening.
- **Report:** editing, live preview, completeness/readiness, publish/withdraw controls, and team comments.
- **Insights:** analytics, learner roster, source freshness, and cross-term comparison.
- **Output:** school-safe view, PDF layout, email, download, and data-quality inspection.
- **Activity:** immutable revisions, override reasons, hashes, and audit events.

The repeated workflow rail was removed from report subpages. Comments were moved out of Revision History and placed beside the working report. Readiness remains at the publish boundary. History no longer mixes collaboration with immutable audit records.

### Canonical school invoice transaction

The migration `20260921000006_school_term_invoice_billing_cycle.sql` adds `billing_cycles.academic_term_id`, enforces one active cycle per school and academic term, and introduces `create_school_term_invoice_atomic`. The RPC serializes concurrent creation, rejects duplicate active invoices, creates or reuses the term cycle, links the invoice, records automation metadata, and safely adopts only unambiguous legacy invoices.

### Deployment boundary

These application and migration changes are implemented and verified locally. Applying the Supabase migrations and deploying the application are separate production actions. Until deployment, the live UI still uses the previously deployed navigation and invoice behavior.
### Completed secondary Finance simplification

- Staff **Today** now stops at actionable counts and destination cards; staff payment history remains in Reports. Payers retain their personal payment history on Today.
- **Invoices / Receipts** are presented as one Invoice Documents workspace with a compact document-type filter rather than two competing destinations.
- **Collections** is presented as one queue with filters for pending payments, proof review, and all records. Outstanding follow-up is an expandable queue inside the same workspace.
- **Settings** now opens one subsection at a time: Accounts, Plans & Pricing, or Automation. Subscription pricing belongs to Plans & Pricing; reminder rules belong to Automation.
- **School invoice documents** moved from Reports to an expandable section inside Invoices. Reports now owns summaries, historical invoice reporting, exports, and archived school statements only.