import { redirect } from 'next/navigation';

export default function CommunicationTemplatesRedirectPage() {
  redirect('/dashboard/office?workspace=settings&section=templates');
}
