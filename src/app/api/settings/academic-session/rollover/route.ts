import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/log';
import { sessionTermLabel, summariseRolloverPlan } from '@/lib/academic/session-rollover';
import {
  applyRolloverPlan,
  gatherRolloverPlan,
  loadAcademicTerm,
} from '@/lib/academic/session-rollover-server';

export const dynamic = 'force-dynamic';

/**
 * The one place an academic session can be corrected everywhere at once.
 *
 * /api/settings/academic-year already names the live session, but naming it was
 * all it did — work already filed against the wrong session stayed there, and no
 * screen could reach it. A curriculum prepared for First Term under the wrong
 * year had propagated into 58 school adoptions, 56 classes and 49 lesson plans
 * before anyone could see it, and the only options left were a hand-written SQL
 * script or living with it.
 *
 * GET  → the terms to choose between, plus what currently sits on each.
 * POST → dry run by default; `apply: true` writes the plan the dry run returned.
 */

async function requireAdmin() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const admin = createAdminClient() as any;
  const { data: profile } = await admin
    .from('portal_users')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle();
  // Platform-wide by nature: it moves every school's adoption at once, so it is
  // not something a single school or teacher account may trigger.
  if (profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Only admins can correct an academic session.' }, { status: 403 }) };
  }
  return { admin, actorId: user.id };
}

export async function GET() {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const { data: terms } = await admin
    .from('academic_terms')
    .select('id, academic_year, term_number, term_label, start_date, end_date, is_current')
    .order('academic_year', { ascending: false })
    .order('term_number', { ascending: false });

  // What is filed against each term, so an operator picking "from" can see at a
  // glance which one is carrying the mis-stamped work.
  const [{ data: classes }, { data: plans }] = await Promise.all([
    admin.from('classes').select('term_id').not('term_id', 'is', null),
    admin.from('lesson_plans').select('term_id').not('term_id', 'is', null),
  ]);
  const count = (rows: any[], id: string) => rows.filter((row) => row.term_id === id).length;

  return NextResponse.json({
    terms: (terms ?? []).map((term: any) => ({
      ...term,
      label: sessionTermLabel(term),
      class_count: count(classes ?? [], term.id),
      lesson_plan_count: count(plans ?? [], term.id),
    })),
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;
  const { admin, actorId } = guard;

  const body = await req.json().catch(() => ({}));
  const fromId = String(body.from_term_id ?? '').trim();
  const toId = String(body.to_term_id ?? '').trim();
  const apply = body.apply === true;
  if (!fromId || !toId) {
    return NextResponse.json({ error: 'Choose the term to correct from and the term to correct to.' }, { status: 400 });
  }

  const [from, to] = await Promise.all([
    loadAcademicTerm(admin, fromId),
    loadAcademicTerm(admin, toId),
  ]);
  if (!from || !to) {
    return NextResponse.json({ error: 'One of the chosen academic terms was not found.' }, { status: 404 });
  }

  const plan = await gatherRolloverPlan(admin, from, to);
  const summary = summariseRolloverPlan(plan);

  if (!apply) {
    return NextResponse.json({ dry_run: true, from, to, summary, plan });
  }
  if (plan.blocked.length) {
    return NextResponse.json(
      { error: 'This correction cannot run yet.', blocked: plan.blocked, summary },
      { status: 409 },
    );
  }

  const failures = await applyRolloverPlan(admin, plan, actorId);

  await logAudit(admin, {
    action: 'academic_session.corrected',
    actorId,
    resourceType: 'academic_term',
    resourceId: to.id,
    oldValue: sessionTermLabel(from),
    newValue: sessionTermLabel(to),
    newValues: { summary, failures },
  });

  return NextResponse.json({
    dry_run: false,
    from,
    to,
    summary,
    failures,
    success: failures.length === 0,
  });
}
