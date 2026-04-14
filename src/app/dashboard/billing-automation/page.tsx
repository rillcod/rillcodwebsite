// Automation config is consolidated into Smart Finance → Automation tab (admin only).
import { redirect } from 'next/navigation';
export default function BillingAutomationPage() {
  redirect('/dashboard/finance?tab=automation');
}
