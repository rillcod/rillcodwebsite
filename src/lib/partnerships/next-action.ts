/**
 * The one next thing to do on a school.
 *
 * The desk used to assemble this by hand, and it assembled it backwards: no
 * agreed rate meant "Record terms" even though a proposal is how you get to a
 * rate, a draft counted as sent, and any signed row (including a proposal,
 * which cannot be signed) short-circuited the whole journey to "done".
 *
 * This is the real sequence:
 *
 *   compose a proposal → send it → they read it → record terms → issue the MoU
 *   → send the MoU → they sign → onboard classes.
 *
 * Terms stay optional on a proposal. They are required for an MoU. A draft is
 * not live on the public link. A signed proposal is not a closed deal.
 */
import { isQuoteExpired } from './issue-document';

/** Where the next click goes. `document` opens the issued copy — it is not a tab. */
export type DeskTab = 'compose' | 'terms' | 'document';
export type NextActionKind = 'proposal' | 'mou';

export type NextActionDoc = {
  id?: string;
  document_kind: string;
  status: string;
  reference?: string | null;
  open_count?: number | null;
  valid_until?: string | null;
  signed_by_name?: string | null;
};

export type NextActionTerms = {
  school_share_percent: number | null;
  settlement_trigger?: string | null;
} | null;

export type PartnershipNextAction = {
  tone: 'todo' | 'warn' | 'wait' | 'ready' | 'done';
  /** 1 prospect → 2 proposal → 3 terms → 4 MoU → 5 partner. */
  step: number;
  headline: string;
  detail: string;
  action: {
    label: string;
    tab: DeskTab;
    kind?: NextActionKind;
  } | null;
  /** WhatsApp chase, only when a live public link actually exists. */
  followUp: 'proposal' | 'mou' | null;
  hrefs?: Array<{ label: string; href: string }>;
};

const LIVE = new Set(['draft', 'sent']);
const CLOSED = new Set(['void', 'declined']);

function newest(
  documents: NextActionDoc[],
  kind: string,
  statuses: string[],
): NextActionDoc | null {
  return (
    documents.find((d) => d.document_kind === kind && statuses.includes(d.status) && !CLOSED.has(d.status)) ??
    null
  );
}

function opens(doc: NextActionDoc | null): number {
  return Number(doc?.open_count) || 0;
}

/**
 * A quote of this kind that is still in play — draft or sent, and not lapsed.
 *
 * Issuing a second one while this exists is how a school ends up with two live
 * links quoting two different numbers.
 */
export function liveDocumentOfKind(
  documents: NextActionDoc[],
  kind: NextActionKind,
): NextActionDoc | null {
  return (
    documents.find(
      (d) =>
        d.document_kind === kind &&
        LIVE.has(d.status) &&
        !(kind === 'proposal' && isQuoteExpired(d.valid_until)),
    ) ?? null
  );
}

