import { redirect } from 'next/navigation';
import { STUDENT_REGISTRATION_PATH } from '@/lib/registration/enrollment-types';

/**
 * Legacy URL. Prefer the permanent redirect in next.config.ts.
 * Kept so App Router navigation still lands on the single student door.
 */
export default function OnlineRegistrationRedirectPage() {
  redirect(`${STUDENT_REGISTRATION_PATH}?type=online`);
}
