import { redirect } from 'next/navigation';

/** Renamed route. Kept so existing links and bookmarks keep working. */
export default function CurriculumStudioSchoolsRedirect() {
  redirect('/dashboard/academic/distribute');
}
