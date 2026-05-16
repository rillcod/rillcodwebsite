// Redirect handled by next.config.ts: /student/login → /login?type=student (permanent 308)
// This file is kept as a fallback only.
import { redirect } from 'next/navigation';

export const metadata = {
  robots: { index: false, follow: false },
};

export default function StudentLoginRedirect() {
  redirect('/login?type=student');
}
