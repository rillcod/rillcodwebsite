import { redirect } from 'next/navigation';

export default function SubscriptionsRedirectPage() {
  redirect('/dashboard/finance?workspace=billing');
}
