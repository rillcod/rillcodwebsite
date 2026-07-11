import { redirect } from 'next/navigation';

export default function SchoolBillingRedirectPage() {
  redirect('/dashboard/finance?workspace=billing');
}
