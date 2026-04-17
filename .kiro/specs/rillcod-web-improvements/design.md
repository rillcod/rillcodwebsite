# Design Document — Rillcod Academy Web Improvements

## Overview

This document describes the technical design for all 25 gap requirements (1–25) and 25 new feature requirements (NF-1–NF-25) for the Rillcod Academy Next.js 14 web application.

The existing stack is unchanged: Next.js 14 App Router (TypeScript), Supabase (Postgres, Auth, Storage, Realtime), Cloudflare R2, Paystack + Stripe (both webhooks handled), SendPulse SMTP via `notificationsService.sendEmail()`, web-push VAPID, Socket.IO, Upstash Redis with in-memory fallback, Tailwind CSS + shadcn/ui, `withApiProxy` wrapper, `AppError`/`ValidationError`/`AuthError`/`RateLimitError`, `rateLimitProxy`, `queueService`, and `pdfmake` already imported in `payments.service.ts`.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                     Next.js 14 App Router (Browser)                    │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────────┐ │
│  │  Pages / Layouts │  │  React Components│  │  Hooks / Utilities     │ │
│  │  /dashboard/**  │  │  shadcn/ui +      │  │  useDebounce           │ │
│  │  /student/[tok] │  │  Tailwind CSS     │  │  useSessionExpiry      │ │
│  │  /api/**        │  │  ErrorBoundary    │  │  useSystemStatus       │ │
│  └────────┬────────┘  └──────────────────┘  └────────────┬───────────┘ │
└───────────┼────────────────────────────────────────────────┼────────────┘
            │ fetch / SSE / WebSocket                        │
┌───────────▼────────────────────────────────────────────────▼────────────┐
│                     Next.js API Routes (src/app/api/**/route.ts)        │
│  withApiProxy wrapper: auth check → role check → rate limit → handler   │
│  AppError / ValidationError / AuthError / RateLimitError → JSON 4xx/5xx │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
         ┌─────────────────────────┼──────────────────────────┐
         │                         │                          │
┌────────▼─────────┐   ┌───────────▼──────────┐   ┌──────────▼──────────┐
│  Services Layer  │   │  Upstash Redis       │   │  Supabase            │
│  src/services/   │   │  + in-memory fallback│   │  Postgres + RLS      │
│  *.service.ts    │   │  (rate limit, queue, │   │  Auth (JWT)          │
│                  │   │   email idempotency) │   │  Storage (R2 proxy)  │
└────────┬─────────┘   └──────────────────────┘   │  Realtime            │
         │                                         └──────────┬───────────┘
         │                                                    │
    ┌────▼──────┐   ┌──────────────┐   ┌───────────┐   ┌─────▼──────────┐
    │ Cloudflare│   │   Paystack   │   │  SendPulse│   │  web-push VAPID│
    │    R2     │   │   + Stripe   │   │   SMTP    │   │  (push.ts)     │
    └───────────┘   └──────────────┘   └───────────┘   └────────────────┘
