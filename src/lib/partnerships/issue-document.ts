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
import { commencementLabel, nextTeachingTerm, type TeachingTerm } from './commencement';
import {
  getPublishedProgression,
  type CurriculumProgression,
  type CurriculumStage,
} from './curriculum';
import { buildPartnershipMouHTML } from './templates/mou-html';
import { buildPartnershipProposalHTML } from './templates/proposal-html';
import {
  buildProposalNarrative,
  isUsableNarrative,
  type ProposalNarrative,
} from './proposal-narrative';
import { loadProofPoints } from './proof-points';
import { PARTNERSHIP_PHOTOS, schoolUpside } from './proposal-sections';
import { normaliseStudioConfig, type ProposalStudioConfig } from './studio-config';
import { PARTNERSHIP_OFFERS, recommendOffer, resolveOffer } from './offers';
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
  /**
   * The exact copy this render used.
   *
   * A preview hands it back so the issue that follows can print the same words
   * rather than asking the model again — two calls to a model are two different
   * proposals, and only one of them was read.
   */
  narrative: ProposalNarrative | null;
  curriculumEdition: number | null;
};

export type IssueInput = {
  db: { from: (t: string) => any };
  schoolId: string;
  kind: DocumentKind;
  actorId?: string | null;
  /** Tailor the proposal's pitch with the AI engine. Never applies to an MoU. */
  useAI?: boolean;
  /**
   * Copy that was already generated and read by a human.
   *
   * Without this, preview and issue each call the model, and a model called
   * twice writes two different proposals — so the document a school received
   * was never the document anybody approved. That is the same complaint as a
   * stale issued copy, arriving by a different route, and it is worse: nobody
   * can see it happen.
   *
   * Validated, not trusted. It arrives from a browser and goes through
   * `isUsableNarrative`, which rejects anything malformed and anything that
   * states a fee — so a tampered payload cannot put a price in a proposal.
   */
  narrative?: ProposalNarrative | null;
  /**
   * Which option leads on the fees page.
   *
   * A code (A, B1, B2) emphasises that row. An empty string prints the whole
   * menu as equals — that is a choice, not an omission. Omitted (`undefined`)
   * lets the engine recommend from the roll.
   */
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

/**
 * The date a quote lapses, or null when it stands indefinitely.
 *
 * Returned as a plain calendar date because that is what it is — a fee stands
 * until the end of a day, not until a time of day — and because the column is a
 * `date`. Zero or a negative number means no expiry stated, which is better
 * than issuing a quote that has already expired.
 */
export function quoteExpiryDate(validityDays: number | null | undefined, from = new Date()): string | null {
  if (!Number.isFinite(validityDays) || Number(validityDays) <= 0) return null;
  const expires = new Date(from);
  expires.setDate(expires.getDate() + Number(validityDays));
  return expires.toISOString().slice(0, 10);
}

/**
 * Has this quote lapsed?
 *
 * Compared on calendar dates, so a proposal valid until the 12th is still valid
 * all day on the 12th. A document with no recorded expiry never lapses — that
 * is what every document issued before expiry was stored looks like, and they
 * are not retrospectively invalid.
 */
export function isQuoteExpired(validUntil: string | null | undefined, now = new Date()): boolean {
  if (!validUntil) return false;
  return now.toISOString().slice(0, 10) > String(validUntil).slice(0, 10);
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
  const { html, narrativeSource, narrative } = await prepared.render(
    reference,
    row.access_code ?? null,
    row.share_token ? String(row.share_token) : null,
  );

  /*
    The document is written back rather than inserted with the row, because it
    has to contain the reference the insert produced.

    `valid_until` goes with it. The proposal prints "these fees stand until…",
    and until now that sentence existed only inside the rendered HTML — nothing
    stored the date, so nothing could enforce it, and a school could sign a
    lapsed quote months later at a rate we no longer offer. An MoU has no
    expiry: it is the agreement, not an offer to make one.
  */
  const { error: saveError } = await input.db
    .from('partnership_agreements')
    .update({
      document_html: html,
      valid_until: kind === 'proposal' ? quoteExpiryDate(input.validityDays ?? DEFAULT_PROPOSAL_VALIDITY_DAYS) : null,
    })
    .eq('id', row.id);
  if (saveError) throw new Error(saveError.message);

  /*
    A proposal is a quote. Issuing another one used to leave the last draft or
    send sitting beside it, which is how the desk filled with mistakes. Drop
    the previous live/leftover copy of this kind. A signed MoU is never in
    that set.
  */
  try {
    await (
      input.db as {
        rpc?: (fn: string, args: Record<string, unknown>) => Promise<unknown>;
      }
    ).rpc?.('replace_live_partnership_documents', {
      p_school_id: targetSchoolId,
      p_kind: kind,
      p_keep_id: row.id,
    });
  } catch {
    // Function missing until the migration lands; issuing still succeeds.
  }

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
    narrative,
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

  const { html, narrativeSource, narrative } = await prepared.render(
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
      // A redraw restates the offer, so the clock on it restarts. Leaving the
      // old date would hand a school a freshly written proposal that expired
      // before they read it.
      valid_until:
        kind === 'proposal'
          ? quoteExpiryDate(input.validityDays ?? DEFAULT_PROPOSAL_VALIDITY_DAYS)
          : null,
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
    narrative,
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
  const { html, narrativeSource, narrative } = await prepared.render(reference, null, null, true);

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
    narrative,
    curriculumEdition: prepared.curriculum?.edition ?? null,
  };
}

/**
 * Match a prospect to an existing school without attaching the wrong one.
 *
 * Case-insensitive exact name. Two schools sharing a name are disambiguated
 * by city when the caller has one; otherwise this refuses rather than taking
 * the oldest row — that is how a proposal for "St Mary's, Warri" landed on
 * "St Mary's, Benin".
 */
export function pickProspectSchool(
  candidates: Array<{ id: string; name: string; city?: string | null }>,
  wanted: { name: string; city?: string | null },
): { match: 'none' } | { match: 'one'; id: string } | { match: 'ambiguous'; count: number } {
  const name = wanted.name.trim().toLowerCase();
  if (!name) return { match: 'none' };
  const exact = candidates.filter((c) => c.name.trim().toLowerCase() === name);
  if (exact.length === 0) return { match: 'none' };
  if (exact.length === 1) return { match: 'one', id: exact[0].id };
  const city = wanted.city?.trim().toLowerCase();
  if (city) {
    const inCity = exact.filter((c) => (c.city ?? '').trim().toLowerCase() === city);
    if (inCity.length === 1) return { match: 'one', id: inCity[0].id };
  }
  return { match: 'ambiguous', count: exact.length };
}

/**
 * The school a document is being issued to, creating it if this is a prospect
 * we have not met before.
 *
 * Only the issue path calls this. A school row is a permanent record, and
 * preview must be free to render as many drafts as somebody wants to look at
 * without leaving any behind.
 */
async function resolveSchoolForIssue(input: IssueInput): Promise<string> {
  const { db, schoolId, prospectSchool } = input;
  if (schoolId && schoolId !== 'new') return schoolId;

  const name = prospectSchool?.name?.trim();
  if (!name) throw new Error('That school does not exist.');

  const { data: existing } = await db
    .from('schools')
    .select('id, name, city')
    .ilike('name', name)
    .neq('is_deleted', true)
    .limit(20);
  const picked = pickProspectSchool((existing ?? []) as Array<{ id: string; name: string; city?: string | null }>, {
    name,
    city: prospectSchool?.city ?? null,
  });
  if (picked.match === 'ambiguous') {
    throw new Error(
      `More than one school is named "${name}". Open the school from the desk instead of issuing against a prospect with the same name.`,
    );
  }
  if (picked.match === 'one') return picked.id;

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
  // When teaching would start, named from the school calendar rather than
  // described as "the next academic term", which is true of every school in
  // the country and specific to none of them.
  const teachingTerm = await nextTeachingTerm(db);

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
      teachingTerm,
      reference,
      dateLabel,
      accessCode,
      shareToken,
      accessPending,
    });
  };

  return { school, agreedTerms, curriculum, snapshot, render, teachingTerm };
}

