# Implementation Plan: Rillcod Academy Web Improvements

## Overview

Incremental implementation across 7 phases: database migrations → core infrastructure → gap fixes (Req 1–25) → new features (NF-1–NF-8) → new features (NF-9–NF-15) → autonomous term engine (NF-16–NF-25) → property-based tests. Each phase builds on the previous; no orphaned code.

---

## Tasks

### Phase 1: Database Migrations

- [x] 1. Create `web_push_subscriptions` migration
  - Write `supabase/migrations/20260501000001_web_push_subscriptions.sql`: CREATE TABLE with id, portal_user_id, endpoint UNIQUE, subscription_json JSONB, device_hint, created_at, updated_at; CREATE INDEX on portal_user_id; RLS policies (users read/delete own, service_role all); migration block that SELECTs `push_sub_%` keys from `system_settings`, INSERTs into `web_push_subscriptions`, DELETEs legacy keys
  - _Requirements: Req 1.1, 1.2, 1.6_

- [x] 2. Create `cbt_sessions.deadline` generated column migration
  - Write `supabase/migrations/20260501000002_cbt_sessions_deadline.sql`: ALTER TABLE cbt_sessions ADD COLUMN deadline TIMESTAMPTZ GENERATED ALWAYS AS (start_time + (duration_minutes \* INTERVAL '1 minute')) STORED
  - _Requirements: Req 2.1_

- [x] 3. Create `point_transactions` unique constraint + backfill migration
  - Write `supabase/migrations/20260501000003_point_transactions_unique.sql`: ADD CONSTRAINT uq_pt_user_activity_ref UNIQUE (portal_user_id, activity_type, reference_id); UPDATE portal_users SET total_points = (SELECT COALESCE(SUM(points),0) FROM point_transactions WHERE portal_user_id = portal_users.id)
  - _Requirements: Req 4.1, 4.5_

- [x] 4. Create `payment_transactions.transaction_reference` unique constraint migration
  - Write `supabase/migrations/20260501000004_payment_transactions_unique.sql`: ADD CONSTRAINT uq_payment_transactions_reference UNIQUE (transaction_reference)
  - _Requirements: Req 6.2_

- [x] 5. Create notification preference columns migration
  - Write `supabase/migrations/20260501000005_notification_prefs_columns.sql`: ADD COLUMN payment_updates BOOLEAN DEFAULT TRUE, report_published BOOLEAN DEFAULT TRUE, attendance_alerts BOOLEAN DEFAULT TRUE, weekly_summary BOOLEAN DEFAULT TRUE, streak_reminder BOOLEAN DEFAULT TRUE
  - _Requirements: Req 8.1, NF-5.4_

- [x] 6. Create grading mode columns migration
  - Write `supabase/migrations/20260501000006_grading_mode_columns.sql`: ADD grading_mode to assignments, cbt_exams, assignment_submissions; ADD ai_suggested_grade NUMERIC(5,2), ai_suggested_feedback TEXT to assignment_submissions
  - _Requirements: NF-22, NF-23_

- [x] 7. Create study groups tables migration
  - Write `supabase/migrations/20260501000007_study_groups.sql`: CREATE TABLE study_groups, study_group_members (PK composite), study_group_messages with indexes; RLS policies scoping to enrolled students and read-only for teachers/admins
  - _Requirements: NF-3.1_

- [x] 8. Create flashcard tables migration
  - Write `supabase/migrations/20260501000008_flashcards.sql`: CREATE TABLE flashcard_decks, flashcard_cards, flashcard_reviews with UNIQUE (card_id, student_id) and index idx_fr_student_review; RLS policies
  - _Requirements: NF-4.1_

- [x] 9. Create parent-teacher chat tables migration
  - Write `supabase/migrations/20260501000009_parent_teacher_chat.sql`: CREATE TABLE parent_teacher_threads with UNIQUE (parent_id, teacher_id, student_id), parent_teacher_messages with index idx_ptm_thread_sent; RLS policies
  - _Requirements: NF-6.1_

- [x] 10. Create consent forms tables migration
  - Write `supabase/migrations/20260501000010_consent_forms.sql`: CREATE TABLE consent_forms, consent_responses with UNIQUE (form_id, parent_id); RLS policies
  - _Requirements: NF-8.1_

- [x] 11. Enhance `lesson_plans` table migration
  - Write `supabase/migrations/20260501000011_lesson_plans_enhanced.sql`: ADD COLUMN IF NOT EXISTS plan_data JSONB DEFAULT '{}', status TEXT DEFAULT 'draft' CHECK (...), version INT DEFAULT 1, curriculum_version_id UUID, term_start DATE, term_end DATE, sessions_per_week INT
  - _Requirements: Req 15.2, NF-12.1_

- [x] 12. Create `course_curricula` table migration
  - Write `supabase/migrations/20260501000012_course_curricula.sql`: CREATE TABLE with UNIQUE (course_id, school_id); RLS scoped to school_admin of matching school
  - _Requirements: NF-16.2_

- [ ] 13. Create `term_schedules` table migration
  - Write `supabase/migrations/20260501000013_term_schedules.sql`: CREATE TABLE with index idx_ts_active WHERE is_active = TRUE; RLS
  - _Requirements: NF-21.1_

- [x] 14. Create portfolio share token columns migration
  - Write `supabase/migrations/20260501000014_portfolio_share_token.sql`: ALTER TABLE portal_users ADD COLUMN portfolio_share_token TEXT, portfolio_share_token_expires_at TIMESTAMPTZ
  - _Requirements: Req 23.1, NF-13.1_

- [x] 15. Create `audit_logs` RLS + FK migration
  - Write `supabase/migrations/20260501000015_audit_logs_rls.sql`: ADD CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES portal_users(id); ALTER COLUMN created_at SET DEFAULT NOW(); ENABLE RLS; CREATE POLICY school_admin select own school
  - _Requirements: Req 20.3, Req 20.4_

