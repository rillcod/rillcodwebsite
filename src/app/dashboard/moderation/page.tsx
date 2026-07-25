import { redirect } from 'next/navigation';

/** Content moderation queue removed from the product shell — not used day-to-day. */
export default function ModerationPageRedirect() {
  redirect('/dashboard');
}
