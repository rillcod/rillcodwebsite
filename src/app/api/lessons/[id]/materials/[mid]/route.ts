import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { r2Delete } from '@/lib/r2/client';

export const dynamic = 'force-dynamic';

/** Extract the R2 keys referenced by a slide-deck material's file_url JSON. */
function deckKeys(fileUrl: string | null | undefined): string[] {
  if (!fileUrl) return [];
  try {
    const p = JSON.parse(fileUrl);
    const keys: string[] = [];
    if (typeof p?.pdf === 'string') keys.push(p.pdf);
    if (Array.isArray(p?.slides)) for (const k of p.slides) if (typeof k === 'string') keys.push(k);
    return keys;
  } catch { return []; }
}

function jsonStringContainsKey(fileUrl: string | null | undefined, key: string): boolean {
  if (!fileUrl) return false;
  try {
    const parsed = JSON.parse(fileUrl);
    if (typeof parsed?.pdf === 'string' && parsed.pdf === key) return true;
    if (Array.isArray(parsed?.slides) && parsed.slides.includes(key)) return true;
  } catch {
    return fileUrl.includes(key);
  }
  return false;
}

async function keyIsUsedByAnotherDeck(admin: ReturnType<typeof adminClient>, key: string, excludeMaterialId: string): Promise<boolean> {
  const { data } = await admin
    .from('lesson_materials')
    .select('id, file_url')
    .eq('file_type', 'slide-deck')
    .neq('id', excludeMaterialId)
    .ilike('file_url', `%${key}%`);
  return (data ?? []).some((row: any) => jsonStringContainsKey(row.file_url, key));
}

/** Best-effort R2 cleanup — never throws and never deletes a key another deck still uses. */
async function purgeKeys(admin: ReturnType<typeof adminClient>, keys: string[], excludeMaterialId: string): Promise<void> {
  for (const k of keys) {
    try {
      if (await keyIsUsedByAnotherDeck(admin, k, excludeMaterialId)) continue;
      await r2Delete(k);
    } catch (e) { console.warn('[materials] R2 purge failed for', k, e); }
  }
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Caller = { role: string; id: string; school_id: string | null };

async function requireStaff(): Promise<Caller | null> {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id, school_id')
    .eq('id', user.id)
    .single();
  if (!caller || !['admin', 'teacher'].includes(caller.role)) return null;
  return caller as Caller;
}

async function getTeacherSchoolIds(teacherId: string, fallbackSchoolId: string | null): Promise<string[]> {
  const ids = new Set<string>();
  if (fallbackSchoolId) ids.add(fallbackSchoolId);
  const admin = adminClient();
  const { data } = await admin
    .from('teacher_schools')
    .select('school_id')
    .eq('teacher_id', teacherId);
  for (const row of data ?? []) {
    const sid = (row as { school_id: string | null }).school_id;
    if (sid) ids.add(sid);
  }
  return Array.from(ids);
}

async function callerCanManageLesson(
  caller: Caller,
  lessonSchoolId: string | null,
  lessonCreatedBy: string | null,
): Promise<boolean> {
  if (caller.role === 'admin') return true;
  if (caller.role === 'teacher') {
    if (lessonCreatedBy === caller.id) return true;
    if (!lessonSchoolId) return false;
    if (caller.school_id === lessonSchoolId) return true;
    const scopedIds = await getTeacherSchoolIds(caller.id, caller.school_id);
    return scopedIds.includes(lessonSchoolId);
  }
  return false;
}

// PATCH /api/lessons/[id]/materials/[mid] — update a material (title and/or file_url).
// For slide decks, changing file_url also purges any R2 keys that were removed.
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; mid: string }> },
) {
  try {
    const caller = await requireStaff();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

    const { id: lessonId, mid } = await context.params;
    const admin = adminClient();

    const { data: material } = await admin
      .from('lesson_materials')
      .select('id, lesson_id, file_type, file_url, lessons(school_id, created_by)')
      .eq('id', mid)
      .maybeSingle();
    if (!material) return NextResponse.json({ error: 'Material not found' }, { status: 404 });
    if ((material as any).lesson_id !== lessonId) {
      return NextResponse.json({ error: 'Material does not belong to this lesson' }, { status: 404 });
    }

    const lesson = (material as any).lessons;
    const canManage = await callerCanManageLesson(caller, lesson?.school_id ?? null, lesson?.created_by ?? null);
    if (!canManage) {
      return NextResponse.json({ error: 'Access denied: lesson is outside your school scope' }, { status: 403 });
    }

    const body = await request.json();
    const update: Record<string, unknown> = {};
    if (typeof body.title === 'string' && body.title.trim()) update.title = body.title.trim();
    if (typeof body.file_url === 'string') update.file_url = body.file_url;
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    // For slide decks, purge any R2 keys dropped from the deck (remove/replace).
    if ((material as any).file_type === 'slide-deck' && typeof body.file_url === 'string') {
      const oldKeys = deckKeys((material as any).file_url);
      const newKeys = new Set(deckKeys(body.file_url));
      await purgeKeys(admin, oldKeys.filter((k) => !newKeys.has(k)), mid);
    }

    const { data, error } = await admin
      .from('lesson_materials')
      .update(update)
      .eq('id', mid)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// DELETE /api/lessons/[id]/materials/[mid]
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string; mid: string }> },
) {
  try {
    const caller = await requireStaff();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

    const { id: lessonId, mid } = await context.params;
    const admin = adminClient();

    // Fetch material and parent lesson details to perform school boundary checks
    const { data: material } = await admin
      .from('lesson_materials')
      .select('id, lesson_id, file_type, file_url, lessons(school_id, created_by)')
      .eq('id', mid)
      .maybeSingle();

    if (!material) {
      return NextResponse.json({ error: 'Material not found' }, { status: 404 });
    }
    if ((material as any).lesson_id !== lessonId) {
      return NextResponse.json({ error: 'Material does not belong to this lesson' }, { status: 404 });
    }

    const lesson = (material as any).lessons;
    const canManage = await callerCanManageLesson(caller, lesson?.school_id ?? null, lesson?.created_by ?? null);
    if (!canManage) {
      return NextResponse.json({ error: 'Access denied: lesson is outside your school scope' }, { status: 403 });
    }

    const { error } = await admin.from('lesson_materials').delete().eq('id', mid);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Clean up the deck's R2 objects so deleting a deck doesn't orphan storage.
    if ((material as any).file_type === 'slide-deck') {
      await purgeKeys(admin, deckKeys((material as any).file_url), mid);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
