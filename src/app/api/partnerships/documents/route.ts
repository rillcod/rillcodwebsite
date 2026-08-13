/**
 * GET  /api/partnerships/documents?school_id=…  — documents issued to a school
 * POST /api/partnerships/documents               — issue a proposal or an MoU
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
import { issuePartnershipDocument, listSchoolDocuments } from '@/lib/partnerships/issue-document';
import { MissingPartnershipTermsError } from '@/lib/partnerships/terms';

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

  try {
    const issued = await issuePartnershipDocument({
      db: actor.db,
      schoolId,
      kind,
      actorId: actor.user.id,
      useAI: body.use_ai === true,
      scopeToOffer: body.scope_to_offer ? String(body.scope_to_offer) : null,
      illustrativeStudents: Number(body.illustrative_students) || undefined,
      commencement: body.commencement ? String(body.commencement) : null,
      durationLabel: body.duration_label ? String(body.duration_label) : null,
      notes: body.notes ? String(body.notes) : null,
    });

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
