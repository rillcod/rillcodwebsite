import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PARTNERSHIP_PHOTO_DIR, PARTNERSHIP_PHOTOS } from '@/lib/partnerships/proposal-sections';
import { categorizeMediaAsset } from '@/lib/partnerships/media-library';

export const dynamic = 'force-dynamic';

const MEDIA_FILE = /\.(jpe?g|png|webp|mp4|webm|mov)$/i;

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not permitted' }, { status: 403 });

  const db = createAdminClient();
  const { data: profile } = await db
    .from('portal_users')
    .select('role, is_active, is_deleted')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || profile.is_deleted || profile.is_active === false) {
    return NextResponse.json({ error: 'Not permitted' }, { status: 403 });
  }
  if (!['admin', 'teacher'].includes(profile.role || '')) {
    return NextResponse.json({ error: 'Not permitted' }, { status: 403 });
  }

  const known = PARTNERSHIP_PHOTOS.map((src) => categorizeMediaAsset(src));

  try {
    const dir = path.join(process.cwd(), PARTNERSHIP_PHOTO_DIR);
    const webDir = '/' + PARTNERSHIP_PHOTO_DIR.replace(/^public\//, '').replace(/\/$/, '');
    const files = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((name) => MEDIA_FILE.test(name)).sort()
      : [];

    const mediaList = files.length
      ? files.map((name) => categorizeMediaAsset(`${webDir}/${name}`))
      : known;

    return NextResponse.json({
      photos: mediaList,
      selected: PARTNERSHIP_PHOTOS,
    });
  } catch (error) {
    console.warn('[partnerships] could not list media:', error);
    return NextResponse.json({ photos: known, selected: PARTNERSHIP_PHOTOS });
  }
}