export function partnershipNextAction(input: {
  agreed: NextActionTerms;
  documents: NextActionDoc[];
}): PartnershipNextAction {
  const { agreed, documents } = input;
  const signedMou = newest(documents, 'mou', ['signed']);
  const sentMou = newest(documents, 'mou', ['sent']);
  const draftMou = newest(documents, 'mou', ['draft']);
  const sentProposal =
    newest(documents, 'proposal', ['sent']) ?? newest(documents, 'proposal', ['signed']);
  const draftProposal = newest(documents, 'proposal', ['draft']);

  if (signedMou) {
    return {
      tone: 'done',
      step: 5,
      headline: `Signed — ${signedMou.reference ?? 'MoU on record'}`,
      detail: signedMou.signed_by_name
        ? `Signed by ${signedMou.signed_by_name}. Set up classes and issue the first-term invoice.`
        : 'The MoU is on record. Set up classes and issue the first-term invoice.',
      action: null,
      followUp: null,
      hrefs: [
        { label: 'Setup Classes', href: '/dashboard/classes' },
        { label: 'Issue Invoice', href: '/dashboard/school-billing' },
      ],
    };
  }

  if (draftMou) {
    return {
      tone: 'warn',
      step: 4,
      headline: `${draftMou.reference ?? 'The MoU'} is a draft`,
      detail:
        'The school cannot open the public link until you send it or mark it sent. Issuing it did not deliver it.',
      action: { label: 'Send this MoU', tab: 'document', kind: 'mou' },
      followUp: null,
    };
  }

  if (sentMou) {
    const n = opens(sentMou);
    return {
      tone: 'wait',
      step: 4,
      headline: n ? `MoU sent, opened ${n}×` : 'MoU sent, not opened yet',
      detail: n
        ? 'They have the agreement. Nudge the proprietor to sign it on their phone.'
        : 'The link has not been opened. Check it reached the right person.',
      action: { label: 'View the MoU', tab: 'document', kind: 'mou' },
      followUp: 'mou',
    };
  }

  if (agreed && agreed.school_share_percent == null && (sentProposal || !draftProposal)) {
    return {
      tone: 'warn',
      step: 3,
      headline: 'Rate agreed, but no revenue share',
      detail:
        'An MoU cannot work out what this school earns until a split is recorded — or the deal is marked as a flat fee. A proposal can still go out.',
      action: { label: 'Fix the split', tab: 'terms' },
      followUp: sentProposal ? 'proposal' : null,
    };
  }

  if (draftProposal && !sentProposal) {
    return {
      tone: 'warn',
      step: 2,
      headline: `${draftProposal.reference ?? 'The proposal'} is a draft`,
      detail:
        'The school cannot open it. Send it or mark it sent — the public link stays dead until then.',
      action: { label: 'Send this proposal', tab: 'document', kind: 'proposal' },
      followUp: null,
    };
  }

  if (sentProposal && isQuoteExpired(sentProposal.valid_until)) {
    return {
      tone: 'warn',
      step: 2,
      headline: `${sentProposal.reference ?? 'This quote'} has lapsed`,
      detail: 'The fees no longer stand. Re-issue a proposal before anything can be agreed or signed.',
      action: { label: 'Re-issue the proposal', tab: 'compose', kind: 'proposal' },
      followUp: null,
    };
  }

  if (agreed && sentProposal) {
    return {
      tone: 'ready',
      step: 4,
      headline: agreed.settlement_trigger
        ? 'Terms are recorded — issue the MoU'
        : 'Terms are recorded — add settlement, then issue the MoU',
      detail: agreed.settlement_trigger
        ? 'They have a live proposal and an agreed rate. The next document is the MoU, not another quote.'
        : 'The proposal will not say when they are paid until settlement is recorded. Then issue the MoU.',
      action: agreed.settlement_trigger
        ? { label: 'Issue the MoU', tab: 'compose', kind: 'mou' }
        : { label: 'Add settlement terms', tab: 'terms' },
      followUp: 'proposal',
    };
  }

  if (sentProposal) {
    const n = sentProposal.status === 'signed' ? Math.max(opens(sentProposal), 1) : opens(sentProposal);
    return {
      tone: n ? 'ready' : 'wait',
      step: n ? 3 : 2,
      headline: n
        ? `Proposal opened ${n}× — record terms when they agree`
        : 'Proposal sent, not opened yet',
      detail: n
        ? 'They have read it. When they pick an option, record the rate here and the MoU can be issued.'
        : 'It has not been opened. Check the link reached the right person, then follow up.',
      action: n
        ? { label: 'Record terms', tab: 'terms' }
        : { label: 'View the proposal', tab: 'document', kind: 'proposal' },
      followUp: 'proposal',
    };
  }

  if (agreed) {
    return {
      tone: 'ready',
      step: 4,
      headline: 'Terms are recorded — nothing has gone out',
      detail:
        'A proposal can still go first if they have not seen the offer. If they have already agreed, issue the MoU.',
      action: { label: 'Issue the MoU', tab: 'compose', kind: 'mou' },
      followUp: null,
    };
  }

  return {
    tone: 'todo',
    step: 2,
    headline: 'Compose a proposal',
    detail:
      'A proposal can go out on the standard menu — no agreed rate needed. Record terms later, when they pick an option, so the MoU can be issued.',
    action: { label: 'Compose a proposal', tab: 'compose', kind: 'proposal' },
    followUp: null,
  };
}
