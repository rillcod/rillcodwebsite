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
import { inferClassGradeAnchor, nextSingleGrade, resolveStudentPromotionGrade } from '@/lib/classes/class-promotion';
import { isYoungToTeenBridge, TEEN_PROGRAMME, YOUNG_PROGRAMME } from '@/lib/classes/programme-transition';

export type SessionPromotionTrackId = 'young_to_teen' | 'jss_to_ss';

/** Category cross vs grade step inside Teen category. */
export type SessionPromotionKind = 'category_change' | 'teen_grade_step';

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
  young_to_teen: {
    id: 'young_to_teen',
    kind: 'category_change',
    label: 'Into Teen Developers category',
    short_label: 'Basic 6 → JSS 1',
    exit_grade: 'Basic 6',
    destination_grade: 'JSS 1',
    menu_hint: 'Young → Teen category',
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

export function isBasic56SectionBand(band: CanonicalBand | null): boolean {
  if (!band || band.lvl !== 'Basic') return false;
  return (band.low === 6 && band.high === 6) || (band.low === 5 && band.high === 6);
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

  if (trackId === 'young_to_teen') {
    if (programme !== YOUNG_PROGRAMME) return false;
    if (anchor === 'Basic 6') return true;
    return isBasic56SectionBand(band);
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
): boolean {
  const track = SESSION_PROMOTION_TRACKS[trackId];
  const grade = resolveStudentPromotionGrade(student, classAnchor);
  if (grade !== track.exit_grade) return false;
  const next = nextSingleGrade(grade);
  return next === track.destination_grade;
}

export type SchoolTrackDue = {
  track_id: SessionPromotionTrackId;
  due_count: number;
  class_count: number;
};

export type SchoolPromotionDueRow = {
  school_id: string;
  school_name: string | null;
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
    schools: rows.filter((s) => s.tracks.some((t) => t.due_count > 0)),
  };
}

export function classEligibleForTeenGraduation(cls: Parameters<typeof classEligibleForSessionTrack>[1]): boolean {
  return classEligibleForSessionTrack('young_to_teen', cls);
}

export function studentDueForTeenGraduation(
  student: { grade?: string | null },
  classAnchor: string | null,
): boolean {
  return studentDueForSessionTrack('young_to_teen', student, classAnchor);
}
