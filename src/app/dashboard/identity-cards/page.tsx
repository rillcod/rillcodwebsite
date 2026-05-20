// Unified: identity cards manager is now the Manage tab of Card Studio
import { redirect } from 'next/navigation';

type PageProps = {
  searchParams?: Promise<{ type?: string }>;
};

export default async function IdentityCardsRedirect({ searchParams }: PageProps) {
  const resolvedParams = searchParams ? await searchParams : {};
  const type = resolvedParams.type ?? 'student';
  redirect(`/dashboard/card-studio?tab=manage&type=${type}`);
}