async function renderDocument(ctx: {
  input: IssueInput;
  school: any;
  agreedTerms: PartnershipTerms | null;
  curriculum: CurriculumProgression | null;
  /** The term teaching would start in, from the school calendar. */
  teachingTerm: TeachingTerm | null;
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
}): Promise<{
  html: string;
  narrativeSource: ProposalNarrative['source'] | null;
  /** Handed back so a preview can be issued verbatim rather than regenerated. */
  narrative: ProposalNarrative | null;
}> {
  const { input, school, agreedTerms, curriculum, teachingTerm, reference, dateLabel, accessCode, shareToken, accessPending } = ctx;
  const kind = input.kind;

  let html: string;
  let narrativeSource: ProposalNarrative['source'] | null = null;
  let usedNarrative: ProposalNarrative | null = null;
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
      // What was typed wins; otherwise the calendar names the term; otherwise
      // the generic phrase the document used to carry on its own.
      commencement: commencementLabel(input.commencement, teachingTerm),
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
    const expiryDate = quoteExpiryDate(validityDays);
    if (expiryDate) {
      const expires = new Date(`${expiryDate}T00:00:00`);
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
    /*
      The option this proposal is quoting, and why.

      A person choosing one always wins — they know things the roll does not.
      Absent that, the system picks from the enrolment and hands over the
      sentence explaining the choice, which the document prints. Before this,
      an unspecified option silently defaulted to the first row of the menu and
      the page still claimed it had been "picked for the size of your roll".

      One resolver, shared with the template. This matched on `scope` first and
      fell back to `findOffer`, which matches on `code` — so the fee and the
      emphasis could come from different rows of the same menu.
    */
    /*
      An empty string is a choice: show the three options as equals.

      `null`/`undefined` used to mean the same thing as "nobody picked", and
      then this silently recommended B1 or B2. The composer has a control for
      "show every option equally" — selecting it sent null, the recommendation
      overwrote it, and the PDF never matched what was on the desk.
    */
    const showFullMenu = input.scopeToOffer === '';
    const chosen = showFullMenu ? null : resolveOffer(input.scopeToOffer);
    const recommendation = chosen || showFullMenu
      ? null
      : recommendOffer({ studentCount: school.student_count, stage: input.stage });
    // A picked or recommended option. Never the first catalogue row: that is
    // Option A, and using it as a silent default priced the return sheet off
    // ₦25,000 while page 4 still showed three equal options.
    const quotedOffer = chosen ?? recommendation?.offer ?? null;
    /**
     * The money page, from whichever shape the deal actually takes.
     *
     * Sections are passed through as agreed rather than reduced to an average.
     * A school that agreed ₦15,000 for primary and ₦25,000 for secondary reads
     * both of its own numbers and the total they come to — not a third figure
     * sitting between them that it has never been quoted.
     */
    const upside = schoolUpside({
      /*
        A headcount typed into the composer beats the one on the school record.

        Nineteen of twenty-nine schools have no student_count, and this read
        only that — so most proposals fell back to illustrative rows for "a
        school of 100, 200, 300" and there was no field anywhere that could
        change it. The number a salesperson was told on the phone had nowhere
        to go, on the one page a head teacher rereads.
      */
      roll: Number(input.illustrativeStudents) || Number(school.student_count) || 0,
      feePerStudent:
        agreedTerms?.billing_model === 'per_student'
          ? (agreedTerms.amount_per_student ?? 0)
          : (quotedOffer?.priceFrom ?? 0),
      sections: agreedTerms?.billing_model === 'tiered' ? agreedTerms.tiers : null,
      // A package is one price for the school; uptake does not move it.
      fixedPackage:
        agreedTerms?.billing_model === 'fixed_package'
          ? agreedTerms.fixed_package_price
          : null,
      // The whole menu, only when the desk asked to show it equally and no
      // rate has been agreed. Otherwise this page would invent a single fee.
      menuOffers:
        !agreedTerms && showFullMenu
          ? PARTNERSHIP_OFFERS.map((o) => ({ code: o.code, priceFrom: o.priceFrom }))
          : null,
      // The standard deal is 70/30, or the custom proposed / agreed split.
      sharePercent: agreedTerms?.school_share_percent ?? input.proposedSchoolSharePercent ?? 30,
      cycle: agreedTerms?.billing_cycle ?? 'term',
    });

    /*
      Copy the caller already had approved wins over a fresh generation.

      Re-running the model here would produce different words from the ones
      somebody read in the preview pane and clicked Issue on. Reused only if it
      still passes the same gate a generation has to pass, so a hand-edited or
      tampered payload cannot smuggle a fee into a proposal.
    */
    const approved = isUsableNarrative(input.narrative) ? input.narrative : null;
    const narrative =
      approved ??
      (await buildProposalNarrative(
        { school, curriculum, notes: input.notes ?? null },
        { useAI: input.useAI === true },
      ));
    narrativeSource = narrative.source;
    usedNarrative = narrative;
    html = buildPartnershipProposalHTML({
      school,
      curriculum,
      agreedTerms,
      reference,
      dateLabel,
      narrative,
      // Honour a picked code, an explicit full menu (''), or the recommendation
      // when the caller did not say. Never treat "show equally" as "recommend".
      scopeToOffer: showFullMenu
        ? null
        : (chosen?.code ?? recommendation?.offer.code ?? null),
      recommendationReason: recommendation?.reason ?? null,
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

  return { html, narrativeSource, narrative: usedNarrative };
}

/** Documents already issued to a school, newest first. */
export async function listSchoolDocuments(
  db: { from: (t: string) => any },
  schoolId: string,
): Promise<Array<Record<string, unknown>>> {
  const { data } = await db
    .from('partnership_agreements')
    .select(
      'id, reference, document_kind, status, terms_snapshot, share_token, access_code, sent_at, signed_at, signed_by_name, created_at, valid_until, first_opened_at, last_opened_at, open_count',
    )
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false });

  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    terms: normaliseTerms(row.terms_snapshot as Record<string, unknown>),
  }));
}
