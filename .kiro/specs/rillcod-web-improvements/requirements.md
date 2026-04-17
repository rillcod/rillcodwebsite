# Requirements Document

## Introduction

Rillcod Academy is a Nigerian EdTech platform serving students, teachers, parents, and school administrators primarily in Benin City and across Nigeria. The web application is built with Next.js 14 App Router (TypeScript), Supabase (Postgres, Auth, Storage, Realtime), Cloudflare R2 for file storage, Paystack and Stripe for payments, SendPulse for transactional email, web-push (VAPID) for browser push notifications, and Socket.IO for real-time features.

This document captures requirements for improving the existing web application by closing confirmed gaps identified in a codebase audit and adding new features aligned with the mobile application roadmap. All requirements are web-only and do not apply to the mobile application. SMS is not used; all notification delivery is via SendPulse email or VAPID web push.

## Glossary

- **Web_App**: The Rillcod Academy Next.js 14 web application served to browsers.
- **API_Route**: A Next.js API route handler located under `src/app/api/**/route.ts`.
- **Portal_User**: A registered user in the `portal_users` table, which may be a student, teacher, parent, or school admin.
- **School_Admin**: A Portal_User with the `school_admin` role scoped to a specific school.
- **SendPulse**: The third-party SMTP API service used for all transactional email delivery via `notificationsService.sendEmail()`.
- **Paystack**: The primary Nigerian payment gateway used for invoice payments and registration fees.
- **Stripe**: The secondary international payment gateway also integrated with webhook handling.
- **Supabase**: The hosted Postgres + Auth + Storage + Realtime backend used by the Web_App.
- **RLS**: Row-Level Security policies enforced by Supabase Postgres on all user-facing tables.
- **VAPID**: Voluntary Application Server Identification — the web push standard used for browser push notifications.
- **Web_Push_Subscription**: A browser-issued push subscription object (endpoint + keys) stored per Portal_User per device.
- **CBT_Session**: A record in `cbt_sessions` representing one student's attempt at a CBT exam.
- **CBT_Exam**: A configured exam in the `cbt_exams` table with questions, duration, and grading settings.
- **Gamification_Service**: The `gamificationService` in `src/services/gamification.service.ts` responsible for awarding XP points and badges.
- **Point_Transaction**: A record in `point_transactions` representing a single XP award event for a Portal_User.
- **Analytics_Service**: The `analyticsService` in `src/services/analytics.service.ts` responsible for at-risk detection and reporting.
- **Notification_Preference**: A record in `notification_preferences` controlling which channels and categories a Portal_User receives.
- **Lesson_Plan**: A structured teaching plan linked to a course, class, and term, stored in the `lesson_plans` table.
- **Curriculum**: A school-scoped, versioned document defining the subject content for a term or year.
- **Term_Scheduler**: A Next.js cron route mechanism that releases weekly content automatically on Monday mornings.
- **SM2**: The SuperMemo 2 spaced repetition algorithm used for flashcard review scheduling.
- **Consent_Form**: A digital form created by an admin or teacher, assigned to parents for digital signature.
- **Portfolio**: A student's collection of submitted work, projects, and achievements viewable on the Web_App.
- **Share_Token**: A time-limited (30-day) opaque UUID token granting public read-only access to a Portfolio.
- **Timetable_Slot**: A record in the timetable table representing a scheduled class period for a subject, teacher, and room.
- **Support_Ticket**: A record in the support tickets table representing a user-submitted help request.
- **Instalment_Plan**: A payment plan splitting an invoice into 2 or 3 scheduled partial payments.
- **WAT**: West Africa Time (UTC+1), the timezone used for all scheduled jobs and time-sensitive operations.
- **Cursor_Pagination**: A pagination strategy using `(created_at, id)` as a cursor instead of OFFSET for stable, performant list queries.
- **Maintenance_Mode**: A system state flag in `system_settings` that, when active, blocks Web_App access with an overlay.
- **Minimum_Web_Version**: A semver string in `system_settings` compared against the deployed Web_App version to prompt hard refresh.


## Requirements

### Requirement 1: Web Push Subscription Table

**User Story:** As a Portal_User, I want my browser push notification subscriptions stored in a dedicated database table, so that notifications reach all my devices reliably and stale subscriptions are cleaned up automatically.

#### Acceptance Criteria

1. THE Web_App SHALL store each Web_Push_Subscription in a dedicated `web_push_subscriptions` table with columns: `id`, `portal_user_id`, `endpoint TEXT UNIQUE`, `subscription_json JSONB`, `device_hint TEXT`, `created_at`, `updated_at`.
2. THE `web_push_subscriptions` table SHALL have RLS policies restricting each Portal_User to read and delete only their own rows, and SHALL have an index on `portal_user_id`.
3. WHEN a Portal_User grants push notification permission, THE Web_App SHALL upsert the Web_Push_Subscription via POST to `/api/push/subscribe`; WHEN a Portal_User unsubscribes, THE Web_App SHALL DELETE the row via DELETE to `/api/push/unsubscribe`.
4. WHEN sending a push notification results in an HTTP 410 Gone or 404 Not Found response from the push service, THE `push.ts` module SHALL delete the corresponding row from `web_push_subscriptions`.
5. IF the POST to `/api/push/subscribe` fails due to a network or server error, THEN THE Web_App SHALL retry up to 3 times with exponential backoff before surfacing an error to the user.
6. THE Web_App SHALL include a migration that reads all `push_sub_{userId}` key-value entries from `system_settings`, inserts them into `web_push_subscriptions`, and deletes the legacy keys from `system_settings`.
7. THE `push.ts` module SHALL query `web_push_subscriptions` by `portal_user_id` to retrieve all subscriptions for a given user before dispatching a push notification.

### Requirement 2: CBT Server-Side Deadline Enforcement

**User Story:** As a School_Admin or teacher, I want CBT submissions rejected server-side if they arrive after the exam deadline, so that students cannot gain extra time by manipulating their browser clock.

#### Acceptance Criteria

1. THE `cbt_sessions` table SHALL have a `deadline TIMESTAMPTZ` column populated on session creation as `start_time + (duration_minutes * interval '1 minute')`.
2. WHEN a student POSTs a submission to `/api/cbt/sessions`, THE API_Route SHALL compare `submitted_at` against `deadline` and return HTTP 422 with `{ "error": "DEADLINE_EXCEEDED", "deadline": "<ISO8601>" }` if `submitted_at > deadline + 30 seconds`.
3. WHEN a CBT_Session's client-side countdown reaches zero and the student has not submitted, THE Web_App SHALL automatically POST the most recently auto-saved answers to `/api/cbt/sessions/[id]` with `{ "auto_submitted": true }`.
4. THE CBT taking page SHALL display a countdown timer showing seconds remaining until `deadline`, refreshed every second using the server-authoritative `deadline` value.
5. WHEN fewer than 5 minutes remain until `deadline`, THE Web_App SHALL display a prominent warning banner on the CBT taking page.
6. IF the auto-submit POST returns HTTP 422 DEADLINE_EXCEEDED, THEN THE Web_App SHALL display a deadline-expired message and prevent further submission attempts.


### Requirement 3: CBT Periodic Auto-Save

**User Story:** As a student, I want my in-progress CBT answers saved to the server every 60 seconds, so that I do not lose my work if my browser crashes or network drops.

#### Acceptance Criteria

1. THE Web_App SHALL provide a `PATCH /api/cbt/sessions/[id]` endpoint that accepts a partial answers payload and persists it to the `answers JSONB` column on the `cbt_sessions` row, only for sessions with `status = 'in_progress'`.
2. THE CBT taking page SHALL automatically PATCH the current answers to `/api/cbt/sessions/[id]` every 60 seconds while the session is in progress.
3. WHEN an auto-save PATCH succeeds, THE Web_App SHALL display a "Saved at HH:MM" indicator reflecting the UTC time of the last successful save.
4. WHEN an auto-save PATCH fails due to a network error, THE Web_App SHALL retain the answers in memory and retry the PATCH every 30 seconds until it succeeds or the session is submitted.
5. IF the auto-save PATCH returns HTTP 422 with `"error": "DEADLINE_EXCEEDED"`, THEN THE Web_App SHALL stop retrying auto-saves and trigger the auto-submit flow defined in Requirement 2.

