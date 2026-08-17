/**
 * What the pipeline counts, and what it flags.
 *
 * Lived in the route file until the numbers were wrong in a way you could not
 * unit-test: Next forbids extra exports from a route, so `signedRate` mixed
 * every signed row (including MoUs) over sent proposals, and a draft sat for
 * seven days before anyone was told the school could not open it.
 */
import { isQuoteExpired } from './issue-document';
import { normaliseTerms, type PartnershipTerms } from './terms';

/** How long a sent document may sit unanswered before it wants chasing. */
export const CHASE_AFTER_DAYS = 7;

export type PipelineRow = {
  id?: string;
  reference?: string | null;
  document_kind: string;
  status: string;
  school_id: string;
  created_at: string;
  sent_at: string | null;
  signed_at: string | null;
  signed_by_name?: string | null;
  valid_until: string | null;
  open_count: number | null;
  terms_snapshot?: Record<string, unknown> | null;
};

export function daysSince(value: string | null, now = new Date()): number | null {
  if (!value) return null;
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((now.getTime() - then) / 86_400_000);
}

/**
 * What this row needs from a person, if anything.
 *
 * One reason per row, most urgent first. A draft is live work from the moment
 * it is issued: the public link is dead until it is sent, so waiting a week
 * to say so is how drafts die in the archive.
 */
export function pipelineAttention(
  row: PipelineRow,
  now = new Date(),
): { needs: boolean; reason: string; tab: 'compose' | 'archive' } {
  if (row.status === 'signed' || row.status === 'void' || row.status === 'declined') {
    return { needs: false, reason: '', tab: 'archive' };
  }
  if (isQuoteExpired(row.valid_until, now)) {
    return {
      needs: true,
      reason: 'Fees have lapsed — re-issue before anything can be agreed',
      tab: 'compose',
    };
  }
  if (row.status === 'draft') {
    const age = daysSince(row.created_at, now) ?? 0;
    return {
      needs: true,
      reason:
        age < 1
          ? 'Issued as a draft — the school cannot open this until you send it'
          : `Drafted ${age} days ago and never sent — the public link is dead until you send it`,
      tab: 'archive',
    };
  }

  const sinceSent = daysSince(row.sent_at, now);
  const opens = Number(row.open_count) || 0;
  const kind = row.document_kind === 'mou' ? 'MoU' : 'proposal';

  if (sinceSent !== null && sinceSent >= CHASE_AFTER_DAYS && opens === 0) {
    return {
      needs: true,
      reason: `Sent ${sinceSent} days ago and never opened`,
      tab: 'archive',
    };
  }
  if (opens >= 3) {
    return {
      needs: true,
      reason:
        kind === 'MoU'
          ? `Opened ${opens} times without a signature`
          : `Opened ${opens} times without an answer — record terms if they have agreed`,
      tab: kind === 'MoU' ? 'archive' : 'archive',
    };
  }
  if (sinceSent !== null && sinceSent >= CHASE_AFTER_DAYS * 2) {
    return {
      needs: true,
      reason: `Sent ${sinceSent} days ago, still ${kind === 'MoU' ? 'unsigned' : 'unanswered'}`,
      tab: 'archive',
    };
  }
  return { needs: false, reason: '', tab: 'archive' };
}

export type PipelineOutcomes = {
  issued: number;
  sent: number;
  opened: number;
  signed: number;
  declined: number;
  signedRate: number | null;
  openRate: number | null;
  medianAgreedRate: number | null;
  medianSchoolShare: number | null;
  medianDaysToSign: number | null;
};

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * What closed deals have in common, counted at school grain.
 *
 * Document-level "signed / sent" mixed MoU signatures into a proposal
 * conversion rate, so issuing an MoU made it look as if more proposals had
 * been signed. Conversion is: of the schools who received a proposal, how
 * many signed an MoU.
 */
export function pipelineOutcomes(rows: PipelineRow[]): PipelineOutcomes {
  const proposals = rows.filter((r) => r.document_kind === 'proposal');
  const sentProposals = proposals.filter((r) => r.status !== 'draft' && r.status !== 'void');
  const opened = sentProposals.filter((r) => (Number(r.open_count) || 0) > 0);
  const signedMous = rows.filter((r) => r.document_kind === 'mou' && r.status === 'signed');
  const declined = rows.filter((r) => r.status === 'declined');

  const schoolsSentProposal = new Set(sentProposals.map((r) => r.school_id));
  const schoolsSignedMou = new Set(signedMous.map((r) => r.school_id));

  const rates: number[] = [];
  const shares: number[] = [];
  for (const row of signedMous) {
    const terms = normaliseTerms(row.terms_snapshot ?? {}) as PartnershipTerms | null;
    if (!terms) continue;
    if (terms.billing_model === 'per_student' && terms.amount_per_student) {
      rates.push(Number(terms.amount_per_student));
    }
    if (terms.school_share_percent != null) shares.push(Number(terms.school_share_percent));
  }

  const firstSentBySchool = new Map<string, string>();
  for (const row of sentProposals) {
    if (!row.sent_at) continue;
    const prev = firstSentBySchool.get(row.school_id);
    if (!prev || row.sent_at < prev) firstSentBySchool.set(row.school_id, row.sent_at);
  }

  const closeDays: number[] = [];
  for (const mou of signedMous) {
    if (!mou.signed_at) continue;
    const firstSent = firstSentBySchool.get(mou.school_id) ?? mou.sent_at;
    if (!firstSent) continue;
    const days = daysSince(firstSent, new Date(mou.signed_at));
    if (days !== null && days >= 0) closeDays.push(days);
  }

  const sentSchoolCount = schoolsSentProposal.size;
  const converted = [...schoolsSignedMou].filter((id) => schoolsSentProposal.has(id)).length;

  return {
    issued: rows.length,
    sent: sentProposals.length,
    opened: opened.length,
    signed: signedMous.length,
    declined: declined.length,
    signedRate: sentSchoolCount ? Math.round((converted / sentSchoolCount) * 100) : null,
    openRate: sentProposals.length ? Math.round((opened.length / sentProposals.length) * 100) : null,
    medianAgreedRate: median(rates),
    medianSchoolShare: median(shares),
    medianDaysToSign: median(closeDays),
  };
}
