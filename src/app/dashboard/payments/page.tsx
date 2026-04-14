// Payments is consolidated into Smart Finance → Operations tab.
// This redirect keeps any bookmarks/links working.
import { redirect } from 'next/navigation';
export default function PaymentsPage() {
  redirect('/dashboard/finance?tab=operations');
}
