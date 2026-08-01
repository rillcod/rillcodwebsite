// Retired because Overview and AdminDashboard already show these analytics.
// At-risk students now live on /dashboard/accountability. Keep this redirect for
// existing dashboard links and saved URLs.
import { redirect } from 'next/navigation';

export default function AnalyticsRetiredRedirect() {
  redirect('/dashboard/accountability');
}
