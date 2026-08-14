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
  issuePartnershipDocument,
  listSchoolDocuments,
  previewPartnershipDocument,
} from '@/lib/partnerships/issue-document';
import { MissingPartnershipTermsError } from '@/lib/partnerships/terms';
import { normaliseStudioConfig } from '@/lib/partnerships/studio-config';

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

  if (!schoolId) return NextResponse.json({ error: 'A school_id is required.' }, { status: 400 });
  if (kind !== 'proposal' && kind !== 'mou') {
    return NextResponse.json({ error: 'kind must be "proposal" or "mou".' }, { status: 400 });
  }

  // Preview renders and returns; it consumes no reference and writes no row, so
  // the whole document can be read before anything about it becomes permanent.
  const previewOnly = body.preview === true;

  try {
    const buildArgs = {
      db: actor.db,
      schoolId,
      kind: kind as "proposal" | "mou",
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
      // Studio settings ride with the request so a preview and the issue that
      // follows it describe the same document.
      studio: body.studio ? normaliseStudioConfig(body.studio) : null,
    };

    if (previewOnly) {
      const draft = await previewPartnershipDocument(buildArgs);
      return NextResponse.json({
        preview: true,
        reference: draft.reference,
        kind: draft.kind,
        school: draft.schoolName,
        narrative_source: draft.narrativeSource,
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

    return NextResponse.json({
      id: issued.id,
      reference: issued.reference,
      kind: issued.kind,
      school: issued.schoolName,
      narrative_source: issued.narrativeSource,
      curriculum_edition: issued.curriculumEdition,
      html: issued.html,
    });
  } catch (error) {
    // The one refusal worth spelling out: an MoU cannot be written without a rate.
    if (error instanceof MissingPartnershipTermsError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not issue the document' },
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
    .select('id, reference, document_kind, status, sent_at, signed_at, signed_by_name')
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
