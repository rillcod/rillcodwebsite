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
import { brandContact } from '@/config/brand';
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
import { normaliseStudioConfig, type ProposalStudioConfig } from './studio-config';
import { findOffer, PARTNERSHIP_OFFERS } from './offers';
import {
  MissingPartnershipTermsError,
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
  /** Secret for the public /p/<token> link. Never the reference: that is sequential and printed. */
  shareToken: string | null;
  /**
   * The six digits a school can type at /p when the link is gone.
   *
   * It is printed on the document and read back out here so the dashboard can
   * show it beside the link — otherwise the only copy is on the sheet itself,
   * and whoever issued it cannot tell the school what to type.
   */
  accessCode: string | null;
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
  /** Custom proposed school revenue share percentage (e.g., 30, 40, 50, 20). */
  proposedSchoolSharePercent?: number | null;
  /**
   * What the studio decided this school should see. Absent renders the whole
   * document, which is what every caller before the studio expects.
   */
  studio?: ProposalStudioConfig | null;
  /** Option to pass details for an unregistered prospect school. */
  prospectSchool?: {
    name: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    email?: string | null;
    contactPerson?: string | null;
    studentCount?: number | null;
  } | null;
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
  // Creating the school happens here and only here. It used to happen inside
  // `prepareDocument`, which preview also calls — so looking at a draft for a
  // school not yet on the system silently inserted it, and every click of
  // Preview inserted another. Issuing is the moment a prospect becomes a record.
  const targetSchoolId = await resolveSchoolForIssue(input);
  const prepared = await prepareDocument(input, targetSchoolId);
  const kind = input.kind;

  const { data: row, error } = await input.db
    .from('partnership_agreements')
    .insert({
      school_id: targetSchoolId,
      terms_id: prepared.agreedTerms?.id ?? null,
      document_kind: kind,
      terms_snapshot: prepared.snapshot,
      status: 'draft',
      created_by: input.actorId ?? null,
    })
    .select('id, reference, share_token, access_code')
    .single();

  if (error) throw new Error(error.message);

  const reference = String(row.reference);
  // The code prints on the document, so it has to reach the render.
  const { html, narrativeSource } = await prepared.render(
    reference,
    row.access_code ?? null,
    row.share_token ? String(row.share_token) : null,
  );

  // The document is written back rather than inserted with the row, because it
  // has to contain the reference the insert produced.
  const { error: saveError } = await input.db
    .from('partnership_agreements')
    .update({ document_html: html })
    .eq('id', row.id);
  if (saveError) throw new Error(saveError.message);

  return {
    id: String(row.id),
    reference,
    kind,
    html,
    schoolId: targetSchoolId,
    schoolName: String(prepared.school.name),
    shareToken: row.share_token ? String(row.share_token) : null,
    accessCode: row.access_code ? String(row.access_code) : null,
    termsId: prepared.agreedTerms?.id ?? null,
    narrativeSource,
    curriculumEdition: prepared.curriculum?.edition ?? null,
  };
}

/**
 * Redraw a draft that has not left the building.
 *
 * An issued document keeps the bytes it was issued with, and that is the point:
 * it is the record of what a school was given. But a *draft* has been given to
 * nobody. When the template is improved, or a rate is agreed after the draft was
 * cut, the draft is simply stale — and the only way to refresh it was to delete
 * it and issue again, which burns a reference and changes the access code that
 * may already have been read down a phone.
 *
 * So this re-renders in place: same row, same reference, same share token, same
 * six digits. Only the body and the terms snapshot change.
 *
 * Drafts only, and deliberately so. Once a document is sent, somebody outside
 * this building may be reading it on the link we gave them — rewriting the page
 * under them is the one thing an archive of contracts must never do.
 */
