/**
 * Session bulk promotion — when the periodic school-wide tool applies.
 *
 * Product split (do not conflate):
 * - **Programme category** — Young Innovators vs Teen Developers (Teen is a category).
 * - **Session promotion** — end-of-term class + grade placement (this module).
 * - **Program speed** — moving faster through the curriculum at the *same* grade/class
 *   (Learner Progress, or per-class Smart promote with curriculum on). Never session bulk.
 *
 * Student grade on file wins over class name (e.g. JSS 3 in a mis-labelled "SS 2" class).
 */

import {
  canonicalGrade,
  canonicalTier,
  inferProgramme,
  parseBandLabel,
  parseGrades,
  type CanonicalBand,
} from '@/lib/classes/naming';
import {
  inferClassGradeAnchor,
  nextPromotionGrade,
  resolveStudentPromotionGrade,
} from '@/lib/classes/class-promotion';
import { isYoungToTeenBridge, TEEN_PROGRAMME, YOUNG_PROGRAMME } from '@/lib/classes/programme-transition';
import {
  DEFAULT_SCHOOL_SESSION_PROMOTION_POLICY,
  type SchoolSessionPromotionPolicy,
} from '@/lib/classes/session-promotion-policy';

export type SessionPromotionTrackId = 'basic5_to_6' | 'young_to_teen' | 'jss_to_ss';

/** Category cross vs grade step inside a programme category. */
export type SessionPromotionKind = 'young_grade_step' | 'category_change' | 'teen_grade_step';

export type SessionPromotionTrack = {
  id: SessionPromotionTrackId;
  kind: SessionPromotionKind;
  label: string;
  short_label: string;
  exit_grade: string;
  destination_grade: string;
  menu_hint: string;
  /** Session bulk never advances curriculum — program speed is a separate path. */
  placement_only: true;
};

export const SESSION_PROMOTION_TRACKS: Record<SessionPromotionTrackId, SessionPromotionTrack> = {
  basic5_to_6: {
    id: 'basic5_to_6',
    kind: 'young_grade_step',
    label: 'Young Innovators · Basic 5 → Basic 6',
    short_label: 'Basic 5 → Basic 6',
    exit_grade: 'Basic 5',
    destination_grade: 'Basic 6',
    menu_hint: 'Basic 5 moving up within Young',
    placement_only: true,
  },
  young_to_teen: {
    id: 'young_to_teen',
    kind: 'category_change',
    label: 'Into Teen Developers category',
    short_label: 'Basic 6 → JSS 1',
    exit_grade: 'Basic 6',
    destination_grade: 'JSS 1',
    menu_hint: 'Basic 6 → Teen category',
    placement_only: true,
  },
  jss_to_ss: {
    id: 'jss_to_ss',
    kind: 'teen_grade_step',
    label: 'Teen category · junior to senior',
    short_label: 'JSS 3 → SS 1',
    exit_grade: 'JSS 3',
    destination_grade: 'SS 1',
    menu_hint: 'JSS 3 → SS 1 (still Teen)',
    placement_only: true,
  },
};

export function activeSessionTrackIds(
  policy: SchoolSessionPromotionPolicy,
): SessionPromotionTrackId[] {
  return policy.young_to_teen_exit_grade === 'Basic 6'
    ? ['basic5_to_6', 'young_to_teen', 'jss_to_ss']
    : ['young_to_teen', 'jss_to_ss'];
}

/** Resolve dynamic labels and grades from the school's policy. */
export function resolveSessionTrack(
  trackId: SessionPromotionTrackId,
  policy: SchoolSessionPromotionPolicy = DEFAULT_SCHOOL_SESSION_PROMOTION_POLICY,
): SessionPromotionTrack {
  const base = SESSION_PROMOTION_TRACKS[trackId];
  if (trackId !== 'young_to_teen') return base;
  const exit = policy.young_to_teen_exit_grade;
  return {
    ...base,
    exit_grade: exit,
    short_label: `${exit} → JSS 1`,
    label: `Young Innovators · ${exit} → JSS 1 (Teen Developers)`,
    menu_hint: `${exit} → Teen category`,
  };
}

/** Default smart options for the periodic session tool — class placement only. */
export const SESSION_BULK_SMART_DEFAULTS = {
  smart_mode: true,
  strict_class_gate: false,
  advance_curriculum: 'never' as const,
};

