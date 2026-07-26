import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStaffContext } from '@/lib/cards/rbac';
import { createCardForHolder } from '@/lib/cards/issue';
import { logAudit } from '@/lib/audit/log';

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

  if (holderType === 'teacher' && ctx.role !== 'admin') {
    return NextResponse.json({ data: [], total: 0 });
  }

  // Non-admin scope: resolve once, up-front.
  let scopedParentIds: string[] | null = null;
  if (ctx.role !== 'admin') {
    if (ctx.school_ids.length === 0) return NextResponse.json({ data: [], total: 0 });
    if (holderType === 'parent') {
      // Parent cards have school_id=null on the card itself — scope by the holder's school.
      const { data: parents } = await (db as any)
        .from('portal_users').select('id').eq('role', 'parent').in('school_id', ctx.school_ids);
      const ids: string[] = (parents ?? []).map((p: any) => p.id);
      if (ids.length === 0) return NextResponse.json({ data: [], total: 0 });
      scopedParentIds = ids;
    }
  }

  // Slim mode (used by Card Studio's grid) skips the portal_users join and heavy columns —
  // the grid only needs holder_id + status to decide "issued vs missing", so this keeps the
  // payload small even with thousands of cards.
  const slim = searchParams.get('slim') === 'true';
  const selectCols = slim
    ? 'id, holder_type, holder_id, status, card_number, verification_code, issued_at, expires_at'
    : '*, portal_users!identity_cards_holder_id_fkey(id, full_name, email, school_id, school_name, grade, section_class)';

  const buildQuery = () => {
    let q = (db as any)
      .from('identity_cards')
      .select(selectCols, { count: 'exact' })
      .order('created_at', { ascending: false });
    if (holderType) q = q.eq('holder_type', holderType);
    if (status) q = q.eq('status', status);
    if (schoolId) q = q.eq('school_id', schoolId);
    if (holderId) q = q.eq('holder_id', holderId);
    if (ctx.role !== 'admin') {
      if (holderType === 'parent') q = q.in('holder_id', scopedParentIds as string[]);
      else q = q.in('school_id', ctx.school_ids);
    }
    return q;
  };

  // Paginate: a single PostgREST page is capped (~1000 rows) and there are more cards than
  // that. Without this, holders whose card fell outside the first page showed as "Missing"
  // and re-issuing them failed with 409 (a card already existed).
  const all: any[] = [];
  let total = 0;
  for (let from = 0; from < 50000; ) {
    const { data, count, error } = await buildQuery().range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (typeof count === 'number') total = count;
    const batch = data ?? [];
    all.push(...batch);
    // Advance by the rows actually returned (the server may cap a page below 1000) and
    // stop once we've gathered them all.
    if (batch.length === 0) break;
    from += batch.length;
    if (total > 0 && all.length >= total) break;
  }
  return NextResponse.json({ data: all, total });
}

export async function POST(request: Request) {
  const ctx = await getStaffContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { holder_type, holder_id } = body || {};

  if (!holder_type || !holder_id) {
    return NextResponse.json({ error: 'holder_type and holder_id are required' }, { status: 400 });
  }

  const db = createAdminClient();
  const result = await createCardForHolder(db, ctx, {
    holder_type,
    holder_id,
    school_id: body.school_id ?? null,
    class_id: body.class_id ?? null,
    template_type: body.template_type ?? holder_type,
    expires_at: body.expires_at ?? null,
    metadata: body.metadata ?? {},
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.existingId ? { existing_id: result.existingId } : {}) },
      { status: result.status },
    );
  }
  await logAudit(db as any, {
    action: 'card_issued',
    actorId: ctx.id,
    resourceType: 'identity_card',
    resourceId: result.card?.id ?? null,
    tableName: 'identity_cards',
    newValue: `Issued ${holder_type} card`,
    newValues: {
      holder_type,
      holder_id,
      card_id: result.card?.id ?? null,
      card_number: result.card?.card_number ?? null,
    },
  });
  return NextResponse.json({ data: result.card }, { status: 201 });
}