```

Data flow for a typical authenticated write: Dashboard page → React component → `fetch()` to API Route → `withApiProxy` (auth + role + rate limit) → service method → Supabase PostgREST (RLS enforced) → optional queue job → SendPulse / push notification.

Cron routes (`/api/cron/*`) are triggered by Vercel Cron or an external scheduler and authenticated via `CRON_SECRET` header check.


---

## Database Schema Changes

### New Table: `web_push_subscriptions`

```sql
CREATE TABLE web_push_subscriptions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_user_id   UUID NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  endpoint         TEXT NOT NULL UNIQUE,
  subscription_json JSONB NOT NULL,
  device_hint      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_wps_portal_user ON web_push_subscriptions(portal_user_id);

-- RLS
ALTER TABLE web_push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own" ON web_push_subscriptions
  FOR SELECT USING (portal_user_id = auth.uid());
CREATE POLICY "users delete own" ON web_push_subscriptions
  FOR DELETE USING (portal_user_id = auth.uid());
CREATE POLICY "service role all" ON web_push_subscriptions
  USING (auth.role() = 'service_role');
```

### New Columns on Existing Tables

```sql
-- Req 2: CBT server-side deadline
ALTER TABLE cbt_sessions
  ADD COLUMN deadline TIMESTAMPTZ
    GENERATED ALWAYS AS (start_time + (duration_minutes * INTERVAL '1 minute')) STORED;

-- Req 4: Gamification idempotency
ALTER TABLE point_transactions
  ADD CONSTRAINT uq_pt_user_activity_ref
    UNIQUE (portal_user_id, activity_type, reference_id);

-- Req 8: Notification preference categories
ALTER TABLE notification_preferences
  ADD COLUMN payment_updates   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN report_published  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN attendance_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN weekly_summary    BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN streak_reminder   BOOLEAN NOT NULL DEFAULT TRUE;  -- NF-5

-- Req 6: Webhook idempotency
ALTER TABLE payment_transactions
  ADD CONSTRAINT uq_payment_transactions_reference UNIQUE (transaction_reference);

-- NF-22/24: Grading mode
ALTER TABLE assignments
  ADD COLUMN grading_mode TEXT NOT NULL DEFAULT 'manual'
    CHECK (grading_mode IN ('auto', 'ai_assisted', 'manual'));
ALTER TABLE cbt_exams
  ADD COLUMN grading_mode TEXT NOT NULL DEFAULT 'auto'
    CHECK (grading_mode IN ('auto', 'ai_assisted', 'manual'));
ALTER TABLE assignment_submissions
  ADD COLUMN grading_mode        TEXT CHECK (grading_mode IN ('auto', 'ai_suggested', 'manual')),
  ADD COLUMN ai_suggested_grade  NUMERIC(5,2),
  ADD COLUMN ai_suggested_feedback TEXT;

-- NF-13: Portfolio share token
ALTER TABLE portal_users
  ADD COLUMN portfolio_share_token              TEXT,
  ADD COLUMN portfolio_share_token_expires_at   TIMESTAMPTZ;
```

### New Table: `study_groups`

```sql
CREATE TABLE study_groups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  course_id    UUID REFERENCES courses(id),
  school_id    UUID NOT NULL REFERENCES schools(id),
  created_by   UUID NOT NULL REFERENCES portal_users(id),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE study_group_members (
  group_id   UUID NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);
CREATE TABLE study_group_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES portal_users(id),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sgm_group_created ON study_group_messages(group_id, created_at DESC);
```

### New Tables: `flashcard_decks`, `flashcard_cards`, `flashcard_reviews`

```sql
CREATE TABLE flashcard_decks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  lesson_id   UUID REFERENCES lessons(id),
  course_id   UUID REFERENCES courses(id),
  school_id   UUID NOT NULL REFERENCES schools(id),
  created_by  UUID NOT NULL REFERENCES portal_users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE flashcard_cards (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id    UUID NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
  front      TEXT NOT NULL,
  back       TEXT NOT NULL,
  position   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE flashcard_reviews (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id        UUID NOT NULL REFERENCES flashcard_cards(id) ON DELETE CASCADE,
  student_id     UUID NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  next_review_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  interval_days  INT NOT NULL DEFAULT 1,
  ease_factor    NUMERIC(4,2) NOT NULL DEFAULT 2.50,
  repetitions    INT NOT NULL DEFAULT 0,
  UNIQUE (card_id, student_id)
);
CREATE INDEX idx_fr_student_review ON flashcard_reviews(student_id, next_review_at);
```

### New Tables: `parent_teacher_threads`, `parent_teacher_messages`

```sql
CREATE TABLE parent_teacher_threads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   UUID NOT NULL REFERENCES portal_users(id),
  teacher_id  UUID NOT NULL REFERENCES portal_users(id),
  student_id  UUID NOT NULL REFERENCES portal_users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (parent_id, teacher_id, student_id)
);
CREATE TABLE parent_teacher_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID NOT NULL REFERENCES parent_teacher_threads(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES portal_users(id),
  body        TEXT NOT NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_read     BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_ptm_thread_sent ON parent_teacher_messages(thread_id, sent_at DESC);
```

### New Tables: `consent_forms`, `consent_responses`

```sql
CREATE TABLE consent_forms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  due_date    TIMESTAMPTZ,
  created_by  UUID NOT NULL REFERENCES portal_users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE consent_responses (
  form_id    UUID NOT NULL REFERENCES consent_forms(id) ON DELETE CASCADE,
  parent_id  UUID NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  signed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (form_id, parent_id)
);
```

### New / Enhanced Table: `lesson_plans`

```sql
-- Existing table enhanced with new columns
ALTER TABLE lesson_plans
  ADD COLUMN IF NOT EXISTS plan_data           JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS status              TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  ADD COLUMN IF NOT EXISTS version             INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS curriculum_version_id UUID REFERENCES course_curricula(id),
  ADD COLUMN IF NOT EXISTS term_start          DATE,
  ADD COLUMN IF NOT EXISTS term_end            DATE,
  ADD COLUMN IF NOT EXISTS sessions_per_week   INT;
```

### New Table: `course_curricula`

```sql
CREATE TABLE course_curricula (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID NOT NULL REFERENCES courses(id),
  school_id   UUID NOT NULL REFERENCES schools(id),
  content     JSONB NOT NULL DEFAULT '{}',
  version     INT NOT NULL DEFAULT 1,
  created_by  UUID NOT NULL REFERENCES portal_users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, school_id)
);
```

### New Table: `term_schedules`

```sql
CREATE TABLE term_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_plan_id  UUID NOT NULL REFERENCES lesson_plans(id) ON DELETE CASCADE,
  school_id       UUID NOT NULL REFERENCES schools(id),
  is_active       BOOLEAN NOT NULL DEFAULT FALSE,
  current_week    INT NOT NULL DEFAULT 1,
  term_start      DATE NOT NULL,
  cadence_days    INT NOT NULL DEFAULT 7,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ts_active ON term_schedules(is_active) WHERE is_active = TRUE;
```

### `audit_logs` RLS and Usage Patterns

```sql
-- audit_logs already exists; ensure constraints and RLS
ALTER TABLE audit_logs
  ADD CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES portal_users(id),
  ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
-- School admins can SELECT rows where their school_id matches
-- No DELETE or UPDATE policy for any role (immutable append-only)
CREATE POLICY "school_admin select own school" ON audit_logs
  FOR SELECT USING (
    resource_type = 'payment_transaction'
    AND EXISTS (
      SELECT 1 FROM portal_users pu
      WHERE pu.id = auth.uid()
        AND pu.role = 'school_admin'
        AND pu.school_id = (
          SELECT pt.school_id FROM payment_transactions pt
          WHERE pt.id = audit_logs.resource_id::uuid LIMIT 1
        )
    )
  );
```

---

## New Database Migrations

| Migration File | Purpose |
|---|---|
| `20260501000001_web_push_subscriptions.sql` | Create `web_push_subscriptions` table, RLS, index; migrate legacy `push_sub_*` keys from `system_settings` |
| `20260501000002_cbt_sessions_deadline.sql` | Add generated `deadline` column to `cbt_sessions` |
| `20260501000003_point_transactions_unique.sql` | Add unique constraint on `(portal_user_id, activity_type, reference_id)`; backfill `total_points` from SUM |
| `20260501000004_payment_transactions_unique.sql` | Add unique constraint on `transaction_reference` in `payment_transactions` |
| `20260501000005_notification_prefs_columns.sql` | Add `payment_updates`, `report_published`, `attendance_alerts`, `weekly_summary`, `streak_reminder` columns |
| `20260501000006_grading_mode_columns.sql` | Add `grading_mode`, `ai_suggested_grade`, `ai_suggested_feedback` to `assignment_submissions`, `assignments`, `cbt_exams` |
| `20260501000007_study_groups.sql` | Create `study_groups`, `study_group_members`, `study_group_messages` + RLS |
| `20260501000008_flashcards.sql` | Create `flashcard_decks`, `flashcard_cards`, `flashcard_reviews` + RLS |
| `20260501000009_parent_teacher_chat.sql` | Create `parent_teacher_threads`, `parent_teacher_messages` + RLS |
| `20260501000010_consent_forms.sql` | Create `consent_forms`, `consent_responses` + RLS |
| `20260501000011_lesson_plans_enhanced.sql` | Add `plan_data`, `status`, `version`, `curriculum_version_id`, `term_start`, `term_end`, `sessions_per_week` to `lesson_plans` |
| `20260501000012_course_curricula.sql` | Create `course_curricula` + unique constraint + RLS |
| `20260501000013_term_schedules.sql` | Create `term_schedules` + index + RLS |
| `20260501000014_portfolio_share_token.sql` | Add `portfolio_share_token` and `portfolio_share_token_expires_at` to `portal_users` |
| `20260501000015_audit_logs_rls.sql` | Add RLS policies and FK constraint on `audit_logs` |
| `20260501000016_at_risk_rpc.sql` | Create / replace `get_at_risk_students(school_id UUID, class_id UUID)` RPC with `triggered_signals JSONB` output |
| `20260501000017_check_timetable_conflicts.sql` | Create `check_timetable_conflicts(slot JSONB)` Postgres function |
| `20260501000018_process_payment_atomic.sql` | Create `process_payment_atomic(reference TEXT, invoice_id UUID, amount NUMERIC)` RPC for atomic webhook processing |


---

## Components and Interfaces

### New / Modified Service Files

#### `src/services/push.service.ts` (new, replaces `src/lib/push.ts` subscription logic)

```ts
interface PushSubscriptionRow {
  id: string;
  portal_user_id: string;
  endpoint: string;
  subscription_json: PushSubscription;
  device_hint?: string;
}

class PushService {
  // Query web_push_subscriptions by portal_user_id
  async getSubscriptions(userId: string): Promise<PushSubscriptionRow[]>

  // Upsert a subscription (ON CONFLICT endpoint DO UPDATE)
  async saveSubscription(userId: string, sub: PushSubscription, deviceHint?: string): Promise<void>

  // Delete by endpoint
  async deleteSubscription(endpoint: string): Promise<void>

  // Send push to all subscriptions for a user; auto-delete on 410/404
  async sendToUser(userId: string, payload: {
    title: string;
    body: string;
    url: string;
    icon?: string;
  }): Promise<{ sent: number; deleted: number }>
}
```

The `sendToUser` method calls `webpush.sendNotification()` from `src/lib/push.ts` for each subscription. On HTTP 410 Gone or 404 Not Found from the push endpoint, it calls `deleteSubscription(endpoint)` immediately.

#### `src/services/gamification.service.ts` (modified)

```ts
// Key change: INSERT ... ON CONFLICT DO NOTHING + recalculate total_points from SUM
async awardPoints(params: {
  portalUserId: string;
  activityType: string;
  referenceId: string;
  points: number;
}): Promise<{ awarded: boolean; totalPoints: number }>

// Uses: INSERT INTO point_transactions (portal_user_id, activity_type, reference_id, points)
//   VALUES ($1, $2, $3, $4)
//   ON CONFLICT (portal_user_id, activity_type, reference_id) DO NOTHING;
// Then: SELECT SUM(points) FROM point_transactions WHERE portal_user_id = $1
```

#### `src/services/notifications.service.ts` (modified)

```ts
// Added: idempotency guard via Redis
// Added: preference category check before sending
async sendEmail(params: {
  to: string;
  templateId: string;
  variables: Record<string, string>;
  category: 'payment_updates' | 'report_published' | 'attendance_alerts'
           | 'weekly_summary' | 'streak_reminder' | 'email_enabled';
  eventType: string;
  referenceId: string;
}): Promise<void>

// Idempotency key: SHA-256(to + eventType + referenceId) → Redis SETNX with 10-min TTL
// If key exists: log suppression warning and return
// If preference for category is false: skip send and log
// On non-2xx from SendPulse: retry once after 30s; log failure if retry fails
```

#### `src/services/analytics.service.ts` (modified)

```ts
// Updated to call get_at_risk_students RPC with triggered_signals
async getAtRiskStudents(schoolId: string, teacherId?: string): Promise<AtRiskStudent[]>
// AtRiskStudent includes: id, name, triggered_signals: string[]

interface AtRiskStudent {
  portal_user_id: string;
  name: string;
  triggered_signals: Array<'no_login' | 'low_attendance' | 'overdue_assignments'>;
}
```

#### `src/services/payments.service.ts` (modified)

```ts
// Webhook handler now uses atomic RPC
async processPaystackWebhook(event: PaystackWebhookEvent): Promise<void>
// Calls: supabase.rpc('process_payment_atomic', { reference, invoice_id, amount })
// Idempotency: check payment_transactions WHERE transaction_reference = reference first

// New: PDF receipt generation using existing pdfmake import
async generateReceipt(transactionId: string, requestingUserId: string): Promise<Buffer>
```

#### `src/services/study-groups.service.ts` (new)

```ts
class StudyGroupsService {
  async createGroup(name: string, courseId: string, schoolId: string, createdBy: string): Promise<StudyGroup>
  async joinGroup(groupId: string, userId: string): Promise<void>
    // Check member count <= 20 before insert; throw ValidationError if at cap
  async leaveGroup(groupId: string, userId: string): Promise<void>
  async sendMessage(groupId: string, senderId: string, content: string): Promise<StudyGroupMessage>
  async getMembers(groupId: string): Promise<{ user_id: string; joined_at: string }[]>
}
```

#### `src/services/flashcards.service.ts` (new)

```ts
class FlashcardsService {
  async createDeck(deck: { title: string; lessonId?: string; courseId?: string; schoolId: string; createdBy: string }): Promise<FlashcardDeck>
  async addCard(deckId: string, card: { front: string; back: string; position: number }): Promise<FlashcardCard>
  async getDueCards(deckId: string, studentId: string): Promise<FlashcardCard[]>
    // WHERE next_review_at <= NOW()
  async recordReview(cardId: string, studentId: string, quality: 1 | 2 | 3 | 4 | 5): Promise<void>
    // Applies SM-2: if quality < 3: interval=1, repetitions=0; else interval=round(interval*ease), ease=max(1.3, ease+0.1-...)
}

// SM-2 formula (pure function, easily unit-tested):
function sm2(state: { intervalDays: number; easeFactor: number; repetitions: number }, quality: number): {
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  nextReviewAt: Date;
}
```

#### `src/services/parent-teacher-chat.service.ts` (new)

```ts
class ParentTeacherChatService {
  async getOrCreateThread(parentId: string, teacherId: string, studentId: string): Promise<PTThread>
  async sendMessage(threadId: string, senderId: string, body: string): Promise<PTMessage>
  async markRead(threadId: string, userId: string): Promise<void>
  async getThreadMessages(threadId: string, cursor?: { sent_at: string; id: string }): Promise<{ messages: PTMessage[]; nextCursor: string | null }>
    // Cursor pagination: 50 per page
  async getTeacherInbox(teacherId: string): Promise<PTThread[]>
}
```

#### `src/services/consent-forms.service.ts` (new)

```ts
class ConsentFormsService {
  async createForm(form: { schoolId: string; title: string; body: string; dueDate?: string; createdBy: string }): Promise<ConsentForm>
  async signForm(formId: string, parentId: string): Promise<void>
    // INSERT ... ON CONFLICT (form_id, parent_id) DO NOTHING; return 409 if already signed
  async getResponses(formId: string): Promise<ConsentResponse[]>
  async exportResponsesCSV(formId: string): Promise<string>  // CSV string
}
```

#### `src/services/lesson-plans.service.ts` (modified)

```ts
class LessonPlansService {
  async createPlan(params: LessonPlanInput): Promise<LessonPlan>
  async generateWithAI(planId: string, curriculumVersionId?: string): Promise<LessonPlan>
  async publishPlan(planId: string): Promise<void>
    // If existing published plan for same course/class/term: archive it first
  async bulkGenerateLessons(planId: string, onProgress: (n: number, total: number) => void): Promise<BulkResult>
  async bulkGenerateAssignments(planId: string, onProgress: (n: number, total: number) => void): Promise<BulkResult>
  async bulkGenerateProjects(planId: string, onProgress: (n: number, total: number) => void): Promise<BulkResult>
  async releaseWeek(planId: string, weekNumber: number): Promise<void>
}

interface BulkResult { generated: number; skipped: number; errors: string[] }
```

#### `src/services/curriculum.service.ts` (new)

```ts
class CurriculumService {
  async generateCurriculum(params: {
    courseId: string;
    schoolId: string;
    courseName: string;
    gradeLevel: string;
    termCount: number;
    weeksPerTerm: number;
    subjectArea: string;
    notes?: string;
    createdBy: string;
  }): Promise<CourseCurriculum>
  // ON CONFLICT (course_id, school_id): increment version, archive old content in JSONB history
  async getCurriculumVersions(courseId: string, schoolId: string): Promise<CurriculumVersion[]>
}
```

#### `src/services/grading.service.ts` (new)

```ts
class GradingService {
  async getSubmissions(filter: {
    schoolId?: string;
    teacherId?: string;
    status?: 'pending_review' | 'graded';
    cursor?: { created_at: string; id: string };
  }): Promise<{ submissions: Submission[]; nextCursor: string | null }>

  async acceptAIGrade(submissionId: string, actorId: string): Promise<void>
    // Sets final_grade = ai_suggested_grade, grading_mode = 'auto', status = 'graded'
    // Writes audit_logs row

  async overrideGrade(submissionId: string, finalGrade: number, actorId: string): Promise<void>
    // Sets final_grade, grading_mode = 'manual', status = 'graded'
    // Writes audit_logs row with old_value, new_value

  async bulkGrade(submissionIds: string[], grade: number, actorId: string): Promise<void>
}
```

#### `src/lib/validation.ts` (modified — adds two new utilities)

```ts
// RFC 5322 simplified
export function validateEmail(value: string): boolean

// 11 digits starting with 0, OR +234 followed by 10 digits
export function validateNigerianPhone(value: string): boolean

// Existing utilities unchanged: assertRequired, assertNumberRange, etc.
```

#### `src/lib/fileUpload.ts` (new)

```ts
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function validateAndCompressFile(file: File): Promise<File> {
  // 1. If image: compress via Canvas API to max 1200px width, quality 0.75
  // 2. Check MIME type ∈ ALLOWED_MIME_TYPES (after compression)
  // 3. Check compressed size <= MAX_FILE_SIZE_BYTES
  // Throws ValidationError on violation
}
```

---

## New / Modified API Routes

### Push Notification Routes

| Method | Path | Auth | Input | Output |
|---|---|---|---|---|
| POST | `/api/push/subscribe` | requireAuth | `{ subscription: PushSubscription; deviceHint?: string }` | `200 {}` |
| DELETE | `/api/push/unsubscribe` | requireAuth | `{ endpoint: string }` | `200 {}` |

`POST /api/push/subscribe` upserts into `web_push_subscriptions`. Retries on client: 3× exponential backoff before surfacing error.

### CBT Routes

| Method | Path | Auth | Input | Output |
|---|---|---|---|---|
| PATCH | `/api/cbt/sessions/[id]` | requireAuth, student | `{ answers: Record<string,unknown> }` | `200 { saved_at }` or `422 { error: 'DEADLINE_EXCEEDED', deadline }` |
| POST | `/api/cbt/sessions` | requireAuth, student | existing + checks deadline | `422 { error: 'DEADLINE_EXCEEDED' }` if late |

### System Routes

| Method | Path | Auth | Input | Output |
|---|---|---|---|---|
| GET | `/api/system/status` | none (public) | — | `{ maintenance_mode: boolean; minimum_web_version: string }` |

### Portfolio Routes

| Method | Path | Auth | Input | Output |
|---|---|---|---|---|
| POST | `/api/portfolio/share` | requireAuth, student | — | `{ url: string; expires_at: string }` |
| DELETE | `/api/portfolio/share` | requireAuth, student | — | `200 {}` |

### Billing Routes

| Method | Path | Auth | Input | Output |
|---|---|---|---|---|
| GET | `/api/billing/outstanding` | requireAuth, parent | — | `{ total: number; perStudent: { studentId, name, amount, overdueCount }[] }` |
| POST | `/api/payments/receipt/[transactionId]` | requireAuth | — | `application/pdf` binary or `403` |
| POST | `/api/billing/settlements` | requireAuth, parent | `{ invoiceId, instalments: { amount, dueDate }[] }` | `201 { plan }` |

### Lesson Plan Routes

| Method | Path | Auth | Input | Output |
|---|---|---|---|---|
| POST | `/api/lesson-plans/[id]/release-week` | requireAuth, teacher/admin | `{ weekNumber: number }` | `200 { released: number }` |
| POST | `/api/lesson-plans/[id]/generate-lessons` | requireAuth, teacher/admin | — | `200 { generated, skipped }` (SSE streaming progress) |
| POST | `/api/lesson-plans/[id]/generate-assignments` | requireAuth, teacher/admin | — | `200 { generated, skipped }` |
| POST | `/api/lesson-plans/[id]/generate-projects` | requireAuth, teacher/admin | — | `200 { generated, skipped }` |

### AI Routes

| Method | Path | Auth | Input | Output |
|---|---|---|---|---|
| POST | `/api/ai/homework-helper` | requireAuth, student | `{ message: string; enrolled_course_ids: string[]; history: {role,content}[] }` | SSE stream of AI tokens |
| POST | `/api/ai/generate` | requireAuth, teacher/admin | `{ type: 'curriculum'\|'lesson-plan'\|'cbt-grading'\|...; payload: object }` | `200 { result: object }` |

### Study Groups Routes

| Method | Path | Auth | Input | Output |
|---|---|---|---|---|
| GET | `/api/study-groups` | requireAuth, student | `?courseId` | `{ groups: StudyGroup[] }` |
| POST | `/api/study-groups` | requireAuth, student | `{ name, courseId }` | `201 { group }` |
| POST | `/api/study-groups/[id]/join` | requireAuth, student | — | `200 {}` or `409 { error: 'GROUP_FULL' }` |
| DELETE | `/api/study-groups/[id]/leave` | requireAuth, student | — | `200 {}` |
| GET | `/api/study-groups/[id]/messages` | requireAuth | `?cursor` | `{ messages, nextCursor }` |
| POST | `/api/study-groups/[id]/messages` | requireAuth, student | `{ content: string }` | `201 { message }` |

### Flashcard Routes

| Method | Path | Auth | Input | Output |
|---|---|---|---|---|
| GET | `/api/flashcards/decks` | requireAuth | `?courseId` | `{ decks }` |
| POST | `/api/flashcards/decks` | requireAuth, teacher | `{ title, lessonId?, courseId }` | `201 { deck }` |
| POST | `/api/flashcards/decks/[id]/cards` | requireAuth, teacher | `{ front, back, position }` | `201 { card }` |
| GET | `/api/flashcards/decks/[id]/due` | requireAuth, student | — | `{ cards }` |
| POST | `/api/flashcards/reviews` | requireAuth, student | `{ cardId, quality: 1-5 }` | `200 { nextReviewAt }` |

### Consent Forms Routes

| Method | Path | Auth | Input | Output |
|---|---|---|---|---|
| GET | `/api/consent-forms` | requireAuth | — | `{ forms }` |
| POST | `/api/consent-forms` | requireAuth, teacher/admin | `{ title, body, dueDate? }` | `201 { form }` |
| POST | `/api/consent-forms/[id]/sign` | requireAuth, parent | — | `200 {}` or `409 { error: 'ALREADY_SIGNED' }` |
| GET | `/api/consent-forms/[id]/export` | requireAuth, teacher/admin | — | `text/csv` |

### Grading Routes

| Method | Path | Auth | Input | Output |
|---|---|---|---|---|
| GET | `/api/grading/submissions` | requireAuth, teacher/admin | `?status&cursor` | `{ submissions, nextCursor }` |
| PATCH | `/api/grading/submissions/[id]` | requireAuth, teacher/admin | `{ action: 'accept_ai'\|'override'; finalGrade?: number }` | `200 { submission }` |
| POST | `/api/grading/submissions/bulk` | requireAuth, teacher/admin | `{ submissionIds: string[]; grade: number }` | `200 { updated }` |

### Cron Routes

| Method | Path | Auth | Input | Output |
|---|---|---|---|---|
| POST | `/api/cron/term-scheduler` | CRON_SECRET header | — | `200 { processed }` |
| POST | `/api/cron/streak-reminder` | CRON_SECRET header | — | `200 { sent }` |
| POST | `/api/cron/weekly-summary` | CRON_SECRET header | — | `200 { sent }` |

All new routes use `withApiProxy` with `requireAuth: true` and explicit `roles[]`, except `/api/system/status` and `/api/payments/webhook` which are intentionally public (documented in `withApiProxy` config).


---

## New Dashboard Pages

| Path | Component File | Purpose | Key Sections |
|---|---|---|---|
| `/dashboard/support` | `src/app/dashboard/support/page.tsx` | Req 12: Support ticket list + create + thread view | Ticket list (cursor-paginated), create form (subject + description), thread detail with reply input, school-admin view of all school tickets |
| `/dashboard/study-groups` | `src/app/dashboard/study-groups/page.tsx` | NF-3: Peer study groups | Group list scoped to enrolled courses, create group form, join/leave buttons, member cap indicator |
| `/dashboard/study-groups/[id]` | `src/app/dashboard/study-groups/[id]/page.tsx` | NF-3: Group chat + code pad | Supabase Realtime chat panel, shared plain-text code pad with JS/Python highlighting via highlight.js, last-write-wins sync |
| `/dashboard/flashcards` | `src/app/dashboard/flashcards/page.tsx` | NF-4: Flashcard decks browser | Deck list by course/lesson, "Start Review" button per deck, "No cards due" empty state with next review date |
| `/dashboard/flashcards/[deckId]/review` | `src/app/dashboard/flashcards/[deckId]/review/page.tsx` | NF-4: SM-2 review session | Card flip animation, quality buttons 1–5, progress indicator, summary on session end |
| `/dashboard/consent-forms` | `src/app/dashboard/consent-forms/page.tsx` | NF-8: Consent form management | Create form (admin/teacher), form list with response count, "Export CSV" button, parent view shows pending/signed status |
| `/dashboard/grading` | `src/app/dashboard/grading/page.tsx` | NF-22/23/24: Unified grading | Role-scoped submission list, AI suggested grade panel with confidence badge, accept/override inputs, bulk grade action, grading mode badge per row |
| `/dashboard/curriculum` | `src/app/dashboard/curriculum/page.tsx` | NF-16: Curriculum generator + viewer | "Generate Curriculum" form, version history list, curriculum detail with JSON content rendered as rich text |
| `/dashboard/homework-helper` | `src/app/dashboard/homework-helper/page.tsx` | NF-1: AI chat tutor | Chat message thread (SSE streaming), scoped to enrolled courses, inline retry on stream failure, session-only history |
| `/student/[token]` | `src/app/student/[token]/page.tsx` | NF-13: Public portfolio | Read-only portfolio view, no auth required, 410 Gone page on expired/missing token |

### Modified Pages

| Path | Changes |
|---|---|
| `/dashboard/lesson-plans` | Redesigned to term-level plans: new creation form with `start_date`, `end_date`, `sessions_per_week`, curriculum reference; status badges; version indicator |
| `/dashboard/lesson-plans/[id]` | Added: Content Dashboard tab, "Generate All Lessons/Assignments/Projects" buttons with SSE progress, "Activate Scheduler" section showing `current_week`, "Release Now" button |
| `/dashboard/messages` | Added: parent-teacher threads panel, unread badge via Supabase Realtime, "Load Earlier" cursor pagination |
| `/dashboard/portfolio` | Added: share link card with expiry date, Copy Link + Web Share API + Revoke buttons |
| `/dashboard/overview` (parent) | Added: Outstanding Balance widget with per-student breakdown, "Pay Now" button, 5-minute client-side cache |
| `/dashboard/announcements` | Added: audience selector (all/students/parents/teachers/class), draft save, Published/Draft/Expired status badges |

---

## Autonomous Term Engine Flow

The term engine covers NF-12 through NF-25 and operates in six stages:

```
Stage 1: Curriculum Generation (NF-16)
  School Admin → /dashboard/curriculum
    → POST /api/ai/generate { type: 'curriculum', payload: { courseId, schoolId, ... } }
    → curriculumService.generateCurriculum()
    → INSERT into course_curricula (version=1)
    → ON CONFLICT (course_id, school_id): increment version, preserve history in JSONB

Stage 2: Lesson Plan Generation (NF-12/17)
  Teacher/Admin → /dashboard/lesson-plans → "New Plan"
    → Form: course, class, school, term, start_date, end_date, sessions_per_week, curriculum_version_id?
    → POST /api/ai/generate { type: 'lesson-plan', payload: { curriculum_content?, ... } }
    → lessonPlansService.createPlan() → status='draft', version=1
    → If regenerating published plan: PATCH existing to status='archived' first
    → Teacher reviews inline week entries, edits per-week teacher notes
    → POST /api/lesson-plans/[id] { status: 'published' }

Stage 3: Bulk Content Generation (NF-18/19/20)
  Teacher → lesson plan detail → "Generate All Lessons" / "Assignments" / "Projects"
    → POST /api/lesson-plans/[id]/generate-lessons (SSE streaming response)
    → API Route iterates plan_data.weeks:
        for each week: POST /api/ai/generate { type: 'lesson', payload: week }
        → save as status='draft' lesson linked to plan_id
        → emit SSE: { generated: N, total: M }
    → Per-item failure: log + emit warning event + continue
    → Final SSE event: { done: true, generated, skipped }
    → Teacher reviews drafts → PATCH lesson { status: 'published' } per item (approval)

Stage 4: Scheduler Activation (NF-21)
  Teacher → lesson plan detail → "Scheduler" section → "Activate"
    → POST /api/lesson-plans/[id]/schedule { term_start, cadence_days }
    → INSERT into term_schedules { is_active: true, current_week: 1, term_start, cadence_days }

Stage 5: Automated Weekly Release (NF-21)
  Vercel Cron: every Monday 05:00 UTC → POST /api/cron/term-scheduler
  Handler (authenticated via CRON_SECRET):
    → SELECT * FROM term_schedules WHERE is_active = TRUE
    → For each schedule:
        week_number = current_week
        UPDATE lessons/assignments/projects
          SET status='published', published_at=NOW()
          WHERE lesson_plan_id = plan_id
            AND week_number = week_number
            AND status = 'published' (teacher-approved)
        → INCREMENT term_schedules.current_week
    → Manual override: POST /api/lesson-plans/[id]/release-week { weekNumber }

Stage 6: Auto-Grading Pipeline (NF-22/23/24)
  Student submits assignment/CBT → API Route reads grading_mode from parent record
    → If 'auto':    compute score inline → status='graded' (visible to student)
    → If 'ai_assisted':
        POST /api/ai/generate { type: 'cbt-grading', payload: { question, rubric, answer, maxScore } }
        → store ai_suggested_grade, ai_suggested_feedback, status='pending_review'
        → NOT visible to student until teacher action
    → If 'manual':  status='pending_review', awaits teacher in /dashboard/grading
  Teacher in /dashboard/grading:
    → "Accept AI Grade": PATCH { action: 'accept_ai' } → status='graded'
    → "Override": PATCH { action: 'override', finalGrade } → status='graded' + audit_log
  On status='graded': notify student via push + email (if prefs allow)
```

---

## Notification System Design

### Push Subscription Lifecycle

```
1. User opens browser, grants notification permission
   → Browser: Notification.requestPermission() + pushManager.subscribe(VAPID_PUBLIC_KEY)
   → Client: POST /api/push/subscribe { subscription, deviceHint }
     → web_push_subscriptions UPSERT ON CONFLICT (endpoint) DO UPDATE SET updated_at=NOW()
   → On network failure: retry up to 3× with exponential backoff (1s, 2s, 4s)

2. User revokes notification permission
   → Client: DELETE /api/push/unsubscribe { endpoint }
   → DELETE FROM web_push_subscriptions WHERE endpoint = $1

3. Sending a push notification (pushService.sendToUser)
   → SELECT * FROM web_push_subscriptions WHERE portal_user_id = $1
   → For each subscription: webpush.sendNotification(sub, payload)
   → On HTTP 410 Gone or 404 Not Found:
     → DELETE FROM web_push_subscriptions WHERE endpoint = sub.endpoint
   → Payload always includes 'url' field for deep-link routing
```

### Deep-Link URL Map

| Notification Type | `url` Field Value |
|---|---|
| `payment_confirmed` | `/dashboard/payments/invoices/[invoiceId]` |
| `report_published` | `/dashboard/results/[reportId]` |
| `assignment_graded` | `/dashboard/assignments/[submissionId]` |
| `support_ticket` | `/dashboard/support/[ticketId]` |
| `announcement` | `/dashboard/notifications` |
| `streak_reminder` | `/dashboard/learning` |
| `instalment_due` | `/dashboard/payments/invoices/[invoiceId]` |
| `consent_form` | `/dashboard/consent-forms/[formId]` |
| `parent_message` | `/dashboard/messages/[threadId]` |
| *(unrecognised)* | `/dashboard` |

The service worker `notificationclick` handler reads `event.notification.data.url` and calls `clients.openWindow(url)`. If `url` is absent, falls back to `/dashboard`.

### Preference Enforcement Per Category

Before any `sendEmail()` or `sendToUser()` call, the service checks the corresponding `notification_preferences` column:

| Trigger | Preference Column Checked |
|---|---|
| Payment confirmed / instalment due | `payment_updates` |
| Report published / certificate issued | `report_published` |
| Attendance alert | `attendance_alerts` |
| Weekly summary email | `weekly_summary` |
| Streak reminder push | `streak_reminder` |
| Any email | `email_enabled` |

If the preference is `false`, the dispatch is skipped with a `console.warn` log entry.

### Idempotency Guard Pattern

```ts
// In notificationsService.sendEmail():
const key = sha256(`${to}:${eventType}:${referenceId}`);
const existing = await redis.get(`email_idem:${key}`);
if (existing) {
  console.warn('[notifications] Suppressed duplicate email', { key, to });
  return;
}
await redis.setex(`email_idem:${key}`, 600, '1'); // 10-minute TTL
// Proceed with SendPulse dispatch
```

For the weekly summary cron, the key is `weekly_summary:${parentEmail}:${weekStartDate}` with a 7-day TTL.

---

## Security & Validation Design

### Per-Endpoint Rate Limiting

```ts
// /api/public/student — 10 req/60s per IP
const limit = await rateLimitProxy.check(req, { key: ip, max: 10, window: 60 });

// /api/payments/registration — 3 req/5min per email
const limit = await rateLimitProxy.check(req, { key: email, max: 3, window: 300 });

// On exceed: throw new RateLimitError('Too many requests. Please wait before trying again.', retryAfter)
// withApiProxy maps RateLimitError → HTTP 429 + { error, retryAfter }
```

Both use Upstash Redis with in-memory Map fallback, consistent with existing `rateLimitProxy` in `src/proxies/rateLimit.proxy.ts`.

### File Validation + Canvas Compression

Pipeline in `src/lib/fileUpload.ts`:
```
1. User selects file via <input type="file">
2. If MIME type ∈ { image/jpeg, image/png, image/webp }:
   a. Draw to <canvas> element
   b. Resize: if width > 1200px, scale proportionally to maxWidth=1200, quality=0.75
   c. canvas.toBlob('image/jpeg', 0.75) → new compressed File
3. Validate compressed MIME type ∈ ALLOWED_MIME_TYPES
4. Validate compressed size ≤ 10 MB (compression runs first, per Req 17.3)
5. On violation: throw ValidationError with field name — rendered inline, no modal
Server-side (upload API Route):
   Re-validate MIME type and size; return HTTP 400 + { error, field } on failure
```

### Session Expiry Hook

Implemented in `src/hooks/useSessionExpiry.ts`, called in `src/app/dashboard/layout.tsx`:

```ts
// Decode JWT exp claim from Supabase session
// When now > exp - 5 minutes: show non-blocking banner
// On any user interaction within 60s of banner: silently call supabase.auth.refreshSession()
// On refresh failure: supabase.auth.signOut() + router.push('/login?reason=session_expired')
// On any API 401: one silent refresh attempt; if retry is also 401: redirect to /login
```

### Error Boundary in Dashboard Layout

`src/app/dashboard/layout.tsx` wraps `{children}` with the existing `ErrorBoundary` component from `src/components/ui/ErrorBoundary.tsx`:

```tsx
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary
      onError={(error, componentStack) => {
        // Server action: write activity_logs row with error.message, componentStack, userId
      }}
    >
      {/* nav, sidebar, etc. */}
      {children}
    </ErrorBoundary>
  );
}
```

In production, the error UI shows "Something went wrong on this page." with a "Try Again" button (calls `ErrorBoundary.reset()`). Raw stack traces are never shown in production.

### Structured Error Response Pattern

All API routes return errors as:
```json
{ "error": "Human-readable message", "code"?: "MACHINE_CODE", "field"?: "fieldName" }
```

`withApiProxy` maps error classes:
- `ValidationError` → HTTP 400 + `field`
- `AuthError` → HTTP 401
- HTTP 403 for role mismatch
- `RateLimitError` → HTTP 429 + `retryAfter`
- `AppError` (generic) → HTTP 400 or 422
- Unhandled → HTTP 500 + `{ "error": "An unexpected error occurred." }` (no stack trace in production)

### Input Validation Utilities

```ts
// src/lib/validation.ts additions:

