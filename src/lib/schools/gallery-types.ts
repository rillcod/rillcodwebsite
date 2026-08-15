import { type MediaCategory } from '@/lib/partnerships/media-library';

/**
 * One photograph or clip in a school's gallery.
 *
 * Kept out of the route deliberately. A `route.ts` may only export handlers and
 * route config — Next enforces that at build time, and neither `tsc --noEmit`
 * nor the CI typecheck step catches a violation, so it surfaces as a failed
 * production build long after the change. A type export happens to be erased,
 * but the viewer, the nudge and the tests all need this shape, and none of them
 * should be reaching into a route to get it.
 */
export type SchoolGalleryItem = {
  id: string;
  school_id: string;
  academic_term_id?: string | null;
  url: string;
  thumbnail_url?: string | null;
  title: string;
  category: Exclude<MediaCategory, 'all'>;
  media_type: 'image' | 'video';
  is_capstone_demo: boolean;
  uploaded_by?: string | null;
  created_at: string;
};

/**
 * The categories the database will accept, mirroring the CHECK on the column.
 *
 * Exported so the route can refuse a bad value before the insert and a test can
 * hold the media library to the same list — the two drifted once already, when
 * the library offered 'coding', 'videos' and 'competitions' and the column
 * accepted none of them.
 */
export const GALLERY_CATEGORIES = [
  'classroom',
  'robotics',
  'capstone',
  'event',
  'award',
] as const;
