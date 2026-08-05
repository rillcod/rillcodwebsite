/**
 * Builds teaching plans from a special programme's published page.
 *
 * Shared by the admin bridge route and the publish→launch pipeline so the two
 * cannot drift. The page write-up is the source of truth; each track is scoped
 * to its own module window (see resolveTrackTeachingWindow).
 */
import {
  bridgeTrack,
  matchTrackToCourse,
  resolveTrackTeachingWindow,
  type BridgeOutcome,
  type PageContent,
} from '@/lib/academic/programme-bridge';

type AnySupabase = any;

export type BridgeOfferingResult = {
  offeringId: string;
  programme: string;
  built: number;
  skipped: number;
  failed: number;
  results: BridgeOutcome[];
  dry_run?: boolean;
  tracks_preview?: Array<Record<string, unknown>>;
  error?: string;
  detail?: string;
};

async function resolveSchoolId(
  db: AnySupabase,
  offeringId: string,
  offeringSchoolId: string | null,
): Promise<string | null> {
  if (offeringSchoolId) return offeringSchoolId;

  // Only trust a school already attached to this offering's classes — never
  // guess from a name match (that stamped the wrong school permanently).
  const { data: klass } = await db
    .from('classes')
    .select('school_id')
    .eq('academic_offering_id', offeringId)
    .not('school_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return klass?.school_id ? String(klass.school_id) : null;
}

async function resolveCourses(
  db: AnySupabase,
  programmeId: string | null,
  tracks: Array<{ title?: string }>,
): Promise<Array<{ id: string; title: string }>> {
  // Require an explicit programme link. Fuzzy-matching against every course in
  // the platform is how a track can bleed onto the wrong syllabus.
  if (!programmeId) return [];

  const { data } = await db
    .from('courses')
    .select('id,title')
    .eq('program_id', programmeId);
  return (data ?? []).map((c: any) => ({ id: c.id, title: c.title }));
}

/**
 * Bridge every track on the offering's linked programme page into
 * curriculum → direction → plan.
 */
export async function bridgeOfferingFromPage(
  db: AnySupabase,
  input: {
    offeringId: string;
    createdBy: string;
    dryRun?: boolean;
    /** Archive every live track plan and rebuild from the page. */
    forceRebuild?: boolean;
    /**
     * When a module's week window on the page no longer matches the plan
     * (e.g. Weeks 1–2 → 1–3), archive and rebuild that track. Default true.
     */
    rebuildOnWindowChange?: boolean;
  },
): Promise<BridgeOfferingResult> {
  const {
    offeringId,
    createdBy,
    dryRun = false,
    forceRebuild = false,
    rebuildOnWindowChange = true,
  } = input;

  const { data: offering } = await db
    .from('academic_offerings')
    .select('id,title,academic_model,status,programme_id,school_id')
    .eq('id', offeringId)
    .maybeSingle();

  if (!offering) {
    return {
      offeringId,
      programme: '',
      built: 0,
      skipped: 0,
      failed: 0,
      results: [],
      error: 'Programme not found.',
    };
  }

  if (offering.academic_model && offering.academic_model !== 'duration_programme') {
    return {
      offeringId,
      programme: String(offering.title),
      built: 0,
      skipped: 0,
      failed: 0,
      results: [],
      error: 'This bridge is for duration programmes only.',
      detail: 'A school-term offering builds its curriculum through the academic office.',
    };
  }

  const { data: page } = await db
    .from('special_program_pages')
    .select('title,content,program_id,academic_offering_id')
    .eq('academic_offering_id', offeringId)
    .maybeSingle();

  const content = (page?.content ?? {}) as PageContent;
  const tracks = Array.isArray(content.tracks) ? content.tracks : [];
  if (!tracks.length) {
    return {
      offeringId,
      programme: String(offering.title),
      built: 0,
      skipped: 0,
      failed: 0,
      results: [],
      error: 'This programme has no published page content to build from.',
      detail: 'The page needs its tracks and week spine before a curriculum can be written.',
    };
  }

  const programmeId =
    (offering.programme_id as string | null) ??
    (page?.program_id as string | null) ??
    null;
  const schoolId = await resolveSchoolId(
    db,
    offeringId,
    (offering.school_id as string | null) ?? null,
  );

  if (!schoolId) {
    return {
      offeringId,
      programme: String(offering.title),
      built: 0,
      skipped: 0,
      failed: 0,
      results: [],
      error: 'This programme must sit on a school before teaching can be built.',
      detail: 'Set the offering school, or create a cohort class on this programme first.',
    };
  }

  if (!programmeId) {
    return {
      offeringId,
      programme: String(offering.title),
      built: 0,
      skipped: 0,
      failed: 0,
      results: [],
      error: 'This programme page must link a programme (program_id) before teaching can be built.',
      detail: 'Without that link, tracks cannot safely match courses and could bleed onto the wrong syllabus.',
    };
  }

  // Persist soft-resolved anchors so the next launch and onboard find them.
  const offeringPatch: Record<string, unknown> = {};
  if (!offering.school_id && schoolId) offeringPatch.school_id = schoolId;
  if (!offering.programme_id && programmeId) offeringPatch.programme_id = programmeId;
  if (Object.keys(offeringPatch).length) {
    offeringPatch.updated_at = new Date().toISOString();
    await db.from('academic_offerings').update(offeringPatch).eq('id', offeringId);
  }

  const courseList = await resolveCourses(db, programmeId, tracks);
  if (!courseList.length) {
    return {
      offeringId,
      programme: String(offering.title),
      built: 0,
      skipped: 0,
      failed: 0,
      results: [],
      error: 'No courses found on the linked programme.',
      detail: 'Add courses that match the page track titles, then launch again.',
    };
  }
  const { data: period } = await db
    .from('academic_offering_periods')
    .select('id,starts_on')
    .eq('offering_id', offeringId)
    .order('sequence_number', { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: klass } = await db
    .from('classes')
    .select('id')
    .eq('academic_offering_id', offeringId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (dryRun) {
    return {
      offeringId,
      programme: String(offering.title),
      built: 0,
      skipped: 0,
      failed: 0,
      results: [],
      dry_run: true,
      tracks_preview: tracks.map((t) => {
        const match = matchTrackToCourse(String(t.title ?? ''), courseList);
        const window = resolveTrackTeachingWindow(t, content);
        return {
          track: t.title ?? '(untitled)',
          topics: (t.topics ?? []).length,
          matched_course: match?.title ?? null,
          module_label: t.week ?? null,
          teaching_weeks: window.weekNumbers,
          week_count: window.weekCount,
          spine_titles: window.weeks.map((w) => w.title ?? w.num ?? ''),
        };
      }),
    };
  }

  const results: BridgeOutcome[] = [];
  for (const track of tracks) {
    results.push(
      await bridgeTrack(db, {
        track,
        page: content,
        programmeTitle: String(offering.title),
        offeringId,
        offeringPeriodId: period?.id ?? null,
        schoolId,
        classId: klass?.id ?? null,
        createdBy,
        courses: courseList,
        forceRebuild,
        rebuildOnWindowChange,
      }),
    );
  }

  return {
    offeringId,
    programme: String(offering.title),
    built: results.filter((r) => r.status === 'built').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    failed: results.filter((r) => r.status === 'failed').length,
    results,
  };
}

/** True when this save is the launch moment (draft → published). */
export function shouldLaunchTeachingOnPublish(input: {
  wasPublished: boolean;
  nowPublished: boolean;
}): boolean {
  return input.nowPublished === true && input.wasPublished !== true;
}
