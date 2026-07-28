// Retired: this screen showed five counts (total students, active students, teaching
// staff, average progress, WAEC scale) that Overview and AdminDashboard already
// display, plus the at-risk list — which was its only unique content. It also carried
// a hard-coded "fake sparkline" placeholder trend.
//
// At-risk students now live on /dashboard/accountability, next to the live census and
// class-integrity checks. This file stays as a redirect because six places still link
// here (Overview, the dashboard index, AdminDashboard, DashboardNavigation,
// MobileNavigation, config/navigation) — deleting it outright would 404 all of them.
import { redirect } from 'next/navigation';

export default function AnalyticsRetiredRedirect() {
  redirect('/dashboard/accountability');
}
