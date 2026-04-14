// Billing contact settings are consolidated into Smart Finance → Setup tab.
import { redirect } from 'next/navigation';
export default function BillingContactsPage() {
  redirect('/dashboard/finance?tab=setup');
}