- [x] 16. Create `get_at_risk_students` RPC migration
  - Write `supabase/migrations/20260501000016_at_risk_rpc.sql`: CREATE OR REPLACE FUNCTION get_at_risk_students(school_id UUID, class_id UUID) returning table with triggered_signals JSONB array containing 'no_login', 'low_attendance', 'overdue_assignments' signals; teacher scoping via class_id filter
  - _Requirements: Req 5.1, 5.2, 5.3_

- [x] 17. Create `check_timetable_conflicts` function migration
  - Write `supabase/migrations/20260501000017_check_timetable_conflicts.sql`: CREATE OR REPLACE FUNCTION check_timetable_conflicts(slot JSONB) checking teacher_id+day_of_week+period overlap and room+day_of_week+period overlap; returns conflict type and conflicting slot data
  - _Requirements: Req 13.3, 13.4, 13.5_

- [x] 18. Create `process_payment_atomic` RPC migration
  - Write `supabase/migrations/20260501000018_process_payment_atomic.sql`: CREATE OR REPLACE FUNCTION process_payment_atomic(reference TEXT, invoice_id UUID, amount NUMERIC) wrapping payment_transactions upsert + invoices status update in a single transaction with ROLLBACK on failure
  - _Requirements: Req 6.1_


---

### Phase 2: Core Infrastructure

- [x] 19. Add `validateEmail()` and `validateNigerianPhone()` to `src/lib/validation.ts`
  - Add EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/ and validateEmail(value: string): boolean using trimmed value
  - Add NG_PHONE_REGEX = /^(0\d{10}|\+234\d{10})$/ and validateNigerianPhone(value: string): boolean using trimmed value
  - _Requirements: Req 18.1, 18.2_

- [x] 20. Create `src/lib/fileUpload.ts`
  - Implement validateAndCompressFile(file: File): Promise\<File\>: if image MIME → draw to canvas → resize to max 1200px width at quality 0.75 via canvas.toBlob → validate MIME ∈ ALLOWED_MIME_TYPES → validate compressed size ≤ 10MB → throw ValidationError with field name on violation; PDF bypasses compression
  - _Requirements: Req 17.1, 17.2, 17.3, 17.4_

- [x] 21. Create `src/hooks/useDebounce.ts`
  - Implement useDebounce\<T\>(value: T, delay = 300): T using useState + useEffect with setTimeout; bypass debounce immediately when value is '' or null
  - _Requirements: Req 19.1, 19.2, 19.4, 19.5_

- [x] 22. Create `src/hooks/useSessionExpiry.ts`
  - Decode JWT exp from supabase.auth.getSession(); show banner when exp - now < 5 minutes; on user interaction within 60s call supabase.auth.refreshSession() silently; on refresh failure call supabase.auth.signOut() + router.push('/login?reason=session_expired'); intercept 401 responses for one silent refresh before redirecting
  - _Requirements: Req 16.1, 16.2, 16.3, 16.4, 16.5_

- [x] 23. Create `src/hooks/useSystemStatus.ts`
  - Poll GET /api/system/status on mount and every 60 seconds while tab is visible (Page Visibility API to pause/resume); return { maintenanceMode, minimumWebVersion, loading }
  - _Requirements: Req 11.2, 11.6_

- [x] 24. Update `src/services/notifications.service.ts` with idempotency guard + preference check
  - Add SHA-256 idempotency key = sha256(`${to}:${eventType}:${referenceId}`); Redis SETNX with 600s TTL before sending; if key exists log suppression and return; check corresponding preference column (payment_updates, report_published, etc.) and skip if false; retry SendPulse once after 30s on non-2xx
  - _Requirements: Req 8.4, Req 24.1, 24.2, 24.3, 24.4_

- [x] 25. Update `src/services/gamification.service.ts` with idempotency
  - Change awardPoints() to INSERT INTO point_transactions ... ON CONFLICT (portal_user_id, activity_type, reference_id) DO NOTHING; recalculate total_points = SELECT SUM(points) FROM point_transactions WHERE portal_user_id = $1; return { awarded: boolean, totalPoints }
  - _Requirements: Req 4.2, 4.3, 4.4_

- [x] 26. Update `src/services/analytics.service.ts` for triggered signals
  - Update getAtRiskStudents() to call get_at_risk_students RPC with school_id and optional class_id; map triggered_signals JSONB array to AtRiskStudent interface; scope by teacherId via class_id filter
  - _Requirements: Req 5.2, 5.3_

- [x] 27. Update `src/services/queue.service.ts` to email-only
  - Change NotificationJob type to `type: 'email'` only — remove 'sms' and 'whatsapp' union members; ensure TypeScript produces compile error on invalid types; update process-notifications cron handler to discard non-email jobs with console.warn
  - _Requirements: Req 14.1, 14.2, 14.3, 14.4, 14.5_

- [x] 28. Update `src/proxies/rateLimit.proxy.ts` for per-endpoint custom limits
  - Extend rateLimitProxy.check() to accept { key: string, max: number, window: number } config object instead of using only global defaults; keep Upstash Redis + in-memory Map fallback pattern
  - _Requirements: Req 7.1, 7.2, 7.4_

- [x] 29. Update `src/lib/push.ts` to use `web_push_subscriptions` + auto-delete on 410/404
  - Replace any `system_settings` push_sub_* key reads with query to web_push_subscriptions by portal_user_id; on webpush.sendNotification() returning 410 or 404 delete the row from web_push_subscriptions; always include url field in payload
  - _Requirements: Req 1.4, 1.7, Req 21.1_

- [x] 30. Wire `ErrorBoundary` into `src/app/dashboard/layout.tsx`
  - Wrap children with existing ErrorBoundary component; implement onError callback as a server action that writes an activity_logs row with error.message, componentStack, and portal_user_id; production mode hides stack traces; "Try Again" button calls ErrorBoundary reset
  - _Requirements: Req 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 31. Checkpoint — Verify Phase 1 migrations apply cleanly and Phase 2 services compile without TypeScript errors
  - Ensure all tests pass, ask the user if questions arise.


