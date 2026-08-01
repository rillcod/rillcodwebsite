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
  '/verify',
  '/forms',
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
