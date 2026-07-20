import { redirect } from 'next/navigation';

export default function OperationsPerformanceRedirectPage() {
  redirect('/dashboard/office?workspace=settings&section=results');
}
