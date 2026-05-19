// Unified: card builder is now the Design tab of Card Studio
import { redirect } from 'next/navigation';

type PageProps = {
  searchParams: Promise<{ type?: string }>;
};

export default async function CardBuilderRedirect({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;
  const type = resolvedParams.type ?? 'student';
  redirect(`/dashboard/card-studio?tab=design&type=${type}`);
}