---

### Phase 3: Gap Fixes (Requirements 1–25)

- [x] 32. Implement push subscription API routes (Req 1)
  - Create `src/app/api/push/subscribe/route.ts`: POST withApiProxy requireAuth; upsert into web_push_subscriptions ON CONFLICT (endpoint) DO UPDATE SET updated_at=NOW()
  - Create `src/app/api/push/unsubscribe/route.ts`: DELETE withApiProxy requireAuth; DELETE FROM web_push_subscriptions WHERE endpoint = body.endpoint AND portal_user_id = userId
  - Add client-side retry (3× exponential backoff 1s/2s/4s) in the push subscription hook/component
  - _Requirements: Req 1.3, 1.5_

- [x] 33. Add deadline enforcement to `POST /api/cbt/sessions` (Req 2)
  - In `src/app/api/cbt/sessions/route.ts` POST handler: compare submitted_at against cbt_sessions.deadline; if submitted_at > deadline + 30s return HTTP 422 `{ error: 'DEADLINE_EXCEEDED', deadline: deadline.toISOString() }`
  - Update CBT taking page to display server-authoritative countdown from deadline, warning banner when < 5 minutes remain, and auto-submit when countdown reaches zero
  - _Requirements: Req 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 34. Implement CBT periodic auto-save (Req 3)
  - Create `src/app/api/cbt/sessions/[id]/route.ts` PATCH handler: accept { answers: Record\<string,unknown\> }; update cbt_sessions.answers only if status = 'in_progress'; return `{ saved_at: new Date().toISOString() }` or 422 on deadline exceeded
  - Update CBT taking page: setInterval every 60s to PATCH current answers; show "Saved at HH:MM" on success; retain answers in memory and retry every 30s on network failure; stop retrying and trigger auto-submit on 422 DEADLINE_EXCEEDED
  - _Requirements: Req 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 35. Update analytics dashboard UI for triggered signals (Req 5)
  - In at-risk student panel component, render triggered_signals array as labelled badges ('no_login' → "No Login 7d", 'low_attendance' → "Low Attendance", 'overdue_assignments' → "Overdue Work"); show empty-state message when array is empty
  - _Requirements: Req 5.4, 5.5_

- [x] 36. Update payment webhook to use atomic RPC (Req 6)
  - In `src/app/api/payments/webhook/route.ts`: check existing payment_transactions WHERE transaction_reference = reference first; if exists return HTTP 200; otherwise call supabase.rpc('process_payment_atomic', { reference, invoice_id, amount }); verify Paystack signature and return 401 on failure
  - _Requirements: Req 6.1, 6.3, 6.4, 6.5_

- [x] 37. Apply per-endpoint rate limits to public routes (Req 7)
  - In `/api/public/student` route: add rateLimitProxy.check(req, { key: clientIp, max: 10, window: 60 })
  - In `/api/payments/registration` route: add rateLimitProxy.check(req, { key: body.email, max: 3, window: 300 })
  - Both throw RateLimitError on exceed; withApiProxy maps to HTTP 429 with retryAfter
  - _Requirements: Req 7.1, 7.2, 7.3_

- [x] 38. Update notification preferences — service, schema, and settings UI (Req 8)
  - Update preferencesService to read/write payment_updates, report_published, attendance_alerts, weekly_summary, streak_reminder columns
  - Update updatePrefsSchema in preferences API route to accept and validate all five new fields
  - Add toggles for all four new categories (+ streak_reminder) to the notification preferences settings page
  - Ensure new portal_user insert triggers corresponding notification_preferences row with defaults
  - _Requirements: Req 8.2, 8.3, 8.5, 8.6_

- [x] 39. Implement cursor pagination on heavy list API routes (Req 10)
  - Update transactions API route: replace .limit(200/.500) with cursor pagination (created_at DESC, id DESC, limit 20) + nextCursor response field
  - Update invoices API route with same cursor pattern
  - Update leaderboard API route with same cursor pattern
  - Update activity_logs API route with same cursor pattern
  - Update corresponding UI pages to show "Load More" button using nextCursor; reset on navigate back
  - _Requirements: Req 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 40. Create `GET /api/system/status` route + UI components (Req 11)
  - Create `src/app/api/system/status/route.ts`: public (no auth); read maintenance_mode + minimum_web_version from system_settings; return JSON
  - Create `src/components/ui/MaintenanceBanner.tsx`: full-screen blocking overlay when maintenance_mode = true; auto-dismiss when mode transitions to false on next poll
  - Create `src/components/ui/ForceRefreshBanner.tsx`: non-blocking top banner with "Refresh" button (triggers hard reload) when deployed version < minimum_web_version
  - Wire useSystemStatus hook in `src/app/dashboard/layout.tsx`
  - _Requirements: Req 11.1, 11.3, 11.4, 11.5_

- [x] 41. Create support ticket dashboard page (Req 12)
  - Create `src/app/api/support/route.ts` POST handler: create ticket + send acknowledgement email via notificationsService.sendEmail()
  - Create `src/app/api/support/[id]/route.ts` POST handler: append reply message; send email notification to ticket creator when staff replies
  - Create `src/app/dashboard/support/page.tsx`: ticket list (cursor-paginated), create form, thread detail view with reply; school_admin sees all school tickets
  - _Requirements: Req 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

- [x] 42. Implement timetable conflict detection (Req 13)
  - Update `src/app/api/timetable-slots/route.ts` POST: call supabase.rpc('check_timetable_conflicts', { slot }) before insert; return HTTP 409 with TEACHER_CONFLICT or ROOM_CONFLICT + conflictingSlot
  - Update timetable UI: client-side conflict check against loaded slots before submit; inline warning listing conflicting slot; red border/warning icon on conflicting grid cells; clear conflict errors on re-submit
  - _Requirements: Req 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

