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
import { r2Upload, r2Delete } from '@/lib/r2/client';
import { canAccessSchool } from '@/lib/auth/school-scope';
import { type MediaCategory } from '@/lib/partnerships/media-library';
import { GALLERY_CATEGORIES, type SchoolGalleryItem } from '@/lib/schools/gallery-types';
import { withSignedUrl, withSignedUrls } from '@/lib/schools/gallery-media';

export const dynamic = 'force-dynamic';


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
    .select('id, school_id, academic_term_id, url, thumbnail_url, title, category, media_type, is_capstone_demo, uploaded_by, created_at, r2_key, share_token')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false });

  // Surfaced rather than swallowed. An empty gallery and a broken gallery look
  // identical to the viewer, and only one of them is worth telling somebody about.
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Signed here rather than stored: a URL kept in the row either expires or,
  // as it did, points at a route that does not exist.
  const items = (await withSignedUrls((records ?? []) as any[])) as SchoolGalleryItem[];
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
    const category = (GALLERY_CATEGORIES as readonly string[]).includes(rawCategory)
      ? (rawCategory as Exclude<MediaCategory, 'all'>)
      : 'classroom';
    const title = String(formData.get('title') || '').trim().slice(0, 160) || 'Classroom snapshot';
    const termId = (formData.get('term_id') as string) || null;
    const isCapstone = formData.get('is_capstone') === 'true';

    let mediaUrl: string;
    let mediaType: 'image' | 'video';
    // Set for an upload, null for a pasted external URL.
    let r2Key: string | null = null;

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
      // The key is what is kept.  was stored as a permanent URL
      // and no such route exists in this codebase, so every uploaded file was
      // written to the bucket and then addressed by a 404. Signed on read instead.
      r2Key = key;
      mediaUrl = key;
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
        r2_key: r2Key,
        title,
        category,
        media_type: mediaType,
        is_capstone_demo: isCapstone,
        uploaded_by: actor.user.id,
      })
      .select('id, school_id, academic_term_id, url, thumbnail_url, title, category, media_type, is_capstone_demo, uploaded_by, created_at, r2_key, share_token')
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
      item: (await withSignedUrl(saved as any)) as SchoolGalleryItem,
      message: `${mediaType === 'video' ? 'Video' : 'Photo'} added to the school gallery.`,
    });
  } catch (error: any) {
    console.error('[gallery] upload error:', error);
    return NextResponse.json({ error: error?.message || 'Upload failed' }, { status: 500 });
  }
}

/** DELETE /api/schools/[id]/gallery — remove an image or video from gallery */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: schoolId } = await params;
  const actor = await authorise(schoolId, true);
  if (!actor) return NextResponse.json({ error: 'Not permitted' }, { status: 403 });

  try {
    const url = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const itemId = String(url.searchParams.get('itemId') || body.itemId || '').trim();
    if (!itemId) return NextResponse.json({ error: 'An itemId is required.' }, { status: 400 });

    const { data: item, error: findError } = await actor.db
      .from('school_gallery_media')
      .select('id, school_id, url')
      .eq('id', itemId)
      .eq('school_id', schoolId)
      .maybeSingle();

    if (findError || !item) {
      return NextResponse.json({ error: 'Item not found in school gallery.' }, { status: 404 });
    }

    // Delete from R2 if stored via internal R2 key
    if (item.url && item.url.includes('/api/storage/r2?key=')) {
      const keyMatch = item.url.match(/key=([^&]+)/);
      if (keyMatch?.[1]) {
        const key = decodeURIComponent(keyMatch[1]);
        try {
          await r2Delete(key);
        } catch (err) {
          console.warn('[gallery] R2 deletion note:', key, err);
        }
      }
    }

    const { error: deleteError } = await actor.db
      .from('school_gallery_media')
      .delete()
      .eq('id', itemId)
      .eq('school_id', schoolId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Media deleted successfully.',
    });
  } catch (error: any) {
    console.error('[gallery] delete error:', error);
    return NextResponse.json({ error: error?.message || 'Delete failed' }, { status: 500 });
  }
}
