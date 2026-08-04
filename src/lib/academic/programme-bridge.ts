/**
 * Turns a published programme page into a teachable spine.
 *
 * A special programme advertised weeks and topics on its public page, but the
 * system had no curriculum, no release and no plan behind any of it — so the
 * generation pipeline had nothing to run on, and the twenty lessons that did
 * exist had been produced outside it and belonged to nothing.
 *
 * The page is the source of truth. Every advertised topic must survive into the
 * syllabus, because parents were shown it. The AI expands and sequences; it
 * does not choose the content.
 *
 * curriculum → release → plan, per track. Once a plan exists and is published,
 * the ordinary weekly pipeline takes over: lesson, slides, flashcards,
 * assignment, project — all held for teacher approval.
 */
import { generateAIContent, type GenerateRequest } from '@/lib/ai/generate-core';

type AnySupabase = any;

export type ProgrammeTrack = {
  id?: string;
  title?: string;
  desc?: string;
  topics?: string[];
};

export type ProgrammeWeek = {
  num?: string;
  tag?: string;
  title?: string;
  desc?: string;
};

export type PageContent = {
  tracks?: ProgrammeTrack[];
  weeks?: ProgrammeWeek[];
  hero_blurb?: string;
  ages_label?: string;
  duration_label?: string;
};

export type BridgeOutcome = {
  track: string;
  courseId: string | null;
  status: 'built' | 'skipped' | 'failed';
  detail: string;
  releaseId?: string;
  planId?: string;
  weeks?: number;
};

/**
 * Matches a track to the course it is taught as.
 *
 * Titles are compared loosely because the page is marketing copy and the course
 * row is an academic record — "Generative Art & Visual Storytelling" appears in
 * both, but punctuation and case drift between them.
 */
export function matchTrackToCourse(
  trackTitle: string,
  courses: Array<{ id: string; title: string }>,
): { id: string; title: string } | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const target = norm(trackTitle);
  if (!target) return null;

  const exact = courses.find((c) => norm(c.title) === target);
  if (exact) return exact;

  // A page title is usually the course title shortened — "AI Foundations" for
  // "AI Foundations & Python Programming". So the track's own words must all
  // appear in the course, rather than the two merely overlapping: that accepts
  // the abbreviation while still refusing "AI Ethics Seminar", which shares a
  // word with three courses and belongs to none of them.
  const targetWords = [...new Set(target.split(' ').filter((w) => w.length > 3))];
  if (!targetWords.length) return null;

  let best: { course: { id: string; title: string }; score: number } | null = null;
  for (const course of courses) {
    const words = new Set(norm(course.title).split(' ').filter((w) => w.length > 3));
    if (!targetWords.every((w) => words.has(w))) continue;
    // Among courses that contain the whole track title, the tightest fit wins.
    const score = targetWords.length - (words.size - targetWords.length);
    if (!best || score > best.score) best = { course, score };
  }
  return best?.course ?? null;
}

/** Flattens the generated curriculum into the week rows a plan carries. */
export function planWeeksFromCurriculum(content: any): Array<Record<string, unknown>> {
  const terms = Array.isArray(content?.terms) ? content.terms : [];
  const weeks = terms.flatMap((t: any) => (Array.isArray(t?.weeks) ? t.weeks : []));
  return weeks
    .map((w: any, i: number) => ({
      week: Number(w?.week) || i + 1,
      topic: String(w?.topic ?? `Week ${i + 1}`),
      subtopics: Array.isArray(w?.subtopics) ? w.subtopics : [],
      objectives: String(w?.objectives ?? ''),
      activities: String(w?.activities ?? ''),
      notes: String(w?.notes ?? ''),
      type: w?.type === 'project' ? 'project' : 'lesson',
    }))
    .sort((a: any, b: any) => a.week - b.week);
}

/**
 * Builds curriculum, release and plan for one track.
 *
 * Idempotent by course: a track that already has a published plan on this
 * offering is left alone, so re-running after a partial failure repairs the
 * gap rather than duplicating what worked.
 */
