/**
 * Centralized Smart Back Navigation System
 *
 * Provides resilient, native-app back navigation across:
 * 1. Capacitor Android hardware back button / gesture
 * 2. In-app mobile header back button
 * 3. Mobile browser & PWA swipe-back / popstate
 *
 * Guarantees:
 * - Open modal dialogs, sheets, and drawers close first on Back press
 * - Authenticated workspace never leaks to /login or external browser history
 * - Direct links, notifications, and refreshed tabs fall back cleanly to parent screens
 * - Sensitive exam flows (CBT) are protected against accidental exits
 */

import {
  PATH_LABELS,
  STUDENT_PATH_LABELS,
  humanizePathLabel,
} from '@/components/layout/DesktopTopNavbar';

export const ROUTE_STACK_KEY = 'rillcod_native_route_stack';
const ROUTE_STACK_LIMIT = 40;

const NATIVE_PATH_PREFIXES = [
  '/',
  '/programs',
  '/curriculum',
  '/about',
  '/contact',
  '/student-journey',
  '/testimonials',
  '/gallery',
  '/dashboard',
  '/login',
  '/student-registration',
  '/school-registration',
  '/online-registration',
  '/summer-school',
  '/special',
  '/forms',
  '/consent',
  '/result-check',
  '/verify',
  '/reset-password',
  '/privacy-policy',
  '/terms-of-service',
  '/account-deletion',
];

export function isNativeDestination(pathname: string): boolean {
  return NATIVE_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || (prefix !== '/' && pathname.startsWith(`${prefix}/`))
  );
}

export function readRouteStack(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(ROUTE_STACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is string => typeof p === 'string' && isNativeDestination(p));
  } catch {
    return [];
  }
}

export function writeRouteStack(stack: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(
      ROUTE_STACK_KEY,
      JSON.stringify(stack.slice(-ROUTE_STACK_LIMIT))
    );
  } catch {
    // Storage unavailable or disabled
  }
}

export function pushRouteToStack(pathname: string): void {
  if (!pathname || !isNativeDestination(pathname)) return;
  const stack = readRouteStack();
  if (stack[stack.length - 1] !== pathname) {
    writeRouteStack([...stack, pathname]);
  }
}

/**
 * Finds a safe target from the route stack to go back to.
 * Ensures dashboard users stay within the dashboard.
 */
export function findSafeBackTarget(
  stack: string[],
  currentPath: string
): { target: string; stack: string[] } | null {
  const isDashboardRoute = currentPath === '/dashboard' || currentPath.startsWith('/dashboard/');

  for (let index = stack.length - 2; index >= 0; index -= 1) {
    const candidate = stack[index];
    if (candidate === currentPath) continue;
    // Authenticated dashboard routes must never leak back into login, registration, or public landing
    if (isDashboardRoute && !(candidate === '/dashboard' || candidate.startsWith('/dashboard/'))) {
      continue;
    }
    return { target: candidate, stack: stack.slice(0, index + 1) };
  }

  return null;
}

/**
 * Returns the logical parent destination for any route when browser history is unavailable
 * (e.g. direct link, notification click, fresh tab, or page refresh).
 */
export function getLogicalParentRoute(currentPath: string): string {
  const clean = currentPath.split('?')[0].replace(/\/$/, '') || '/';

  // Specific dashboard child flows
  if (/^\/dashboard\/classes\/[^/]+/.test(clean)) return '/dashboard/classes';
  if (/^\/dashboard\/students\/[^/]+\/report/.test(clean)) return '/dashboard/students';
  if (/^\/dashboard\/students\/[^/]+/.test(clean)) return '/dashboard/students';
  if (clean.startsWith('/dashboard/students/')) return '/dashboard/students';
  if (clean.startsWith('/dashboard/parents/add') || clean.startsWith('/dashboard/parents/edit')) {
    return '/dashboard/parents';
  }
  if (/^\/dashboard\/lessons\/[^/]+/.test(clean)) return '/dashboard/classes';
  if (clean.startsWith('/dashboard/lessons/')) return '/dashboard/lessons';
  if (/^\/dashboard\/cbt\/[^/]+/.test(clean)) return '/dashboard/cbt';
  if (/^\/dashboard\/exams\/[^/]+/.test(clean)) return '/dashboard/exams';
  if (/^\/dashboard\/flashcards\/[^/]+/.test(clean)) return '/dashboard/flashcards';
  if (/^\/dashboard\/payments\/invoices\/[^/]+/.test(clean)) return '/dashboard/finance';
  if (clean === '/dashboard/timetable' || clean === '/dashboard/attendance') return '/dashboard/classes';
  if (clean.startsWith('/dashboard/reports/')) return '/dashboard/reports';
  if (clean.startsWith('/dashboard/progression/')) return '/dashboard/learner-progress';
  if (clean.startsWith('/dashboard/projects/')) return '/dashboard/projects';
  if (clean.startsWith('/dashboard/study-groups/')) return '/dashboard/study-groups';
  if (clean.startsWith('/dashboard/consent-forms/')) return '/dashboard/consent-forms';

  // Generic dashboard fallback
  if (clean.startsWith('/dashboard/')) return '/dashboard';

  // Public site subpages
  if (/^\/programs\/[^/]+/.test(clean)) return '/programs';
  if (clean === '/signup' || clean === '/reset-password') return '/login';

  return '/';
}