### Requirement 4: Gamification Idempotency Guard

**User Story:** As a student, I want XP points awarded exactly once per activity, so that server retries or duplicate events do not inflate my score or leaderboard rank.

#### Acceptance Criteria

1. THE `point_transactions` table SHALL have a UNIQUE constraint on `(portal_user_id, activity_type, reference_id)`.
2. WHEN `gamificationService.awardPoints()` is called, THE Gamification_Service SHALL execute `INSERT INTO point_transactions ... ON CONFLICT (portal_user_id, activity_type, reference_id) DO NOTHING`.
3. THE Gamification_Service SHALL recalculate a Portal_User's `total_points` as `SELECT SUM(points) FROM point_transactions WHERE portal_user_id = $1` on each award, rather than incrementing a stored counter.
4. WHEN `awardPoints()` is called with a duplicate `(portal_user_id, activity_type, reference_id)`, THE Gamification_Service SHALL return without error and without modifying `total_points`.
5. THE Web_App SHALL include a migration that recalculates `total_points` for all existing Portal_Users from the sum of their Point_Transactions to correct any inflated values.

### Requirement 5: Enhanced At-Risk Student Detection

**User Story:** As a School_Admin or teacher, I want at-risk student detection to use login inactivity, attendance, and overdue assignment signals together, so that I can identify struggling students before they fall too far behind.

#### Acceptance Criteria

1. THE `get_at_risk_students` Postgres RPC function SHALL flag a student as at-risk if ANY of the following signals apply: (a) no login recorded in the last 7 days, (b) attendance rate below 70% in the last 30 days, (c) 2 or more overdue unsubmitted assignments.
2. THE `get_at_risk_students` function SHALL return a `triggered_signals JSONB` array per student row indicating which conditions fired (e.g., `["no_login", "low_attendance", "overdue_assignments"]`).
3. WHEN `analyticsService.getAtRiskStudents()` is called by a teacher, THE Analytics_Service SHALL scope results to only students in classes assigned to that teacher.
4. THE at-risk students UI panel SHALL display the `triggered_signals` values as labelled badges alongside each student's name.
5. WHILE a school has no students meeting any at-risk signal, THE at-risk panel SHALL display an empty-state message rather than an error or empty table.


### Requirement 6: Payment Webhook Atomicity

**User Story:** As a School_Admin, I want Paystack webhook processing to be atomic, so that payment records and invoice statuses are always consistent even if a partial failure occurs mid-update.

#### Acceptance Criteria

1. THE Paystack webhook handler SHALL wrap the `payment_transactions` update and the `invoices` status update in a single Postgres transaction executed via a Supabase RPC function; IF the invoice update fails, THE RPC SHALL roll back the `payment_transactions` update.
2. THE `payment_transactions` table SHALL have a UNIQUE constraint on `transaction_reference` enforced at the database level.
3. WHEN a Paystack webhook is received, THE API_Route SHALL check whether a `payment_transactions` row with the same `transaction_reference` already exists; IF it does, THE API_Route SHALL return HTTP 200 without reprocessing the payload.
4. IF Paystack webhook signature verification fails, THEN THE API_Route SHALL return HTTP 401, log the failure with the raw request body, and not process the payload.
5. WHEN the atomic RPC completes successfully, THE API_Route SHALL return HTTP 200 to Paystack within 5 seconds of receiving the webhook.

### Requirement 7: Per-Endpoint Rate Limiting for Public Routes

**User Story:** As a School_Admin, I want registration and payment initiation endpoints protected by tighter rate limits, so that the platform is not abused by spam registrations or payment fraud attempts.

#### Acceptance Criteria

1. THE API_Route at `/api/public/student` SHALL enforce a rate limit of 10 requests per 60 seconds per client IP address.
2. THE API_Route at `/api/payments/registration` SHALL enforce a rate limit of 3 requests per 5 minutes keyed on the email address submitted in the request body.
3. WHEN any per-endpoint rate limit is exceeded, THE API_Route SHALL return HTTP 429 with `{ "error": "Too many requests. Please wait before trying again.", "retryAfter": <seconds> }`.
4. THE rate limit counters for both endpoints SHALL use Upstash Redis with an in-memory map fallback, consistent with the existing `rateLimitProxy` pattern.
5. IF a rate-limited request is retried after `retryAfter` seconds have elapsed, THEN THE API_Route SHALL process it normally without applying any additional penalty.

### Requirement 8: Notification Preference Categories Expansion

**User Story:** As a Portal_User, I want granular notification preferences for payments, reports, attendance, and weekly summaries, so that I only receive alerts that matter to me.

#### Acceptance Criteria

1. THE `notification_preferences` table SHALL have four new columns added via migration: `payment_updates BOOLEAN DEFAULT true`, `report_published BOOLEAN DEFAULT true`, `attendance_alerts BOOLEAN DEFAULT true`, `weekly_summary BOOLEAN DEFAULT true`.
2. THE `preferencesService` SHALL be updated to read and write all four new columns alongside existing columns.
3. THE `updatePrefsSchema` used by the preferences API_Route SHALL be updated to accept and validate all four new fields.
4. WHEN `notificationsService.sendEmail()` is called for a categorised notification, THE Notifications_Service SHALL check the corresponding preference column (e.g., `payment_updates` for payment emails) and skip sending with a warning log if the preference is `false`.
5. WHEN a new Portal_User row is inserted, THE Web_App SHALL insert a corresponding `notification_preferences` row with all columns set to their defaults.
6. THE notification preferences settings page SHALL expose toggles for all four new categories alongside existing ones.


### Requirement 9: Error Boundary Coverage for All Dashboard Routes

**User Story:** As a Portal_User, I want render errors on any dashboard page contained and reported without crashing the whole application, so that I can recover without a full page reload and errors are logged for investigation.

#### Acceptance Criteria

1. THE dashboard layout file SHALL wrap its `children` with the existing `ErrorBoundary` component so that all routes under `/dashboard` are covered.
2. WHEN the `ErrorBoundary` catches an error via `componentDidCatch`, THE Web_App SHALL invoke a server action that writes an `activity_logs` row containing the error message, component stack, and Portal_User id.
3. IF the Web_App is running in production mode, THEN THE error UI SHALL NOT display raw stack traces; it SHALL display a user-friendly message such as "Something went wrong on this page."
4. THE error UI SHALL include a "Try Again" button that resets the ErrorBoundary state and re-renders the failed subtree.
5. WHEN the "Try Again" button is clicked, THE Web_App SHALL attempt to re-render the route without navigating away from the current page.

### Requirement 10: Cursor-Based Pagination on Heavy Lists

**User Story:** As a Portal_User, I want large lists like transactions, invoices, leaderboard, and activity logs to load in pages of 20, so that the dashboard remains responsive on large datasets and does not time out.

#### Acceptance Criteria

1. THE API_Routes for transactions, invoices, leaderboard, and activity logs SHALL replace all `.limit(200)` and `.limit(500)` queries with cursor-based pagination using a cursor composed of `(created_at DESC, id DESC)`.
2. WHEN a client requests a paginated list without a cursor, THE API_Route SHALL return the first 20 rows ordered by `created_at DESC, id DESC`.
3. WHEN a client requests with a cursor value, THE API_Route SHALL return the next 20 rows where `(created_at, id) < (cursor_created_at, cursor_id)`.
4. EACH paginated API_Route response SHALL include a `nextCursor` field that is `null` when no further rows exist.
5. THE Web_App list pages for all four endpoints SHALL display a "Load More" button that appends the next page using the returned `nextCursor`; pulling to refresh or navigating back SHALL reset the cursor to the first page.