export async function refreshPartnershipDocument(
  input: Omit<IssueInput, 'kind' | 'schoolId'> & { documentId: string },
): Promise<IssuedDocument> {
  const { data: row } = await input.db
    .from('partnership_agreements')
    .select('id, reference, status, document_kind, school_id, share_token, access_code')
    .eq('id', input.documentId)
    .maybeSingle();

  if (!row) throw new Error('That document does not exist.');
  if (row.status !== 'draft') {
    throw new StaleDocumentError(String(row.reference), String(row.status));
  }

  // The kind and the school come from the row, never from the caller. A
  // reference reads RC-PROP or RC-MOU and a school is named on every page, so
  // letting either be restated here would put a document under a number that
  // describes something else.
  const kind = String(row.document_kind) as DocumentKind;
  const schoolId = String(row.school_id);
  const prepared = await prepareDocument({ ...input, kind, schoolId }, schoolId);

  const { html, narrativeSource } = await prepared.render(
    String(row.reference),
    row.access_code ? String(row.access_code) : null,
    row.share_token ? String(row.share_token) : null,
  );

  // The snapshot is rewritten too. It records the terms the document states, and
  // the document has just been restated — leaving the old snapshot behind would
  // make the row disagree with the page it points at.
  const { error: saveError } = await input.db
    .from('partnership_agreements')
    .update({
      document_html: html,
      terms_snapshot: prepared.snapshot,
      terms_id: prepared.agreedTerms?.id ?? null,
    })
    .eq('id', row.id);
  if (saveError) throw new Error(saveError.message);

  return {
    id: String(row.id),
    reference: String(row.reference),
    kind,
    html,
    schoolId,
    schoolName: String(prepared.school.name),
    shareToken: row.share_token ? String(row.share_token) : null,
    accessCode: row.access_code ? String(row.access_code) : null,
    termsId: prepared.agreedTerms?.id ?? null,
    narrativeSource,
    curriculumEdition: prepared.curriculum?.edition ?? null,
  };
}

/** A document past draft cannot be redrawn — supersede it instead. */
export class StaleDocumentError extends Error {
  constructor(
    readonly reference: string,
    readonly status: string,
  ) {
    super(
      `${reference} has already been ${status}. A document that left the building keeps the words it left with — issue a fresh one instead of rewriting this.`,
    );
    this.name = 'StaleDocumentError';
  }
}

/**
 * Render the document without keeping it.
 *
 * Issuing consumes a reference and writes a row, and both are meant to be
 * permanent — so somebody should be able to read the whole thing before either
 * happens. The preview is the same render the issue path performs, from the same
 * terms and the same curriculum; only the reference is a placeholder, because a
 * document that was never issued does not have one.
 */
export async function previewPartnershipDocument(
  input: IssueInput,
): Promise<Omit<IssuedDocument, 'id'> & { preview: true }> {
  const prepared = await prepareDocument(input);
  const reference = input.kind === 'mou' ? 'MoU — not yet issued' : 'Proposal — not yet issued';
  // No code and no token yet, but the card is drawn: a preview that hides a
  // panel the issued document will carry is not a preview of that document.
  const { html, narrativeSource } = await prepared.render(reference, null, null, true);

  return {
    preview: true,
    reference,
    kind: input.kind,
    html,
    schoolId: prepared.school.id,
    schoolName: String(prepared.school.name),
    // A preview has no row, so there is neither a link to share nor a code to
    // type. Both stay null rather than being faked, so the dashboard can tell
    // "not issued yet" from "issued, code missing" instead of printing an
    // access-code pill with nothing behind it.
    shareToken: null,
    accessCode: null,
    termsId: prepared.agreedTerms?.id ?? null,
    narrativeSource,
    curriculumEdition: prepared.curriculum?.edition ?? null,
  };
}

/**
 * Everything both paths need, gathered once.
 *
 * Returns a `render` the caller invokes with whatever reference the document
 * will carry, so preview and issue cannot drift into two different documents.
 */
/**
 * The school a document is being issued to, creating it if this is a prospect
 * we have not met before.
 *
 * Only the issue path calls this. A school row is a permanent record, and
 * preview must be free to render as many drafts as somebody wants to look at
 * without leaving any behind.
 *
 * The match is case-insensitive on name and takes the first hit rather than
 * insisting on exactly one: this codebase already has a duplicate-name problem
 * serious enough to have its own gate, and `maybeSingle()` throws outright when
 * two schools share a name — which would block issuing to a school that plainly
 * exists.
 */
