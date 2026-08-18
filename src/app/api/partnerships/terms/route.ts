/**
 * GET    /api/partnerships/terms?school_id=…  — terms history for one school
 * POST   /api/partnerships/terms               — record a new set of terms
 * DELETE /api/partnerships/terms?id=…          — discard an unagreed draft
 *
 * Terms are the agreed commercial deal: what a school is charged and how it
 * divides. The proposal, the MoU and the invoice all read this rather than each
 * deciding a rate for themselves, which is how the MoU came to state 70/30
 * while the receipt path billed 15.
 *
 * Terms are never edited in place. Recording new terms for a school supersedes
 * the current ones and keeps the old row, because a superseded rate is what a
 * previously signed agreement was signed against.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit/log';
import { describeTerms, normaliseTerms, parseSettlementFields } from '@/lib/partnerships/terms';

export const dynamic = 'force-dynamic';

// One literal, not a concatenation: a joined string widens to `string` and the
// Supabase client can no longer infer the row shape from it.
const SELECT = 'id, school_id, billing_model, currency, billing_cycle, amount_per_student, fixed_package_price, tiers, deposit_amount, rillcod_share_percent, school_share_percent, settlement_days, settlement_trigger, withdrawal_policy, minimum_students, status, effective_from, effective_to, version, supersedes_id, notes, agreed_at, created_at, updated_at';

async function requireActor(write: boolean) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: profile } = await db
    .from('portal_users')
    .select('role, school_id, is_active, is_deleted')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || profile.is_deleted || profile.is_active === false) return null;

  // Money terms are set by admins only. Teachers may read them because they
  // answer school questions; a school may read its own but never write them —
  // nobody should be able to edit the rate they are billed at.
  const allowed = write ? ['admin'] : ['admin', 'teacher', 'school'];
  if (!allowed.includes(profile.role || '')) return null;
  return { user, db, role: profile.role as string, schoolId: profile.school_id as string | null };
}

export async function GET(req: NextRequest) {
  const actor = await requireActor(false);
  if (!actor) return NextResponse.json({ error: 'Not permitted' }, { status: 403 });

  const schoolId = req.nextUrl.searchParams.get('school_id')?.trim() || null;
  if (!schoolId) {
    return NextResponse.json({ error: 'A school_id is required.' }, { status: 400 });
  }
  // A partner school sees its own terms and nobody else's, whatever it asks for.
  if (actor.role === 'school' && actor.schoolId !== schoolId) {
    return NextResponse.json({ error: 'Not permitted' }, { status: 403 });
  }

  const { data, error } = await actor.db
    .from('partnership_terms')
    .select(SELECT)
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((row: Record<string, unknown>) => {
    const terms = normaliseTerms(row);
    return { ...row, summary: terms ? describeTerms(terms) : null };
  });
  const agreed = rows.find((r: any) => r.status === 'agreed') ?? null;

  return NextResponse.json({ terms: rows, agreed });
}

export async function POST(req: NextRequest) {
  const actor = await requireActor(true);
  if (!actor) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const schoolId = String(body.school_id ?? '').trim();
  if (!schoolId) {
    return NextResponse.json({ error: 'A school_id is required.' }, { status: 400 });
  }

  const status = String(body.status ?? 'draft');
  if (!['draft', 'proposed', 'agreed'].includes(status)) {
    return NextResponse.json(
      { error: 'Terms can be saved as draft, proposed or agreed.' },
      { status: 400 },
    );
  }

  const { data: school } = await actor.db
    .from('schools')
    .select('id, name')
    .eq('id', schoolId)
    .maybeSingle();
  if (!school) return NextResponse.json({ error: 'That school does not exist.' }, { status: 404 });

  const num = (v: unknown) => (v == null || v === '' ? null : Number(v));

  const settlement = parseSettlementFields(body);
  if (!settlement.ok) {
    return NextResponse.json({ error: settlement.error }, { status: 400 });
  }

  const payload = {
    school_id: schoolId,
    billing_model: String(body.billing_model ?? ''),
    currency: String(body.currency ?? 'NGN'),
    billing_cycle: String(body.billing_cycle ?? 'term'),
    amount_per_student: num(body.amount_per_student),
    fixed_package_price: num(body.fixed_package_price),
    tiers: Array.isArray(body.tiers) && body.tiers.length ? body.tiers : null,
    deposit_amount: num(body.deposit_amount),
    rillcod_share_percent: num(body.rillcod_share_percent),
    school_share_percent: num(body.school_share_percent),
    ...settlement.fields,
    status,
    effective_from: body.effective_from ? String(body.effective_from) : null,
    effective_to: body.effective_to ? String(body.effective_to) : null,
    notes: body.notes ? String(body.notes) : null,
    created_by: actor.user.id,
    agreed_at: status === 'agreed' ? new Date().toISOString() : null,
  };

  // Only one agreed set may stand at a time, so supersede before inserting.
  // Done first because the partial unique index would otherwise reject the
  // insert, and the clearer error is the one that never happens.
  let supersedesId: string | null = null;
  let version = 1;
  if (status === 'agreed') {
    const { data: current } = await actor.db
      .from('partnership_terms')
      .select('id, version')
      .eq('school_id', schoolId)
      .eq('status', 'agreed')
      .maybeSingle();
    if (current) {
      supersedesId = current.id as string;
      version = (Number(current.version) || 1) + 1;
      const { error: supErr } = await actor.db
        .from('partnership_terms')
        .update({ status: 'superseded', effective_to: new Date().toISOString().slice(0, 10) })
        .eq('id', current.id);
      if (supErr) return NextResponse.json({ error: supErr.message }, { status: 500 });
    }
  }

  const { data: inserted, error } = await actor.db
    .from('partnership_terms')
    .insert({ ...payload, version, supersedes_id: supersedesId })
    .select(SELECT)
    .single();

  if (error) {
    // The CHECK constraints carry the business rules, so their messages are the
    // useful ones — surface them instead of a generic failure.
    const message = /rillcod_not_minority/.test(error.message)
      ? 'Rillcod’s share cannot be below 50%. Check the split is not reversed.'
      : /shares_total/.test(error.message)
        ? 'The two shares must add up to 100%.'
        : /model_fields/.test(error.message)
          ? 'These terms are missing the amount they bill on.'
          : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const terms = normaliseTerms(inserted);
  // logAudit never throws — a lost trail entry must not undo a recorded rate.
  await logAudit(actor.db as any, {
    action: 'record_partnership_terms',
    actorId: actor.user.id,
    resourceType: 'partnership_terms',
    resourceId: inserted.id as string,
    tableName: 'partnership_terms',
    newValue: terms ? `${school.name}: ${describeTerms(terms)} (${status})` : null,
    newValues: {
      school_id: schoolId,
      school_name: school.name,
      status,
      supersedes_id: supersedesId,
      version,
    },
  });

  return NextResponse.json({
    terms: inserted,
    summary: terms ? describeTerms(terms) : null,
  });
}

/**
 * End the deal in force, without putting another in its place.
 *
 * Recording terms is easy to do to the wrong school, and until now there was no
 * way back: an agreed row cannot be deleted — invoices billed on it and
 * agreements were signed against it — and the only other path was to supersede
 * it, which requires a replacement deal the desk does not have. So a rate
 * entered by mistake stood for ever, and the school read as a partner on terms
 * nobody had agreed.
 *
 * Ending it keeps the row and stops it applying: the same close a supersede
 * performs, minus the successor. The school goes back to having no agreed rate,
 * which is the truth, and the desk asks for one again.
 */