export function sessionTrackForBridge(
  fromGrade: string | null | undefined,
  toGrade: string | null | undefined,
): SessionPromotionTrack | null {
  if (isYoungToTeenBridge(fromGrade, toGrade)) return SESSION_PROMOTION_TRACKS.young_to_teen;
  if (canonicalGrade(fromGrade) === 'JSS 3' && canonicalGrade(toGrade) === 'SS 1') {
    return SESSION_PROMOTION_TRACKS.jss_to_ss;
  }
  return null;
}

/** Basic 5, Basic 6, or Basic 5–6 — not wider bands like Basic 4–6. */
export function isBasic5Or6SectionBand(band: CanonicalBand | null): boolean {
  if (!band || band.lvl !== 'Basic') return false;
  if (band.low === 5 && band.high === 5) return true;
  if (band.low === 6 && band.high === 6) return true;
  if (band.low === 5 && band.high === 6) return true;
  return false;
}

function isYoungBasic56Class(cls: {
  qa_grade_key?: string | null;
  qa_grade_band?: string | null;
  name?: string | null;
  program_name?: string | null;
}): boolean {
  if (classProgramme(cls) !== YOUNG_PROGRAMME) return false;
  const anchor = canonicalGrade(inferClassGradeAnchor(cls));
  if (anchor === 'Basic 5' || anchor === 'Basic 6') return true;
  const band =
    parseBandLabel(cls.qa_grade_band)
    ?? parseBandLabel(cls.qa_grade_key)
    ?? parseBandLabel(cls.name);
  return isBasic5Or6SectionBand(band);
}

/** JSS 3 or JSS 1–3 / JSS 2–3 — top of junior secondary. */
export function isJssExitSectionBand(band: CanonicalBand | null): boolean {
  if (!band || band.lvl !== 'JSS') return false;
  if (band.low === 3 && band.high === 3) return true;
  if (band.low === 2 && band.high === 3) return true;
  if (band.low === 1 && band.high === 3) return true;
  return false;
}

function classProgramme(cls: {
  program_name?: string | null;
  name?: string | null;
}): string {
  return canonicalTier(cls.program_name) ?? inferProgramme(cls.name, parseGrades(cls.name));
}

export function classEligibleForSessionTrack(
  trackId: SessionPromotionTrackId,
  cls: {
    qa_grade_key?: string | null;
    qa_grade_band?: string | null;
    name?: string | null;
    program_name?: string | null;
  },
): boolean {
  const programme = classProgramme(cls);
  const anchor = canonicalGrade(inferClassGradeAnchor(cls));
  const band =
    parseBandLabel(cls.qa_grade_band)
    ?? parseBandLabel(cls.qa_grade_key)
    ?? parseBandLabel(cls.name);

  if (trackId === 'basic5_to_6' || trackId === 'young_to_teen') {
    return isYoungBasic56Class(cls);
  }

  if (trackId === 'jss_to_ss') {
    if (programme !== TEEN_PROGRAMME) return false;
    if (anchor === 'JSS 3') return true;
    return isJssExitSectionBand(band);
  }

  return false;
}

/** Learner at the exit grade for this session track (grade on file wins over class label). */
export function studentDueForSessionTrack(
  trackId: SessionPromotionTrackId,
  student: { grade?: string | null },
  classAnchor: string | null,
  policy: SchoolSessionPromotionPolicy = DEFAULT_SCHOOL_SESSION_PROMOTION_POLICY,
): boolean {
  if (trackId === 'basic5_to_6' && policy.young_to_teen_exit_grade !== 'Basic 6') return false;
  const track = resolveSessionTrack(trackId, policy);
  const grade = resolveStudentPromotionGrade(student, classAnchor);
  if (grade !== track.exit_grade) return false;
  const next = nextPromotionGrade(grade, policy.young_to_teen_exit_grade);
  return next === track.destination_grade;
}

export type SchoolTrackDue = {
  track_id: SessionPromotionTrackId;
  short_label: string;
  due_count: number;
  class_count: number;
};

export type SchoolPromotionDueRow = {
  school_id: string;
  school_name: string | null;
  young_to_teen_exit_grade: SchoolSessionPromotionPolicy['young_to_teen_exit_grade'];
  tracks: SchoolTrackDue[];
};

export type PromotionDueSnapshot = {
  show_menu: boolean;
  total_due: number;
  schools: SchoolPromotionDueRow[];
};

export function mergeTrackDue(rows: SchoolPromotionDueRow[]): PromotionDueSnapshot {
  const total_due = rows.reduce(
    (n, s) => n + s.tracks.reduce((m, t) => m + t.due_count, 0),
    0,
  );
  return {
    show_menu: total_due > 0,
    total_due,
    schools: rows,
  };
}
