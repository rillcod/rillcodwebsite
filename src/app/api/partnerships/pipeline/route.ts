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
import { normaliseTerms, type PartnershipTerms } from '@/lib/partnerships/terms';

export const dynamic = 'force-dynamic';

/**
 * How long a sent proposal may sit unanswered before it wants chasing.
 *
 * Deliberately not exported. A route file may export request handlers and
 * Next's route config and nothing else — anything more fails `next build` with
 * an error that neither `tsc --noEmit` nor the test suite will ever show you.
 * `npm run check:routes` guards it now, in about a second.
 */
const CHASE_AFTER_DAYS = 7;

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

function daysSince(value: string | null): number | null {
  if (!value) return null;
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}

/**
 * What this row needs from a person, if anything.
 *
 * One reason per row, most urgent first, because a list where everything is
 * flagged is a list nobody reads. The order encodes what is actually at stake:
 * a lapsed quote cannot be signed at all, an unopened proposal has not started
 * the conversation, and one read repeatedly without an answer is the one worth
 * picking up the phone about.
 */
function attention(row: Row): { needs: boolean; reason: string } {
  if (row.status === 'signed' || row.status === 'void' || row.status === 'declined') {
    return { needs: false, reason: '' };
  }
  if (isQuoteExpired(row.valid_until)) {
    return { needs: true, reason: 'Fees have lapsed — re-issue before it can be signed' };
  }
  if (row.status === 'draft') {
    const age = daysSince(row.created_at);
    return age !== null && age >= CHASE_AFTER_DAYS
      ? { needs: true, reason: `Drafted ${age} days ago and never sent` }
      : { needs: false, reason: '' };
  }

  const sinceSent = daysSince(row.sent_at);
  const opens = Number(row.open_count) || 0;
  if (sinceSent !== null && sinceSent >= CHASE_AFTER_DAYS && opens === 0) {
    return { needs: true, reason: `Sent ${sinceSent} days ago and never opened` };
  }
  if (opens >= 3) {
    return { needs: true, reason: `Opened ${opens} times without a signature` };
  }
  if (sinceSent !== null && sinceSent >= CHASE_AFTER_DAYS * 2) {
    return { needs: true, reason: `Sent ${sinceSent} days ago, still unsigned` };
  }
  return { needs: false, reason: '' };
}

/**
 * What the signed deals have in common.
 *
 * Counted off `terms_snapshot`, which is frozen at issue — so this measures the
 * terms a school actually agreed to, not whatever their current record says
 * after a renegotiation.
 */
function outcomes(rows: Row[]) {
  const proposals = rows.filter((r) => r.document_kind === 'proposal');
  const sent = proposals.filter((r) => r.status !== 'draft');
  const opened = sent.filter((r) => (Number(r.open_count) || 0) > 0);
  const signed = rows.filter((r) => r.status === 'signed');
  const declined = rows.filter((r) => r.status === 'declined');

  // What was agreed, on the deals that closed.
  const rates: number[] = [];
  const shares: number[] = [];
  for (const row of signed) {
    const terms = normaliseTerms(row.terms_snapshot ?? {}) as PartnershipTerms | null;
    if (!terms) continue;
    if (terms.billing_model === 'per_student' && terms.amount_per_student) {
      rates.push(Number(terms.amount_per_student));
    }
    if (terms.school_share_percent != null) shares.push(Number(terms.school_share_percent));
  }
  const median = (xs: number[]) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  // Days from sending to signature, which is what "how long does this take"
  // actually means when somebody asks.
  const closeDays = signed
    .map((r) => (r.sent_at && r.signed_at ? daysSince(r.sent_at)! - daysSince(r.signed_at)! : null))
    .filter((d): d is number => d !== null && d >= 0);

  return {
    issued: rows.length,
    sent: sent.length,
    opened: opened.length,
    signed: signed.length,
    declined: declined.length,
    /** Of the proposals that went out, how many came back signed. */
    signedRate: sent.length ? Math.round((signed.length / sent.length) * 100) : null,
    /** Of the proposals that went out, how many were even read. */
    openRate: sent.length ? Math.round((opened.length / sent.length) * 100) : null,
    medianAgreedRate: median(rates),
    medianSchoolShare: median(shares),
    medianDaysToSign: median(closeDays),
  };
}

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
    const flag = attention(row);
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
      terms: normaliseTerms(row.terms_snapshot ?? {}),
    };
  });

  return NextResponse.json({ documents, outcomes: outcomes(rows) });
}
