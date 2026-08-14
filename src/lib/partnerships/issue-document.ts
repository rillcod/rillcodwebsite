/**
 * Issuing a proposal or an MoU: render it, then keep it.
 *
 * A generated document that is not stored is the Desktop problem again — a file
 * whose terms live only in its own bytes. Issuing writes a row that records what
 * the document said, which terms it was rendered from, and its reference, so a
 * signed copy can always be matched back.
 *
 * Two rules the callers do not get to bend:
 *
 *   An MoU requires agreed terms. There is nothing to agree without them, and
 *   the fee it prints must be the fee the invoice will charge.
 *
 *   A signed agreement is never re-issued. Its terms and document are frozen by
 *   a database trigger; re-rendering would silently restate what somebody signed.
 *   Issue a fresh document instead, which is what supersede is for.
 */
import {
  getPublishedProgression,
  type CurriculumProgression,
  type CurriculumStage,
} from './curriculum';
import { buildPartnershipMouHTML } from './templates/mou-html';
import { buildPartnershipProposalHTML } from './templates/proposal-html';
import { buildProposalNarrative, type ProposalNarrative } from './proposal-narrative';
import { loadProofPoints } from './proof-points';
import { PARTNERSHIP_PHOTOS, schoolUpside } from './proposal-sections';
import { findOffer, PARTNERSHIP_OFFERS } from './offers';
import {
  MissingPartnershipTermsError,
  effectivePerStudentFee,
  getAgreedTerms,
  normaliseTerms,
  type PartnershipTerms,
} from './terms';

export type DocumentKind = 'proposal' | 'mou';

export type IssuedDocument = {
  id: string;
  reference: string;
  kind: DocumentKind;
  html: string;
  schoolId: string;
  schoolName: string;
  termsId: string | null;
  narrativeSource: ProposalNarrative['source'] | null;
  curriculumEdition: number | null;
};

export type IssueInput = {
  db: { from: (t: string) => any };
  schoolId: string;
  kind: DocumentKind;
  actorId?: string | null;
  /** Tailor the proposal's pitch with the AI engine. Never applies to an MoU. */
  useAI?: boolean;
  /** Restrict the printed years to one offer's scope, e.g. "Basic 1 through SS 2". */
  scopeToOffer?: string | null;
  /** Quote the primary half, the secondary half, or all twelve years. */
  stage?: CurriculumStage | null;
  /** Headcount used for the MoU's worked example. */
  illustrativeStudents?: number;
  commencement?: string | null;
  durationLabel?: string | null;
  notes?: string | null;
  /** How long a proposal's quoted fees stand. Ignored for an MoU. */
  validityDays?: number | null;
};

/** A quote with no expiry is a quote forever. Long enough for a school term to turn over. */
export const DEFAULT_PROPOSAL_VALIDITY_DAYS = 90;

function longDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function todayLabel(): string {
  return longDate(new Date());
}

/**
 * Render and archive one document.
 *
 * The reference is assigned by the database on insert, so the row is created
 * first and the document is rendered with the reference it will carry — the
 * printed number and the stored number cannot drift apart.
 */
