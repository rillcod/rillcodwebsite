import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessSchool, getStaffContext } from '@/lib/cards/rbac';

async function generateUniqueCode(db: ReturnType<typeof createAdminClient>, column: 'card_number' | 'verification_code', prefix: string) {
  for (let i = 0; i < 8; i++) {
    const code = `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { data } = await (db as any).from('identity_cards').select('id').eq(column, code).maybeSingle();
    if (!data?.id) return code;
  }
  // Final fallback with extra entropy — collision probability vanishingly small
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 12).toUpperCase()}`;
}

// Everyone on a card must belong to a school. Resolve a student's/teacher's school from
// their portal profile → class → school_name (in that order of confidence).
async function resolveSchoolIdForUser(db: ReturnType<typeof createAdminClient>, userId: string): Promise<string | null> {
  const { data: u } = await (db as any)
    .from('portal_users').select('school_id, school_name, class_id').eq('id', userId).maybeSingle();
  if (u?.school_id) return u.school_id as string;
  if (u?.class_id) {
    const { data: cls } = await (db as any).from('classes').select('school_id').eq('id', u.class_id).maybeSingle();
    if (cls?.school_id) return cls.school_id as string;
  }
  if (u?.school_name) {
    const { data: sch } = await (db as any).from('schools').select('id').ilike('name', u.school_name).maybeSingle();
    if (sch?.id) return sch.id as string;
  }
  return null;
}

// A parent inherits the school of their linked child (parent_student_links → students →
// the child's portal profile), falling back to the parent's own recorded school.
async function resolveSchoolIdForParent(db: ReturnType<typeof createAdminClient>, parentId: string): Promise<string | null> {
  const { data: links } = await (db as any)
    .from('parent_student_links').select('student_id').eq('parent_id', parentId);
  for (const l of (links ?? [])) {
    const { data: st } = await (db as any)
      .from('students').select('user_id, school_name').eq('id', l.student_id).maybeSingle();
    if (st?.user_id) {
      const sid = await resolveSchoolIdForUser(db, st.user_id);
      if (sid) return sid;
    }
    if (st?.school_name) {
      const { data: sch } = await (db as any).from('schools').select('id').ilike('name', st.school_name).maybeSingle();
      if (sch?.id) return sch.id as string;
    }
  }
  return resolveSchoolIdForUser(db, parentId);
}

export async function GET(request: Request) {
  const ctx = await getStaffContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const holderType = searchParams.get('holder_type');
  const status = searchParams.get('status');
  const schoolId = searchParams.get('school_id');
  const holderId = searchParams.get('holder_id');

  const db = createAdminClient();

  // Lazy auto-expire: no cron runs for cards, so flip overdue 'active' cards here
  // (best-effort) before listing so status filters and counts stay truthful.
  try {
    await (db as any)
      .from('identity_cards')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('status', 'active')
      .lt('expires_at', new Date().toISOString());
  } catch { /* non-fatal */ }

  let q = (db as any)
    .from('identity_cards')
    .select('*, portal_users!identity_cards_holder_id_fkey(id, full_name, email, school_id, school_name, section_class)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(500);

  if (holderType) q = q.eq('holder_type', holderType);
  if (holderType === 'teacher' && ctx.role !== 'admin') {
    return NextResponse.json({ data: [], total: 0 });
  }
  if (status) q = q.eq('status', status);
  if (schoolId) q = q.eq('school_id', schoolId);
  if (holderId) q = q.eq('holder_id', holderId);

  if (ctx.role !== 'admin') {
    if (ctx.school_ids.length === 0) return NextResponse.json({ data: [], total: 0 });

    if (holderType === 'parent') {
      // Parent cards have school_id=null on the card itself — filter by the holder's school instead
      const { data: parents } = await (db as any)
        .from('portal_users')
        .select('id')
        .eq('role', 'parent')
        .in('school_id', ctx.school_ids);
      const parentIds = (parents ?? []).map((p: any) => p.id);
      if (parentIds.length === 0) return NextResponse.json({ data: [], total: 0 });
      q = q.in('holder_id', parentIds);
    } else {
      q = q.in('school_id', ctx.school_ids);
    }
  }

  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], total: count ?? 0 });
}

export async function POST(request: Request) {
  const ctx = await getStaffContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const {
    holder_type,
    holder_id,
    class_id = null,
    template_type = holder_type,
    expires_at = null,
    metadata = {},
  } = body || {};

  if (!holder_type || !holder_id) {
    return NextResponse.json({ error: 'holder_type and holder_id are required' }, { status: 400 });
  }
  if (!['student', 'parent', 'teacher'].includes(holder_type)) {
    return NextResponse.json({ error: 'Invalid holder_type' }, { status: 400 });
  }

  if (holder_type === 'teacher' && ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Teacher cards can only be issued by admin' }, { status: 403 });
  }

  const db = createAdminClient();

  // Everyone on a card belongs to a real school. Resolve it: explicit body value, else the
  // holder's own school (student/teacher), else the child's school (parent). The Online
  // School is NOT a fallback here — it only ever applies to genuinely online students, who
  // already carry its school_id. If none resolves, the holder simply has no school on file.
  let school_id: string | null = body.school_id ?? null;
  if (!school_id) {
    school_id = holder_type === 'parent'
      ? await resolveSchoolIdForParent(db, holder_id)
      : await resolveSchoolIdForUser(db, holder_id);
  }
  if (!school_id) {
    return NextResponse.json(
      { error: `No school is on record for this ${holder_type}. Assign them to a school first, then issue the card.` },
      { status: 400 },
    );
  }

  if (!canAccessSchool(ctx, school_id)) {
    return NextResponse.json({ error: 'Forbidden for this school scope' }, { status: 403 });
  }

  // Backfill the holder's own school_id when it was simply un-denormalised (we resolved it
  // from their class / school name) — never overwrites a school already on file, and never
  // writes the Online School as a guess.
  if (holder_type !== 'parent') {
    try {
      await (db as any).from('portal_users').update({ school_id }).eq('id', holder_id).is('school_id', null);
    } catch { /* non-fatal */ }
  }

  // Check for existing active/expired card — prevent duplicates (revoked cards allow re-issue)
  const { data: existing } = await (db as any)
    .from('identity_cards')
    .select('id, status')
    .eq('holder_type', holder_type)
    .eq('holder_id', holder_id)
    .not('status', 'eq', 'revoked')
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'A card has already been issued for this holder', existing_id: existing.id }, { status: 409 });
  }

  const card_number = await generateUniqueCode(db, 'card_number', 'CARD');
  const verification_code = await generateUniqueCode(db, 'verification_code', 'RC');
  const now = new Date().toISOString();

  const { data, error } = await (db as any)
    .from('identity_cards')
    .insert({
      holder_type,
      holder_id,
      school_id,
      class_id,
      card_number,
      verification_code,
      template_type,
      status: 'active',
      issued_at: now,
      expires_at,
      created_by: ctx.id,
      updated_by: ctx.id,
      metadata,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await (db as any).from('card_audit_logs').insert({
    card_id: data.id,
    actor_id: ctx.id,
    school_id,
    action: 'issue',
    entity: 'identity_card',
    details: { holder_type, holder_id },
  });

  return NextResponse.json({ data }, { status: 201 });
}
