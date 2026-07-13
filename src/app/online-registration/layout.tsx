import type { Metadata } from 'next';
import { STUDENT_REGISTRATION_PATH } from '@/lib/registration/enrollment-types';

/** Legacy route — noindex; canonical points at the single student registration page. */
export const metadata: Metadata = {
  title: 'Online Registration | Rillcod Technologies',
  description:
    'Online enrolment has moved to the main learner registration page. Choose Online School there to continue.',
  robots: { index: false, follow: true },
  alternates: {
    canonical: `https://www.rillcod.com${STUDENT_REGISTRATION_PATH}?type=online`,
  },
};

export default function OnlineRegistrationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