### Requirement 11: Maintenance Mode and Minimum Version Check

**User Story:** As a School_Admin, I want the Web_App to display a maintenance overlay during downtime and a refresh banner when a new version is deployed, so that users are not confused by a stale or broken UI.

#### Acceptance Criteria

1. THE Web_App SHALL provide a publicly accessible API_Route at `GET /api/system/status` that returns `{ maintenance_mode: boolean, minimum_web_version: string }` read from `system_settings`; this route SHALL require no authentication.
2. THE Web_App SHALL poll `/api/system/status` on every dashboard page load and every 60 seconds thereafter while the tab is visible.
3. WHEN `maintenance_mode` is `true`, THE Web_App SHALL display a full-screen blocking overlay with a maintenance message and hide all dashboard content.
4. WHEN the deployed Web_App version is lower than `minimum_web_version`, THE Web_App SHALL display a non-blocking top banner with a "Refresh" button that triggers a hard reload.
5. WHEN `maintenance_mode` transitions from `true` to `false` on a subsequent poll, THE Web_App SHALL automatically dismiss the blocking overlay without requiring a manual reload.
6. THE Web_App SHALL pause the status poll while the browser tab is hidden, using the Page Visibility API, and resume polling when the tab becomes visible again.


### Requirement 12: Support Ticket Dashboard Page

**User Story:** As a Portal_User, I want a support ticket page in the dashboard so that I can create, track, and reply to help requests without leaving the platform.

#### Acceptance Criteria

1. THE Web_App SHALL provide a `/dashboard/support` page accessible to all authenticated Portal_Users.
2. THE `/dashboard/support` page SHALL list the Portal_User's own tickets showing: ticket id, subject, status, and `created_at`.
3. WHEN a Portal_User submits the create-ticket form with a subject and description, THE Web_App SHALL POST to `/api/support` and display the new ticket in the list immediately.
4. WHEN a ticket is created, THE Web_App SHALL send an acknowledgement email via `notificationsService.sendEmail()` using SendPulse to the ticket creator within 60 seconds.
5. WHEN a Portal_User selects a ticket, THE Web_App SHALL display the full thread of messages in chronological order; WHEN a reply is submitted, THE Web_App SHALL POST to `/api/support/[id]` and append the message without a full page reload.
6. WHEN a staff member replies to a ticket, THE Web_App SHALL send an email notification via SendPulse to the ticket creator.
7. WHERE the logged-in Portal_User has the `school_admin` role, THE `/dashboard/support` page SHALL also display all tickets submitted by Portal_Users within their school.

### Requirement 13: Timetable Slot Conflict Detection

**User Story:** As a School_Admin or teacher, I want timetable slots checked for teacher and room conflicts on both client and server before saving, so that no teacher or room is ever double-booked.

#### Acceptance Criteria

1. WHEN a user fills in a new Timetable_Slot form, THE Web_App SHALL perform client-side conflict detection against the loaded timetable data, checking for same `teacher_id`, `room`, `day_of_week`, and `period` overlap before the form is submitted.
2. WHEN a client-side conflict is detected, THE Web_App SHALL display an inline warning listing the conflicting slot and prevent form submission until resolved.
3. WHEN a POST request is made to the timetable API_Route, THE API_Route SHALL invoke a Postgres function `check_timetable_conflicts` via Supabase RPC before inserting the row.
4. IF `check_timetable_conflicts` detects a teacher overlap, THEN THE API_Route SHALL return HTTP 409 with `{ "error": "TEACHER_CONFLICT", "conflictingSlot": { ... } }`.
5. IF `check_timetable_conflicts` detects a room overlap, THEN THE API_Route SHALL return HTTP 409 with `{ "error": "ROOM_CONFLICT", "conflictingSlot": { ... } }`.
6. THE timetable grid UI SHALL visually flag any Timetable_Slots that conflict with each other using a warning indicator such as a red border or warning icon.

### Requirement 14: Queue Service Email-Only Enforcement

**User Story:** As a developer, I want the notification queue restricted to email jobs only, so that no SMS or WhatsApp jobs are dispatched on a platform that does not support those channels.

#### Acceptance Criteria

1. THE `NotificationJob` type in `queue.service.ts` SHALL be restricted to `type: 'email'` only; the `'sms'` and `'whatsapp'` union members SHALL be removed.
2. THE `process-notifications` cron route SHALL only dispatch jobs of type `'email'` and SHALL discard any jobs of other types with a `console.warn` log.
3. IF a legacy `sms` or `whatsapp` job is found in the Redis queue at cron execution time, THEN THE cron handler SHALL log a warning with the job id and discard it without processing.
4. THE `queueService` SHALL NOT expose any method that creates a job with `type: 'sms'` or `type: 'whatsapp'`.
5. THE TypeScript compiler SHALL produce a type error if any call site attempts to enqueue a job with a type other than `'email'` after the type change.


### Requirement 15: Lesson Plan Term Generator

**User Story:** As a teacher or School_Admin, I want to create term-level lesson plans with week-by-week structure and AI generation, so that I can plan a full term in one workflow rather than editing per-lesson notes manually.

#### Acceptance Criteria

1. THE `/dashboard/lesson-plans` page SHALL be redesigned to support term-level plans; the creation form SHALL accept: course, class, school, term, `start_date`, `end_date`, `sessions_per_week`, and an optional curriculum reference.
2. WHEN a term plan form is submitted, THE Web_App SHALL POST to `/api/lesson-plans` (or the existing route with new fields) and save the plan with `plan_data JSONB` containing week-by-week structure and `status = 'draft'`.
3. WHEN AI generation is triggered from the lesson plan form, THE Web_App SHALL POST to `/api/ai/generate` and populate `plan_data` with AI-produced week entries.
4. THE lesson plan detail page SHALL allow inline editing of individual week entries within `plan_data` before publishing.
5. THE lesson plan detail page SHALL support PDF export of the plan via browser print.
6. THE lesson plan record SHALL support `status` values of `draft`, `published`, and `archived`, with version history maintained on each edit.
7. WHERE a `curriculum_version_id` is linked to a lesson plan, THE lesson plan detail page SHALL display the linked curriculum title and version number.

### Requirement 16: Session Token Expiry Handling

**User Story:** As a Portal_User, I want a warning before my session expires and a silent refresh if I am active, so that I am not unexpectedly signed out in the middle of work.

#### Acceptance Criteria

1. THE auth context SHALL monitor the Supabase JWT `exp` claim and display a non-blocking banner "Session expiring soon — Stay signed in" when fewer than 5 minutes remain until expiry.
2. WHEN a Portal_User interacts with the page within 60 seconds of the expiry banner appearing, THE Web_App SHALL silently call `supabase.auth.refreshSession()` to extend the session without interrupting the user.
3. IF `supabase.auth.refreshSession()` fails, THEN THE Web_App SHALL sign the Portal_User out and redirect to `/login` with a query parameter or flash message: "Your session has expired."
4. WHEN any API_Route returns HTTP 401, THE Web_App SHALL attempt one silent `supabase.auth.refreshSession()` before retrying the original request; IF the retry also returns 401, THE Web_App SHALL redirect to `/login`.
5. THE session expiry logic SHALL be implemented in a shared auth hook or context so it applies consistently across all dashboard pages.

### Requirement 17: File Upload Validation and Compression

**User Story:** As a Portal_User, I want client-side file validation and image compression before upload, so that invalid files are rejected early and storage costs are kept low.

#### Acceptance Criteria

