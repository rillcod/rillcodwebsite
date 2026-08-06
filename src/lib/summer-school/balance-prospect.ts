/**
 * Shared balance-payment prospect lookup + tuition math.
 * Single source for /api/summer-school/balance, processSuccessfulPayment, and staff verify.
 */
import { getSummerSchoolAdminClient } from '@/lib/summer-school/admin';
import {
  formatNaira,
  getSummerBalanceDueFromTotal,
  resolveLockedTuitionTotal,
} from '@/lib/summer-school/pricing';

export type BalanceProspectRow = {
  id: string;
  full_name: string;
  parent_email: string | null;
  preferred_schedule: string | null;
  status: string;
  notes: string | null;
  course_interest: string | null;
};

export type BalanceSnapshot = {
  prospect: BalanceProspectRow;
  preferredMode: string;
  amountPaid: number;
  totalTuition: number;
  balanceDue: number;
  balanceLabel: string;
};

/** True when this prospect row belongs to a special / summer programme registration. */
export function isSpecialProgramProspect(row: Pick<BalanceProspectRow, 'course_interest' | 'notes'>): boolean {
  const interest = String(row.course_interest || '');
  const notes = String(row.notes || '');
  if (/\[SpecialPage:/i.test(notes)) return true;
  if (/\[Programme:/i.test(notes)) return true;
  if (/summer/i.test(interest)) return true;
  if (/special/i.test(interest)) return true;
  return false;
}

/**
 * The page id a registration was tagged with, when it carries one.
 *
 * Deliberately not UUID-strict: this value is only ever compared against a
 * known page id, never used to build a query, so accepting whatever sits in
 * the tag is both safe and more honest about what is stored there.
 * (getSpecialPageTuition below stays strict — that one does hit the database.)
 */
export function taggedSpecialPageId(notes: string | null | undefined): string | null {
  const m = String(notes ?? '').match(/\[SpecialPage:\s*([^\]]+)\]/);
  const id = m?.[1]?.trim();
  return id ? id.toLowerCase() : null;
}

const TITLE_NOISE = new Set(['the', 'and', 'for', 'with', 'programme', 'program']);

function significantTokens(text: string): string[] {
  return [...new Set(
    text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
      .filter((w) => w.length > 2 && !TITLE_NOISE.has(w)),
  )];
}

/**
 * Legacy rows carry no page tag, only free text like "JSS3 Summer School 2026".
 *
 * Raw substring matching could not see those at all: the page is titled "AI
 * Summer School 2026", and "JSS3 Summer School 2026" does not contain it. Six
 * paid registrations were invisible to the duplicate guard as a result, four of
 * them still owing a balance — so a parent re-registering would have been given
 * a second row and a second payment link.
 *
 * Tokens instead of substrings, with the year decisive when the title carries
 * one. That recognises a differently-prefixed cohort while still refusing to
 * merge this year's programme with last year's.
 */
function legacyTitleMatches(interest: string, pageTitle: string): boolean {
  const pageTokens = significantTokens(pageTitle);
  if (!pageTokens.length) return false;
  const rowTokens = new Set(significantTokens(interest));
  if (!rowTokens.size) return false;

  const pageYear = pageTokens.find((t) => /^(19|20)\d{2}$/.test(t));
  if (pageYear) {
    const rowYear = [...rowTokens].find((t) => /^(19|20)\d{2}$/.test(t));
    // A different cohort year is a different programme, whatever else matches.
    if (rowYear && rowYear !== pageYear) return false;
    if (!rowYear) return false;
  }

  const shared = pageTokens.filter((t) => rowTokens.has(t));
  return shared.length >= 2;
}

/**
 * Is this registration for the same programme?
 *
 * The [SpecialPage: <uuid>] tag is authoritative in BOTH directions — a row
 * tagged for another programme is not this one, however similar the titles
 * read. Titles are only consulted for untagged legacy rows, where there is
 * nothing better.
 */
export function isSameSpecialProgramRegistration(
  row: Pick<BalanceProspectRow, 'course_interest' | 'notes'>,
  specialPage: { id: string; title: string } | null,
): boolean {
  const interest = String(row.course_interest || '');
  const taggedId = taggedSpecialPageId(row.notes);

  if (!specialPage) {
    // The legacy summer flow, which predates pages entirely.
    return /summer/i.test(interest) && !taggedId;
  }

  // Previously a title substring could override the tag, so a row belonging to
  // one programme could be claimed by another whose title was a prefix of it.
  if (taggedId) return taggedId === specialPage.id.toLowerCase();

  return legacyTitleMatches(interest, specialPage.title);
}

export async function sumCompletedProspectPayments(prospectId: string): Promise<number> {
  const supabase = getSummerSchoolAdminClient();
  const { data: txs } = await supabase
    .from('payment_transactions')
    .select('amount, payment_status, payment_gateway_response')
    .contains('payment_gateway_response', { prospect_id: prospectId });

  return (txs ?? [])
    .filter((tx) => ['completed', 'success', 'paid'].includes(String(tx.payment_status || '').toLowerCase()))
    .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
}

export async function getLockedTuitionFromPayments(prospectId: string): Promise<number | null> {
  const supabase = getSummerSchoolAdminClient();
  const { data: txs } = await supabase
    .from('payment_transactions')
    .select('payment_gateway_response, created_at')
    .contains('payment_gateway_response', { prospect_id: prospectId })
    .order('created_at', { ascending: true })
    .limit(20);

  for (const tx of txs ?? []) {
    const meta = (tx.payment_gateway_response || {}) as Record<string, unknown>;
    const locked = Number(meta.total_tuition);
    if (Number.isFinite(locked) && locked > 0) return locked;
  }
  return null;
}

export async function getSpecialPageTuition(notes: string | null, preferredMode: string): Promise<number | null> {
  if (!notes) return null;
  const match = notes.match(/\[SpecialPage:\s*([0-9a-fA-F-]{36})\]/);
  if (!match) return null;

  try {
    const supabase = getSummerSchoolAdminClient();
    const { data } = await supabase
      .from('special_program_pages')
      .select('online_fee, onsite_fee')
      .eq('id', match[1])
      .maybeSingle();

    if (data) {
      return preferredMode === 'Onsite' ? Number(data.onsite_fee) : Number(data.online_fee);
    }
  } catch (err) {
    console.error('[balance-prospect] special page tuition lookup failed:', err);
  }
  return null;
}

export async function computeBalanceSnapshot(prospect: BalanceProspectRow): Promise<Omit<BalanceSnapshot, 'prospect'>> {
  const preferredMode = prospect.preferred_schedule || 'Online';
  const amountPaid = await sumCompletedProspectPayments(prospect.id);
  const locked = await getLockedTuitionFromPayments(prospect.id);
  const dbTuition = await getSpecialPageTuition(prospect.notes, preferredMode);
  const totalTuition =
    locked || dbTuition || resolveLockedTuitionTotal({ preferredMode, amountPaid, lockedFromPayments: locked });
  const balanceDue = getSummerBalanceDueFromTotal(totalTuition, amountPaid);

  return {
    preferredMode,
    amountPaid,
    totalTuition,
    balanceDue,
    balanceLabel: formatNaira(balanceDue),
  };
}

/**
 * Find the best prospect row for completing an installment balance by parent email.
 * Does NOT require "Summer School" in course_interest — matches SpecialPage / Programme tags too.
 */
export async function findProspectForBalancePayment(email: string): Promise<BalanceSnapshot | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const supabase = getSummerSchoolAdminClient();
  const { data: rows } = await supabase
    .from('prospective_students')
    .select('id, full_name, parent_email, preferred_schedule, status, notes, course_interest')
    .eq('parent_email', normalized)
    .eq('is_deleted', false)
    .in('status', ['partially_paid', 'paid'])
    .order('created_at', { ascending: false })
    .limit(20);

  const candidates = (rows ?? []).filter(isSpecialProgramProspect) as BalanceProspectRow[];
  if (!candidates.length) return null;

  // Prefer the row with an actual outstanding balance.
  for (const prospect of candidates) {
    const snapshot = await computeBalanceSnapshot(prospect);
    if (snapshot.balanceDue > 0) {
      return { prospect, ...snapshot };
    }
  }

  // Fully paid — return newest so GET can respond "no balance due".
  const prospect = candidates[0];
  const snapshot = await computeBalanceSnapshot(prospect);
  return { prospect, ...snapshot };
}
