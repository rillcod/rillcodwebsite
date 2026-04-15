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