export async function issuePartnershipDocument(input: IssueInput): Promise<IssuedDocument> {
  const { db, schoolId, kind } = input;

  const { data: school } = await db
    .from('schools')
    .select('id, name, address, city, state, student_count')
    .eq('id', schoolId)
    .maybeSingle();
  if (!school) throw new Error('That school does not exist.');

  const agreedTerms = await getAgreedTerms(db, schoolId);
  if (kind === 'mou' && !agreedTerms) {
    throw new MissingPartnershipTermsError(schoolId, school.name);
  }

  const curriculum: CurriculumProgression | null = await getPublishedProgression(db);

  // Terms are snapshotted, not referenced, so the row still says what the
  // document said after the deal is renegotiated.
  const snapshot: Record<string, unknown> = agreedTerms
    ? { ...agreedTerms }
    : { billing_model: null, note: 'Issued before terms were agreed; standard options quoted.' };

  const { data: row, error } = await db
    .from('partnership_agreements')
    .insert({
      school_id: schoolId,
      terms_id: agreedTerms?.id ?? null,
      document_kind: kind,
      terms_snapshot: snapshot,
      status: 'draft',
      created_by: input.actorId ?? null,
    })
    .select('id, reference')
    .single();

  if (error) throw new Error(error.message);

  const reference = String(row.reference);
  const dateLabel = todayLabel();

  let html: string;
  let narrativeSource: ProposalNarrative['source'] | null = null;

  if (kind === 'mou') {
    html = buildPartnershipMouHTML({
      school,
      terms: agreedTerms as PartnershipTerms,
      curriculum,
      reference,
      dateLabel,
      commencement: input.commencement ?? null,
      durationLabel: input.durationLabel ?? null,
      illustrativeStudents: input.illustrativeStudents ?? school.student_count ?? 0,
      stage: input.stage ?? null,
    });
  } else {
    // Zero or a negative number means "no expiry stated" rather than an
    // already-expired quote, which would be worse than saying nothing.
    const validityDays = input.validityDays ?? DEFAULT_PROPOSAL_VALIDITY_DAYS;
    let validUntil: string | null = null;
    if (Number.isFinite(validityDays) && (validityDays as number) > 0) {
      const expires = new Date();
      expires.setDate(expires.getDate() + Number(validityDays));
      validUntil = longDate(expires);
    }

    /**
     * What the programme is worth to this school.
     *
     * Prefers the agreed rate, because once a deal exists the proposal must not
     * quote a different number from the one the invoice will bill. Falls back to
     * the quoted offer's entry price — the conservative end of the range, so the
     * projection is a floor rather than a best case.
     */
    // Falls back to the first standard offer when the quote is not scoped to
    // one, at its entry price. Without this the projection silently vanishes
    // from every proposal that does not pre-pick an option — which is most of
    // them, and it is the section that does the persuading.
    const scopedOffer =
      PARTNERSHIP_OFFERS.find((o) => o.scope === input.scopeToOffer) ??
      findOffer(input.scopeToOffer) ??
      PARTNERSHIP_OFFERS[0];
    // All three models resolve through one helper, so a banded school is quoted
    // the weighted average of its own bands rather than the standard menu price.
    const agreedFee = agreedTerms ? effectivePerStudentFee(agreedTerms) : null;
    const upside = schoolUpside({
      roll: Number(school.student_count) || 0,
      feePerStudent: agreedFee ?? scopedOffer?.priceFrom ?? 0,
      // A package is one price for the school; uptake does not move it.
      fixedPackage:
        agreedTerms?.billing_model === 'fixed_package'
          ? agreedTerms.fixed_package_price
          : null,
      // The standard deal is 70/30. Where terms exist, their split wins.
      sharePercent: agreedTerms?.school_share_percent ?? 30,
      cycle: agreedTerms?.billing_cycle ?? 'term',
    });

    const narrative = await buildProposalNarrative(
      { school, curriculum, notes: input.notes ?? null },
      { useAI: input.useAI === true },
    );
    narrativeSource = narrative.source;
    html = buildPartnershipProposalHTML({
      school,
      curriculum,
      agreedTerms,
      reference,
      dateLabel,
      narrative,
      scopeToOffer: input.scopeToOffer ?? null,
      stage: input.stage ?? null,
      validUntilLabel: validUntil,
      // Counted now, so the cover cannot claim a footprint we have grown out of
      // or shrunk below. The recipient is excluded from its own proof, and null
      // simply drops the band.
      proof: await loadProofPoints(db, schoolId),
      upside,
      photos: PARTNERSHIP_PHOTOS,
      // Read from the brand record, not typed again. "Rillcod Academy" is not a
      // company we have; the MoU already learned that lesson.
    });
  }

  // The document is written back rather than inserted with the row, because it
  // has to contain the reference the insert produced.
  const { error: saveError } = await db
    .from('partnership_agreements')
    .update({ document_html: html })
    .eq('id', row.id);
  if (saveError) throw new Error(saveError.message);

  return {
    id: String(row.id),
    reference,
    kind,
    html,
    schoolId,
    schoolName: String(school.name),
    termsId: agreedTerms?.id ?? null,
    narrativeSource,
    curriculumEdition: curriculum?.edition ?? null,
  };
}

/** Documents already issued to a school, newest first. */
export async function listSchoolDocuments(
  db: { from: (t: string) => any },
  schoolId: string,
): Promise<Array<Record<string, unknown>>> {
  const { data } = await db
    .from('partnership_agreements')
    .select('id, reference, document_kind, status, terms_snapshot, sent_at, signed_at, signed_by_name, created_at')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false });

  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    terms: normaliseTerms(row.terms_snapshot as Record<string, unknown>),
  }));
}
