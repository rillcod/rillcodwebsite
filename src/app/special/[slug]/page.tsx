import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import SpecialProgramLanding from '@/components/special-programs/SpecialProgramLanding';
import { getSpecialProgramBySlug } from '@/lib/special-programs/queries';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getSpecialProgramBySlug(slug, { requirePublished: true });
  if (!page) return { title: 'Programme not found' };
  return {
    title: `${page.title} — Rillcod Technologies`,
    description: page.content.hero_blurb || `Register for ${page.title} at Rillcod Technologies.`,
  };
}

export default async function SpecialProgramPageRoute({ params }: Props) {
  const { slug } = await params;
  const page = await getSpecialProgramBySlug(slug, { requirePublished: true });
  if (!page) notFound();
  return <SpecialProgramLanding page={page} />;
}
