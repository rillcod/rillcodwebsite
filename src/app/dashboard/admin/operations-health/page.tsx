import { redirect } from 'next/navigation';

export default function OperationsHealthRedirectPage() {
  redirect('/dashboard/office?workspace=settings&section=health');
}
