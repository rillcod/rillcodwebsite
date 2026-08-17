/**
 * GET    /api/partnerships/documents?school_id=…  — documents issued to a school
 * POST   /api/partnerships/documents               — issue a proposal or an MoU
 * PATCH  /api/partnerships/documents               — move one along its lifecycle
 * DELETE /api/partnerships/documents?id=…          — discard a draft
 *
 * Issuing renders the document and keeps it, with a reference assigned by the
 * database. That is the whole point: a generated file nobody stored is how one
 * school ended up with seventeen MoU PDFs distinguished only by filename.
 *
 * Nothing here sends anything. A document is issued as a draft for a person to
 * read before it leaves the building.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit/log';
import {
  StaleDocumentError,
  issuePartnershipDocument,
  listSchoolDocuments,
  previewPartnershipDocument,
  refreshPartnershipDocument,
} from '@/lib/partnerships/issue-document';
import { MissingPartnershipTermsError } from '@/lib/partnerships/terms';
import { normaliseStudioConfig } from '@/lib/partnerships/studio-config';
import { ImpermissibleSplitError, normaliseSchoolSharePercent } from '@/lib/partnerships/split';
import { notificationsService } from '@/services/notifications.service';
import { buildPartnershipFollowUpEmail } from '@/lib/email/rillcod-transactional-email';
import { brandContact } from '@/config/brand';

export const dynamic = 'force-dynamic';

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

  // Issuing a contract is an admin act. A partner school may read what it was
  // sent, and never issue anything to itself.
  const allowed = write ? ['admin'] : ['admin', 'teacher', 'school'];
  if (!allowed.includes(profile.role || '')) return null;
  return { user, db, role: profile.role as string, schoolId: profile.school_id as string | null };
}

export async function GET(req: NextRequest) {
  const actor = await requireActor(false);
  if (!actor) return NextResponse.json({ error: 'Not permitted' }, { status: 403 });

  const schoolId = req.nextUrl.searchParams.get('school_id')?.trim() || null;
  if (!schoolId) return NextResponse.json({ error: 'A school_id is required.' }, { status: 400 });
  if (actor.role === 'school' && actor.schoolId !== schoolId) {
    return NextResponse.json({ error: 'Not permitted' }, { status: 403 });
  }

  try {
    const documents = await listSchoolDocuments(actor.db, schoolId);
    // A school sees what was actually sent to it, not internal drafts.
    const visible =
      actor.role === 'school'
        ? documents.filter((d) => ['sent', 'signed'].includes(String(d.status)))
        : documents;
    return NextResponse.json({ documents: visible });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load documents' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const actor = await requireActor(true);
  if (!actor) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const schoolId = String(body.school_id ?? '').trim();
  const kind = String(body.kind ?? '').trim();

  const prospectSchool = body.prospect_school && typeof body.prospect_school === 'object'
    ? {
        name: String((body.prospect_school as any).name || ''),
        address: (body.prospect_school as any).address ? String((body.prospect_school as any).address) : null,
        city: (body.prospect_school as any).city ? String((body.prospect_school as any).city) : null,
        state: (body.prospect_school as any).state ? String((body.prospect_school as any).state) : null,
        email: (body.prospect_school as any).email ? String((body.prospect_school as any).email) : null,
        contactPerson: (body.prospect_school as any).contact_person ? String((body.prospect_school as any).contact_person) : null,
        studentCount: Number((body.prospect_school as any).student_count) || undefined,
      }
    : null;

  if (!schoolId && !prospectSchool?.name) {
    return NextResponse.json({ error: 'A school_id or prospect_school is required.' }, { status: 400 });
  }
  if (kind !== 'proposal' && kind !== 'mou') {
    return NextResponse.json({ error: 'kind must be "proposal" or "mou".' }, { status: 400 });
  }

  // Preview renders and returns; it consumes no reference and writes no row, so
  // the whole document can be read before anything about it becomes permanent.
  const previewOnly = body.preview === true;

  try {
    const buildArgs = {
      db: actor.db,
      schoolId: schoolId || 'new',
      prospectSchool,
      kind: kind as "proposal" | "mou",
      actorId: actor.user.id,
      useAI: body.use_ai === true,
      scopeToOffer: body.scope_to_offer ? String(body.scope_to_offer) : null,
      stage:
        body.stage === 'primary' || body.stage === 'secondary' || body.stage === 'both'
          ? body.stage
          : null,
      // Both kinds: an MoU works the agreed fee through it, a proposal works
      // the uptake scenarios off it.
      illustrativeStudents: Number(body.illustrative_students) || undefined,
      commencement: body.commencement ? String(body.commencement) : null,
      durationLabel: body.duration_label ? String(body.duration_label) : null,
      notes: body.notes ? String(body.notes) : null,
      validityDays:
        body.validity_days == null || body.validity_days === ''
          ? null
          : Number(body.validity_days),
      proposedSchoolSharePercent: normaliseSchoolSharePercent(body.proposed_school_share_percent),
      // Studio settings ride with the request so a preview and the issue that
      // follows it describe the same document.
      studio: body.studio ? normaliseStudioConfig(body.studio) : null,
      /*
        Copy that came back from a preview, sent so the issue prints it verbatim.

        Without it, ticking "tailor with AI" meant the model was asked once for
        the preview and again for the issue — two generations, two different
        proposals, and only the first one was ever read. Revalidated in
        `issuePartnershipDocument` rather than trusted, because it arrives from
        a browser and a proposal must never state a fee nobody agreed.
      */
      narrative: body.narrative && typeof body.narrative === 'object' ? body.narrative : null,
    };

    if (previewOnly) {
      const draft = await previewPartnershipDocument(buildArgs);
      return NextResponse.json({
        preview: true,
        reference: draft.reference,
        kind: draft.kind,
        school: draft.schoolName,
        narrative_source: draft.narrativeSource,
        // Handed back so the issue that follows can print these exact words.
        narrative: draft.narrative,
        curriculum_edition: draft.curriculumEdition,
        html: draft.html,
      });
    }

    const issued = await issuePartnershipDocument(buildArgs);

    await logAudit(actor.db as any, {
      action: kind === 'mou' ? 'issue_partnership_mou' : 'issue_partnership_proposal',
      actorId: actor.user.id,
      resourceType: 'partnership_agreements',
      resourceId: issued.id,
      tableName: 'partnership_agreements',
      newValue: `${issued.reference} for ${issued.schoolName}`,
      newValues: {
        school_id: schoolId,
        kind,
        reference: issued.reference,
        terms_id: issued.termsId,
        narrative_source: issued.narrativeSource,
        curriculum_edition: issued.curriculumEdition,
      },
    });

    // Optionally dispatch email directly to recipient via Resend with SendPulse backup
    let emailSent = false;
    let emailRecipient: string | null = null;
    if (body.send_email === true) {
      let toEmail = String(body.recipient_email || prospectSchool?.email || '').trim();
      let contactPerson = prospectSchool?.contactPerson || null;
      if (!toEmail && schoolId && schoolId !== 'new') {
        const { data: dbSchool } = await actor.db
          .from('schools')
          .select('email, contact_person')
          .eq('id', schoolId)
          .maybeSingle();
        if (dbSchool?.email) {
          toEmail = String(dbSchool.email).trim();
          contactPerson = contactPerson || dbSchool.contact_person;
        }
      }

      if (toEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(toEmail)) {
        const appUrl = (process.env.NEXT_PUBLIC_APP_URL || brandContact.siteUrl).replace(/\/$/, '');
        /*
          The link is built from the share token, and only the share token.

          This read `issued.reference || issued.shareToken`, and a reference is
          always present — so every emailed link was a reference. That is the
          sequential number printed on the document (RC-MOU-2026-00014), which
          makes it both guessable and, since the public route stopped honouring
          references, dead: recipients got a link that resolved to nothing.

          If a token is somehow absent there is no safe link to send, so the
          email goes out without one rather than falling back to the reference.
        */
        const shareUrl = issued.shareToken ? `${appUrl}/p/${issued.shareToken}` : null;
        const { subject, html } = buildPartnershipFollowUpEmail({
          schoolName: issued.schoolName,
          contactName: contactPerson,
          reference: issued.reference,
          angle: kind === 'mou' ? 'resumption_slot' : 'cold_pitch',
          shareUrl,
          appUrl,
        });

        const dispatched = await notificationsService.sendEmail('system', {
          to: toEmail,
          subject,
          html,
          templateKey: kind === 'mou' ? 'partnership_mou' : 'partnership_proposal',
          referenceId: issued.reference,
        });

        if (dispatched) {
          emailSent = true;
          emailRecipient = toEmail;
          // Mark document status as sent
          await actor.db
            .from('partnership_agreements')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', issued.id);
        }
      }
    }

    return NextResponse.json({
      id: issued.id,
      reference: issued.reference,
      kind: issued.kind,
      school: issued.schoolName,
      narrative_source: issued.narrativeSource,
      curriculum_edition: issued.curriculumEdition,
      html: issued.html,
      // What the public link is built from. Never the reference: that is
      // sequential and printed on the document, so it is not a secret.
      share_token: issued.shareToken,
      // The typed way in, for a school that has the sheet but lost the link.
      // Without this the dashboard's "Access Code" pill had nothing to show.
      access_code: issued.accessCode,
      email_sent: emailSent,
      email_to: emailRecipient,
    });
  } catch (error) {
    // The one refusal worth spelling out: an MoU cannot be written without a rate.
    if (error instanceof MissingPartnershipTermsError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    // A split that would put Rillcod in the minority is a bad request, not a
    // server fault — and it is worth saying why rather than returning a 500.
    if (error instanceof ImpermissibleSplitError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not issue the document' },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/partnerships/documents — redraw a draft against today's template.
 *
 * A stored document is deliberately frozen: what a school received is what we
 * can reprint. But a draft has been received by nobody, and after a template
 * change or a newly agreed rate it is simply out of date. Redrawing keeps the
 * reference, the share link and the six-digit code, so nothing already written
 * down or read out over the phone stops working.
 *
 * The build settings ride with the request, the same ones preview and issue
 * take, because they are not stored on the row — the draft is redrawn as the
 * composer currently describes it.
 */
export async function PUT(req: NextRequest) {
  const actor = await requireActor(true);
  if (!actor) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const id = String(body.id ?? '').trim();
  if (!id) return NextResponse.json({ error: 'An id is required.' }, { status: 400 });

  try {
    const refreshed = await refreshPartnershipDocument({
      db: actor.db,
      documentId: id,
      actorId: actor.user.id,
      useAI: body.use_ai === true,
      scopeToOffer: body.scope_to_offer ? String(body.scope_to_offer) : null,
      stage:
        body.stage === 'primary' || body.stage === 'secondary' || body.stage === 'both'
          ? body.stage
          : null,
      illustrativeStudents: Number(body.illustrative_students) || undefined,
      commencement: body.commencement ? String(body.commencement) : null,
      durationLabel: body.duration_label ? String(body.duration_label) : null,
      notes: body.notes ? String(body.notes) : null,
      validityDays:
        body.validity_days == null || body.validity_days === ''
          ? null
          : Number(body.validity_days),
      proposedSchoolSharePercent: normaliseSchoolSharePercent(body.proposed_school_share_percent),
      studio: body.studio ? normaliseStudioConfig(body.studio) : null,
    });

    await logAudit(actor.db as any, {
      action: 'refresh_partnership_document',
      actorId: actor.user.id,
      resourceType: 'partnership_agreements',
      resourceId: refreshed.id,
      tableName: 'partnership_agreements',
      newValue: `${refreshed.reference} redrawn for ${refreshed.schoolName}`,
      newValues: {
        school_id: refreshed.schoolId,
        reference: refreshed.reference,
        terms_id: refreshed.termsId,
        curriculum_edition: refreshed.curriculumEdition,
      },
    });

    return NextResponse.json({
      id: refreshed.id,
      reference: refreshed.reference,
      kind: refreshed.kind,
      school: refreshed.schoolName,
      html: refreshed.html,
      share_token: refreshed.shareToken,
      access_code: refreshed.accessCode,
      narrative_source: refreshed.narrativeSource,
      curriculum_edition: refreshed.curriculumEdition,
      refreshed: true,
    });
  } catch (error) {
    // Past draft is a refusal with a reason, not a fault.
    if (error instanceof StaleDocumentError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof MissingPartnershipTermsError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof ImpermissibleSplitError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not redraw that draft' },
      { status: 500 },
    );
  }
}

const LIFECYCLE = ['draft', 'sent', 'signed', 'declined', 'void'] as const;

/**
 * Move a document along its lifecycle.
 *
 * Only the status and the signature details are writable. The document body and
 * the terms behind it are never touched here — a database trigger seals both
 * once a row is signed, and this route has no reason to fight it. Restating a
 * signed contract means superseding the terms and issuing a new one.
 */
export async function PATCH(req: NextRequest) {
  const actor = await requireActor(true);
  if (!actor) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const id = String(body.id ?? '').trim();
  const status = String(body.status ?? '').trim();

  if (!id) return NextResponse.json({ error: 'An id is required.' }, { status: 400 });
  if (!LIFECYCLE.includes(status as (typeof LIFECYCLE)[number])) {
    return NextResponse.json(
      { error: `status must be one of ${LIFECYCLE.join(', ')}.` },
      { status: 400 },
    );
  }

  const { data: current } = await actor.db
    .from('partnership_agreements')
    .select('id, reference, status, school_id, sent_at, signed_at, signed_by_name, signed_by_role')
    .eq('id', id)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: 'That document does not exist.' }, { status: 404 });

  const patch: {
    status: string;
    signed_by_name?: string | null;
    signed_by_role?: string | null;
    signed_at?: string | null;
    sent_at?: string | null;
  } = { status };

  /*
    Recall: back to draft, so a mistake can be redrawn or deleted.

    A school should end up holding one copy of a proposal, not a corrected one
    sitting beside the wrong one. Sent documents were terminal — the only
    remedy was to void and issue again, which leaves both on the school's
    record and gives them two references for one offer.

    Only from `sent`, and never from `signed`: a signature is somebody else's
    act, and no button here gets to undo it. `sent_at` is cleared with it,
    because a document that is going back out has not been sent yet.
  */
  if (status === 'draft') {
    if (current.status === 'signed') {
      return NextResponse.json(
        {
          error: `${current.reference} has been signed. A signature is the other party's act — supersede it with a fresh document instead of recalling it.`,
        },
        { status: 409 },
      );
    }
    if (current.status !== 'sent' && current.status !== 'draft') {
      return NextResponse.json(
        { error: `${current.reference} is ${current.status} and cannot be recalled to draft.` },
        { status: 409 },
      );
    }
    patch.sent_at = null;
  }

  if (status === 'signed') {
    // The CHECK requires a name and a time against a signature. Asking for them
    // here means the refusal names the missing field instead of the constraint.
    const signedByName = String(body.signed_by_name ?? current.signed_by_name ?? '').trim();
    if (!signedByName) {
      return NextResponse.json(
        { error: 'Recording a signature needs the name of the person who signed it.' },
        { status: 400 },
      );
    }
    patch.signed_by_name = signedByName;
    // Keep what is already recorded when the caller does not restate it, so a
    // second PATCH cannot quietly blank the signer's role.
    patch.signed_by_role = body.signed_by_role
      ? String(body.signed_by_role)
      : (current.signed_by_role ?? null);
    patch.signed_at = current.signed_at ?? new Date().toISOString();
    // A document cannot be signed without having gone out.
    patch.sent_at = current.sent_at ?? new Date().toISOString();
  } else if (status === 'sent' && !current.sent_at) {
    patch.sent_at = new Date().toISOString();
  }

  const { data: updated, error } = await actor.db
    .from('partnership_agreements')
    .update(patch)
    .eq('id', id)
    .select('id, reference, document_kind, status, sent_at, signed_at, signed_by_name, share_token')
    .single();

  if (error) {
    // The trigger's own message is the useful one — it says what to do instead.
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logAudit(actor.db as any, {
    action: 'update_partnership_agreement_status',
    actorId: actor.user.id,
    resourceType: 'partnership_agreements',
    resourceId: id,
    tableName: 'partnership_agreements',
    oldValue: String(current.status),
    newValue: `${updated.reference}: ${current.status} → ${status}`,
    newValues: { school_id: current.school_id, status, reference: updated.reference },
  });

  return NextResponse.json({ document: updated });
}

/**
 * Discard a draft.
 *
 * Drafts only. A document that has been sent or signed is the record of what a
 * school was given, and deleting it would recreate exactly the gap this table
 * was built to close — void it instead, which keeps the row and says so.
 */
export async function DELETE(req: NextRequest) {
  const actor = await requireActor(true);
  if (!actor) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const id = req.nextUrl.searchParams.get('id')?.trim() || '';
  if (!id) return NextResponse.json({ error: 'An id is required.' }, { status: 400 });

  const { data: current } = await actor.db
    .from('partnership_agreements')
    .select('id, reference, status, school_id, document_kind')
    .eq('id', id)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: 'That document does not exist.' }, { status: 404 });

  if (current.status !== 'draft') {
    return NextResponse.json(
      {
        error:
          `${current.reference} has already been ${current.status}. A document that left the building stays on record — void it instead of deleting it.`,
      },
      { status: 409 },
    );
  }

  const { error } = await actor.db.from('partnership_agreements').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(actor.db as any, {
    action: 'delete_partnership_draft',
    actorId: actor.user.id,
    resourceType: 'partnership_agreements',
    resourceId: id,
    tableName: 'partnership_agreements',
    oldValue: `${current.reference} (${current.document_kind}, draft)`,
    newValues: { school_id: current.school_id, reference: current.reference },
  });

  return NextResponse.json({ deleted: true, reference: current.reference });
}
