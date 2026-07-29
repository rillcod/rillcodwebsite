import { redirect } from 'next/navigation';

/** Renamed route. Kept so existing links and bookmarks keep working. */
export default function CurriculumStudioRedirect() {
  redirect('/dashboard/academic/certify');
}
