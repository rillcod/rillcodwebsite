export const APP_UTILITY_ROUTE_PREFIXES = [
  '/dashboard',
  '/login',
  '/signup',
  '/reset-password',
  '/student/login',
  '/student-registration',
  '/school-registration',
  '/online-registration',
  '/summer-school/pay-balance',
  '/portal',
  /*
    The document a school opens from a link we sent them.

    It was missing, so /p/<token> rendered inside the whole application shell:
    the marketing header above it and the dashboard dock below it, each with
    its own scroll, wrapped around a document that already has a header, a
    page navigator and a scroll of its own. Two navigations and two scrolls
    on a phone, around a contract somebody is being asked to sign.

    Matching is exact or prefixed with a slash, so this catches /p and /p/<token>
    and leaves /partnership and /pay-balance alone.
  */
  '/p',
  '/verify',
  '/forms',
  '/consent',
  '/result-check',
  '/parent-claim',
  '/account-deletion',
] as const;

export const PUBLIC_MARKETING_ROUTE_PREFIXES = [
  '/',
  '/about',
  '/programs',
  '/curriculum',
  '/services',
  '/implementation',
  '/team',
  '/testimonials',
  '/gallery',
  '/media',
  '/events',
  '/faq',
  '/contact',
  '/partnership',
  '/careers',
  '/student-projects',
  '/student-journey',
  '/showcase',
  '/privacy-policy',
  '/terms-of-service',
  '/special',
  '/summer-school',
] as const;

export function isAppUtilityRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return APP_UTILITY_ROUTE_PREFIXES.some((route) =>
    pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function hasPublicMarketingFooter(pathname: string | null | undefined): boolean {
  if (!pathname || pathname.includes('/pay-balance')) return false;
  return PUBLIC_MARKETING_ROUTE_PREFIXES.some((route) =>
    route === '/' ? pathname === '/' : pathname === route || pathname.startsWith(`${route}/`),
  );
}
