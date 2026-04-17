# Rillcod Academy — Platform Policies

> Last updated: 2026-04-15
> This document covers all access-control, financial, data-visibility, and operational policies enforced by the platform code and API routes.

---

## Table of Contents

1. [Role Definitions](#1-role-definitions)
2. [Authentication & Session Policy](#2-authentication--session-policy)
3. [Role-Based Access Control (RBAC)](#3-role-based-access-control-rbac)
   - 3.1 Dashboard Navigation
   - 3.2 Page-Level Guards
   - 3.3 API-Level Guards
4. [School Boundary Policy](#4-school-boundary-policy)
5. [Teacher School Assignment Policy](#5-teacher-school-assignment-policy)
6. [Class Enrollment Policy](#6-class-enrollment-policy)
7. [Finance & Billing Policies](#7-finance--billing-policies)
   - 7.1 Role Visibility in Smart Finance
   - 7.2 Invoice & Outstanding Display
   - 7.3 Payment Accounts Policy
   - 7.4 Admin / Payment Contact Policy
   - 7.5 Billing Cycles & Payment Flow
   - 7.6 Subscription Management
   - 7.7 Revenue Share Policy
8. [Report & Grading Policies](#8-report--grading-policies)
9. [Content & Library Policies](#9-content--library-policies)
10. [Student Data Visibility Policy](#10-student-data-visibility-policy)
11. [Multi-Tenant Data Isolation](#11-multi-tenant-data-isolation)

---

## 1. Role Definitions

| Role      | Description |
|-----------|-------------|
| `admin`   | Rillcod Technologies staff. Full access to all schools, students, finances, and settings. |
| `teacher` | A teacher assigned to one or more schools. Scoped to their assigned schools only. |
| `school`  | A partner school representative (owner/coordinator). Scoped to their own school. |
| `student` | An enrolled learner. Access limited to their own learning data, reports, and payments. |
| `parent`  | A parent/guardian. Access limited to their linked children's data and invoices. |

---

## 2. Authentication & Session Policy

- All authenticated routes require a valid Supabase session.
- The auth context performs a **two-phase load**:
  1. Fast-path: reads the stored user from `localStorage` synchronously.
  2. Profile fetch: loads `portal_users` record from Supabase.
- Pages that depend on role must wait for **both** `authLoading` and `profileLoading` to resolve before enforcing guards. This prevents flash-of-access-denied for valid users.
- Pattern:
  ```tsx
  const { profile, loading: authLoading, profileLoading } = useAuth();
  if (authLoading || profileLoading || !profile) return <Spinner />;
  ```
- `profile.grade_level` does not exist as a column; it is aliased from `portal_users.section_class` by the `/api/auth/me` route for backward compatibility.

---

## 3. Role-Based Access Control (RBAC)

### 3.1 Dashboard Navigation

Sidebar links are role-filtered in `DashboardNavigation.tsx`:

| Section | admin | teacher | school | student |
|---------|-------|---------|--------|---------|
| Overview / Dashboard | ✓ | ✓ | ✓ | ✓ |
| My Classes | ✓ | ✓ | ✓ | — |
| Students | ✓ | ✓ | ✓ | — |
| Courses / Programs | ✓ | ✓ | ✓ | ✓ |
| Learning Center | ✓ | ✓ | ✓ | ✓ |
| Progress Reports | ✓ | ✓ | — | — |
| My Report Card | — | — | — | ✓ |
| Student Reports | — | — | ✓ | — |
| Report Builder | ✓ | ✓ | — | — |
| Smart Finance | ✓ | ✓ (limited) | ✓ (scoped) | — |
| Library | ✓ | ✓ | ✓ (view) | ✓ (view) |
| Settings | ✓ | ✓ | ✓ | ✓ |
| Portfolio / Playground | ✓ | ✓ | ✓ | ✓ |

**Removed from teacher navigation (not applicable to teacher workflow):**
- Written Exams (`/dashboard/exams`)
- Lesson Plans (`/dashboard/lesson-plans`)

### 3.2 Page-Level Guards

- **Open to all authenticated users** (no role guard): playground, portfolio, learning center, settings.
- **Staff-only** (admin or teacher): report builder, grading.
- **Admin + Teacher + School** (read access): class details, student lists, financial records.
- **Admin only**: settlements, automation, subscription management.

### 3.3 API-Level Guards

All API routes enforce authorization at the route level using the service-role Supabase client:

```
requireStaff() → checks role ∈ {admin, teacher, school}
callerHasClassAccess() → checks teacher is assigned to class's school
```

Unauthorized requests receive `401` (no session) or `403` (insufficient role/scope).

---

## 4. School Boundary Policy

Non-admin users can only access data belonging to their assigned school.

**Enforcement points:**
- `/api/classes/[id]/students` — if caller role is `school`, the class's `school_id` must match `caller.school_id`.
- `/api/classes/[id]/enroll` — students from a different school cannot be enrolled into a class (returns 403 with a boundary violation message).
- `PaymentsHub` — school role queries are filtered to `school_id = profile.school_id`.
- `OverviewTab` — invoices are filtered to `school_id = profile.school_id` for school role.

**Legacy matching:** Some older student records use `school_name` (text) instead of `school_id` (UUID FK). Boundary checks compare both fields to prevent data leakage.

---

## 5. Teacher School Assignment Policy

A teacher can be assigned to **one or more schools** via:
1. `portal_users.school_id` — their primary school.
2. `teacher_schools` table — additional multi-school assignments.

**Rule:** A teacher may only access classes and enroll students in schools where they have an explicit assignment. A teacher with no school assignment cannot access any school's data.

**Resolution order for teacher school scope:**
1. Check `portal_users.school_id`.
2. Check `teacher_schools` rows for `teacher_id = caller.id`.
3. Union both sets as the teacher's authorized school IDs.

---

## 6. Class Enrollment Policy

### Student Enrollment into a Class

| Action | Who Can Perform |
|--------|----------------|
| Enroll single student (POST) | admin, teacher (own school), school |
| Bulk enroll (PUT) | admin, teacher (own school), school |
| Remove student (DELETE) | admin, teacher (own school), school |
| View enrollable students (GET) | admin, teacher (own school), school |

**Guards applied:**
- **Teacher school guard**: before any write, verify `cls.school_id` is in the teacher's authorized school IDs (see §5). Returns 403 if not.
- **Student boundary**: the student being enrolled must belong to the same school as the class. Cross-school enrollment is blocked with a clear error message.

**Auto-heal:** When the `/students` API detects a student enrolled in a program but without a `class_id`, it automatically assigns `class_id` and syncs `section_class` to the class name. This prevents bulk-enrolled students from disappearing after class rebuilds.

**Count sync:** After every enrollment change (single or bulk), `classes.current_students` is recalculated to an exact count — it never drifts.

---

## 7. Finance & Billing Policies

### 7.1 Role Visibility in Smart Finance

| Tab | admin | teacher | school |
|-----|-------|---------|--------|
| Overview | ✓ | — | ✓ (scoped) |
| Billing Cycles | ✓ | ✓ (view) | ✓ (scoped, pay) |
| Financial Records | ✓ | ✓ | ✓ (scoped) |
| Subscriptions | ✓ | — | — |
| Settlements | ✓ | — | — |
| Automation | ✓ | — | — |
| Setup (accounts + contact) | ✓ | — | ✓ (own school) |

### 7.2 Invoice & Outstanding Display

**For school role:**
- Invoices with status `sent` are displayed as **"Outstanding"** (not "Sent").
- Invoices with status `overdue` are displayed as **"Overdue — Action Required"**.
- **Paid invoices are hidden** from the school's recent activity view. Once a payment is cleared, it disappears from the list — it belongs to Rillcod's settled records.
- The overview section is titled **"Outstanding Invoices"** (not "Recent Invoice Activity") for school role.

**For admin/teacher role:**
- All invoice statuses displayed with standard labels: Draft, Sent, Paid, Overdue, Cancelled.
- Admin can mark invoices as paid using the "Mark Paid" button.

### 7.3 Payment Accounts Policy

**Admin:**
- Can create, edit, and delete any payment account (Rillcod company or school accounts).
- Can set `owner_type` to either `rillcod` or `school`.

**School role:**
- Can **add** their own school payment account (`owner_type = school`, `school_id = their school`).
- Can **edit** only their own school accounts — Rillcod company accounts are **view-only**.
- Cannot delete any account (admin only).
- School accounts are **visible to parents** alongside the Rillcod company account. A "Visible to parents" indicator is shown.
- When adding an account, `owner_type` and `school_id` are locked — a school cannot create a Rillcod-type account.

### 7.4 Admin / Payment Contact Policy

> Section name: **"Admin / Payment Contact"** (previously "Billing Contact")

**Purpose:** The primary finance contact used for invoice reminders and payment notifications.

**School role behavior:**
- If no contact has been set: the form is shown with a prompt — *"Enter your billing contact once."*
- If contact is already saved: the form is replaced with a **read-only display** of the contact details.
- A **"Change"** button appears to allow editing after initial setup.
- This ensures the contact is entered **once by the school owner** and is not accidentally overwritten.

**Admin behavior:**
- Always sees the editable form.
- Can select any school to view/set their billing contact.

### 7.5 Billing Cycles & Payment Flow

**What school sees:**
- Their own billing schedule (term windows, due dates, amounts).
- The admin-only description note is **hidden** for school and teacher roles.
- School sees a clean header: *"Your Billing Schedule"*.

**Cycle statuses and colors:**
| Status | Color | Meaning |
|--------|-------|---------|
| `due` | Amber | Payment is due |
| `past_due` | Rose/Red | Payment is overdue |
| `paid` | Emerald | Settled |
| `cancelled` | Grey | Cancelled |
| `rolled_over` | Grey | Closed by automation |

**Pay Now flow (school role only):**
- Cycles with status `due` or `past_due` show a **Pay Now strip** at the bottom of the cycle card.
- Clicking Pay Now reveals two payment options:
  1. **Bank Transfer** — Instruction to transfer to Rillcod Technologies using the invoice reference as narration, with a link to the Setup tab to view account details.
  2. **Paystack (Card / Bank)** — Online payment link with the amount pre-filled, routing to `/dashboard/my-payments`.
- School can collapse the payment options by clicking "Hide".

**Admin controls:**
- Admin can edit, delete (cancelled/rolled-over only), and manually change the status of any cycle.
- Delete is restricted to `cancelled` and `rolled_over` cycles only.

### 7.6 Subscription Management

- **Admin only** — the Subscriptions tab is no longer visible to school role.
- School subscription plans are managed exclusively by Rillcod Technologies admin.
- School role was removed from the subscriptions tab `roles` array.

### 7.7 Revenue Share Policy

Each school has a `rillcod_quota_percent` field (e.g. 60 = Rillcod takes 60%, school keeps 40%).

When generating a school invoice:
- `rillcodShare = subtotal × (rillcod_quota_percent / 100)` → amount owed to Rillcod.
- `schoolShare = subtotal − rillcodShare` → school's retained portion.
- If `show_revenue_share` is enabled, the invoice document shows both splits explicitly.
- The invoice `balance` (what the school pays to Rillcod) = `rillcodShare − deposit`.

---

## 8. Report & Grading Policies

### Who Can Create/Edit Reports
| Action | admin | teacher | school | student |
|--------|-------|---------|--------|---------|
| Build / publish report | ✓ | ✓ | — | — |
| View all reports | ✓ | ✓ | ✓ | — |
| View own report card | — | — | — | ✓ |
| Download PDF | ✓ | ✓ | ✓ | ✓ (own) |

### Pre-Portal Student Report Lookup
- Reports for students registered before the portal launch have `student_id = NULL` with `student_name` set as text.
- When a portal student's report lookup by `student_id` returns no result, a **name-based fallback** is performed: `WHERE student_id IS NULL AND student_name = profile.full_name AND is_published = true`.
- This ensures legacy report cards are surfaced to the correct student.

### Grading
- Only `admin` and `teacher` roles can grade assignment submissions.
- The `school` role cannot grade.
- Assignment submissions are matched by both `portal_user_id` and `user_id` columns to cover all submission paths.

---

## 9. Content & Library Policies

| Action | admin | teacher | school | student |
|--------|-------|---------|--------|---------|
| Upload content | ✓ | ✓ | — | — |
| Delete content | ✓ | ✓ | — | — |
| View/download content | ✓ | ✓ | ✓ | ✓ |

- `canUpload` = `admin || teacher` only. The `school` role cannot upload content.
- File storage uses Cloudflare R2 (`rillcod-assests` bucket) — not Supabase Storage.

---

## 10. Student Data Visibility Policy

### Who Can See Which Students
| Viewer | Visible students |
|--------|-----------------|
| admin | All students across all schools |
| teacher | Students at their assigned school(s) only |
| school | Students at their own school only |
| student | Own data only |

### Student List API (`/api/classes/[id]/students`)
Three-pass lookup to prevent students from disappearing:
1. **Primary**: `portal_users` where `class_id = classId`.
2. **Program fallback**: `enrollments` with `status ∈ {active, enrolled, approved}` for the class's program — students found here are auto-healed (`class_id` set to current class).
3. **Section fallback**: `portal_users` where `school_id` and `section_class` match — students found here are auto-healed.

Auto-heal also syncs `classes.current_students` to the actual count after each query.

---

## 11. Multi-Tenant Data Isolation

The platform is multi-tenant — multiple partner schools share the same database with strict data isolation.

### Key isolation rules

| Table | Isolation column | How enforced |
|-------|-----------------|--------------|
| `portal_users` | `school_id` | API + RLS |
| `classes` | `school_id` | API guard |
| `enrollments` | via `user_id → portal_users.school_id` | API |
| `invoices` | `school_id` | API query filter |
| `billing_cycles` | `owner_school_id` / `school_id` | API + auth check |
| `payment_accounts` | `school_id` (for `owner_type=school`) | API |
| `billing_settings` | `school_id` | API endpoint scoped |
| `subscriptions` | `school_id` | API query filter |

### Schema cross-reference rules (critical)
- `enrollments.user_id` → FK to `portal_users` (NOT `portal_user_id`).
- `enrollments` has a `role: string NOT NULL` column — always include `role: 'student'` on insert.
- `assignment_submissions.portal_user_id` = student FK; `graded_by` = teacher FK.
- Joining `portal_users` from `assignment_submissions` must specify: `portal_users!assignment_submissions_portal_user_id_fkey`.
- `schools.status` values: `pending | approved | rejected` (NOT `active`).

---

*This document is maintained by Rillcod Technologies. Code-level enforcement takes precedence over this document in the event of conflict.*


---

## 12. Cron Jobs & Automation Policies

### 12.1 Billing Reminders
- **Schedule**: Daily at 7:00 AM UTC (8:00 AM WAT)
- **Trigger**: Weeks 6, 7, 8 of term start date
- **Channels**: Email, WhatsApp, In-app notification
- **Recipients**: School billing contact or school email
- **Auto-rollover**: Paid cycles automatically create next term cycle

### 12.2 Invoice Reminders
- **Schedule**: Daily at 8:00 AM UTC (9:00 AM WAT)
- **Three-stage system**:
  1. Reminder 1: N days after invoice created
  2. Reminder 2: N days before due date
  3. Reminder 3: N days after due date (marks as overdue)
- **Configurable**: Via `system_settings` table (`billing_automation_config`)
- **Channels**: Email and in-app notification

### 12.3 Live Session Reminders
- **Schedule**: Every 15 minutes
- **Purpose**: Reminds students of upcoming live sessions
- **Service**: Uses `liveSessionService`

### 12.4 Notification Queue Processing
- **Schedule**: Every 5 minutes
- **Batch size**: 10 notifications per run
- **Retry logic**: Max 3 attempts with exponential backoff
- **Supported**: Email notifications only

### 12.5 Streak Reminders
- **Schedule**: Daily at 5:00 PM UTC (6:00 PM WAT)
- **Target**: Students with `streak_reminder` preference enabled
- **Checks**: No activity today (lessons, flashcards, CBT)
- **Timezone**: WAT (UTC+1)

### 12.6 Term Scheduler
- **Schedule**: Mondays at 5:00 AM UTC (6:00 AM WAT)
- **Purpose**: Auto-releases weekly lessons and assignments
- **Action**: Publishes draft content, increments `current_week`

### 12.7 Weekly Summary
- **Schedule**: Fridays at 5:00 PM UTC (6:00 PM WAT)
- **Target**: Parents with `weekly_summary` preference enabled
- **Content**: Student activity (lessons, assignments, attendance, XP)

### 12.8 Certificate Processing
- **Trigger**: Manual POST request
- **Purpose**: Generates PDFs for newly issued certificates
- **Service**: Uses `certificateService`

---

## 13. Edge Functions & Webhooks

### 13.1 Paystack Webhook
- **Endpoint**: `https://[project].supabase.co/functions/v1/paystack-webhook`
- **Security**: HMAC SHA-512 signature verification
- **Events**: `charge.success`
- **Actions**:
  - Updates `payment_transactions` status to `completed`
  - Updates `invoices` status to `paid`
  - Updates student registration status if applicable
  - Triggers receipt generation callback
- **Modes**:
  - Forwarding mode: Forwards to Next.js API route
  - Inline mode: Processes directly in edge function
- **Idempotency**: Prevents duplicate processing

---

## 14. Performance & Optimization Policies

### 14.1 Dashboard Performance
- **Target load time**: < 1.5 seconds
- **Caching**: 30-second client-side cache
- **Auto-refresh**: 60 seconds for teachers and admins
- **Database queries**: 2-3 queries (down from 10+)
- **Loading states**: Skeleton screens during data fetch

### 14.2 Database Query Optimization
- **Indexes**: 80+ indexes on foreign keys and common query patterns
- **RPC functions**: Optimized with CTEs and set-based operations
- **At-risk detection**: Single query for 1000+ students (was N queries)
- **Materialized views**: Admin dashboard stats pre-aggregated

### 14.3 API Response Caching
- **Cache TTL options**:
  - ONE_MINUTE: 60s
  - FIVE_MINUTES: 300s
  - THIRTY_MINUTES: 1800s
  - ONE_HOUR: 3600s
- **Implementation**: In-memory cache with automatic cleanup
- **Usage**: Frequently accessed data (stats, activity feeds)

### 14.4 Pagination
- **Default page size**: 20 items
- **Maximum page size**: 100 items
- **Strategies**:
  - Offset-based: Traditional page numbers
  - Cursor-based: Better for large datasets
- **Enforcement**: All list endpoints must implement pagination

### 14.5 Image Optimization
- **Max width**: 1200px
- **Quality**: 75%
- **Format**: JPEG (auto-converted)
- **Max file size**: 10MB
- **Compression**: Automatic before upload

---

## 15. Security Policies

### 15.1 SQL Injection Prevention
- **Rule**: Never use string interpolation in queries
- **Enforcement**: All queries use `JSON.stringify()` for escaping
- **Verified**: 7 SQL injection vulnerabilities fixed
- **Pattern**: `school_name.eq.${JSON.stringify(name)}`

### 15.2 Authentication & Authorization
- **Session management**: Supabase JWT tokens
- **Token expiry**: 3600 seconds (1 hour)
- **Refresh tokens**: Enabled with 10-second reuse interval
- **Race condition prevention**: Promise-based lock for concurrent 401s

### 15.3 Cron Job Security
- **Authentication**: Secret-based (CRON_SECRET, BILLING_CRON_SECRET)
- **Header validation**: `x-cron-secret` or `Authorization: Bearer`
- **Secret length**: Minimum 32 characters
- **Rotation**: Recommended every 90 days

### 15.4 Webhook Security
- **Paystack**: HMAC SHA-512 signature verification
- **Timing-safe comparison**: Prevents timing attacks
- **CORS**: Configured for webhook sources only
- **Idempotency**: Duplicate event detection

### 15.5 RPC Function Security
- **SECURITY DEFINER**: All sensitive functions
- **Permission grants**: Explicit GRANT EXECUTE statements
- **Service role only**: Payment processing functions
- **Authenticated users**: Dashboard and analytics functions

---

## 16. Data Retention & Cleanup Policies

### 16.1 Notification Queue
- **Retention**: Failed jobs kept for 7 days
- **Cleanup**: Automatic after successful delivery
- **Max retries**: 3 attempts with exponential backoff

### 16.2 Activity Logs
- **Retention**: 90 days for standard logs
- **Archival**: Critical logs retained indefinitely
- **Cleanup**: Automated monthly cleanup job

### 16.3 Session Data
- **Retention**: Active sessions only
- **Cleanup**: Automatic on logout or expiry
- **Refresh tokens**: Rotated on each use

### 16.4 Billing Cycles
- **Retention**: All cycles retained indefinitely
- **Status transitions**: `due` → `paid` → `rolled_over`
- **Deletion**: Only `cancelled` and `rolled_over` cycles (admin only)

---

## 17. Monitoring & Observability Policies

### 17.1 Error Tracking
- **Recommended**: Sentry or similar APM tool
- **Coverage**: All API routes and cron jobs
- **Alerting**: Critical errors trigger immediate notification

### 17.2 Performance Monitoring
- **Metrics tracked**:
  - API response times
  - Database query performance
  - Cron job execution time
  - Webhook processing time
- **Thresholds**:
  - API: < 200ms for most endpoints
  - Dashboard: < 1.5s load time
  - Webhooks: < 100ms processing

### 17.3 Uptime Monitoring
- **External monitoring**: Recommended for production
- **Health checks**: `/api/health` endpoint
- **Status page**: Public status dashboard

### 17.4 Log Aggregation
- **Platforms**: CloudWatch, Datadog, or similar
- **Retention**: 30 days for standard logs
- **Search**: Full-text search enabled

---

## 18. Compliance & Privacy Policies

### 18.1 Data Privacy
- **PII handling**: Encrypted at rest and in transit
- **Access control**: Role-based with audit logging
- **Data export**: Students can request their data
- **Data deletion**: Soft deletes with 30-day grace period

### 18.2 GDPR Compliance
- **Right to access**: API endpoint for data export
- **Right to erasure**: Soft delete with permanent deletion after 30 days
- **Data portability**: JSON export format
- **Consent management**: Tracked in `consent_forms` table

### 18.3 Payment Data Security
- **PCI compliance**: Paystack handles card data (PCI DSS Level 1)
- **No card storage**: Platform never stores card details
- **Transaction logs**: Encrypted and access-controlled
- **Audit trail**: All payment actions logged

---

## 19. Environment-Specific Policies

### 19.1 Development Environment
- **Database**: Separate Supabase project
- **Payments**: Test mode only (Paystack test keys)
- **Emails**: Captured in Inbucket (not sent)
- **Cron jobs**: Disabled or manual trigger only

### 19.2 Staging Environment
- **Database**: Separate Supabase project with production-like data
- **Payments**: Test mode (Paystack test keys)
- **Emails**: Sent to test addresses only
- **Cron jobs**: Enabled with reduced frequency

### 19.3 Production Environment
- **Database**: Production Supabase project
- **Payments**: Live mode (Paystack live keys)
- **Emails**: Sent to real addresses
- **Cron jobs**: Full schedule enabled
- **Monitoring**: All monitoring tools active
- **Backups**: Automated daily backups

---

## 20. Migration & Deployment Policies

### 20.1 Database Migrations
- **Naming**: `YYYYMMDDHHMMSS_description.sql`
- **Testing**: All migrations tested in staging first
- **Rollback**: Reversible migrations preferred
- **Documentation**: Each migration documented in commit message

### 20.2 Deployment Process
- **Pre-deployment**: Run deployment checklist
- **Deployment**: Zero-downtime deployment via Vercel
- **Post-deployment**: Monitor for 1 hour after deployment
- **Rollback**: Immediate rollback if error rate > 1%

### 20.3 Feature Flags
- **Implementation**: Environment variables
- **Examples**: `ENABLE_PAYMENTS`, `ENABLE_GAMIFICATION`
- **Testing**: Features tested behind flags before full rollout

---

*Last updated: April 17, 2026*
*All policies enforced at code level. This document serves as reference.*