- [x] 43. Redesign lesson plans pages (Req 15)
  - Redesign `src/app/dashboard/lesson-plans/page.tsx`: creation form with course, class, school, term, start_date, end_date, sessions_per_week, optional curriculum_version_id; status badges (draft/published/archived); version indicator
  - Redesign `src/app/dashboard/lesson-plans/[id]/page.tsx`: inline week entry editing, PDF export via browser print, linked curriculum title display, status transitions
  - _Requirements: Req 15.1, 15.2, 15.4, 15.5, 15.6, 15.7_

- [x] 44. Wire session expiry UI in dashboard layout (Req 16)
  - Create `src/components/ui/SessionExpiryBanner.tsx`: non-blocking top banner "Session expiring soon — Stay signed in" with click handler to trigger silent refresh
  - Call useSessionExpiry hook in `src/app/dashboard/layout.tsx`; render SessionExpiryBanner when expiry is near
  - _Requirements: Req 16.1, 16.2, 16.3_

- [x] 45. Integrate file validation + compression into upload flows (Req 17)
  - Wire validateAndCompressFile() into assignment submission file input component before upload
  - Wire validateAndCompressFile() into bank transfer proof upload component before upload
  - Add server-side MIME type + size re-validation to relevant upload API routes with HTTP 400 structured error response
  - _Requirements: Req 17.1, 17.2, 17.3, 17.4, 17.5_

- [x] 46. Apply input validation utilities across forms (Req 18)
  - Apply validateEmail() to auth login form, registration form, and invoice editor email fields with inline errors
  - Apply validateNigerianPhone() to all registration forms with phone fields with inline errors
  - Add invoice editor validations: at least one line item with positive amount, due date not in the past
  - Add CBT exam editor validations: at least one question, passing score 1–100
  - Disable save/submit buttons until all validations pass (React Hook Form formState.isValid)
  - Add server-side enforcement in auth/registration/invoice/CBT API routes returning `{ error, field }`
  - _Requirements: Req 18.1, 18.2, 18.3, 18.4, 18.5, 18.6_

- [x] 47. Apply `useDebounce` to all search/filter inputs (Req 19)
  - Apply useDebounce(value, 300) to search inputs on: students list, transactions list, invoices list, leaderboard, activity logs, and all other dashboard pages with search/filter inputs
  - _Requirements: Req 19.3_

- [x] 48. Implement audit log for manual finance actions (Req 20)
  - In finance admin UI: on payment_transactions status change, POST audit_logs row with actor_id, resource_type='payment_transaction', resource_id, old_value, new_value, action='status_change'
  - In bank transfer proof upload API route: check payment_status = 'completed' first; if true return HTTP 409 `{ error: 'ALREADY_PAID' }` and write audit_logs row recording the attempt
  - _Requirements: Req 20.1, 20.2_

- [x] 49. Implement notification deep-link routing (Req 21)
  - Update push.ts sendToUser() to always include url field in payload mapped from notification type to route (payment_confirmed → /dashboard/payments/invoices/[id], etc.)
  - Update service worker notificationclick handler to call clients.openWindow(event.notification.data.url) with /dashboard fallback
  - _Requirements: Req 21.1, 21.2, 21.3, 21.4, 21.5_

- [x] 50. Harden `withApiProxy` structured error responses (Req 22)
  - Update `src/lib/api-wrapper.ts` error handler to map ValidationError → 400 + field, AuthError → 401, RateLimitError → 429 + retryAfter, AppError → 400/422 + code, unhandled → 500 generic; never return HTML; never include stack traces in production
  - _Requirements: Req 22.1, 22.2, 22.3, 22.4, 22.5_

- [x] 51. Implement portfolio public share link (Req 23)
  - Create `src/app/api/portfolio/share/route.ts` POST: generate UUID token; store in portal_users.portfolio_share_token + expires_at = NOW()+30days; return { url, expires_at }
  - Create `src/app/api/portfolio/share/route.ts` DELETE: set both columns to null
  - Create `src/app/student/[token]/page.tsx`: public read-only portfolio view; return 410 Gone page when token expired or not found
  - Update `src/app/dashboard/portfolio/page.tsx`: share link card with expiry date, "Copy Link" (Clipboard API), "Share" (Web Share API), "Revoke Link" buttons; "No active share link" when null
  - _Requirements: Req 23.1, 23.2, 23.3, 23.4, 23.5, 23.6_

- [x] 52. Audit all API routes for `withApiProxy` + authorization consistency (Req 25)
  - Audit all data-mutating routes under src/app/api; add requireAuth: true + explicit roles[] where missing
  - Document /api/system/status and /api/payments/webhook as intentionally public in their withApiProxy config
  - Add roles: ['admin'] to billing health, sync-users, and system settings admin endpoints
  - _Requirements: Req 25.1, 25.2, 25.3, 25.4, 25.5_

- [x] 53. Checkpoint — Gap fixes complete; all existing tests pass
  - Ensure all tests pass, ask the user if questions arise.


---

### Phase 4: New Features (NF-1 to NF-8)

- [x] 54. Implement AI Homework Helper (NF-1)
  - Create `src/app/api/ai/homework-helper/route.ts` POST: requireAuth, student role; accept { message, enrolled_course_ids, history[] }; scope AI prompt to enrolled_course_ids only; stream response via SSE; return polite redirect message when question is out of scope
  - Create `src/app/dashboard/homework-helper/page.tsx`: chat thread with SSE streaming display; enrolled-courses-only gate; inline retry button on stream failure without clearing history; session-only React state (no DB persistence)
  - _Requirements: NF-1.1, NF-1.2, NF-1.3, NF-1.4, NF-1.5, NF-1.6_

- [ ] 55. Implement auto-completion certificates (NF-2)
  - Create Supabase database function/trigger that fires when a student completes all lessons AND achieves passing score on associated CBT exam; check UNIQUE (portal_user_id, course_id) on certificates table before generating; generate PDF and store in Cloudflare R2
  - Update certificate notification to send report_published-category email via notificationsService.sendEmail() to student and linked parent including R2 download link
  - Add certificates list with "Download" button (R2 signed URL) to student dashboard
  - _Requirements: NF-2.1, NF-2.2, NF-2.3, NF-2.4, NF-2.5, NF-2.6_

