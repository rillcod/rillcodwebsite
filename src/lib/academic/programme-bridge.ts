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
  /** Marketing label, e.g. "Module 1 · Weeks 1–2". Scopes generation to that window. */
  week?: string;
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

export type WeekRange = { start: number; end: number };

/**
 * Reads the module window from a track's published week label.
 * "Module 1 · Weeks 1–2" → {1,2}; "Week 4" → {4,4}.
 */
export function parseTrackWeekRange(
  label: string | null | undefined,
): WeekRange | null {
  if (!label?.trim()) return null;
  const normalised = label.replace(/[–—]/g, '-');
  const range = normalised.match(/weeks?\s*(\d+)\s*(?:-|\/|to)\s*(\d+)/i);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (start > 0 && end >= start) return { start, end };
  }
  const single = normalised.match(/weeks?\s*(\d+)/i);
  if (single) {
    const n = Number(single[1]);
    if (n > 0) return { start: n, end: n };
  }
  return null;
}

export function weekNumberFromPageWeek(week: ProgrammeWeek): number | null {
  const match = String(week.num ?? '').match(/(\d+)/);
  if (!match) return null;
  const n = Number(match[1]);
  return n > 0 ? n : null;
}

/** Keeps only the programme-calendar weeks that belong to this track's module. */
export function filterWeeksForTrack(
  weeks: ProgrammeWeek[],
  range: WeekRange | null,
): ProgrammeWeek[] {
  if (!range || !weeks.length) return [];
  return weeks.filter((w) => {
    const n = weekNumberFromPageWeek(w);
    return n != null && n >= range.start && n <= range.end;
  });
}

const TRACK_STOP = new Set([
  'with', 'from', 'that', 'this', 'have', 'into', 'your', 'using', 'and', 'the',
  'for', 'module', 'weeks', 'week', 'project', 'personal', 'basic', 'basics',
]);

function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((w) => w.length >= 3 && !TRACK_STOP.has(w)),
  );
}

/**
 * True when a shared cohort spine row may ground THIS track.
 * Drops rows that clearly name another module (e.g. Python on Generative Art
 * expand) while keeping neutral or overlapping rows (Web Apps & Game Logic).
 */
export function spineWeekBelongsToTrack(
  week: ProgrammeWeek,
  track: ProgrammeTrack,
  siblingTracks: ProgrammeTrack[] = [],
): boolean {
  const weekTitleWords = significantWords(String(week.title ?? ''));
  const weekWords = significantWords(
    [week.title, week.desc].map(String).join(' '),
  );
  const myWords = significantWords(
    [track.title, track.desc, ...(track.topics ?? [])].map(String).join(' '),
  );

  // This track's own words in the spine row → keep.
  for (const w of myWords) {
    if (weekWords.has(w)) return true;
  }

  const siblings = siblingTracks.filter((t) => {
    const a = String(t.title ?? '').trim().toLowerCase();
    const b = String(track.title ?? '').trim().toLowerCase();
    return Boolean(a && b && a !== b);
  });

  // Exclusive foreign word in the spine TITLE (not the blurb — blurbs name
  // shared tools like Python/Gemini and would false-drop the wrong rows).
  for (const sibling of siblings) {
    const foreign = significantWords(
      [sibling.title, sibling.desc, ...(sibling.topics ?? [])].map(String).join(' '),
    );
    for (const w of foreign) {
      if (weekTitleWords.has(w) && !myWords.has(w)) return false;
    }
  }

  // Neutral / shared spine — safe to keep inside this module's calendar window.
  return true;
}

/**
 * Teaching window for one track, taken from the page write-up — never the whole
 * cohort calendar when the track names a shorter module (Generative Art is
 * Weeks 1–2, not the full 7-week Python-to-graduation spine).
 *
 * Expandable: change the label to "Weeks 1–3" (or set start/end) and re-launch
 * teaching — the bridge captures the new window. Extra week NUMBERS are kept;
 * foreign spine titles from sibling modules are dropped so expand cannot bleed.
 */
