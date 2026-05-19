// Unified: parent card view is now handled by /dashboard/my-card (role-aware)
import { redirect } from 'next/navigation';
export default function ParentCardRedirect() {
  redirect('/dashboard/my-card');
}
