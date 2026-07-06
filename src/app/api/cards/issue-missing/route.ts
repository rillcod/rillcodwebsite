import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStaffContext } from '@/lib/cards/rbac';
import { createCardForHolder } from '@/lib/cards/issue';

/**
 * Bulk "issue missing" — the server decides who lacks a live card and issues only those,
 * so the browser never has to load the full card set to work it out (avoids the payload
 * overload and the 409s that happened when cards fell outside a client page).
 *
 * Body: { holder_type, holder_ids: string[], expires_at?: string|null }
 */
export async function POST(request: Request) {
  const ctx = await getStaffContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const holder_type = body?.holder_type;
  const holder_ids: string[] = Array.isArray(body?.holder_ids) ? body.holder_ids.filter(Boolean) : [];
  const expires_at: string | null = body?.expires_at ?? null;

  if (!['student', 'parent', 'teacher'].includes(holder_type)) {
    return NextResponse.json({ error: 'Invalid holder_type' }, { status: 400 });
  }
  if (holder_ids.length === 0) {
    return NextResponse.json({ error: 'holder_ids is required' }, { status: 400 });
  }
  if (holder_type === 'teacher' && ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Teacher cards can only be issued by admin' }, { status: 403 });
  }

  const db = createAdminClient();

  // Find who already has a live (non-revoked) card — chunk the IN() so long id lists stay
  // within URL limits.
  const haveCard = new Set<string>();
  for (let i = 0; i < holder_ids.length; i += 200) {
    const chunk = holder_ids.slice(i, i + 200);
    const { data } = await (db as any)
      .from('identity_cards')
      .select('holder_id')
      .eq('holder_type', holder_type)
      .neq('status', 'revoked')
      .in('holder_id', chunk);
    for (const row of data ?? []) haveCard.add(row.holder_id);
  }

  const missing = holder_ids.filter((id) => !haveCard.has(id));

  let issued = 0;
  const failures: Array<{ holder_id: string; error: string }> = [];

  // Small concurrency so we don't hammer the DB (or its rate limits) on big batches.
  for (let i = 0; i < missing.length; i += 8) {
    const batch = missing.slice(i, i + 8);
    const results = await Promise.all(batch.map(async (holder_id) => {
      const r = await createCardForHolder(db, ctx as any, { holder_type, holder_id, expires_at });
      return { holder_id, r };
    }));
    for (const { holder_id, r } of results) {
      if (r.ok) issued += 1;
      else if (r.status === 409) { /* already had a card — treat as skipped, not a failure */ }
      else failures.push({ holder_id, error: r.error });
    }
  }

  return NextResponse.json({
    issued,
    skipped: holder_ids.length - missing.length,
    failed: failures.length,
    failures: failures.slice(0, 20),
  });
}