- [x] 56. Implement peer study groups service + routes (NF-3)
  - Create `src/services/study-groups.service.ts`: createGroup(), joinGroup() with 20-member cap check throwing ValidationError on cap, leaveGroup(), sendMessage(), getMembers()
  - Create API routes: GET/POST /api/study-groups, POST /api/study-groups/[id]/join (409 GROUP_FULL if at cap), DELETE /api/study-groups/[id]/leave, GET/POST /api/study-groups/[id]/messages (cursor pagination)
  - Create `src/app/dashboard/study-groups/page.tsx`: group list scoped to enrolled courses, create form, join/leave, member cap indicator; set inactive when course ends
  - _Requirements: NF-3.1, NF-3.2, NF-3.5, NF-3.6_

- [x] 57. Implement study group chat + code pad page (NF-3)
  - Create `src/app/dashboard/study-groups/[id]/page.tsx`: Supabase Realtime chat panel broadcasting study_group_messages; shared plain-text code pad with JS/Python syntax highlighting via highlight.js; last-write-wins Realtime sync for code pad; read-only mode for teacher/admin roles
  - _Requirements: NF-3.3, NF-3.4, NF-3.6_

- [x] 58. Implement `sm2()` pure function + flashcards service + routes (NF-4)
  - Implement sm2(state, quality) pure function in `src/lib/sm2.ts`: for quality < 3 reset repetitions=0 + intervalDays=1; for quality >= 3 compute intervalDays=max(1, round(old_interval*ease)), update easeFactor with SM-2 formula clamped to min 1.3; return { intervalDays, easeFactor, repetitions, nextReviewAt }
  - Create `src/services/flashcards.service.ts`: createDeck(), addCard(), getDueCards() WHERE next_review_at <= NOW(), recordReview() applying sm2()
  - Create API routes: GET/POST /api/flashcards/decks, POST /api/flashcards/decks/[id]/cards, GET /api/flashcards/decks/[id]/due, POST /api/flashcards/reviews
  - _Requirements: NF-4.1, NF-4.3, NF-4.4, NF-4.5_

- [x] 59. Implement flashcard pages + lesson editor integration (NF-4)
  - Create `src/app/dashboard/flashcards/page.tsx`: deck list by course/lesson, "Start Review" button per deck, "No cards due" empty state with next review date
  - Create `src/app/dashboard/flashcards/[deckId]/review/page.tsx`: card flip animation, quality buttons 1–5, progress indicator, session summary on end
  - Add flashcard deck section to teacher lesson editor for adding front/back card pairs
  - _Requirements: NF-4.2, NF-4.6, NF-4.7_

- [x] 60. Implement streak reminder cron route (NF-5)
  - Create `src/app/api/cron/streak-reminder/route.ts`: CRON_SECRET auth; query students with no lesson completion, flashcard review, or CBT session today (WAT); check streak_reminder preference column; send VAPID push via push.ts sendToUser() with personalised first name; skip students with no subscriptions; handle 410/404 cleanup
  - _Requirements: NF-5.1, NF-5.2, NF-5.3, NF-5.4, NF-5.5, NF-5.6_

- [x] 61. Implement parent-teacher chat service + routes (NF-6)
  - Create `src/services/parent-teacher-chat.service.ts`: getOrCreateThread(), sendMessage(), markRead(), getThreadMessages() with 50-per-page cursor pagination, getTeacherInbox()
  - Create API routes: GET/POST /api/parent-teacher/threads, GET/POST /api/parent-teacher/threads/[id]/messages
  - Update `src/app/dashboard/messages/page.tsx`: parent-teacher threads panel, unread badge via Supabase Realtime, "Load Earlier" cursor pagination, send email_enabled category email to teacher on new parent message
  - _Requirements: NF-6.1, NF-6.2, NF-6.3, NF-6.4, NF-6.5, NF-6.6_

- [x] 62. Implement weekly summary cron route (NF-7)
  - Create `src/app/api/cron/weekly-summary/route.ts`: CRON_SECRET auth; runs Fridays 17:00 UTC; query parents with weekly_summary=true and linked students; compile per-student: lessons completed, assignments submitted, CBT scores, attendance rate, XP total; send via notificationsService.sendEmail() with weekly_summary category; Redis idempotency key weekly_summary:${parentEmail}:${weekStartDate} with 7-day TTL; send "No activity this week" when no data
  - _Requirements: NF-7.1, NF-7.2, NF-7.3, NF-7.4, NF-7.5, NF-7.6_

- [x] 63. Implement digital consent forms service + routes + pages (NF-8)
  - Create `src/services/consent-forms.service.ts`: createForm(), signForm() with ON CONFLICT DO NOTHING + 409 on already signed, getResponses(), exportResponsesCSV()
  - Create API routes: GET/POST /api/consent-forms, POST /api/consent-forms/[id]/sign (409 ALREADY_SIGNED if duplicate), GET /api/consent-forms/[id]/export (CSV response)
  - Create `src/app/dashboard/consent-forms/page.tsx`: admin/teacher view with create form, response count, "Export CSV"; parent view with pending/signed status; "I Agree" button on signing page; send report_published email on publish
  - _Requirements: NF-8.1, NF-8.2, NF-8.3, NF-8.4, NF-8.5, NF-8.6_

- [x] 64. Checkpoint — NF-1 through NF-8 complete; verify Realtime subscriptions and cron routes work
  - Ensure all tests pass, ask the user if questions arise.


---

### Phase 5: New Features (NF-9 to NF-15)

