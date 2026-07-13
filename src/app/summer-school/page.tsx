import { redirect } from 'next/navigation';
import { getFeaturedSpecialProgram } from '@/lib/special-programs/queries';
import { specialProgramPublicPath } from '@/lib/special-programs/types';

/** Legacy URL — always send visitors to the featured special programme. */
export default async function SummerSchoolRedirectPage() {
  const featured = await getFeaturedSpecialProgram();
  if (featured) {
    redirect(specialProgramPublicPath(featured.slug));
  }
  redirect('/special/ai-summer-school-2026');
}
