import type { UserRole } from '@/types/auth.types';

/** Rillcod platform operators (full dashboard tooling). Excludes partner `school`. */
export function isPlatformStaffRole(role: string | undefined | null): role is 'admin' | 'teacher' {
  return role === 'admin' || role === 'teacher';
}

export function isPartnerSchoolRole(role: string | undefined | null): role is 'school' {
  return role === 'school';
}

/** Any non-learner role (includes partner schools). */
export function isStaffRole(role: string | undefined | null): role is 'admin' | 'teacher' | 'school' {
  return isPlatformStaffRole(role) || isPartnerSchoolRole(role);
}

/** AI `/api/ai/generate` types allowed for partner school (communications / reporting — not full authoring). */
export const PARTNER_SCHOOL_AI_GENERATE_TYPES = ['report-feedback', 'newsletter'] as const;

function normalizePath(pathname: string): string {
  const base = pathname.split('?')[0] ?? pathname;
  if (base.length > 1 && base.endsWith('/')) return base.slice(0, -1);
  return base;
}

function matchesPathPrefix(path: string, prefixes: readonly string[]): boolean {
  for (const p of prefixes) {
    if (path === p || path.startsWith(`${p}/`)) return true;
  }
  return false;
}

/**
 * Staff-only areas under /dashboard (prefix match).
 * Used as a secondary deny-list; students primarily use the allow-list below.
 */
const STAFF_ONLY_PREFIXES: string[] = [
  '/dashboard/account-deletion-requests',
  '/dashboard/users',
  '/dashboard/records',
  '/dashboard/schools',
  '/dashboard/teachers',
  '/dashboard/parents',
  '/dashboard/students',
  '/dashboard/classes',
  '/dashboard/approvals',
  '/dashboard/lesson-plans',
  '/dashboard/lessons/add',
  '/dashboard/analytics',
  '/dashboard/settings',
  '/dashboard/school-overview',
  '/dashboard/school-reports',
  '/dashboard/school-billing',
  '/dashboard/card-studio',
  '/dashboard/directory',
  '/dashboard/engagement',
  '/dashboard/school-settings',
  '/dashboard/school-teacher-messages',
  '/dashboard/bulk',
  '/dashboard/payments/bulk',
  '/dashboard/admin',
  '/dashboard/whatsapp',
  '/dashboard/progression',
  '/dashboard/cbt/new',
  '/dashboard/programs',
  '/dashboard/grading',
  '/dashboard/gamification',
  '/dashboard/crm',
  '/dashboard/activity-logs',
  '/dashboard/parent-claims',
  '/dashboard/reports',
  '/dashboard/billing',
  '/dashboard/billing-automation',
  '/dashboard/transactions',
  '/dashboard/subscriptions',
  '/dashboard/generate-content',
  '/dashboard/certificates/management',
  '/dashboard/cases',
  '/dashboard/customer-book',
  '/dashboard/overview',
  '/dashboard/whatsapp-groups',
  '/dashboard/office',
];

/**
 * Partner school: platform-wide and cross-tenant tools (prefix match).
 * Does NOT include routes in the school sidebar (overview, students, curriculum, inbox, …).
 */
const SCHOOL_PLATFORM_PREFIXES: string[] = [
  '/dashboard/account-deletion-requests',
  '/dashboard/users',
  '/dashboard/schools',
  '/dashboard/teachers',
  '/dashboard/parents',
  '/dashboard/approvals',
  '/dashboard/lesson-plans',
  '/dashboard/lessons/add',
  '/dashboard/analytics',
  '/dashboard/settings',
  '/dashboard/directory',
  '/dashboard/engagement',
  '/dashboard/school-settings',
  '/dashboard/bulk',
  '/dashboard/payments/bulk',
  '/dashboard/admin',
  '/dashboard/whatsapp',
  '/dashboard/cbt/new',
  '/dashboard/programs',
  '/dashboard/grading',
  '/dashboard/gamification',
  '/dashboard/crm',
  '/dashboard/activity-hub',
  '/dashboard/activity-logs',
  '/dashboard/reports',
  '/dashboard/billing',
  '/dashboard/billing-automation',
  '/dashboard/transactions',
  '/dashboard/subscriptions',
  '/dashboard/generate-content',
  '/dashboard/certificates/management',
];

/** Lesson/course/CBT editors — partner schools monitor clients; content authoring stays with platform staff / teachers. */
function isCrossTenantContentEditorPath(path: string): boolean {
  if (/^\/dashboard\/lessons\/[^/]+\/edit$/.test(path)) return true;
  if (/^\/dashboard\/classes\/[^/]+\/edit$/.test(path)) return true;
  if (path.startsWith('/dashboard/classes/new')) return true;
  if (path === '/dashboard/courses/new' || path.startsWith('/dashboard/courses/new/')) return true;
  if (/^\/dashboard\/courses\/[^/]+\/edit$/.test(path)) return true;
  if (/^\/dashboard\/cbt\/[^/]+\/edit$/.test(path)) return true;
  if (path.startsWith('/dashboard/cbt/') && /\/sessions\/[^/]+\/grade$/.test(path)) return true;
  if (/^\/dashboard\/flashcards\/[^/]+\/edit$/.test(path)) return true;
  return false;
}