1. THE Web_App SHALL validate files client-side before upload: maximum size 10 MB; allowed MIME types: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`; violations SHALL display an inline field-level error without a modal alert.
2. WHEN an image file (`image/jpeg`, `image/png`, `image/webp`) is selected for upload, THE Web_App SHALL compress it to a maximum width of 1200 px at quality 0.75 using the browser Canvas API before sending to the upload API_Route.
3. THE compression step SHALL run before the 10 MB size check so that a large image that compresses below 10 MB is accepted.
4. PDF files SHALL bypass the compression step and be uploaded as-is after passing the size and MIME type validation.
5. THE upload API_Route SHALL enforce the same MIME type and size constraints server-side and return HTTP 400 with a structured error if validation fails.


### Requirement 18: Input Validation Hardening

**User Story:** As a Portal_User, I want form fields to enforce valid email addresses, Nigerian phone numbers, and business rules on invoices and CBT exams, so that bad data is caught before it reaches the server.

#### Acceptance Criteria

1. THE Web_App SHALL implement a `validateEmail()` utility that enforces RFC 5322 simplified regex and apply it to all auth and registration form email fields, displaying inline field-level errors on violation.
2. THE Web_App SHALL implement a `validateNigerianPhone()` utility that accepts 11 digits starting with `0` OR `+234` followed by 10 digits and apply it to all registration forms with a phone number field, displaying inline errors on violation.
3. THE invoice editor SHALL require at least one line item with a positive amount and SHALL reject a due date that is in the past, displaying inline errors for each violation.
4. THE CBT exam editor SHALL require at least one question and a passing score between 1 and 100 inclusive, displaying inline errors on violation.
5. THE save/submit buttons on the affected forms SHALL remain disabled until all field-level validations pass.
6. THE same validation rules SHALL be enforced server-side in the relevant API_Routes, returning `{ "error": "<message>", "field": "<fieldName>" }` on violation.

### Requirement 19: Search Input Debouncing

**User Story:** As a Portal_User, I want search and filter inputs to wait until I stop typing before querying, so that the dashboard does not make excessive database calls on every keystroke.

#### Acceptance Criteria

1. THE Web_App SHALL implement a reusable `useDebounce` React hook that accepts a value and a delay in milliseconds and returns the debounced value only after the delay has elapsed with no further changes.
2. THE default debounce delay SHALL be 300 ms.
3. THE `useDebounce` hook SHALL be applied to all search and filter inputs across all dashboard pages that currently trigger filter or query calls on each change event.
4. WHEN the search input is cleared to an empty string, THE Web_App SHALL bypass the debounce delay and reset the filter immediately.
5. THE `useDebounce` hook SHALL be a pure utility with no side effects, returning only the debounced value.

### Requirement 20: Audit Log for Manual Finance Actions

**User Story:** As a compliance officer or School_Admin, I want every manual finance status change and rejected duplicate payment logged, so that there is a full audit trail for financial operations.

#### Acceptance Criteria

1. WHEN a finance admin manually changes the `status` of a `payment_transactions` row, THE Web_App SHALL write an `audit_logs` row with: `actor_id`, `resource_type = 'payment_transaction'`, `resource_id`, `old_value`, `new_value`, `action = 'status_change'`, `created_at`.
2. WHEN a bank transfer proof is submitted for an invoice that already has `payment_status = 'completed'`, THE API_Route SHALL return HTTP 409 with `{ "error": "ALREADY_PAID" }` and write an `audit_logs` row recording the attempt.
3. THE `audit_logs` table SHALL enforce that `actor_id` references `portal_users.id` and `created_at` defaults to `NOW()`.
4. THE finance admin UI SHALL NOT expose a way to delete or modify `audit_logs` rows.
5. WHILE a Portal_User has the `school_admin` role, THE Web_App SHALL allow filtering `audit_logs` by `resource_type = 'payment_transaction'` and by `created_at` date range within their school scope.


### Requirement 21: Notification Deep-Link Routing

**User Story:** As a Portal_User, I want tapping a push notification to navigate me directly to the relevant page, so that I do not have to search for the related content after receiving the alert.

#### Acceptance Criteria

1. THE `push.ts` module SHALL include a `url` field in every push notification payload pointing to the relevant dashboard page.
2. THE routing map for the `url` field SHALL be: `payment_confirmed` → `/dashboard/payments/invoices/[id]`; `report_published` → `/dashboard/results/[id]`; `assignment_graded` → `/dashboard/assignments/[id]`; `support_ticket` → `/dashboard/support/[id]`; `announcement` → `/dashboard/notifications`; `streak_reminder` → `/dashboard/learning`.
3. THE service worker notification click handler SHALL read `notification.data.url` and call `clients.openWindow(url)` to navigate the browser to the specified route on notification click.
4. IF `notification.data.url` is absent or null, THEN THE service worker SHALL navigate to `/dashboard` as a fallback.
5. THE `url` field SHALL be constructed server-side using the relevant resource `id` at the time the notification is dispatched.

### Requirement 22: Structured API Error Responses

**User Story:** As a developer, I want all API routes to return consistent structured JSON error objects, so that clients can reliably parse and display errors without encountering HTML error pages or raw exception messages.

#### Acceptance Criteria

1. ALL API_Routes SHALL return errors as JSON objects with shape `{ "error": string, "code"?: string, "field"?: string }` and never as HTML or plain text.
2. THE `withApiProxy` error handler SHALL catch all subclasses of `AppError` (including `ValidationError`, `AuthError`, `RateLimitError`) from `src/lib/errors.ts` and map them to the correct HTTP status code.
3. IF a `ValidationError` is thrown, THEN THE API_Route SHALL include the `field` property in the error response body identifying the invalid field.
4. IF the Web_App is running in production mode, THEN THE API_Route error handler SHALL NOT include raw stack traces in any response body.
5. WHEN any API_Route throws an unhandled exception, THE `withApiProxy` wrapper SHALL catch it, log it server-side, and return HTTP 500 with `{ "error": "An unexpected error occurred." }`.

### Requirement 23: Portfolio Public Share Link

**User Story:** As a student, I want to generate a time-limited public link to my portfolio so that prospective employers or institutions can view my work without needing a platform account.

#### Acceptance Criteria

1. WHEN a student POSTs to `/api/portfolio/share`, THE API_Route SHALL generate a UUID token stored in `portal_users.portfolio_share_token` and `portal_users.portfolio_share_token_expires_at = NOW() + 30 days`, and return the public URL `/student/[token]`.
2. THE Web_App SHALL provide a public Next.js route at `/student/[token]` that renders a read-only portfolio view without requiring authentication.
3. WHEN `/student/[token]` is requested and `portfolio_share_token_expires_at` is in the past or the token does not exist, THE Web_App SHALL return HTTP 410 Gone with a "This link has expired" message.
4. WHEN a student DELETEs `/api/portfolio/share`, THE API_Route SHALL set `portfolio_share_token = null` and `portfolio_share_token_expires_at = null`; subsequent requests to the former URL SHALL return HTTP 410.
5. THE student portfolio page SHALL display the active share URL with its expiry date, a "Copy Link" button using the Clipboard API, a "Share" button using the Web Share API where available, and a "Revoke Link" button.
6. THE portfolio page SHALL show "No active share link" when `portfolio_share_token` is null.


### Requirement 24: Email Idempotency Guard in Notifications Service

**User Story:** As a developer, I want the notifications service to suppress duplicate emails for the same event within a short window, so that retry logic or duplicate webhook deliveries do not result in repeated emails to users.

#### Acceptance Criteria

1. WHEN `notificationsService.sendEmail()` is called, THE Notifications_Service SHALL compute a SHA-256 hash of `recipient_email + event_type + reference_id` and use it as an idempotency key in Redis with a 10-minute TTL.
2. IF the idempotency key already exists in Redis, THEN THE Notifications_Service SHALL skip the send and log a suppression warning with the key and recipient.
3. IF the idempotency key does not exist, THE Notifications_Service SHALL set it in Redis before dispatching, then dispatch via SendPulse.
4. WHEN SendPulse returns a non-2xx response, THE Notifications_Service SHALL retry once after 30 seconds; IF the retry also fails, THE service SHALL log the failure and not retry further.
5. THE `'sms'` and `'whatsapp'` job types SHALL be removed from `queueService` as specified in Requirement 14; the idempotency guard SHALL apply only to `'email'` jobs.

### Requirement 25: API Route Authorization Consistency

**User Story:** As a developer, I want all data-mutating API routes protected by `withApiProxy` with explicit role checks, so that no admin-only endpoint is accidentally accessible without authentication or authorization.

#### Acceptance Criteria

1. ALL API_Routes under `src/app/api` that create, update, or delete data SHALL use `withApiProxy` with `requireAuth: true` and an explicit `roles[]` array matching the permitted Portal_User roles.
2. THE following routes SHALL be explicitly documented as intentionally public (no auth): `/api/system/status`, `/api/payments/webhook`.
3. THE admin-only endpoints for billing health, sync-users, and system settings SHALL be updated to include `roles: ['admin']` in their `withApiProxy` configuration if not already present.
4. WHEN an authenticated Portal_User calls an API_Route for which their role is not in `roles[]`, THE API_Route SHALL return HTTP 403 with `{ "error": "Forbidden" }`.
5. WHEN an unauthenticated request is made to a route with `requireAuth: true`, THE API_Route SHALL return HTTP 401 with `{ "error": "Unauthorized" }`.


## New Features

### Requirement NF-1: AI Homework Helper

**User Story:** As a student, I want to chat with an AI tutor scoped to my enrolled courses for step-by-step guidance, so that I can get help on coursework without leaving the platform.

#### Acceptance Criteria

1. THE Web_App SHALL provide a `/dashboard/homework-helper` page (or Homework Helper tab on `/dashboard/learning`) accessible only to students with at least one enrolled course.
2. WHEN a student sends a message, THE Web_App SHALL POST to `/api/ai/homework-helper` with `{ message, enrolled_course_ids, history[] }` and stream the AI response via server-sent events (SSE).
3. THE API_Route SHALL scope the AI prompt to content from the student's `enrolled_course_ids` only and SHALL NOT expose content from other courses.
4. WHEN a question is outside the scope of the student's enrolled courses, THE API_Route SHALL respond with a polite redirect message rather than attempting to answer.
5. IF the SSE stream fails, THE Web_App SHALL display an inline retry button without clearing the conversation history.
6. THE conversation history SHALL be maintained in React state for the current browser session only and SHALL NOT be persisted to the database.

### Requirement NF-2: Auto-Issued Completion Certificates

**User Story:** As a student, I want to automatically receive a completion certificate when I finish all lessons and pass the CBT exam for a course, so that my achievement is recognised without manual admin action.

#### Acceptance Criteria

1. WHEN a student completes all lessons in a course AND achieves a passing score on the associated CBT_Exam, THE Web_App SHALL automatically generate a PDF certificate and store it in Cloudflare R2.
2. THE certificate issuance SHALL be triggered by a Supabase database function or webhook that fires when both completion conditions are met.
3. THE `certificates` table SHALL have a UNIQUE constraint on `(portal_user_id, course_id)`; IF a certificate already exists for that pair, THEN THE generation process SHALL skip issuance without creating a duplicate.
4. WHEN a certificate is generated, THE Web_App SHALL send a `report_published`-category email via SendPulse to the student and to any linked parent, including a download link to the R2 file.
5. THE student dashboard SHALL display all issued certificates with a "Download" button linking to the R2 signed URL.
6. THE parent linked to a student SHALL also see the certificate notification in the `report_published` category.

### Requirement NF-3: Peer Study Groups

**User Story:** As a student, I want to create or join a peer study group with real-time chat and a shared code pad, so that I can collaborate with classmates on coursework in real time.

#### Acceptance Criteria

1. THE Web_App SHALL provide `study_groups` (id, name, course_id, created_by, created_at), `study_group_members` (group_id, user_id, joined_at), and `study_group_messages` (id, group_id, sender_id, content, created_at) tables with RLS.
2. THE Web_App SHALL provide a `/dashboard/study-groups` page where students can create, browse, and join groups scoped to their enrolled courses; each group SHALL have a maximum of 20 members.
3. WHEN a student sends a chat message, THE Web_App SHALL insert it into `study_group_messages` and broadcast it via Supabase Realtime to all active group members.
4. THE study group page SHALL include a shared plain-text code pad with JavaScript and Python syntax highlighting; edits SHALL be broadcast via Supabase Realtime with last-write-wins conflict resolution.
5. WHEN a course ends, THE Web_App SHALL set associated study groups to inactive so they no longer appear in active group lists.
6. WHILE a Portal_User has the `teacher` or `school_admin` role, THE Web_App SHALL grant read-only access to study group messages without allowing participation in chat.


### Requirement NF-4: Flashcard / Spaced Repetition System

**User Story:** As a student, I want to study flashcard decks linked to my lessons using SM-2 spaced repetition, so that I retain lesson content efficiently over time.

#### Acceptance Criteria

1. THE Web_App SHALL provide `flashcard_decks` (id, title, lesson_id, course_id, created_by), `flashcard_cards` (id, deck_id, front, back, position), and `flashcard_reviews` (id, card_id, student_id, next_review_at, interval_days, ease_factor, repetitions) tables with RLS.
2. THE Web_App SHALL provide a `/dashboard/flashcards` page where students can browse decks linked to their enrolled lessons and start a review session.
3. WHEN a student rates a card after reveal, THE Web_App SHALL apply the SM-2 algorithm to compute `next_review_at`, `interval_days`, `ease_factor`, and `repetitions` using the initial parameters `ease_factor = 2.5` and minimum `ease_factor = 1.3`.
4. WHEN a card is rated with quality < 3 (Again), THE SM-2 algorithm SHALL reset `repetitions = 0` and set `next_review_at = NOW() + interval '1 day'`.
5. WHEN a student opens the flashcard review page, THE Web_App SHALL surface only cards where `next_review_at <= NOW()`.
6. IF a student has no cards due for review, THEN THE Web_App SHALL display a "No cards due" message showing the date of the next scheduled review.
7. THE teacher lesson editor SHALL include a flashcard deck section allowing teachers to add front/back card pairs linked to that lesson.

### Requirement NF-5: Student Learning Streak Reminder

**User Story:** As a student, I want to receive a VAPID push notification at 18:00 WAT if I have not done any learning activity that day, so that I am reminded to keep my streak going.

#### Acceptance Criteria

1. THE Web_App SHALL provide a Next.js cron route that runs daily at 17:00 UTC (18:00 WAT), authenticated via a `CRON_SECRET` header check.
2. THE cron job SHALL identify students who have no lesson completion, flashcard review, or CBT session recorded for the current calendar day (WAT).
3. WHEN a student is identified as having no activity, THE Web_App SHALL send a VAPID push notification to all rows in `web_push_subscriptions` for that student with title "Keep your streak going!" and body personalised with the student's first name.
4. THE `notification_preferences` table SHALL have a `streak_reminder BOOLEAN DEFAULT true` column added via migration; THE cron job SHALL only send to students where `streak_reminder = true`.
5. IF a student has no rows in `web_push_subscriptions`, THEN THE cron job SHALL skip that student without logging an error.
6. WHEN push dispatch returns HTTP 410 or 404 for a subscription, THE cron job SHALL delete that row from `web_push_subscriptions` per Requirement 1.

### Requirement NF-6: Parent-Teacher Direct Chat

**User Story:** As a parent, I want to send direct messages to my child's teachers so that I can discuss progress without scheduling a formal meeting.

#### Acceptance Criteria

1. THE Web_App SHALL provide `parent_teacher_threads` (id, parent_id, teacher_id, student_id, created_at) and `parent_teacher_messages` (id, thread_id, sender_id, body, sent_at, is_read) tables with RLS.
2. THE `/dashboard/messages` page SHALL allow a parent to initiate a thread with any teacher assigned to their child's class and view all existing threads in a teacher inbox section.
3. WHEN a message is sent, THE Web_App SHALL insert it into `parent_teacher_messages` and broadcast it via Supabase Realtime to the recipient's active session.
4. THE Web_App SHALL display an unread badge on the messages nav item when `is_read = false` messages exist for the logged-in Portal_User, without requiring a page reload.
5. THE messages page SHALL load messages using Cursor_Pagination (50 per page) and support a "Load Earlier" button for older messages.
6. WHEN a teacher receives a new parent message, THE Web_App SHALL send an `email_enabled`-category email via SendPulse to the teacher if `notification_preferences.email_enabled = true`.


### Requirement NF-7: Weekly Student Summary Email to Parents

**User Story:** As a parent, I want to receive a weekly email summary of my child's learning activity every Friday, so that I can stay informed without logging in each day.

#### Acceptance Criteria

1. THE Web_App SHALL provide a Next.js cron route that runs every Friday at 17:00 UTC (18:00 WAT), authenticated via a `CRON_SECRET` header check.
2. THE cron job SHALL query parents where `notification_preferences.weekly_summary = true` and who have at least one linked student.
3. WHEN compiling the summary, THE cron job SHALL include for each linked student: lessons completed that week, assignments submitted, CBT scores, attendance rate, and current XP total.
4. THE cron job SHALL send the weekly summary via `notificationsService.sendEmail()` using the `weekly_summary` preference category and include a direct link to the parent dashboard.
5. THE cron job SHALL use an idempotency guard keyed on `(parent_email, week_start_date)` using Redis with a 7-day TTL to prevent duplicate sends within the same week.
6. WHEN a parent has no linked student with any activity that week, THE summary email SHALL still be sent with a "No activity this week" section to encourage re-engagement.

### Requirement NF-8: Digital Consent Forms

**User Story:** As a School_Admin or teacher, I want to create digital consent forms and collect parent signatures, so that I can manage activity permissions without paper forms.

#### Acceptance Criteria

1. THE Web_App SHALL provide `consent_forms` (id, school_id, title, body, created_by, due_date, created_at) and `consent_responses` (id, form_id, parent_id, signed_at) tables with RLS; a UNIQUE constraint on `(form_id, parent_id)` SHALL prevent double-signing.
2. THE Web_App SHALL provide a `/dashboard/consent-forms` page accessible to School_Admins and teachers for creating, publishing, and viewing response summaries.
3. WHEN a consent form is published, THE Web_App SHALL send a `report_published`-category email via SendPulse to all parents in the school with a link to the signing page.
4. WHEN a parent clicks "I Agree" on the signing page, THE Web_App SHALL insert a row into `consent_responses` with `signed_at = NOW()`.
5. IF a parent attempts to sign a form they have already signed, THEN THE Web_App SHALL display a "You have already signed this form" message and return HTTP 409.
6. WHEN a School_Admin clicks "Export Responses", THE Web_App SHALL generate and stream a CSV file of all `consent_responses` for that form including parent name, email, and `signed_at`.

### Requirement NF-9: Instalment Payment Plans UI

**User Story:** As a parent, I want to pay school fees in 2 or 3 instalments, so that I can manage large fee payments within my monthly budget.

#### Acceptance Criteria

1. THE invoice detail page SHALL display a "Pay in Instalments" option for invoices where the school has enabled instalment plans.
2. WHEN a parent selects "Pay in Instalments", THE Web_App SHALL present options to split into 2 or 3 equal instalments with computed due dates and require that the sum of instalments equals the invoice total.
3. WHEN a parent confirms an instalment plan, THE Web_App SHALL POST to `/api/billing/settlements` to create the instalment schedule; the server SHALL verify the instalment sum equals the invoice total before saving.
4. THE parent dashboard SHALL display each instalment with amount, due date, and status (pending, paid, overdue).
5. WHEN an instalment is 3 days from its due date, THE Web_App SHALL send a `payment_updates`-category email via SendPulse to the parent.
6. WHEN a Paystack webhook confirms an instalment payment, THE Web_App SHALL update the instalment status to "paid" and send a payment confirmation email via SendPulse.


### Requirement NF-10: Payment Receipt PDF Download

**User Story:** As a parent or School_Admin, I want to download a PDF receipt for any completed payment, so that I have a document for accounting or reimbursement purposes.

#### Acceptance Criteria

1. THE invoices and transactions pages SHALL display a "Download Receipt" button for each transaction with `payment_status = 'completed'`.
2. WHEN a user clicks "Download Receipt", THE Web_App SHALL POST to `/api/payments/receipt/[transactionId]`, which generates a PDF using the `pdfmake` library already imported in `payments.service.ts`.
3. THE PDF SHALL include: school name, student name, invoice number, amount paid, payment date, transaction reference, and receipt number.
4. THE API_Route SHALL return the PDF as `Content-Type: application/pdf` with `Content-Disposition: attachment; filename="receipt-[transactionId].pdf"`.
5. IF the transaction does not belong to the requesting Portal_User's school or parent-student relationship, THEN THE API_Route SHALL return HTTP 403 with `{ "error": "Forbidden" }`.

### Requirement NF-11: Outstanding Balance Widget on Parent Dashboard

**User Story:** As a parent, I want to see my total outstanding school fee balance prominently on my dashboard, so that I am always aware of what I owe without navigating to the invoices page.

#### Acceptance Criteria

1. THE parent `/dashboard/overview` page SHALL display an "Outstanding Balance" card showing the total unpaid invoice amount across all linked students.
2. THE card SHALL break down the balance per student if a parent has more than one linked student, and display an overdue invoice count.
3. WHEN the outstanding balance is zero, THE card SHALL display "All fees paid" with a green visual indicator and no "Pay Now" button.
4. WHEN the outstanding balance is greater than zero, THE card SHALL display a "Pay Now" button that navigates to `/dashboard/parent-invoices` filtered to unpaid invoices.
5. THE widget data SHALL be fetched from a new `/api/billing/outstanding` API_Route and cached client-side for 5 minutes; THE widget SHALL auto-refresh on dashboard load.
6. THE `/api/billing/outstanding` API_Route SHALL require `requireAuth: true` and scope results to the linked students of the requesting Portal_User.

### Requirement NF-12: AI Termly Lesson Plan Generator (Enhanced)

**User Story:** As a teacher or School_Admin, I want to generate a full term's lesson plan using AI with school, class, and curriculum context, so that generated plans are tailored and ready to activate with the Term Scheduler.

#### Acceptance Criteria

1. THE lesson plan creation form SHALL accept: course, class, school, term, `start_date`, `end_date`, `sessions_per_week`, and an optional `curriculum_version_id` reference.
2. WHEN AI generation is triggered, THE Web_App SHALL POST to `/api/ai/generate` embedding the selected curriculum content as structured context; WHEN generation completes, THE Web_App SHALL save the plan with `plan_data JSONB` containing week-by-week entries.
3. THE lesson plan detail page SHALL display three action buttons: "Generate All Lessons", "Generate All Assignments", and "Generate All Projects", each with a progress indicator.
4. THE lesson plan detail page SHALL include an "Activate Scheduler" button that creates or activates a `term_schedules` row for the plan.
5. THE lesson plan detail page SHALL support inline week editing of individual entries in `plan_data`.
6. THE lesson plan detail page SHALL support PDF export via browser print.
7. THE lesson plan record SHALL support `status` values of `draft`, `published`, and `archived`; regeneration of a `published` plan SHALL archive the existing record before creating the new draft.


### Requirement NF-13: Student Portfolio Public Share Link

**User Story:** As a student, I want to generate a public share link to my portfolio so that prospective employers or institutions can view my work without a platform account.

#### Acceptance Criteria

1. WHEN a student POSTs to `/api/portfolio/share`, THE API_Route SHALL generate a UUID token, store it in `portal_users.portfolio_share_token` and set `portal_users.portfolio_share_token_expires_at = NOW() + 30 days`, and return the public URL `/student/[token]`.
2. THE Web_App SHALL provide a public Next.js route at `/student/[token]` that renders a read-only portfolio view without requiring authentication.
3. WHEN `/student/[token]` is requested and the token is expired or not found, THE Web_App SHALL return HTTP 410 Gone with a "This link has expired" message.
4. WHEN a student DELETEs `/api/portfolio/share`, THE API_Route SHALL set both `portfolio_share_token` and `portfolio_share_token_expires_at` to null; subsequent requests to the former URL SHALL return HTTP 410.
5. THE student portfolio page SHALL display: the active share URL with expiry date, a "Copy Link" button (Clipboard API), a "Share" button (Web Share API where available), and a "Revoke Link" button.
6. THE portfolio page SHALL display "No active share link" when `portfolio_share_token` is null.

### Requirement NF-14: Timetable Conflict Detection (Feature Entry Point)

**User Story:** As a School_Admin or teacher, I want the timetable system to detect teacher and room conflicts on both client and server before saving a slot, so that scheduling errors are caught before they affect students.

#### Acceptance Criteria

1. THE Web_App SHALL implement client-side and server-side conflict detection as specified in Requirement 13, including the `check_timetable_conflicts` Postgres RPC function.
2. THE timetable grid view SHALL visually flag any existing Timetable_Slots that conflict with each other using a warning indicator.
3. WHEN a user edits an existing Timetable_Slot and the change introduces a conflict, THE Web_App SHALL apply the same client-side and server-side detection flow as for a new slot.
4. THE server-side HTTP 409 conflict error SHALL be displayed inline on the timetable form without navigating away from the page.
5. WHEN a conflict is resolved by the user and the form is re-submitted, THE Web_App SHALL clear any previous conflict error messages before sending the new request.

### Requirement NF-15: Announcement Composer

**User Story:** As a School_Admin, I want to compose and publish announcements to selected audiences from the dashboard, so that I can communicate with students, parents, or teachers without using external tools.

#### Acceptance Criteria

1. THE `/dashboard/announcements` page SHALL provide a "New Announcement" button opening a composer form accepting: title, body (rich text via textarea), audience (all / students / parents / teachers / specific class), and optional `expires_at` date.
2. THE composer form SHALL support saving as a draft (`status = 'draft'`) without publishing.
3. WHEN a School_Admin publishes an announcement, THE Web_App SHALL POST to `/api/announcements`, set `status = 'published'`, and create in-app notification records for all Portal_Users in the selected audience.
4. WHEN an announcement is published, THE Web_App SHALL send an email via SendPulse to all Portal_Users in the audience where `notification_preferences.email_enabled = true` and `notification_preferences.announcement_notifications = true`.
5. THE announcements list page SHALL display status badges (Draft, Published, Expired) and allow editing drafts or archiving published announcements.
6. WHEN an announcement's `expires_at` date is reached, THE Web_App SHALL hide it from the Portal_User notification feed without deleting the record.


### Requirement NF-16: AI Curriculum Generator per Course

**User Story:** As a School_Admin, I want to generate and version a curriculum per course scoped to my school, so that each school's content is tailored and reusable as a reference for lesson plan generation.

#### Acceptance Criteria

1. THE Web_App SHALL provide a `/dashboard/curriculum` page accessible to School_Admins with a "Generate Curriculum" form accepting: course name, grade level, school, term count, weeks per term, subject area, and optional notes.
2. WHEN the form is submitted, THE Web_App SHALL POST to `/api/ai/generate` and save the result to a new `course_curricula` table (id, course_id, school_id, content JSONB, version INT, created_by, created_at, updated_at) with a UNIQUE constraint on `(course_id, school_id)`.
3. WHEN a curriculum is first created for a `(course_id, school_id)` pair, THE Web_App SHALL set `version = 1`; WHEN an existing curriculum is edited and republished, THE Web_App SHALL increment `version` and save the new content.
4. THE curriculum detail page SHALL display the current `version` number and a version history list showing each past version's `version_number`, `created_by`, and `created_at`.
5. IF the AI generation API call fails, THEN THE Web_App SHALL display an error notification and SHALL NOT save a partial curriculum to `course_curricula`.
6. WHEN a teacher creates a Lesson_Plan and selects a curriculum reference, THE Web_App SHALL allow selecting from active curricula in the teacher's school, storing `curriculum_version_id` on the `lesson_plans` row.

### Requirement NF-17: AI Lesson Plan Generator with Class/School/Curriculum Context

**User Story:** As a teacher or School_Admin, I want the AI lesson plan generator to embed school, class, and curriculum context into its prompt and support per-class customisation, so that generated plans are fully tailored and archived safely on regeneration.

#### Acceptance Criteria

1. THE lesson plan generation form SHALL accept `school_id`, `class_id`, `course_id`, term start and end dates, `sessions_per_week`, and an optional `curriculum_version_id`.
2. WHEN a `curriculum_version_id` is provided, THE API_Route SHALL embed the full curriculum `content` JSONB into the AI prompt as structured context.
3. WHEN a Lesson_Plan with `status = 'published'` is regenerated, THE Web_App SHALL set the existing plan's `status = 'archived'` before creating the new plan as `status = 'draft'`, preserving audit history.
4. THE lesson plan record SHALL store a `curriculum_version_id FK` linking to `course_curricula` when a curriculum was used for generation.
5. THE lesson plan detail page SHALL expose a per-week teacher notes field alongside AI-generated content for instructor customisation.
6. IF the AI generation API call exceeds 30 seconds, THE Web_App SHALL display a timeout error and SHALL NOT persist a partial plan to `lesson_plans`.

### Requirement NF-18: Bulk Lesson Generation from Term Plan

**User Story:** As a teacher or School_Admin, I want to generate all lessons for a published term plan in one action, so that a full term's lesson library is populated without creating each lesson individually.

#### Acceptance Criteria

1. WHEN a Lesson_Plan has `status = 'published'`, THE lesson plan detail page SHALL display a "Generate All Lessons" button.
2. WHEN the button is clicked, THE Web_App SHALL iterate each week entry in `plan_data` and POST to `/api/ai/generate` per session topic, saving each result as a `status = 'draft'` lesson linked to the Lesson_Plan.
3. WHILE bulk generation is in progress, THE Web_App SHALL display a progress indicator ("Generating lesson 3 of 12…") updated per completed item.
4. IF generation of an individual lesson fails, THE Web_App SHALL log the failure, skip that item, and continue processing remaining weeks without halting the batch.
5. WHEN bulk generation completes, THE Web_App SHALL display a summary notification showing how many lessons were generated and how many were skipped.
6. THE generated draft lessons SHALL require explicit teacher approval (setting `status = 'published'`) before being visible to students.


### Requirement NF-19: Bulk Assignment Generation from Term Plan

**User Story:** As a teacher or School_Admin, I want to generate all assignments for a published term plan in one action, so that due dates and topics are pre-populated and consistent with the lesson schedule.

#### Acceptance Criteria

1. WHEN a Lesson_Plan has `status = 'published'`, THE lesson plan detail page SHALL display a "Generate All Assignments" button alongside the bulk lesson button.
2. WHEN the button is clicked, THE Web_App SHALL iterate each week entry in `plan_data` and POST to `/api/ai/generate` per assignment topic, saving each result as a `status = 'draft'` assignment linked to the Lesson_Plan with a `due_date` derived from the week's scheduled end date.
3. WHILE bulk generation is in progress, THE Web_App SHALL display a progress indicator updated per completed item.
4. IF generation of an individual assignment fails, THE Web_App SHALL log the failure, skip that item, and continue the batch.
5. WHEN bulk generation completes, THE Web_App SHALL display a summary notification showing success and skip counts.
6. THE generated draft assignments SHALL require explicit teacher approval before being made visible to students.

### Requirement NF-20: Bulk Project Generation from Term Plan

**User Story:** As a teacher or School_Admin, I want to generate all projects for a published term plan in one action, so that term-level projects are scaffolded and linked to the correct content clusters.

#### Acceptance Criteria

1. WHEN a Lesson_Plan has `status = 'published'`, THE lesson plan detail page SHALL display a "Generate All Projects" button alongside the other bulk generation buttons.
2. WHEN the button is clicked, THE Web_App SHALL identify major content clusters in `plan_data` and POST to `/api/ai/generate` for each, saving results as `status = 'draft'` projects linked to the Lesson_Plan.
3. WHILE bulk generation is in progress, THE Web_App SHALL display a progress indicator updated per completed item.
4. IF generation of an individual project fails, THE Web_App SHALL log the failure, skip that item, and continue the batch.
5. WHEN bulk generation completes, THE Web_App SHALL display a summary notification showing success and skip counts.
6. THE generated draft projects SHALL require explicit teacher approval before being released to students.

### Requirement NF-21: Automated Weekly Content Release (Term Scheduler)

**User Story:** As a School_Admin or teacher, I want approved term content released automatically each Monday, so that students always have timely access to the current week's material without manual intervention.

#### Acceptance Criteria

1. THE Web_App SHALL provide a `term_schedules` table with columns: `id`, `lesson_plan_id`, `school_id`, `is_active BOOLEAN DEFAULT false`, `current_week INT DEFAULT 1`, `term_start DATE`, `cadence_days INT DEFAULT 7`, `created_at`, `updated_at`.
2. THE Web_App SHALL provide a cron route at `POST /api/cron/term-scheduler` running Monday 05:00 UTC (06:00 WAT), authenticated via a `CRON_SECRET` header.
3. WHEN the cron runs, THE handler SHALL query all `term_schedules` rows where `is_active = true`, compute the current week's lessons/assignments/projects from `plan_data`, and set their `status = 'published'` and `published_at = NOW()`.
4. AFTER releasing content for a schedule, THE handler SHALL increment `term_schedules.current_week` by 1.
5. WHEN a School_Admin toggles the scheduler off for a plan, THE Web_App SHALL set `term_schedules.is_active = false` and the cron SHALL skip that schedule on subsequent runs.
6. THE lesson plan detail page SHALL include a "Scheduler" section showing `current_week`, active/paused state, and a "Release Now" button that POSTs to `/api/lesson-plans/[id]/release-week` for immediate release without waiting for the cron.


### Requirement NF-22: Auto-Grading with Manual Override

**User Story:** As a teacher, I want MCQ, true/false, and fill-in-the-blank submissions graded automatically and essay submissions surfaced with AI suggestions for my review, so that grading is fast and I retain full control.

#### Acceptance Criteria

1. THE `assignments` and `cbt_exams` tables SHALL have a `grading_mode` column with allowed values `auto`, `ai_assisted`, `manual`; `assignment_submissions` SHALL also store the inherited `grading_mode` from the parent.
2. WHEN a submission is received with `grading_mode = 'auto'`, THE API_Route SHALL compute the grade immediately for objective question types (MCQ, true/false, fill-in-the-blank) and store it with `status = 'graded'`.
3. WHEN a submission is received with `grading_mode = 'ai_assisted'`, THE API_Route SHALL POST to `/api/ai/generate` with `type = 'cbt-grading'`, store `ai_suggested_grade` and `ai_suggested_feedback` on the submission, set `status = 'pending_review'`, and NOT expose the grade to the student.
4. THE grading UI SHALL display `ai_suggested_grade`, `ai_suggested_feedback`, and a confidence indicator alongside a teacher override input for each `ai_assisted` submission.
5. WHEN a teacher clicks "Accept AI Grade", THE Web_App SHALL set `final_grade = ai_suggested_grade`, `grading_mode = 'auto'`, and `status = 'graded'`.
6. WHEN a teacher overrides with a different grade, THE Web_App SHALL set `final_grade` to the teacher's value, `grading_mode = 'manual'`, `status = 'graded'`, and write an `audit_logs` row with actor id, AI suggested grade, final grade, and UTC timestamp.
7. THE student SHALL only see `final_grade` and feedback when `status = 'graded'`.

### Requirement NF-23: Unified Grading Screen

**User Story:** As a School_Admin or teacher, I want a unified grading interface scoped to my role, so that I can efficiently review, grade, and bulk-action submissions in my purview.

#### Acceptance Criteria

1. THE Web_App SHALL provide a `/dashboard/grading` page accessible to Portal_Users with the `admin`, `school_admin`, or `teacher` role.
2. WHILE the logged-in Portal_User has the `admin` role, THE grading page SHALL display submissions across all schools.
3. WHILE the logged-in Portal_User has the `school_admin` role, THE grading page SHALL display only submissions within their assigned school.
4. WHILE the logged-in Portal_User has the `teacher` role, THE grading page SHALL display only submissions for assignments and CBT_Exams that the teacher created or is assigned to.
5. THE grading page SHALL support a bulk grade action that applies a grade to all selected submissions of the same assignment at once.
6. WHEN any grade is saved on the grading page, THE Web_App SHALL write an `audit_logs` row capturing `actor_id`, submission id, old grade, new grade, and UTC timestamp.
7. THE grading page SHALL display a grading mode badge per submission row.

### Requirement NF-24: Grading Mode Toggle

**User Story:** As a teacher or School_Admin, I want to select a default grading mode when creating an assignment or CBT exam, so that submissions are handled consistently according to the item's grading approach.

#### Acceptance Criteria

1. THE assignment editor page SHALL include a grading mode selector with options `auto`, `ai_assisted`, and `manual`.
2. THE CBT exam editor page SHALL include the same grading mode selector.
3. WHEN a submission is created, THE Web_App SHALL inherit the `grading_mode` from the parent assignment or CBT_Exam and store it on the submission record.
4. WHERE the logged-in Portal_User has the `admin` role, THE grading view SHALL allow overriding `grading_mode` on a per-submission basis.
5. WHEN a student submits, THE Web_App SHALL display a confirmation message: "Your submission will be automatically graded" for `auto`, or "Your submission will be reviewed by your teacher" for `ai_assisted` and `manual`.
6. THE grading mode SHALL be visible as a badge on each submission row in the grading list view.

### Requirement NF-25: Term Content Dashboard

**User Story:** As a School_Admin or teacher, I want a per-week content dashboard for each term plan showing draft, approved, and released counts with quick actions, so that I can track progress and take action without extra navigation.

#### Acceptance Criteria

1. THE lesson plan detail page SHALL include a "Content Dashboard" tab displaying a table with one row per week in `plan_data`, showing: week number, topic, draft count, approved count, released count, and a per-row progress bar calculated as `released_count / total_items_for_week`.
2. THE Content Dashboard SHALL provide "Release Now", "Edit", and "Regenerate" quick-action buttons per row.
3. WHEN "Release Now" is clicked on a row, THE Web_App SHALL immediately publish that week's approved content via `POST /api/lesson-plans/[id]/release-week` with the week number in the body.
4. WHEN "Regenerate" is clicked on a row, THE Web_App SHALL POST to the relevant bulk generation endpoint scoped to that single week's content.
5. WHILE the logged-in Portal_User has the `teacher` role, THE Content Dashboard SHALL scope visible weeks and items to that teacher's assigned courses and classes.
6. WHERE the logged-in Portal_User has the `school_admin` or `admin` role, THE Content Dashboard SHALL include a school selector allowing the admin to view content dashboards for any school they manage.
7. THE overall progress bar at the top of the Content Dashboard SHALL display the percentage of weeks that are fully released across the term.
