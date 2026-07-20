import { redirect } from 'next/navigation';

export default function OfficeDeskRedirectPage() {
  redirect('/dashboard/office?workspace=desk');
}