export function resolveTrackTeachingWindow(
  track: ProgrammeTrack,
  page: PageContent,
): {
  weeks: ProgrammeWeek[];
  weekCount: number;
  range: WeekRange | null;
  weekNumbers: number[];
} {
  const range = parseTrackWeekRange(track.week);
  const all = Array.isArray(page.weeks) ? page.weeks : [];
  const topics = (track.topics ?? []).map(String).filter(Boolean);
  const siblings = Array.isArray(page.tracks) ? page.tracks : [];

  if (range) {
    const weekNumbers = Array.from(
      { length: range.end - range.start + 1 },
      (_, i) => range.start + i,
    );
    const inRange = filterWeeksForTrack(all, range);
    const owned = inRange.filter((w) => spineWeekBelongsToTrack(w, track, siblings));
    return {
      weeks: owned,
      weekCount: weekNumbers.length,
      range,
      weekNumbers,
    };
  }

  // No module label: prefer the track's own topic count over the full spine so
  // a track without "Weeks 1–2" still cannot inherit unrelated modules.
  if (topics.length) {
    const weekCount = Math.max(topics.length, 2);
    return {
      weeks: [],
      weekCount,
      range: null,
      weekNumbers: Array.from({ length: weekCount }, (_, i) => i + 1),
    };
  }

  if (all.length) {
    const weekNumbers = all
      .map(weekNumberFromPageWeek)
      .filter((n): n is number => n != null);
    return {
      weeks: all,
      weekCount: all.length,
      range: null,
      weekNumbers:
        weekNumbers.length === all.length
          ? weekNumbers
          : Array.from({ length: all.length }, (_, i) => i + 1),
    };
  }

  return { weeks: [], weekCount: 4, range: null, weekNumbers: [1, 2, 3, 4] };
}

/** Stable key for the teaching window — used to detect 1–2 → 1–3 expansions. */
export function moduleWindowFingerprint(weekNumbers: number[]): string {
  return [...weekNumbers]
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b)
    .join(',');
}

/** Builds the marketing label the page and bridge both understand. */
export function formatModuleWeekLabel(input: {
  moduleIndex?: number;
  start: number;
  end: number;
}): string {
  const start = Math.max(1, Math.floor(input.start));
  const end = Math.max(start, Math.floor(input.end));
  const mod =
    typeof input.moduleIndex === 'number' && input.moduleIndex > 0
      ? `Module ${input.moduleIndex} · `
      : '';
  if (start === end) return `${mod}Week ${start}`;
  return `${mod}Weeks ${start}–${end}`;
}

export function windowsMatch(
  a: number[] | null | undefined,
  b: number[] | null | undefined,
): boolean {
  return moduleWindowFingerprint(a ?? []) === moduleWindowFingerprint(b ?? []);
}

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
 * If the model returned local 1..N weeks for a mid-cohort module (e.g. Weeks 4–5),
 * rewrite them onto the published programme calendar numbers.
 */
export function alignPlanWeeksToWindow(
  planWeeks: Array<Record<string, unknown>>,
  weekNumbers: number[],
): Array<Record<string, unknown>> {
  if (!planWeeks.length || !weekNumbers.length) return planWeeks;
  if (planWeeks.length !== weekNumbers.length) return planWeeks;

  const sorted = [...planWeeks].sort(
    (a, b) => Number(a.week) - Number(b.week),
  );
  const alreadyAligned = sorted.every(
    (w, i) => Number(w.week) === weekNumbers[i],
  );
  if (alreadyAligned) return sorted;

  const looksLocal = sorted.every(
    (w, i) => Number(w.week) === i + 1,
  );
  if (!looksLocal) return sorted;

  return sorted.map((w, i) => ({ ...w, week: weekNumbers[i] }));
}

