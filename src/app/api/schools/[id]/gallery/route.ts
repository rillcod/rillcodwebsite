/**
 * A school's own photographs and clips.
 *
 * This is where the evidence comes from. The proposal prints a strip of it, the
 * school report wants a QR to a capstone demonstration, and the only person who
 * can produce either is a teacher standing in the classroom with a phone.
 *
 * Both halves used to fail quietly and in opposite directions: the read wrapped
 * its query in a try/catch and returned an empty gallery for ever because the
 * table did not exist, and the write uploaded the file to R2, swallowed the
 * insert error and answered "Photo uploaded to school gallery!" — so a teacher
 * who had just recorded a capstone was told it worked while the record was
 * discarded and the file left orphaned in the bucket. A write that cannot be
 * read back is not a success, and this route no longer reports one.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { r2Upload } from '@/lib/r2/client';
import { canAccessSchool } from '@/lib/auth/school-scope';
import { type MediaCategory } from '@/lib/partnerships/media-library';

export const dynamic = 'force-dynamic';

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

/** Mirrors the CHECK on the column, so a bad value is refused before the insert. */
const CATEGORIES = ['classroom', 'robotics', 'capstone', 'event', 'award'] as const;

/**
 * What may be uploaded, decided here rather than from the browser's say-so.
 *
 * `file.type` is whatever the client claims. The extension actually stored is
 * derived from this list, not from the supplied filename, so a name cannot
 * choose the key it is written under.
 */
const ACCEPTED: Record<string, { ext: string; kind: 'image' | 'video' }> = {
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'image/png': { ext: 'png', kind: 'image' },
  'image/webp': { ext: 'webp', kind: 'image' },
  'video/mp4': { ext: 'mp4', kind: 'video' },
  'video/webm': { ext: 'webm', kind: 'video' },
  'video/quicktime': { ext: 'mov', kind: 'video' },
};

/** A classroom clip off a phone, with room to spare. Beyond this, refuse. */
const MAX_BYTES = 60 * 1024 * 1024;

/** The caller, and whether they may touch this school at all. */
async function authorise(schoolId: string, write: boolean) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const db = createAdminClient();
  const { data: profile } = await db
    .from('portal_users')
    .select('id, role, full_name, school_id, is_active, is_deleted')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || profile.is_deleted || profile.is_active === false) return null;

  // Uploading is for the people who run the sessions. Everyone else may look.
  const roles = write ? ['admin', 'teacher', 'school'] : ['admin', 'teacher', 'school', 'student'];
  if (!roles.includes(profile.role || '')) return null;

  // A teacher belongs to the schools in `teacher_schools`, not to whichever id
  // happens to sit on their profile — the role check alone let anyone with an
  // account read, and any teacher write to, every school on the platform.
  if (!(await canAccessSchool(user.id, profile as any, schoolId))) return null;

  return { user, db, profile };
}

/** GET /api/schools/[id]/gallery — everything pooled for this school. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: schoolId } = await params;
  const actor = await authorise(schoolId, false);
  if (!actor) return NextResponse.json({ error: 'Not permitted' }, { status: 403 });

  const { data: school } = await actor.db
    .from('schools')
    // logo_url is optional and usually null; the gallery shows the school's own
    // crest when it has one.
    .select('id, name, logo_url')
    .eq('id', schoolId)
    .maybeSingle();
  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 });

  const { data: records, error } = await actor.db
    .from('school_gallery_media')
    .select('id, school_id, academic_term_id, url, thumbnail_url, title, category, media_type, is_capstone_demo, uploaded_by, created_at')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false });

  // Surfaced rather than swallowed. An empty gallery and a broken gallery look
  // identical to the viewer, and only one of them is worth telling somebody about.
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (records ?? []) as SchoolGalleryItem[];
  return NextResponse.json({
    school,
    items,
    total: items.length,
    imagesCount: items.filter((i) => i.media_type === 'image').length,
    videosCount: items.filter((i) => i.media_type === 'video').length,
    capstonesCount: items.filter((i) => i.is_capstone_demo).length,
  });
}

/** POST /api/schools/[id]/gallery — add a photograph or a clip. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: schoolId } = await params;
  const actor = await authorise(schoolId, true);
  if (!actor) return NextResponse.json({ error: 'Not permitted' }, { status: 403 });

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const rawCategory = String(formData.get('category') || 'classroom');
    const category = (CATEGORIES as readonly string[]).includes(rawCategory)
      ? (rawCategory as Exclude<MediaCategory, 'all'>)
      : 'classroom';
    const title = String(formData.get('title') || '').trim().slice(0, 160) || 'Classroom snapshot';
    const termId = (formData.get('term_id') as string) || null;
    const isCapstone = formData.get('is_capstone') === 'true';

    let mediaUrl: string;
    let mediaType: 'image' | 'video';

    if (file) {
      const accepted = ACCEPTED[file.type];
      if (!accepted) {
        return NextResponse.json(
          { error: 'That file type is not supported. Use JPEG, PNG, WebP, MP4, WebM or MOV.' },
          { status: 415 },
        );
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          { error: `That file is ${Math.round(file.size / 1024 / 1024)}MB. The limit is ${MAX_BYTES / 1024 / 1024}MB.` },
          { status: 413 },
        );
      }

      mediaType = accepted.kind;
      const key = `schools/${schoolId}/gallery/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${accepted.ext}`;
      await r2Upload(key, Buffer.from(await file.arrayBuffer()), file.type);
      mediaUrl = `/api/storage/r2?key=${encodeURIComponent(key)}`;
    } else {
      const directUrl = String(formData.get('url') || '').trim();
      if (!directUrl.startsWith('/') && !/^https?:\/\//i.test(directUrl)) {
        return NextResponse.json({ error: 'No file or usable URL provided.' }, { status: 400 });
      }
      mediaUrl = directUrl;
      mediaType = /\.(mp4|webm|mov)$/i.test(directUrl) ? 'video' : 'image';
    }

    // The database assigns the id. The route used to invent `gal-<timestamp>`,
    // which is not a uuid and which the column would reject outright.
    const { data: saved, error: insertError } = await actor.db
      .from('school_gallery_media')
      .insert({
        school_id: schoolId,
        academic_term_id: termId,
        url: mediaUrl,
        thumbnail_url: mediaUrl,
        title,
        category,
        media_type: mediaType,
        is_capstone_demo: isCapstone,
        uploaded_by: actor.user.id,
      })
      .select('id, school_id, academic_term_id, url, thumbnail_url, title, category, media_type, is_capstone_demo, uploaded_by, created_at')
      .single();

    // The file is in the bucket but nothing points at it. Say so: a teacher who
    // is told this worked will not upload it again, and the moment is gone.
    if (insertError) {
      console.error('[gallery] upload stored but not recorded:', insertError.message);
      return NextResponse.json(
        { error: 'The file uploaded but could not be saved to the gallery. Please try again.' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      item: saved as SchoolGalleryItem,
      message: `${mediaType === 'video' ? 'Video' : 'Photo'} added to the school gallery.`,
    });
  } catch (error: any) {
    console.error('[gallery] upload error:', error);
    return NextResponse.json({ error: error?.message || 'Upload failed' }, { status: 500 });
  }
}