- [ ] 65. Implement instalment payment plans UI + API (NF-9)
  - Create `src/app/api/billing/settlements/route.ts` POST: requireAuth, parent; accept { invoiceId, instalments: { amount, dueDate }[] }; verify SUM(amounts) equals invoice total exactly or return HTTP 422; save instalment schedule
  - Update invoice detail page: "Pay in Instalments" option with 2/3 equal split calculator; display each instalment with amount, due date, status; Paystack per-instalment checkout flow
  - Add 3-day due-date reminder: payment_updates category email via notificationsService; update instalment status to 'paid' on Paystack webhook + confirmation email
  - _Requirements: NF-9.1, NF-9.2, NF-9.3, NF-9.4, NF-9.5, NF-9.6_

- [ ] 66. Implement payment receipt PDF download (NF-10)
  - Create `src/app/api/payments/receipt/[transactionId]/route.ts` POST: requireAuth; verify transaction belongs to requesting user's school or parent-student relationship or return 403; generate PDF using pdfmake with school name, student name, invoice number, amount paid, payment date, transaction reference, receipt number; return Content-Type: application/pdf + Content-Disposition: attachment
  - Add "Download Receipt" button to invoices and transactions pages for transactions with payment_status='completed'
  - _Requirements: NF-10.1, NF-10.2, NF-10.3, NF-10.4, NF-10.5_

- [x] 67. Implement outstanding balance widget (NF-11)
  - Create `src/app/api/billing/outstanding/route.ts` GET: requireAuth, parent; scope to linked students; return { total, perStudent: [{ studentId, name, amount, overdueCount }] }
  - Add Outstanding Balance card to `src/app/dashboard/overview/page.tsx` (parent view): per-student breakdown, overdue count, "Pay Now" → /dashboard/parent-invoices, "All fees paid" green state when zero; 5-minute client-side cache; auto-refresh on load
  - _Requirements: NF-11.1, NF-11.2, NF-11.3, NF-11.4, NF-11.5, NF-11.6_

- [ ] 68. Complete announcement composer (NF-15)
  - Update `src/app/dashboard/announcements/page.tsx` with "New Announcement" button: composer form with title, body (rich textarea), audience selector (all/students/parents/teachers/specific class), optional expires_at, draft save
  - Update POST /api/announcements: set status='published'; create in-app notification records for audience; send email via SendPulse to audience where email_enabled=true and announcement_notifications=true
  - Add status badges (Draft/Published/Expired) to announcements list; allow editing drafts; hide expired announcements from notification feed
  - _Requirements: NF-15.1, NF-15.2, NF-15.3, NF-15.4, NF-15.5, NF-15.6_

- [ ] 69. Checkpoint — NF-9 through NF-15 complete; verify PDF generation and payment flows
  - Ensure all tests pass, ask the user if questions arise.


---

### Phase 6: Autonomous Term Engine (NF-16 to NF-25)

- [x] 70. Implement curriculum service + generator page (NF-16)
  - Create `src/services/curriculum.service.ts`: generateCurriculum() calling POST /api/ai/generate type='curriculum'; ON CONFLICT (course_id, school_id) increment version + preserve old content in JSONB history; getCurriculumVersions()
  - Create `src/app/api/curricula/route.ts` POST: requireAuth, school_admin; call curriculumService.generateCurriculum(); do NOT save partial result if AI call fails
  - Create `src/app/dashboard/curriculum/page.tsx`: "Generate Curriculum" form (course name, grade level, school, term count, weeks per term, subject area, notes); version history list; curriculum detail with content rendered as rich text
  - _Requirements: NF-16.1, NF-16.2, NF-16.3, NF-16.4, NF-16.5, NF-16.6_

- [ ] 71. Enhance lesson plan generator with curriculum context (NF-17)
  - Update POST /api/ai/generate (type='lesson-plan'): embed full curriculum content JSONB into AI prompt when curriculum_version_id is provided; store curriculum_version_id FK on lesson_plans row
  - When regenerating published plan: PATCH existing plan status='archived' before creating new draft
  - Add per-week teacher notes field to lesson plan detail page alongside AI content; enforce 30s timeout + do not persist on timeout
  - _Requirements: NF-17.1, NF-17.2, NF-17.3, NF-17.4, NF-17.5, NF-17.6_

- [ ] 72. Implement bulk lesson generation with SSE progress (NF-18)
  - Create `src/app/api/lesson-plans/[id]/generate-lessons/route.ts` POST: requireAuth, teacher/admin; iterate plan_data.weeks; POST /api/ai/generate per week topic; save as draft lesson; emit SSE { generated: N, total: M } per item; log + emit warning event on per-item failure (do not halt); final SSE { done: true, generated, skipped }
  - Add "Generate All Lessons" button to lesson plan detail page (visible when status='published'); progress indicator "Generating lesson N of M…"; summary notification on completion; generated lessons require teacher approval (PATCH status='published') before student visibility
  - _Requirements: NF-18.1, NF-18.2, NF-18.3, NF-18.4, NF-18.5, NF-18.6_

- [ ] 73. Implement bulk assignment generation with SSE progress (NF-19)
  - Create `src/app/api/lesson-plans/[id]/generate-assignments/route.ts` POST: same SSE streaming pattern as generate-lessons; generate assignment per week with due dates aligned to lesson schedule; save as draft; per-item failure tolerance
  - Add "Generate All Assignments" button to lesson plan detail page with SSE progress indicator
  - _Requirements: NF-19.1, NF-19.2, NF-19.3, NF-19.4, NF-19.5_

- [ ] 74. Implement bulk project generation with SSE progress (NF-20)
  - Create `src/app/api/lesson-plans/[id]/generate-projects/route.ts` POST: same SSE streaming pattern; generate project per week; save as draft; per-item failure tolerance
  - Add "Generate All Projects" button to lesson plan detail page with SSE progress indicator
  - _Requirements: NF-20.1, NF-20.2, NF-20.3, NF-20.4, NF-20.5_