export async function bridgeTrack(
  db: AnySupabase,
  input: {
    track: ProgrammeTrack;
    page: PageContent;
    programmeTitle: string;
    offeringId: string;
    offeringPeriodId: string | null;
    schoolId: string;
    classId: string | null;
    createdBy: string;
    courses: Array<{ id: string; title: string }>;
  },
): Promise<BridgeOutcome> {
  const title = String(input.track.title ?? '').trim();
  const course = title ? matchTrackToCourse(title, input.courses) : null;

  if (!course) {
    return {
      track: title || '(untitled track)',
      courseId: null,
      status: 'skipped',
      detail: 'No course on this programme matches the track title.',
    };
  }

  const { data: existingPlan } = await db
    .from('lesson_plans')
    .select('id')
    .eq('course_id', course.id)
    .eq('academic_offering_id', input.offeringId)
    .neq('status', 'archived')
    .maybeSingle();
  if (existingPlan?.id) {
    return {
      track: title,
      courseId: course.id,
      status: 'skipped',
      detail: 'This track already has a teaching plan on the programme.',
      planId: existingPlan.id,
    };
  }

  const topics = (input.track.topics ?? []).map(String).filter(Boolean);
  const weekCount = Array.isArray(input.page.weeks) && input.page.weeks.length
    ? input.page.weeks.length
    : Math.max(topics.length, 4);

  let generated: any;
  try {
    const result = await generateAIContent({
      type: 'programme-curriculum',
      topic: title,
      course_name: course.title,
      programme_title: input.programmeTitle,
      topics,
      programme_weeks: input.page.weeks ?? [],
      week_count: weekCount,
      weeks_per_term: weekCount,
      ages_label: input.page.ages_label,
      duration_label: input.page.duration_label,
      hero_blurb: input.page.hero_blurb,
      track_desc: input.track.desc,
    } as GenerateRequest);
    generated = result?.data;
  } catch (err) {
    return {
      track: title,
      courseId: course.id,
      status: 'failed',
      detail: err instanceof Error ? err.message : 'Curriculum generation failed.',
    };
  }

  const planWeeks = planWeeksFromCurriculum(generated);
  if (!planWeeks.length) {
    return {
      track: title,
      courseId: course.id,
      status: 'failed',
      detail: 'The generated curriculum carried no weeks.',
    };
  }

  // The release is anchored to the offering. keep_offering_curriculum_off_the_
  // term_spine clears the session and term the column defaults would stamp on,
  // so a holiday programme never acquires a school session.
  const { data: lastRelease } = await db
    .from('academic_curriculum_releases')
    .select('release_number')
    .eq('course_id', course.id)
    .order('release_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const releasePayload = {
    course_id: course.id,
    release_number: Number(lastRelease?.release_number ?? 0) + 1,
    title: `${course.title} · ${input.programmeTitle}`,
    change_summary: `Built from the published ${input.programmeTitle} programme page.`,
    content: generated,
    content_hash: `bridge-${input.offeringId}-${course.id}-${Date.now()}`,
    published_by: input.createdBy,
    academic_offering_id: input.offeringId,
    status: 'published',
  };

  const { data: release, error: releaseErr } = await db
    .from('academic_curriculum_releases')
    .insert(releasePayload)
    .select('id')
    .single();
  if (releaseErr || !release?.id) {
    return {
      track: title,
      courseId: course.id,
      status: 'failed',
      detail: releaseErr?.message ?? 'Could not publish the curriculum release.',
    };
  }

  // Register the release as this offering's official direction for the course.
  // attach_official_direction_to_lesson_plan refuses a plan whose curriculum is
  // not the assigned direction — a real guard against a class being taught from
  // a release nobody adopted, and one the bridge has to satisfy rather than
  // work around.
  // Only one direction per offering+course may be active, enforced by a partial
  // unique index that an upsert cannot target — so the existing one is moved
  // rather than a second inserted alongside it.
  const { data: currentDirection } = await db
    .from('academic_offering_curriculum_directions')
    .select('id')
    .eq('academic_offering_id', input.offeringId)
    .eq('course_id', course.id)
    .eq('status', 'active')
    .maybeSingle();

  const directionRow = {
    academic_offering_id: input.offeringId,
    course_id: course.id,
    release_id: release.id,
    status: 'active',
    assigned_by: input.createdBy,
    updated_at: new Date().toISOString(),
  };
  const { error: directionErr } = currentDirection?.id
    ? await db
        .from('academic_offering_curriculum_directions')
        .update(directionRow)
        .eq('id', currentDirection.id)
    : await db.from('academic_offering_curriculum_directions').insert(directionRow);
  if (directionErr) {
    return {
      track: title,
      courseId: course.id,
      status: 'failed',
      detail: `Curriculum published but could not be adopted: ${directionErr.message}`,
      releaseId: release.id,
    };
  }

  // Published, and automation on: the point of the bridge is that the weekly
  // pipeline can now run. auto_publish stays off, so every generated week still
  // waits for a teacher on the approvals screen.
  const { data: plan, error: planErr } = await db
    .from('lesson_plans')
    .insert({
      course_id: course.id,
      class_id: input.classId,
      school_id: input.schoolId,
      academic_offering_id: input.offeringId,
      offering_period_id: input.offeringPeriodId,
      curriculum_release_id: release.id,
      status: 'published',
      version: 1,
      created_by: input.createdBy,
      plan_data: { weeks: planWeeks, source: 'programme_page_bridge' },
      metadata: {
        auto_generate_settings: {
          enabled: true,
          types: ['lessons', 'slides', 'flashcards', 'assignments', 'projects'],
          maxWeeksPerBatch: 1,
          auto_publish: false,
        },
        programme_bridge: {
          built_at: new Date().toISOString(),
          programme: input.programmeTitle,
          track: title,
        },
      },
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (planErr || !plan?.id) {
    return {
      track: title,
      courseId: course.id,
      status: 'failed',
      detail: planErr?.message ?? 'Curriculum published but the plan could not be created.',
      releaseId: release.id,
    };
  }

  return {
    track: title,
    courseId: course.id,
    status: 'built',
    detail: `Curriculum and plan created for ${planWeeks.length} weeks.`,
    releaseId: release.id,
    planId: plan.id,
    weeks: planWeeks.length,
  };
}
