/**
 * GET /api/partnerships/pipeline — every issued document, across every school.
 *
 * The archive was per-school: to know what was outstanding you picked a school,
 * read its documents, went back, picked the next one. Nobody does that for
 * forty schools, so nothing was chased and nothing was measured.
 *
 * This is the same rows, unpartitioned, with two things attached that only make
 * sense in aggregate: what needs attention now, and what has actually been
 * signed. The second one is the point. Every outcome was already stored —
 * status, the terms snapshot, which option, signed or declined — and nobody had
 * ever read it back, so the recommendation in `recommendOffer` is a rule of
 * thumb rather than something the last forty deals taught us.
 *
 * Deliberately no writes. Acting on a row goes through the routes that already
 * own that, so there is one place where a status can change.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isQuoteExpired } from '@/lib/partnerships/issue-document';
import { pipelineAttention, pipelineOutcomes } from '@/lib/partnerships/pipeline';
import { normaliseTerms } from '@/lib/partnerships/terms';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  reference: string | null;
  document_kind: string;
  status: string;
  school_id: string;
  created_at: string;
  sent_at: string | null;
  signed_at: string | null;
  signed_by_name: string | null;
  share_token: string | null;
  access_code: string | null;
  valid_until: string | null;
  first_opened_at: string | null;
  last_opened_at: string | null;
  open_count: number | null;
  terms_snapshot: Record<string, unknown> | null;
};

export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not permitted' }, { status: 403 });

  const db = createAdminClient();
  const { data: profile } = await db
    .from('portal_users')
    .select('role, is_active, is_deleted')
    .eq('id', user.id)
    .maybeSingle();
  // The pipeline spans every school, so a partner school must never see it —
  // it would show them what every other school was quoted.
  if (
    !profile ||
    profile.is_deleted ||
    profile.is_active === false ||
    !['admin', 'teacher'].includes(profile.role || '')
  ) {
    return NextResponse.json({ error: 'Not permitted' }, { status: 403 });
  }

  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 200, 500);

  const { data, error } = await db
    .from('partnership_agreements')
    .select(
      'id, reference, document_kind, status, school_id, created_at, sent_at, signed_at, signed_by_name, share_token, access_code, valid_until, first_opened_at, last_opened_at, open_count, terms_snapshot',
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as Row[];

  // School names in one query rather than one per row.
  const schoolIds = [...new Set(rows.map((r) => r.school_id).filter(Boolean))];
  const { data: schools } = schoolIds.length
    ? await db.from('schools').select('id, name, city, state, student_count').in('id', schoolIds)
    : { data: [] as Array<Record<string, unknown>> };
  const byId = new Map((schools ?? []).map((s: any) => [String(s.id), s]));

  const documents = rows.map((row) => {
    const school = byId.get(String(row.school_id));
    const flag = pipelineAttention(row);
    return {
      id: row.id,
      reference: row.reference,
      kind: row.document_kind,
      status: row.status,
      school_id: row.school_id,
      school_name: school ? String(school.name) : 'Unknown school',
      school_city: school?.city ?? null,
      school_student_count: school?.student_count ?? null,
      created_at: row.created_at,
      sent_at: row.sent_at,
      signed_at: row.signed_at,
      signed_by_name: row.signed_by_name,
      share_token: row.share_token,
      access_code: row.access_code,
      valid_until: row.valid_until,
      expired: isQuoteExpired(row.valid_until),
      open_count: Number(row.open_count) || 0,
      first_opened_at: row.first_opened_at,
      last_opened_at: row.last_opened_at,
      needs_attention: flag.needs,
      attention_reason: flag.reason,
      attention_tab: flag.tab,
      terms: normaliseTerms(row.terms_snapshot ?? {}),
    };
  });

  return NextResponse.json({ documents, outcomes: pipelineOutcomes(rows) });
}
