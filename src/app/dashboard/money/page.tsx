import { redirect } from 'next/navigation';

export default function MoneyRedirectPage() {
  redirect('/dashboard/finance?workspace=payments');
}