// RFC 5322 simplified: local@domain.tld
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function validateEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

// 11 digits starting with 0, OR +234 followed by 10 digits
export const NG_PHONE_REGEX = /^(0\d{10}|\+234\d{10})$/;
export function validateNigerianPhone(value: string): boolean {
  return NG_PHONE_REGEX.test(value.trim());
}
```

Applied client-side via React Hook Form + inline field-level error display. Same regex re-validated server-side in relevant API routes. Submit buttons remain disabled until all validations pass (`formState.isValid`).

### Search Input Debouncing

```ts
// src/hooks/useDebounce.ts
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    if (value === '' || value === null) {
      setDebounced(value);  // bypass debounce on clear
      return;
    }
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
```

Applied to all search/filter inputs across dashboard pages (students, transactions, invoices, leaderboard, etc.).

### Cursor-Based Pagination Pattern

```ts
// Supabase query pattern used across all heavy list endpoints:
const query = supabase
  .from('table')
  .select('*')
  .order('created_at', { ascending: false })
  .order('id', { ascending: false })
  .limit(20);

if (cursor) {
  // Compound cursor: rows before this position
  query.or(
    `created_at.lt.${cursor.created_at},` +
    `and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
  );
}
// Response: { data, nextCursor: last_row ? { created_at, id } : null }
```

Applied to: `payment_transactions`, `invoices`, leaderboard (points), `activity_logs`, `parent_teacher_messages` (50/page), `grading/submissions`.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

---

### Property 1: Gamification Idempotency — Unique Transactions Sum Equals Total Points

*For any* sequence of `awardPoints()` calls sharing the same `(portal_user_id, activity_type, reference_id)` triple (regardless of how many times called), the `point_transactions` table must contain exactly one row for that triple, and the user's `total_points` must equal the sum of all distinct `point_transactions.points` for that user — never more.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4**

---

### Property 2: CBT Deadline Enforcement — Late Submissions Rejected

*For any* CBT session with a computed `deadline`, a submission where `submitted_at > deadline + 30 seconds` must be rejected with HTTP 422 and `{ error: 'DEADLINE_EXCEEDED' }`. A submission where `submitted_at <= deadline + 30 seconds` must be accepted.

**Validates: Requirements 2.1, 2.2**

---

### Property 3: Instalment Sum Equals Invoice Total

*For any* instalment plan configuration, the sum of all instalment amounts must equal the invoice total exactly. Any configuration where the sum differs by even one unit must be rejected by the server before saving, returning HTTP 422.

**Validates: Requirements NF-9.2, NF-9.3**

---

### Property 4: Study Group Membership Cap at 20

*For any* study group, the count of rows in `study_group_members` for that group must never exceed 20. Any `joinGroup()` call that would bring the count to 21 or more must be rejected with HTTP 409 `{ error: 'GROUP_FULL' }`.

**Validates: Requirements NF-3.2**

---

### Property 5: SM-2 Next Review Date Monotonicity

*For any* flashcard review state `(intervalDays, easeFactor, repetitions)` and any quality rating `q ∈ {1, 2, 3, 4, 5}`, calling `sm2(state, q)` must return a `nextReviewAt` date that is greater than or equal to today, `intervalDays >= 1`, and `easeFactor >= 1.3`. For `q < 3`: `repetitions` resets to 0 and `intervalDays` resets to 1. For `q >= 3`: `intervalDays = max(1, round(old_interval * ease_factor))`.

**Validates: Requirements NF-4.3, NF-4.4**

---

### Property 6: Curriculum Uniqueness per (course_id, school_id)

*For any* two rows in `course_curricula`, they must not share the same `(course_id, school_id)` pair. Any attempt to insert a second curriculum for the same pair must either increment the version on the existing row (upsert) or be rejected — it must never result in two distinct rows with the same pair.

**Validates: Requirements NF-16.2, NF-16.3**

---

### Property 7: Term Scheduler Release Timing Invariant

*For any* content item released by the term scheduler cron, its `published_at` timestamp must satisfy: `published_at >= term_start + (week_number - 1) * cadence_days`. Content for week N must never be released before the start of week N's scheduled date.

**Validates: Requirements NF-21.2, NF-21.3**

---

### Property 8: AI-Suggested Grade Not Visible to Student Before Graded

*For any* `assignment_submissions` row where `grading_mode = 'ai_suggested'` and `status != 'graded'`, a query executed under the student's RLS context must not return `ai_suggested_grade`, `ai_suggested_feedback`, or `final_grade` — these fields must be null or omitted until `status = 'graded'`.

**Validates: Requirements NF-22.3, NF-22.7**

---

### Property 9: Portfolio Share Token Expiry Set to NOW() + 30 Days

*For any* call to `POST /api/portfolio/share`, the resulting `portal_users.portfolio_share_token_expires_at` must be within ±60 seconds of `NOW() + 30 days` at the time of generation. A token that does not have an expiry within this range must be treated as invalid.

**Validates: Requirements NF-13.1, 23.1**

---

### Property 10: Email Idempotency — One Send per Event per 10-Minute Window

*For any* `(recipient_email, event_type, reference_id)` triple, if `sendEmail()` is called two or more times within a 10-minute window with identical values, exactly one email must be dispatched to the recipient. All subsequent calls within the window must be suppressed with a warning log.

**Validates: Requirements 24.1, 24.2, 24.3**

---

### Property 11: File Size Rejection Above 10 MB

*For any* file where the compressed byte size exceeds 10,485,760 bytes (10 MB), `validateAndCompressFile()` must throw a `ValidationError` and no network upload request must be initiated. Files at or below 10 MB must not be rejected on size grounds.

**Validates: Requirements 17.1, 17.3**

---

### Property 12: MIME Type Allowlist Enforcement

*For any* file whose MIME type is not one of `{ image/jpeg, image/png, image/webp, application/pdf }`, both the client-side `validateAndCompressFile()` and the server-side upload API route must reject it before any upload occurs, returning an inline field-level error (client) or HTTP 400 `{ error, field }` (server).

**Validates: Requirements 17.1, 17.5**

---

### Property 13: Rate Limit Returns 429 After Threshold Exceeded

*For any* IP address making requests to `/api/public/student`, after the 10th request within a 60-second window, every subsequent request within that window must receive HTTP 429 with `{ "error": "Too many requests. Please wait before trying again.", "retryAfter": <seconds> }`. The same property holds for `/api/payments/registration` keyed on email (threshold: 3 per 5 minutes).

**Validates: Requirements 7.1, 7.2, 7.3**

---

### Property 14: Queue Enforces Email-Only Job Type

*For any* attempt to call `queueService` with a job where `type !== 'email'`, TypeScript must produce a compile-time type error, and at runtime the `process-notifications` cron handler must discard the job with a `console.warn` log and not dispatch it. No `'sms'` or `'whatsapp'` jobs must ever be enqueued or processed.

**Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5**

---

### Property 15: Webhook Idempotency — One Row per Transaction Reference

*For any* Paystack webhook delivered one or more times with the same `transaction_reference`, the `payment_transactions` table must contain exactly one row with that reference after all deliveries have been processed. Duplicate deliveries must return HTTP 200 without creating additional rows or re-triggering invoice updates.

**Validates: Requirements 6.2, 6.3**

---

### Property 16: Payment Atomicity — Both Updates or Neither

*For any* Paystack webhook processed by `process_payment_atomic()` RPC, either both the `payment_transactions` row and the linked `invoices` row are updated to the new status, or neither is — there must be no intermediate state where one is updated and the other is not. If the invoice update fails, the transaction row must be rolled back.

**Validates: Requirements 6.1**

---

### Property 17: Cursor Pagination Completeness — No Duplicates, No Gaps

*For any* dataset of N rows in a cursor-paginated list (transactions, invoices, leaderboard, activity logs), fetching all pages by following `nextCursor` until it is `null` must yield exactly N rows: no row appears more than once, no row is skipped, and each individual page contains at most 20 rows. The property must hold even if rows are inserted concurrently between page fetches.

**Validates: Requirements 10.1, 10.2, 10.3, 10.4**

---

### Property 18: Push Subscription Cleanup on 410/404

*For any* Web Push dispatch where the push service returns HTTP 410 Gone or HTTP 404 Not Found for a subscription endpoint, the `pushService.sendToUser()` method must delete the corresponding row from `web_push_subscriptions` before returning. Subsequent sends to the same user must not include that endpoint.

**Validates: Requirements 1.4, NF-5.6**

---

### Property 19: Nigerian Phone Format Validation

*For any* string `s`, `validateNigerianPhone(s)` must return `true` if and only if `s` is exactly an 11-digit string starting with `0` or the string `+234` followed by exactly 10 digits. All other strings — including strings with spaces, dashes, parentheses, shorter or longer digit counts, or different country codes — must return `false`.

**Validates: Requirements 18.2**

---

### Property 20: Email Format Validation

*For any* string `s`, `validateEmail(s)` must return `true` if and only if `s` matches the RFC 5322 simplified pattern (at least one non-whitespace/@ character before `@`, at least one non-whitespace/@ character after `@`, a `.`, and at least one non-whitespace/@ character after the last `.`). Strings without `@`, with multiple `@`, with leading/trailing spaces after trim, or without a valid domain part must return `false`.

**Validates: Requirements 18.1**

---


---

## Error Handling

### Client-Side Error Handling

| Error Class | Client Handling |
|---|---|
| Network error / fetch failure | Show inline retry button; for CBT auto-save: keep answers in memory, retry every 30s |
| HTTP 401 | One silent `supabase.auth.refreshSession()`; on failure: redirect to `/login?reason=session_expired` |
| HTTP 403 | Show "You don't have permission" inline message |
| HTTP 409 | Show specific conflict message (e.g. "Already signed", "Group full", "Already paid") |
| HTTP 422 `DEADLINE_EXCEEDED` | Show deadline-expired panel; disable further CBT submission |
| HTTP 429 | Show rate limit message with countdown using `retryAfter` seconds |
| HTTP 410 (portfolio token) | Render "This link has expired" page |
| HTTP 500 | Show "Something went wrong" with retry button |
| SSE stream failure (AI) | Show inline retry button without clearing conversation history |
| ErrorBoundary catch | Show "Something went wrong on this page." + "Try Again" button; log to `activity_logs` via server action |

All errors are displayed as field-level inline messages (for form errors) or toast notifications (for non-form errors). No raw stack traces or Supabase error codes are shown to users in production.

### Server-Side Error Handling

All API routes use `withApiProxy`, which catches all `AppError` subclasses and maps them to structured JSON responses. Error handler behaviour:

```ts
// src/lib/api-wrapper.ts (modified to handle all AppError subclasses)
if (error instanceof ValidationError) return json({ error: error.message, field: error.field }, 400);
if (error instanceof AuthError)       return json({ error: error.message }, 401);
if (error instanceof RateLimitError)  return json({ error: error.message, retryAfter: error.retryAfter }, 429);
if (error instanceof AppError)        return json({ error: error.message, code: error.code }, error.status ?? 400);
// Unhandled: log server-side; return generic 500
return json({ error: 'An unexpected error occurred.' }, 500);
```

Webhook routes (`/api/payments/webhook`) return HTTP 500 on partial failures so Paystack retries delivery. AI bulk generation endpoints catch per-item failures, log them, and continue — never halt the batch.

---

## Testing Strategy

### Dual Testing Approach

Both unit tests and property-based tests are required and complementary:
- Unit tests: specific examples, integration points, edge cases, error conditions
- Property tests: universal correctness across randomly generated inputs (via fast-check)

Together they provide comprehensive coverage: unit tests catch concrete bugs, property tests verify general correctness invariants.

### Property-Based Testing

**Library**: [fast-check](https://github.com/dubzzz/fast-check) — TypeScript-native, integrates with Vitest/Jest.

**Configuration**: Each property test runs a minimum of 100 iterations (`numRuns: 100`).

**Tag format**: Each property test file includes a comment:
```
// Feature: rillcod-web-improvements, Property N: <property_text>
```

Each correctness property must be implemented by a single property-based test.

**Property Test Mapping**:

| Property | Test File | fast-check Arbitraries |
|---|---|---|
| P1: Gamification idempotency | `__tests__/gamification.service.pbt.ts` | `fc.array(fc.record({ activityType: fc.string(), referenceId: fc.string(), points: fc.integer({min:1,max:1000}) }))` |
| P2: CBT deadline enforcement | `__tests__/cbt.service.pbt.ts` | `fc.date()` for deadline, `fc.integer({min:-60,max:120})` for seconds offset |
| P3: Instalment sum | `__tests__/billing.service.pbt.ts` | `fc.integer({min:1,max:1000000})` for total, `fc.array(fc.integer({min:1,max:1000000}), {minLength:2,maxLength:3})` |
| P4: Study group cap | `__tests__/study-groups.service.pbt.ts` | `fc.array(fc.uuid(), {minLength:18,maxLength:25})` for member ids |
| P5: SM-2 monotonicity | `__tests__/flashcards.service.pbt.ts` | `fc.integer({min:1,max:5})` for quality, `fc.float({min:1.3,max:2.5})` for ease, `fc.integer({min:1,max:365})` for interval |
| P6: Curriculum uniqueness | `__tests__/curriculum.service.pbt.ts` | `fc.uuid()` for courseId, `fc.uuid()` for schoolId |
| P7: Scheduler release timing | `__tests__/cron.term-scheduler.pbt.ts` | `fc.date()` for termStart, `fc.integer({min:1,max:20})` for weekNumber, `fc.integer({min:1,max:14})` for cadence |
| P8: AI grade visibility | `__tests__/grading.service.pbt.ts` | `fc.constantFrom('auto','ai_suggested','manual')` for gradingMode, `fc.constantFrom('pending_review','graded')` for status |
| P9: Portfolio token expiry | `__tests__/portfolio.service.pbt.ts` | `fc.date()` for now |
| P10: Email idempotency | `__tests__/notifications.service.pbt.ts` | `fc.record({ email: fc.emailAddress(), eventType: fc.string(), referenceId: fc.string() })`, `fc.integer({min:2,max:10})` for duplicate call count |
| P11: File size rejection | `__tests__/fileUpload.pbt.ts` | `fc.integer({min:0,max:20_000_000})` for compressed size |
| P12: MIME type allowlist | `__tests__/fileUpload.pbt.ts` | `fc.string()` for MIME type |
| P13: Rate limit 429 | `__tests__/rateLimitProxy.pbt.ts` | `fc.string()` for IP, `fc.integer({min:11,max:50})` for request count over threshold |
| P14: Queue email-only | `__tests__/queue.service.pbt.ts` | `fc.constantFrom('email','sms','whatsapp','push')` for job type |
| P15: Webhook idempotency | `__tests__/payments.service.pbt.ts` | `fc.string()` for reference, `fc.integer({min:2,max:5})` for delivery count |
| P16: Payment atomicity | `__tests__/payments.service.pbt.ts` | `fc.boolean()` for invoice update success/failure |
| P17: Cursor pagination | `__tests__/pagination.pbt.ts` | `fc.array(fc.record({ id: fc.uuid(), created_at: fc.date() }), {minLength:0,maxLength:200})` |
| P18: Push 410/404 cleanup | `__tests__/push.service.pbt.ts` | `fc.array(fc.string(), {minLength:1,maxLength:5})` for endpoints, `fc.constantFrom(200,410,404)` for response status |
| P19: Nigerian phone validation | `__tests__/validation.pbt.ts` | `fc.string()` for arbitrary strings, `fc.stringOf(fc.constantFrom(...digits), {minLength:10,maxLength:12})` for near-valid numbers |
| P20: Email validation | `__tests__/validation.pbt.ts` | `fc.emailAddress()` for valid, `fc.string()` for invalid |

### Unit Tests

Unit tests focus on:
- Specific examples: a known valid `+2348012345678` passes phone validation; `noatsign` fails email validation
- Integration points: `gamificationService.awardPoints()` calls `supabase.from('point_transactions').upsert()` with correct conflict target
- Edge cases: empty `plan_data` in lesson plan, zero-member study group query, flashcard deck with no due cards
- Error conditions: AI service returns non-2xx (throws `AppError`), Redis down (in-memory fallback used), PDF generation throws

**Test runner**: Vitest (preferred for Next.js 14 App Router projects) or Jest with `ts-jest`.

**Coverage targets**:
- All new service methods: ≥ 80% line coverage
- All new API routes: integration tests using Supabase local dev stack or mock Supabase client
- SM-2 `sm2()` pure function: 100% branch coverage (all 5 quality ratings tested)

### Integration Test Patterns for API Routes

```ts
// Pattern: test withApiProxy auth + role enforcement
it('returns 401 when unauthenticated', async () => {
  const res = await POST('/api/study-groups', { name: 'Test', courseId: 'x' });
  expect(res.status).toBe(401);
});

it('returns 409 when group is at cap', async () => {
  // Seed group with 20 members, attempt join
  const res = await POST(`/api/study-groups/${groupId}/join`, {});
  expect(res.status).toBe(409);
  expect(await res.json()).toMatchObject({ error: 'GROUP_FULL' });
});

// Pattern: test cursor pagination returns no duplicates
it('cursor pagination has no duplicates across pages', async () => {
  const allIds: string[] = [];
  let cursor: string | null = null;
  do {
    const url = cursor ? `/api/billing/transactions?cursor=${cursor}` : '/api/billing/transactions';
    const res = await GET(url);
    const { data, nextCursor } = await res.json();
    allIds.push(...data.map((r: any) => r.id));
    cursor = nextCursor;
  } while (cursor);
  expect(new Set(allIds).size).toBe(allIds.length); // no duplicates
});
```