async function resolveSchoolForIssue(input: IssueInput): Promise<string> {
  const { db, schoolId, prospectSchool } = input;
  if (schoolId && schoolId !== 'new') return schoolId;

  const name = prospectSchool?.name?.trim();
  if (!name) throw new Error('That school does not exist.');

  const { data: existing } = await db
    .from('schools')
    .select('id')
    .ilike('name', name)
    .order('created_at', { ascending: true })
    .limit(1);
  if (existing?.length) return String(existing[0].id);

  const { data: created, error: createError } = await db
    .from('schools')
    .insert({
      name,
      address: prospectSchool?.address?.trim() || null,
      city: prospectSchool?.city?.trim() || null,
      state: prospectSchool?.state?.trim() || null,
      email: prospectSchool?.email?.trim() || null,
      contact_person: prospectSchool?.contactPerson?.trim() || null,
      student_count: Number(prospectSchool?.studentCount) || 0,
      // 'pending' is what `schools_status_check` permits, alongside 'approved'
      // and 'rejected'. 'prospect' is not a value the column accepts, so every
      // insert here was rejected outright and the whole path threw.
      status: 'pending',
    })
    .select('id')
    .single();

  if (createError) throw new Error(`Could not register prospect school: ${createError.message}`);
  return String(created.id);
}

async function prepareDocument(input: IssueInput, resolvedSchoolId?: string) {
  const { db, kind, prospectSchool } = input;
  const schoolId = resolvedSchoolId ?? input.schoolId;

  type SchoolRecord = {
    id: string;
    name: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    student_count?: number | null;
  };
  let school: SchoolRecord | null = null;

  if (schoolId && schoolId !== 'new') {
    const { data } = await db
      .from('schools')
      .select('id, name, address, city, state, student_count')
      .eq('id', schoolId)
      .maybeSingle();
    school = data as SchoolRecord | null;
  }

  // A prospect being previewed has no row yet, and must not get one here. The
  // document renders against the details typed into the form; the empty id says
  // "nothing stored", which is exactly what a preview is.
  if (!school && prospectSchool?.name) {
    school = {
      id: '',
      name: prospectSchool.name.trim(),
      address: prospectSchool.address?.trim() || null,
      city: prospectSchool.city?.trim() || null,
      state: prospectSchool.state?.trim() || null,
      student_count: Number(prospectSchool.studentCount) || null,
    };
  }

  if (!school) throw new Error('That school does not exist.');

  // No id means nothing is stored yet, so there is nothing agreed to look up.
  const agreedTerms = school.id ? await getAgreedTerms(db, school.id) : null;
  if (kind === 'mou' && !agreedTerms) {
    throw new MissingPartnershipTermsError(school.id, school.name);
  }

  const curriculum: CurriculumProgression | null = await getPublishedProgression(db);

  // Terms are snapshotted, not referenced, so the row still says what the
  // document said after the deal is renegotiated.
  const snapshot: Record<string, unknown> = agreedTerms
    ? { ...agreedTerms }
    : { billing_model: null, note: 'Issued before terms were agreed; standard options quoted.' };

  const render = async (
    reference: string,
    accessCode: string | null = null,
    shareToken: string | null = null,
    /*
      Draw the scan card, but with nothing behind it yet.

      A preview has no row, so it has no code and no token — and the card was
      simply omitted, which made the preview a different document from the one
      that gets issued. Somebody reads a proposal, approves it, issues it, and
      the real thing carries a 30mm panel the preview never showed. On the cover
      that is the difference between a page that fits and a page that does not.

      So the preview draws the card at its true size and says the code is
      assigned on issue. Nothing false is printed: there is no invented code and
      no QR that leads anywhere.
    */
    accessPending = false,
  ) => {
    const dateLabel = todayLabel();
    return renderDocument({
      input,
      school,
      agreedTerms,
      curriculum,
      reference,
      dateLabel,
      accessCode,
      shareToken,
      accessPending,
    });
  };

  return { school, agreedTerms, curriculum, snapshot, render };
}