- [x] 75. Implement term scheduler — activation + cron release (NF-21)
  - Create `src/app/api/lesson-plans/[id]/schedule/route.ts` POST: INSERT into term_schedules { is_active: true, current_week: 1, term_start, cadence_days }
  - Create `src/app/api/lesson-plans/[id]/release-week/route.ts` POST: manual week release; UPDATE lessons/assignments/projects status='published' WHERE lesson_plan_id + week_number + teacher-approved
  - Create `src/app/api/cron/term-scheduler/route.ts` POST: CRON_SECRET auth; Mondays 05:00 UTC; SELECT active term_schedules; for each: release current_week content; INCREMENT current_week
  - Add "Activate Scheduler" button to lesson plan detail with term_start + cadence_days inputs; show current_week indicator; "Release Now" manual override button
  - _Requirements: NF-21.1, NF-21.2, NF-21.3, NF-21.4, NF-21.5_

- [ ] 76. Implement auto-grading pipeline (NF-22)
  - Update assignment submission API route: read grading_mode from parent assignment; if 'auto' compute score inline and set status='graded'; if 'ai_assisted' call POST /api/ai/generate type='cbt-grading' store ai_suggested_grade + ai_suggested_feedback, set status='pending_review' (NOT visible to student); if 'manual' set status='pending_review'
  - Update CBT submission API route with same grading_mode branching logic
  - On status='graded': trigger push + email notification to student (if prefs allow)
  - _Requirements: NF-22.1, NF-22.2, NF-22.3, NF-22.4, NF-22.5, NF-22.6, NF-22.7_

- [x] 77. Implement grading service + routes + grading page (NF-23, NF-24)
  - Create `src/services/grading.service.ts`: getSubmissions() with cursor pagination, acceptAIGrade() setting final_grade + status='graded' + audit_log, overrideGrade() with audit_log old/new value, bulkGrade()
  - Create API routes: GET /api/grading/submissions, PATCH /api/grading/submissions/[id] (action: accept_ai | override), POST /api/grading/submissions/bulk
  - Create `src/app/dashboard/grading/page.tsx`: role-scoped submission list, AI suggested grade panel with confidence badge, accept/override inputs, bulk grade action, grading mode badge per row
  - Add grading mode selector (auto/ai_assisted/manual) to assignment editor and CBT exam editor
  - _Requirements: NF-23.1, NF-23.2, NF-23.3, NF-24.1, NF-24.2, NF-24.3_

- [ ] 78. Implement Content Dashboard tab on lesson plan detail (NF-25)
  - Add "Content Dashboard" tab to `src/app/dashboard/lesson-plans/[id]/page.tsx`: per-week breakdown showing lesson count, assignment count, project count with progress bars; "Release Now", "Edit", and "Regenerate" action buttons per week; reflects current_week state from term_schedules
  - _Requirements: NF-25.1, NF-25.2, NF-25.3_

- [ ] 79. Checkpoint — Autonomous term engine complete; verify SSE streaming and cron scheduling
  - Ensure all tests pass, ask the user if questions arise.


---

### Phase 7: Property-Based Tests

- [ ] 80. Set up fast-check testing framework
  - Install fast-check: `npm install --save-dev fast-check`
  - Configure Vitest (or Jest) to run `__tests__/**/*.pbt.ts` files with numRuns: 100 in fast-check global config
  - Add `// Feature: rillcod-web-improvements` comment header to each PBT file
  - _Requirements: Design testing strategy_

- [ ] 81. Implement property tests for gamification service
  - [ ]* 81.1 Write property test for gamification idempotency (P1)
    - **Property 1: Gamification Idempotency — Unique Transactions Sum Equals Total Points**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
    - File: `__tests__/gamification.service.pbt.ts`; arbitraries: fc.array(fc.record({ activityType: fc.string(), referenceId: fc.string(), points: fc.integer({min:1,max:1000}) }))

- [ ] 82. Implement property tests for CBT deadline enforcement
  - [ ]* 82.1 Write property test for CBT deadline enforcement (P2)
    - **Property 2: CBT Deadline Enforcement — Late Submissions Rejected**
    - **Validates: Requirements 2.1, 2.2**
    - File: `__tests__/cbt.service.pbt.ts`; arbitraries: fc.date() for deadline, fc.integer({min:-60,max:120}) for seconds offset

- [ ] 83. Implement property tests for billing service
  - [ ]* 83.1 Write property test for instalment sum equals invoice total (P3)
    - **Property 3: Instalment Sum Equals Invoice Total**
    - **Validates: Requirements NF-9.2, NF-9.3**
    - File: `__tests__/billing.service.pbt.ts`; arbitraries: fc.integer({min:1,max:1000000}) for total, fc.array(fc.integer({min:1,max:1000000}), {minLength:2,maxLength:3})

- [ ] 84. Implement property tests for study groups service
  - [ ]* 84.1 Write property test for study group membership cap at 20 (P4)
    - **Property 4: Study Group Membership Cap at 20**
    - **Validates: Requirements NF-3.2**
    - File: `__tests__/study-groups.service.pbt.ts`; arbitraries: fc.array(fc.uuid(), {minLength:18,maxLength:25}) for member ids

- [ ] 85. Implement property tests for flashcards SM-2 algorithm
  - [ ]* 85.1 Write property test for SM-2 next review date monotonicity (P5)
    - **Property 5: SM-2 Next Review Date Monotonicity**
    - **Validates: Requirements NF-4.3, NF-4.4**
    - File: `__tests__/flashcards.service.pbt.ts`; arbitraries: fc.integer({min:1,max:5}) for quality, fc.float({min:1.3,max:2.5}) for ease, fc.integer({min:1,max:365}) for interval

- [ ] 86. Implement property tests for curriculum service
  - [ ]* 86.1 Write property test for curriculum uniqueness per (course_id, school_id) (P6)
    - **Property 6: Curriculum Uniqueness per (course_id, school_id)**
    - **Validates: Requirements NF-16.2, NF-16.3**
    - File: `__tests__/curriculum.service.pbt.ts`; arbitraries: fc.uuid() for courseId, fc.uuid() for schoolId