/**
 * Builds curriculum, release and plan for one track.
 *
 * Idempotent by course when the module window is unchanged. If the page expands
 * the window (Weeks 1–2 → 1–3) or forceRebuild is set, the old plan is archived
 * and a fresh one is built from the write-up — so growth is capturable.
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
    /** Always archive any live plan for this track and rebuild from the page. */
    forceRebuild?: boolean;
    /** When the page week window no longer matches the plan, archive and rebuild. Default true. */
    rebuildOnWindowChange?: boolean;
  },
): Promise<BridgeOutcome> {
  const title = String(input.track.title ?? '').trim();
  const course = title ? matchTrackToCourse(title, input.courses) : null;
  const rebuildOnWindowChange = input.rebuildOnWindowChange !== false;
  const window = resolveTrackTeachingWindow(input.track, input.page);
  const desiredFingerprint = moduleWindowFingerprint(window.weekNumbers);

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
    .select('id, metadata, plan_data')
    .eq('course_id', course.id)
    .eq('academic_offering_id', input.offeringId)
    .neq('status', 'archived')
    .maybeSingle();

  if (existingPlan?.id) {
    const bridgeMeta =
      ((existingPlan.metadata as Record<string, unknown> | null)?.programme_bridge as
        | Record<string, unknown>
        | undefined) ?? {};
    const storedNumbers = Array.isArray(bridgeMeta.week_numbers)
      ? (bridgeMeta.week_numbers as unknown[]).map(Number).filter((n) => Number.isFinite(n) && n > 0)
      : extractWeekNumbersFromPlanData(existingPlan.plan_data);
    const sameWindow = windowsMatch(storedNumbers, window.weekNumbers);
    const mustRebuild = input.forceRebuild === true || (rebuildOnWindowChange && !sameWindow);

    if (!mustRebuild) {
      return {
        track: title,
        courseId: course.id,
        status: 'skipped',
        detail: 'This track already has a teaching plan on the programme.',
        planId: existingPlan.id,
      };
    }

    const { error: archiveErr } = await db
      .from('lesson_plans')
      .update({
        status: 'archived',
        updated_at: new Date().toISOString(),
        metadata: {
          ...((existingPlan.metadata as Record<string, unknown>) ?? {}),
          programme_bridge_archived: {
            at: new Date().toISOString(),
            reason: input.forceRebuild
              ? 'force_rebuild'
              : `window_changed:${moduleWindowFingerprint(storedNumbers)}→${desiredFingerprint}`,
            previous_week_numbers: storedNumbers,
          },
        },
      })
      .eq('id', existingPlan.id);
    if (archiveErr) {
      return {
        track: title,
        courseId: course.id,
        status: 'failed',
        detail: `Could not archive the old plan before expanding: ${archiveErr.message}`,
        planId: existingPlan.id,
      };
    }
  }

  const topics = (input.track.topics ?? []).map(String).filter(Boolean);
  const weekCount = window.weekCount;
  const moduleDuration = window.range
    ? `Module · Weeks ${window.range.start}–${window.range.end} (${weekCount} teaching weeks)`
    : `Module · ${weekCount} teaching weeks`;

  let generated: any;
  try {
    const result = await generateAIContent({
      type: 'programme-curriculum',
      topic: title,
      course_name: course.title,
      programme_title: input.programmeTitle,
      topics,
      programme_weeks: window.weeks,
      week_count: weekCount,
      weeks_per_term: weekCount,
      week_numbers: window.weekNumbers,
      track_week_label: input.track.week,
      ages_label: input.page.ages_label,
      // Module length, not the full cohort label — otherwise the model pads
      // Generative Art across the whole 7-week Python-to-graduation calendar.
      duration_label: moduleDuration,
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

  const planWeeks = alignPlanWeeksToWindow(
    planWeeksFromCurriculum(generated),
    window.weekNumbers,
  );
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
    change_summary: `Built from the published ${input.programmeTitle} programme page (${moduleDuration}).`,
    content: generated,
    content_hash: `bridge-${input.offeringId}-${course.id}-${desiredFingerprint}-${Date.now()}`,
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
  // Only one direction per offering+course may be active — move the existing one.
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

  // Published, and automation on: weekly pipeline can run. auto_publish stays
  // off so every generated week waits for teacher approval.
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
      plan_data: {
        weeks: planWeeks,
        source: 'programme_page_bridge',
        module_window: desiredFingerprint,
      },
      metadata: {
        auto_generate_settings: {
          enabled: true,
          types: ['lessons', 'slides', 'flashcards', 'assignments', 'projects'],
          maxWeeksPerBatch: 1,
          prep_ahead_weeks: 1,
          auto_publish: false,
        },
        programme_bridge: {
          built_at: new Date().toISOString(),
          programme: input.programmeTitle,
          track: title,
          track_week_label: input.track.week ?? null,
          week_numbers: window.weekNumbers,
          window_fingerprint: desiredFingerprint,
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
    detail: `Curriculum and plan created for ${planWeeks.length} weeks (${desiredFingerprint || 'unscoped'}).`,
    releaseId: release.id,
    planId: plan.id,
    weeks: planWeeks.length,
  };
}

function extractWeekNumbersFromPlanData(planData: unknown): number[] {
  const weeks = (planData as { weeks?: Array<{ week?: number }> } | null)?.weeks;
  if (!Array.isArray(weeks)) return [];
  return weeks
    .map((w) => Number(w?.week))
    .filter((n) => Number.isFinite(n) && n > 0);
}
