/**
 * The project catalogue, grouped by the sentence rather than the row.
 *
 * 21,354 rows share 361 distinct prompts, and the largest three cover 20,520 of
 * them — every Basic, JSS and SS slot carries one templated line with the year,
 * term and week swapped in. Editing this catalogue a row at a time is 21,354
 * edits and nobody was ever going to make them, which is why it has sat
 * untouched since April. Editing it by shape is four.
 *
 * GET   — the shapes, biggest group first.
 * PATCH — rewrite every row sharing one shape.
 * POST  — draft a replacement with the AI engine, for a human to approve.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateAIContent } from '@/lib/ai/generate-core';

export const dynamic = 'force-dynamic';

type Actor = { id: string; role: string };

async function requireAdmin(): Promise<Actor | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await createAdminClient()
    .from('portal_users')
    .select('id, role, is_active, is_deleted')
    .eq('id', user.id)
    .maybeSingle();
  const row = data as { id: string; role: string; is_active: boolean; is_deleted: boolean } | null;
  if (!row || row.role !== 'admin' || !row.is_active || row.is_deleted) return null;
  return { id: row.id, role: row.role };
}

export async function GET(req: NextRequest) {
  const actor = await requireAdmin();
  if (!actor) {
    return NextResponse.json(
      { error: 'Only the Academic Office can review the Project Library.' },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const db = createAdminClient() as any;
  const { data, error } = await db.rpc('curriculum_project_shapes', {
    p_program: url.searchParams.get('program_id') || null,
    p_track: url.searchParams.get('track') || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const shapes = (data ?? []) as Array<{ rows: number; avg_length: number }>;
  const rows = shapes.reduce((sum, s) => sum + Number(s.rows), 0);

  return NextResponse.json({
    data: shapes,
    summary: {
      shapes: shapes.length,
      rows,
      // What the top few are worth, which is the whole argument for working
      // this way: three edits reach 96% of the catalogue.
      coveredByTopThree: shapes.slice(0, 3).reduce((sum, s) => sum + Number(s.rows), 0),
      // A one-sentence prompt is a placeholder, not a project brief.
      thinShapes: shapes.filter((s) => Number(s.avg_length) < 120).length,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const actor = await requireAdmin();
  if (!actor) {
    return NextResponse.json(
      { error: 'Only the Academic Office can change the official Project Library.' },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { shape, prompt, program_id = null, track = null } = body as Record<string, string | null>;

  if (!shape) return NextResponse.json({ error: 'shape is required.' }, { status: 400 });
  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'A replacement prompt is required.' }, { status: 400 });
  }

  const db = createAdminClient() as any;
  const { data, error } = await db.rpc('rewrite_curriculum_project_shape', {
    p_shape: shape,
    p_prompt: prompt,
    p_program: program_id,
    p_track: track,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ updated: Number(data ?? 0) });
}

/**
 * Draft a replacement. Deliberately returns text and writes nothing — 20,520
 * rows is far too many to change on a model's say-so without a person reading
 * the sentence first.
 */
export async function POST(req: NextRequest) {
  const actor = await requireAdmin();
  if (!actor) {
    return NextResponse.json(
      { error: 'Only the Academic Office can change the official Project Library.' },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { sample_prompt, sample_title, tracks, rows } = body as Record<string, unknown>;

  // `custom` reads req.prompt (see resolveGenerationPlan); topic is the label.
  const result = await generateAIContent({
    type: 'custom',
    topic: `Rewrite a weak project brief used across ${Number(rows) || 'many'} lessons`,
    prompt: `You are writing ONE reusable practical-project brief for Rillcod Technologies, a Nigerian STEM and coding academy.

It replaces this placeholder, which is currently used verbatim across ${Number(rows) || 'many'} different weeks:

  "${String(sample_prompt ?? '').slice(0, 400)}"

An example of a lesson it must serve: "${String(sample_title ?? '').slice(0, 200)}"
Tracks it covers: ${Array.isArray(tracks) ? tracks.join(', ') : 'mixed'}

Write a brief a teacher could hand to a class today. Requirements:
- 3 to 5 sentences. Concrete, not generic.
- Say what the learner BUILDS, how they TEST it, and what they SHOW at the end.
- Use the placeholder {week} where the week number belongs, and {track} for the track. They are substituted per lesson, so the one brief stays specific to each week.
- Nigerian context where it helps (market stalls, transport, mobile money, solar) — never forced.
- Plain British English. No headings, no bullet points, no preamble. Return only the brief itself.`,
  });

  if (!result?.content) {
    return NextResponse.json({ error: 'The AI engine returned nothing. Try again.' }, { status: 502 });
  }

  return NextResponse.json({ draft: String(result.content).trim(), model: result.model ?? null });
}
