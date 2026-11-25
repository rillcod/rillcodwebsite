import { redirect } from 'next/navigation';

export default function NewClassRedirectPage() {
  redirect('/dashboard/classes/add');
}