export async function PATCH(req: NextRequest) {
  const actor = await requireActor(true);
  if (!actor) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const id = String(body.id ?? '').trim();
  if (!id) return NextResponse.json({ error: 'An id is required.' }, { status: 400 });
  if (String(body.action ?? '') !== 'end') {
    return NextResponse.json({ error: 'The only change available here is ending the deal.' }, { status: 400 });
  }

  const { data: current } = await actor.db
    .from('partnership_terms')
    .select('id, school_id, status, version')
    .eq('id', id)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: 'Those terms do not exist.' }, { status: 404 });
  if (current.status !== 'agreed') {
    return NextResponse.json(
      { error: 'Only the deal currently in force can be ended.' },
      { status: 409 },
    );
  }

  const { error } = await actor.db
    .from('partnership_terms')
    .update({ status: 'superseded', effective_to: new Date().toISOString().slice(0, 10) })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: school } = await actor.db
    .from('schools')
    .select('name')
    .eq('id', current.school_id)
    .maybeSingle();

  await logAudit(actor.db as any, {
    action: 'end_partnership_terms',
    actorId: actor.user.id,
    resourceType: 'partnership_terms',
    resourceId: id,
    tableName: 'partnership_terms',
    oldValue: `v${current.version} agreed`,
    newValues: { school_id: current.school_id, school_name: school?.name ?? null, status: 'superseded' },
  });

  return NextResponse.json({ ended: true });
}

/**
 * Discard a set of terms that was never agreed.
 *
 * Drafts and proposals only. An agreed or superseded row is what some invoice
 * was billed on and what some agreement was signed against, so it stays —
 * ending or superseding is how terms stop applying, not deletion. The foreign
 * key from `partnership_agreements.terms_id` enforces the same thing one layer
 * down; this check exists so the answer is a sentence rather than a constraint
 * name.
 */
export async function DELETE(req: NextRequest) {
  const actor = await requireActor(true);
  if (!actor) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const id = req.nextUrl.searchParams.get('id')?.trim() || '';
  if (!id) return NextResponse.json({ error: 'An id is required.' }, { status: 400 });

  const { data: current } = await actor.db
    .from('partnership_terms')
    .select('id, school_id, status, version')
    .eq('id', id)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: 'Those terms do not exist.' }, { status: 404 });

  if (current.status === 'agreed' || current.status === 'superseded') {
    return NextResponse.json(
      {
        error:
          current.status === 'agreed'
            ? 'These terms are in force. End the deal to stop them applying, or record new agreed terms to supersede them — either way this row stays, because previously signed agreements point at it.'
            : 'Terms that once applied are kept on purpose: an agreement signed earlier was signed against them.',
      },
      { status: 409 },
    );
  }

  const { error } = await actor.db.from('partnership_terms').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(actor.db as any, {
    action: 'delete_partnership_terms_draft',
    actorId: actor.user.id,
    resourceType: 'partnership_terms',
    resourceId: id,
    tableName: 'partnership_terms',
    oldValue: `v${current.version} (${current.status})`,
    newValues: { school_id: current.school_id, status: current.status },
  });

  return NextResponse.json({ deleted: true });
}
