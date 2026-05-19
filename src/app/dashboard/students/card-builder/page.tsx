// Unified: card builder is now the Design tab of Card Studio
import { redirect } from 'next/navigation';
export default function CardBuilderRedirect({ searchParams }: { searchParams?: { type?: string } }) {
  const type = searchParams?.type ?? 'student';
  redirect(`/dashboard/card-studio?tab=design&type=${type}`);
}
