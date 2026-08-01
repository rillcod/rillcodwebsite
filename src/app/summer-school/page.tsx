import { redirect } from 'next/navigation';
import { getFeaturedSpecialProgram } from '@/lib/special-programs/queries';
import { specialProgramPublicPath } from '@/lib/special-programs/types';

// The redirect target is live data, so it must be resolved per request, never
// baked at build. Without this Next attempts a build-time prerender, which on
// the deploy host has no SUPABASE_SERVICE_ROLE_KEY and logs a misleading
// "supabaseKey is required" failure before falling through to the default slug.
export const dynamic = 'force-dynamic';

/** Legacy URL — always send visitors to the featured special programme. */
export default async function SummerSchoolRedirectPage() {
  const featured = await getFeaturedSpecialProgram();
  if (featured) {
    redirect(specialProgramPublicPath(featured.slug));
  }
  redirect('/special/ai-summer-school-2026');
}
