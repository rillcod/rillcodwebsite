import { redirect } from 'next/navigation';

/**
 * The builder moved to /dashboard/academic/build.
 *
 * The whole Academic Office flow now lives under one namespace: authoring was the only
 * stage still sitting outside /academic, which made the sidebar section read as two
 * parallel worlds. Kept as a redirect so existing links and bookmarks still land.
 */
export default function CurriculumBuilderRedirect() {
  redirect('/dashboard/academic/build');
}