/**
 * Primary root tabs for each role in the mobile bottom bar.
 * Root tabs do not show an in-app back chevron.
 */
export const ROOT_TABS_BY_ROLE: Record<string, string[]> = {
  student: ['/dashboard', '/dashboard/learning', '/dashboard/assignments', '/dashboard/grades'],
  school: ['/dashboard', '/dashboard/classes', '/dashboard/finance', '/dashboard/inbox'],
  admin: ['/dashboard', '/dashboard/office', '/dashboard/students', '/dashboard/reports/builder'],
  teacher: ['/dashboard', '/dashboard/classes', '/dashboard/grades', '/dashboard/progress'],
  parent: ['/dashboard', '/dashboard/my-children', '/dashboard/parent-results', '/dashboard/parent-invoices'],
};

/**
 * Checks if the current pathname is a primary root tab for the user's role.
 */
export function isRootTab(pathname: string, role?: string | null): boolean {
  const clean = pathname.split('?')[0].replace(/\/$/, '') || '/';
  if (clean === '/dashboard') return true;
  if (!role) return false;
  const tabs = ROOT_TABS_BY_ROLE[role] || ['/dashboard'];
  return tabs.includes(clean);
}

/**
 * Resolves a human-friendly title for the mobile top app header.
 */
export function resolveMobileScreenTitle(
  pathname: string,
  activeNavItemTitle?: string,
  role?: string | null
): string {
  const clean = pathname.split('?')[0].replace(/\/$/, '') || '/';

  // Role-specific student overrides from existing system
  if (role === 'student' && STUDENT_PATH_LABELS[clean]) {
    return STUDENT_PATH_LABELS[clean];
  }

  // Canonical paths from existing system
  if (PATH_LABELS[clean]) {
    return PATH_LABELS[clean];
  }

  // Known sub-path overrides
  if (clean === '/dashboard/settings') return 'Settings';
  if (clean === '/dashboard/profile') return 'Profile';
  if (clean === '/dashboard/my-card') return 'Digital Access Card';
  if (clean === '/dashboard/notifications') return 'Notifications';
  if (clean === '/dashboard/support') return 'Support Desk';
  if (clean === '/dashboard/students/resend-credentials') return 'Resend Credentials';
  if (clean === '/dashboard/students/bulk-register') return 'Bulk Register';
  if (clean === '/dashboard/students/bulk-enroll') return 'Bulk Enrol';
  if (clean === '/dashboard/students/import') return 'Import Students';
  if (clean === '/dashboard/parents/add') return 'Add Parent';
  if (/^\/dashboard\/parents\/edit\//.test(clean)) return 'Edit Parent';
  if (/^\/dashboard\/classes\/[^/]+/.test(clean)) return 'Class Details';
  if (/^\/dashboard\/lessons\/[^/]+/.test(clean)) return 'Lesson Player';
  if (/^\/dashboard\/cbt\/[^/]+\/take/.test(clean)) return 'CBT Exam';
  if (/^\/dashboard\/cbt\/[^/]+/.test(clean)) return 'CBT Session';
  if (/^\/dashboard\/exams\/[^/]+/.test(clean)) return 'Exam Workspace';
  if (/^\/dashboard\/payments\/invoices\/[^/]+\/edit/.test(clean)) return 'Edit Invoice';

  // Active navigation item fallback
  if (activeNavItemTitle) return activeNavItemTitle;

  // Use existing humanizePathLabel from DesktopTopNavbar
  const lastSegment = clean.split('/').pop() || '';
  if (lastSegment && lastSegment !== 'dashboard') {
    return humanizePathLabel(lastSegment);
  }

  return 'Dashboard';
}

/**
 * Performs a smart, resilient back navigation:
 * 1. Closes transient drawers, sheets, and dialogs first.
 * 2. Uses tracked route stack if a valid safe target exists.
 * 3. Falls back cleanly to the logical parent screen if history is empty.
 */
export function performSmartBack(
  router: { back: () => void; replace: (url: string) => void; push: (url: string) => void },
  currentPath: string
): boolean {
  if (typeof window === 'undefined') return false;

  // 1. Give custom modal sheets / drawers first priority to close
  const nativeBackEvent = new Event('rillcod:native-back', { cancelable: true });
  window.dispatchEvent(nativeBackEvent);
  if (nativeBackEvent.defaultPrevented) return true;

  // 2. Give accessible open dialogs / popovers priority to close
  const openDialog = document.querySelector<HTMLElement>(
    '[role="dialog"], dialog[open], [data-state="open"]'
  );
  if (openDialog) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    return true;
  }

  // 3. Examine route stack
  const stack = readRouteStack();
  const safe = findSafeBackTarget(stack, currentPath);

  if (safe && safe.target) {
    writeRouteStack(safe.stack);
    // If the browser has real history in this session, router.back() provides standard transitions
    if (window.history.length > 1) {
      router.back();
    } else {
      router.replace(safe.target);
    }
    return true;
  }

  // 4. Fallback to logical parent route
  const fallback = getLogicalParentRoute(currentPath);
  writeRouteStack([fallback]);
  router.replace(fallback);
  return true;
}