/** Student roster / registration tools (not the self-service /students page). */
function isStudentManagementPath(path: string): boolean {
  if (path.startsWith('/dashboard/students/bulk')) return true;
  if (path.startsWith('/dashboard/students/import')) return true;
  if (path.startsWith('/dashboard/students/bulk-delete')) return true;
  if (path.startsWith('/dashboard/students/register')) return true;
  if (path.startsWith('/dashboard/students/resend-credentials')) return true;
  return false;
}

const STUDENT_ALLOWED_PREFIXES: string[] = [
  '/dashboard/learning',
  '/dashboard/slides',
  '/dashboard/flashcards',
  '/dashboard/library',
  '/dashboard/playground',
  '/dashboard/live-sessions',
  '/dashboard/assignments',
  '/dashboard/projects',
  '/dashboard/cbt',
  '/dashboard/activity-hub',
  '/dashboard/engage',
  '/dashboard/vault',
  '/dashboard/missions',
  '/dashboard/protocol',
  '/dashboard/study-groups',
  '/dashboard/showcase',
  '/dashboard/timetable',
  '/dashboard/attendance',
  '/dashboard/grades',
  '/dashboard/path-progress',
  '/dashboard/results',
  '/dashboard/certificates',
  '/dashboard/portfolio',
  '/dashboard/my-card',
  '/dashboard/finance',
  '/dashboard/money',
  '/dashboard/inbox',
  '/dashboard/messages',
  '/dashboard/notifications',
  '/dashboard/newsletters',
  '/dashboard/profile',
  '/dashboard/support',
  '/dashboard/consent-forms',
];

const STUDENT_ALLOWED_EXACT = new Set([
  '/dashboard',
  '/dashboard/students', // self-view only; management subpaths stay blocked
  '/dashboard/grades/waec',
]);

function isStudentAllowedPath(path: string): boolean {
  if (STUDENT_ALLOWED_EXACT.has(path)) return true;
  // Block CBT create/edit while allowing /dashboard/cbt for taking exams
  if (path === '/dashboard/cbt/new' || path.startsWith('/dashboard/cbt/new/')) return false;
  if (/^\/dashboard\/cbt\/[^/]+\/edit$/.test(path)) return false;
  if (path.startsWith('/dashboard/cbt/') && /\/sessions\/[^/]+\/grade$/.test(path)) return false;
  if (path.startsWith('/dashboard/certificates/management')) return false;
  for (const p of STUDENT_ALLOWED_PREFIXES) {
    if (path === p || path.startsWith(`${p}/`)) return true;
  }
  return false;
}

/**
 * True when a learner (student) should be redirected away from this path.
 * Allow-list first (parity with parents), then management / editor denials.
 */
export function isDashboardPathBlockedForStudent(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (!path.startsWith('/dashboard')) return false;

  if (isStudentManagementPath(path)) return true;
  if (isCrossTenantContentEditorPath(path)) return true;
  if (matchesPathPrefix(path, STAFF_ONLY_PREFIXES) && path !== '/dashboard/students') return true;
  if (isStudentAllowedPath(path)) return false;
  return true;
}

/**
 * True when a partner school account should be redirected away from this path.
 * Mirrors DB intent: school users are scoped by `school_id`; platform tables stay admin/teacher.
 */
export function isDashboardPathBlockedForSchool(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (!path.startsWith('/dashboard')) return false;

  if (matchesPathPrefix(path, SCHOOL_PLATFORM_PREFIXES)) return true;
  if (isCrossTenantContentEditorPath(path)) return true;

  return false;
}

const PARENT_ALLOWED_PREFIXES: string[] = [
  '/dashboard/my-children',
  '/dashboard/parent-results',
  '/dashboard/parent-grades',
  '/dashboard/parent-attendance',
  '/dashboard/parent-certificates',
  '/dashboard/parent-path-progress',
  '/dashboard/grades/waec',
  '/dashboard/parent-card',
  '/dashboard/my-card',
  '/dashboard/finance',
  '/dashboard/parent-invoices',
  '/dashboard/parent-feedback',
  '/dashboard/money',
  '/dashboard/feedback',
  '/dashboard/support',
  '/dashboard/profile',
  '/dashboard/messages',
  '/dashboard/notifications',
  '/dashboard/newsletters',
  '/dashboard/consent-forms',
  '/dashboard/inbox',
];

const PARENT_ALLOWED_EXACT = new Set(['/dashboard']);

function isParentAllowedPath(path: string): boolean {
  if (PARENT_ALLOWED_EXACT.has(path)) return true;
  for (const p of PARENT_ALLOWED_PREFIXES) {
    if (path === p || path.startsWith(`${p}/`)) return true;
  }
  return false;
}

/**
 * Parents: allow-list only (read-mostly family + account surfaces).
 */
export function isDashboardPathBlockedForParent(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (!path.startsWith('/dashboard')) return false;
  if (isParentAllowedPath(path)) return false;
  return true;
}

export function isDashboardPathBlockedForRole(pathname: string, role: UserRole | string | undefined | null): boolean {
  if (!role) return false;
  if (role === 'school') return isDashboardPathBlockedForSchool(pathname);
  if (isPlatformStaffRole(role)) return false;
  if (role === 'student') return isDashboardPathBlockedForStudent(pathname);
  if (role === 'parent') return isDashboardPathBlockedForParent(pathname);
  return false;
}
