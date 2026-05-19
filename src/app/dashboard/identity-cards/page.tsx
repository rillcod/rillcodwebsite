// Unified: identity cards manager is now the Manage tab of Card Studio
import { redirect } from 'next/navigation';
export default function IdentityCardsRedirect({ searchParams }: { searchParams?: { type?: string } }) {
  const type = searchParams?.type ?? 'student';
  redirect(`/dashboard/card-studio?tab=manage&type=${type}`);
}
