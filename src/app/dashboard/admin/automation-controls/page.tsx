import { redirect } from 'next/navigation';

export default function AutomationControlsRedirectPage() {
  redirect('/dashboard/office?workspace=settings&section=automation');
}
