import { redirect } from 'next/navigation';

export default function LegacyMoneyPage() {
  redirect('/dashboard/finance?workspace=today');
}
