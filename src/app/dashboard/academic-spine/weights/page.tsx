import { redirect } from 'next/navigation';

/** Renamed route. Kept so existing links and bookmarks keep working. */
export default function AcademicSpineWeightsRedirect() {
  redirect('/dashboard/academic/weights');
}
