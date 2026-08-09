/**
 * POST /api/curriculum-governance/quality-repair
 *
 * Mend a curriculum that is not yet publishable, instead of handing the Academic Office a list of
 * faults to correct by hand. Body: { curriculum_id, include_warnings?, save? }.
 *
 * `save: false` (the default) returns the mended document for review without writing it, so an
 * administrator can see what the AI changed before accepting it. `save: true` writes it back.
 *
 * The AI is never trusted on its own — see quality-repair.ts. A candidate that loses a term or a
 * week, or that fails to reduce the fault count, is discarded and the original kept.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { geminiGenerateText } from '@/lib/gemini/client';
import { inspectCurriculumQuality } from '@/lib/curriculum/qualityGate';
import { solidifyCurriculumQuality } from '@/lib/curriculum/quality-repair';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createAdminClient() as any;
  const { data: profile } = await db
    .from('portal_users')
    .select('role, is_active, is_deleted')
    .eq('id', user.id)
    .maybeSingle();
  // Publishing is an Academic Office act, and so is repairing what is about to be published.
  if (profile?.role !== 'admin' || !profile.is_active || profile.is_deleted) {
    return NextResponse.json(
      { error: 'Only the Academic Office can repair a curriculum for publication.' },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const curriculumId = String((body as any).curriculum_id ?? '').trim();
  if (!curriculumId) {
    return NextResponse.json({ error: 'Choose a curriculum to repair.' }, { status: 400 });
  }

  const { data: row, error: loadError } = await db
    .from('course_curricula')
    .select('id, content, school_id')
    .eq('id', curriculumId)
    .maybeSingle();
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Curriculum not found.' }, { status: 404 });
  if (row.school_id) {
    return NextResponse.json(
      { error: 'Repair the central curriculum, not a school copy — a copy is not what gets published.' },
      { status: 409 },
    );
  }

  // Judged by the same engine the readiness screen shows, with the same context,
  // so "17 suggestions" on screen and what repair attempts are the same list.
  const outcome = await solidifyCurriculumQuality(row.content, geminiGenerateText, {
    sourceMetadata: (body as any).source_metadata,
    academicSession: (body as any).academic_session ?? null,
    audienceLabel: (body as any).audience_label ?? null,
  });

  let saved = false;
  if (outcome.status === 'repaired' && (body as any).save === true) {
    const { error: saveError } = await db
      .from('course_curricula')
      .update({ content: outcome.content, updated_at: new Date().toISOString() })
      .eq('id', curriculumId);
    if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });
    saved = true;
  }

  const finalQuality = inspectCurriculumQuality(outcome.content);
  const settled = outcome.after ?? outcome.before;
  return NextResponse.json({
    status: outcome.status,
    saved,
    reason: outcome.reason ?? null,
    model: outcome.model ?? null,
    // What the Academic Office needs to decide: is it publishable now, and what
    // actually moved. Reported on the readiness engine's own terms, so these
    // numbers match the report shown beside the Publish button.
    publishable: finalQuality.passed,
    readiness_before: outcome.before.readiness,
    readiness_after: settled.readiness,
    score_before: outcome.before.score,
    score_after: settled.score,
    must_fix_before: outcome.before.mustFix.length,
    must_fix_after: settled.mustFix.length,
    improvements_before: outcome.before.improvements.length,
    improvements_after: settled.improvements.length,
    quality: settled,
    content: saved ? undefined : outcome.content,
  });
}
