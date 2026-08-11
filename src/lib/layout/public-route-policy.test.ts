import { describe, expect, it } from 'vitest';
import { hasPublicMarketingFooter, isAppUtilityRoute } from './public-route-policy';

describe('public route policy', () => {
  it.each([
    '/dashboard',
    '/dashboard/academic',
    '/login',
    '/student/login',
    '/student-registration/pay-balance',
    '/summer-school/pay-balance',
    '/verify/example',
    '/forms/example',
    '/result-check/example',
    '/consent/CF-AB12-CD34',
  ])('keeps navigation out of utility flow %s', (pathname) => {
    expect(isAppUtilityRoute(pathname)).toBe(true);
  });

  it.each([
    '/',
    '/about',
    '/programs',
    '/programs/web-development',
    '/services',
    '/student-projects',
    '/summer-school',
    '/privacy-policy',
  ])('keeps the shared footer on marketing route %s', (pathname) => {
    expect(hasPublicMarketingFooter(pathname)).toBe(true);
  });

  it.each([
    '/login',
    '/student-registration',
    '/student-registration/pay-balance',
    '/summer-school/pay-balance',
    '/portfolio/example',
    '/verify/example',
  ])('does not add a marketing footer to utility route %s', (pathname) => {
    expect(hasPublicMarketingFooter(pathname)).toBe(false);
  });

  it('does not confuse student marketing routes with student utility routes', () => {
    expect(isAppUtilityRoute('/student-projects')).toBe(false);
    expect(isAppUtilityRoute('/student-journey')).toBe(false);
  });
});