async function renderDocument(ctx: {
  input: IssueInput;
  school: any;
  agreedTerms: PartnershipTerms | null;
  curriculum: CurriculumProgression | null;
  reference: string;
  dateLabel: string;
  /**
   * The six digits printed on the document so a school can get back to it after
   * the email is gone. Null on a preview, which has no row and therefore no code.
   */
  accessCode?: string | null;
  /** Secret behind the QR a reader scans off the printed page. */
  shareToken?: string | null;
  /** Draw the card at full size with "assigned when issued" in place of a code. */
  accessPending?: boolean;
}): Promise<{ html: string; narrativeSource: ProposalNarrative['source'] | null }> {
  const { input, school, agreedTerms, curriculum, reference, dateLabel, accessCode, shareToken, accessPending } = ctx;
  const kind = input.kind;

  let html: string;
  let narrativeSource: ProposalNarrative['source'] | null = null;
  const db = input.db;
  // The resolved id, not the raw input: a prospect arrives as the sentinel
  // 'new' or as nothing, and neither is a uuid the proof-band exclusion can be
  // filtered on. An unstored prospect has nothing to exclude itself from.
  const schoolId = school.id || undefined;

  // A QR turns a printed page into a tap. Built here because the templates are
  // synchronous string builders and encoding an image is not.
  let accessQrDataUrl: string | null = null;
  if (shareToken) {
    try {
      const { qrDataUrl } = await import('@/lib/cards/qr');
      const { HD_QR_PRINT_PX } = await import('@/lib/qr/hd-qr');
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || brandContact.siteUrl).replace(/\/$/, '');
      accessQrDataUrl = await qrDataUrl(`${appUrl}/p/${shareToken}`, HD_QR_PRINT_PX);
    } catch {
      // A document without its QR still prints the code and the address.
      accessQrDataUrl = null;
    }
  }

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
      accessCode,
      accessQrDataUrl,
      accessPending,
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
    /**
     * The money page, from whichever shape the deal actually takes.
     *
     * Sections are passed through as agreed rather than reduced to an average.
     * A school that agreed ₦15,000 for primary and ₦25,000 for secondary reads
     * both of its own numbers and the total they come to — not a third figure
     * sitting between them that it has never been quoted.
     */
    const upside = schoolUpside({
      roll: Number(school.student_count) || 0,
      feePerStudent:
        agreedTerms?.billing_model === 'per_student'
          ? (agreedTerms.amount_per_student ?? 0)
          : (scopedOffer?.priceFrom ?? 0),
      sections: agreedTerms?.billing_model === 'tiered' ? agreedTerms.tiers : null,
      // A package is one price for the school; uptake does not move it.
      fixedPackage:
        agreedTerms?.billing_model === 'fixed_package'
          ? agreedTerms.fixed_package_price
          : null,
      // The standard deal is 70/30, or the custom proposed / agreed split.
      sharePercent: agreedTerms?.school_share_percent ?? input.proposedSchoolSharePercent ?? 30,
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
      accessCode,
      accessQrDataUrl,
      accessPending,
      validUntilLabel: validUntil,
      // Counted now, so the cover cannot claim a footprint we have grown out of
      // or shrunk below. The recipient is excluded from its own proof, and null
      // simply drops the band.
      proof: await loadProofPoints(db, schoolId),
      upside,
      photos: PARTNERSHIP_PHOTOS,
      // The studio owns which sections print and in whose words. Normalised
      // here rather than trusted, because it arrives from a browser.
      studio: input.studio ? normaliseStudioConfig(input.studio, PARTNERSHIP_PHOTOS) : null,
      // Read from the brand record, not typed again. The name that used to be
      // hardcoded here — "Rillcod Academy" — is not a company we have, and the
      // MoU already learned that lesson.
    });
  }

  return { html, narrativeSource };
}

/** Documents already issued to a school, newest first. */
export async function listSchoolDocuments(
  db: { from: (t: string) => any },
  schoolId: string,
): Promise<Array<Record<string, unknown>>> {
  const { data } = await db
    .from('partnership_agreements')
    .select('id, reference, document_kind, status, terms_snapshot, share_token, access_code, sent_at, signed_at, signed_by_name, created_at')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false });

  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    terms: normaliseTerms(row.terms_snapshot as Record<string, unknown>),
  }));
}
