import { redirect } from 'next/navigation';

/** Student activity tracker now lives in the Audit family. */
export default function EngagementRedirectPage() {
  redirect('/dashboard/activity-logs?view=students');
}
