/**
 * GET /api/partnerships/photos — the classroom photographs available to a proposal.
 *
 * Read off the filesystem rather than a list somebody maintains by hand. Photos
 * are dropped into `public/images/EVENTS/` and appear here; a hardcoded array
 * would go stale the first time somebody added one and did not tell anybody.
 */
import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PARTNERSHIP_PHOTO_DIR, PARTNERSHIP_PHOTOS } from '@/lib/partnerships/proposal-sections';

export const dynamic = 'force-dynamic';

const IMAGE = /\.(jpe?g|png|webp)$/i;

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

  try {
    const dir = path.join(process.cwd(), PARTNERSHIP_PHOTO_DIR);
    const webDir = '/' + PARTNERSHIP_PHOTO_DIR.replace(/^public\//, '').replace(/\/$/, '');
    const files = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((name) => IMAGE.test(name)).sort()
      : [];

    return NextResponse.json({
      photos: files.map((name) => ({ src: `${webDir}/${name}`, name })),
      // What the document prints today, so the studio can open on it.
      selected: PARTNERSHIP_PHOTOS,
    });
  } catch (error) {
    // A studio that cannot list photographs should still open; it simply offers
    // none rather than failing the whole screen.
    console.warn('[partnerships] could not list photographs:', error);
    return NextResponse.json({ photos: [], selected: PARTNERSHIP_PHOTOS });
  }
}