- [ ] 87. Implement property tests for term scheduler cron
  - [ ]* 87.1 Write property test for term scheduler release timing invariant (P7)
    - **Property 7: Term Scheduler Release Timing Invariant**
    - **Validates: Requirements NF-21.2, NF-21.3**
    - File: `__tests__/cron.term-scheduler.pbt.ts`; arbitraries: fc.date() for termStart, fc.integer({min:1,max:20}) for weekNumber, fc.integer({min:1,max:14}) for cadence

- [ ] 88. Implement property tests for grading service
  - [ ]* 88.1 Write property test for AI-suggested grade not visible before graded (P8)
    - **Property 8: AI-Suggested Grade Not Visible to Student Before Graded**
    - **Validates: Requirements NF-22.3, NF-22.7**
    - File: `__tests__/grading.service.pbt.ts`; arbitraries: fc.constantFrom('auto','ai_suggested','manual'), fc.constantFrom('pending_review','graded')

- [ ] 89. Implement property tests for portfolio service
  - [ ]* 89.1 Write property test for portfolio share token expiry (P9)
    - **Property 9: Portfolio Share Token Expiry Set to NOW() + 30 Days**
    - **Validates: Requirements NF-13.1, 23.1**
    - File: `__tests__/portfolio.service.pbt.ts`; arbitraries: fc.date() for now

- [ ] 90. Implement property tests for notifications service
  - [ ]* 90.1 Write property test for email idempotency one send per 10-min window (P10)
    - **Property 10: Email Idempotency — One Send per Event per 10-Minute Window**
    - **Validates: Requirements 24.1, 24.2, 24.3**
    - File: `__tests__/notifications.service.pbt.ts`; arbitraries: fc.record({ email: fc.emailAddress(), eventType: fc.string(), referenceId: fc.string() }), fc.integer({min:2,max:10}) for duplicate call count

- [ ] 91. Implement property tests for file upload validation
  - [ ]* 91.1 Write property test for file size rejection above 10 MB (P11)
    - **Property 11: File Size Rejection Above 10 MB**
    - **Validates: Requirements 17.1, 17.3**
    - File: `__tests__/fileUpload.pbt.ts`; arbitraries: fc.integer({min:0,max:20_000_000}) for compressed size
  - [ ]* 91.2 Write property test for MIME type allowlist enforcement (P12)
    - **Property 12: MIME Type Allowlist Enforcement**
    - **Validates: Requirements 17.1, 17.5**
    - File: `__tests__/fileUpload.pbt.ts`; arbitraries: fc.string() for MIME type

- [ ] 92. Implement property tests for rate limit proxy
  - [ ]* 92.1 Write property test for rate limit returns 429 after threshold (P13)
    - **Property 13: Rate Limit Returns 429 After Threshold Exceeded**
    - **Validates: Requirements 7.1, 7.2, 7.3**
    - File: `__tests__/rateLimitProxy.pbt.ts`; arbitraries: fc.string() for IP, fc.integer({min:11,max:50}) for request count over threshold

- [ ] 93. Implement property tests for queue service
  - [ ]* 93.1 Write property test for queue enforces email-only job type (P14)
    - **Property 14: Queue Enforces Email-Only Job Type**
    - **Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5**
    - File: `__tests__/queue.service.pbt.ts`; arbitraries: fc.constantFrom('email','sms','whatsapp','push') for job type

- [ ] 94. Implement property tests for payments service — webhook idempotency
  - [ ]* 94.1 Write property test for webhook idempotency one row per transaction reference (P15)
    - **Property 15: Webhook Idempotency — One Row per Transaction Reference**
    - **Validates: Requirements 6.2, 6.3**
    - File: `__tests__/payments.service.pbt.ts`; arbitraries: fc.string() for reference, fc.integer({min:2,max:5}) for delivery count

- [ ] 95. Implement property tests for payments service — atomicity
  - [ ]* 95.1 Write property test for payment atomicity both updates or neither (P16)
    - **Property 16: Payment Atomicity — Both Updates or Neither**
    - **Validates: Requirements 6.1**
    - File: `__tests__/payments.service.pbt.ts`; arbitraries: fc.boolean() for invoice update failure simulation

- [ ] 96. Implement property tests for cursor pagination
  - [ ]* 96.1 Write property test for cursor pagination completeness no duplicates no gaps (P17)
    - **Property 17: Cursor Pagination Completeness — No Duplicates, No Gaps**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4**
    - File: `__tests__/pagination.pbt.ts`; arbitraries: fc.array(fc.record({ created_at: fc.date(), id: fc.uuid() }), {minLength:1,maxLength:100}) for dataset

- [ ] 97. Implement property tests for push service
  - [ ]* 97.1 Write property test for push subscription cleanup on 410/404 (P18)
    - **Property 18: Push Subscription Cleanup on 410/404**
    - **Validates: Requirements 1.4, NF-5.6**
    - File: `__tests__/push.service.pbt.ts`; arbitraries: fc.constantFrom(410,404,200,201) for push service response status

- [ ] 98. Implement property tests for validation utilities
  - [ ]* 98.1 Write property test for Nigerian phone format validation (P19)
    - **Property 19: Nigerian Phone Format Validation**
    - **Validates: Requirements 18.2**
    - File: `__tests__/validation.pbt.ts`; arbitraries: fc.string() for arbitrary phone strings + fc.stringMatching for valid patterns
  - [ ]* 98.2 Write property test for email format validation (P20)
    - **Property 20: Email Format Validation**
    - **Validates: Requirements 18.1**
    - File: `__tests__/validation.pbt.ts`; arbitraries: fc.string() for arbitrary strings + fc.emailAddress() for valid emails

- [ ] 99. Final checkpoint — All property tests pass with numRuns: 100
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints at the end of each phase ensure incremental validation
- Property tests validate universal correctness invariants; unit tests catch concrete bugs — they are complementary
- All API routes must use `withApiProxy`; cron routes authenticate via `CRON_SECRET` header
- All SSE streaming routes return `Content-Type: text/event-stream` with per-item progress events
