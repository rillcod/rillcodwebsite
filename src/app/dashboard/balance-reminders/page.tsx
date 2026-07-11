import { redirect } from 'next/navigation';

export default function BalanceRemindersRedirectPage() {
  redirect('/dashboard/finance?workspace=settings');
}
