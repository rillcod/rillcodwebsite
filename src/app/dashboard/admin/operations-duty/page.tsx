import { redirect } from 'next/navigation';

export default function OperationsDutyRedirectPage() {
  redirect('/dashboard/office?workspace=duty');
}
