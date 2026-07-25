import { redirect } from 'next/navigation';

/** Legacy URL — debris cleanup lives under System Health. */
export default function DebrisPageRedirect() {
  redirect('/dashboard/classes/heal?tab=cleanup');
}
