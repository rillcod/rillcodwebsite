/**
 * Rillcod Academy — WAEC-Aligned Grading System
 *
 * Built for Nigerian secondary schools (JSS1–SS3) aligned with WAEC/NECO grading.
 * Weighted to reward active students who submit assignments, do projects,
 * attend class, and perform in assessments.
 *
 * Grade Scale (WAEC standard):
 *   A1  75–100   Distinction / Excellent
 *   B2  70–74    Very Good
 *   B3  65–69    Good
 *   C4  60–64    Credit
 *   C5  55–59    Credit
 *   C6  50–54    Credit
 *   D7  45–49    Pass
 *   E8  40–44    Pass (Marginal)
 *   F9  0–39     Fail
 */

// ── Grade Boundaries ─────────────────────────────────────────────────────────
export interface WAECGrade {
  code: string;       // A1, B2, B3, C4, C5, C6, D7, E8, F9
  label: string;      // Distinction, Very Good, etc.
  min: number;
  max: number;
  remark: string;
  color: string;      // Tailwind text colour class
  bgColor: string;    // Tailwind bg colour class
}

export const WAEC_GRADES: WAECGrade[] = [
  { code: 'A1', label: 'Distinction',  min: 75, max: 100, remark: 'Excellent — Outstanding performance', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  { code: 'B2', label: 'Very Good',    min: 70, max: 74,  remark: 'Very Good — Above average',          color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  { code: 'B3', label: 'Good',         min: 65, max: 69,  remark: 'Good — Solid understanding',         color: 'text-green-400',   bgColor: 'bg-green-500/10'   },
  { code: 'C4', label: 'Credit',       min: 60, max: 64,  remark: 'Credit — Satisfactory',              color: 'text-blue-400',    bgColor: 'bg-blue-500/10'    },
  { code: 'C5', label: 'Credit',       min: 55, max: 59,  remark: 'Credit — Satisfactory',              color: 'text-blue-400',    bgColor: 'bg-blue-500/10'    },
  { code: 'C6', label: 'Credit',       min: 50, max: 54,  remark: 'Credit — Minimum credit pass',       color: 'text-cyan-400',    bgColor: 'bg-cyan-500/10'    },
  { code: 'D7', label: 'Pass',         min: 45, max: 49,  remark: 'Pass — Below average',               color: 'text-amber-400',   bgColor: 'bg-amber-500/10'   },
  { code: 'E8', label: 'Pass',         min: 40, max: 44,  remark: 'Marginal Pass — Needs improvement',  color: 'text-orange-400',  bgColor: 'bg-orange-500/10'  },
  { code: 'F9', label: 'Fail',         min: 0,  max: 39,  remark: 'Fail — Must retake',                 color: 'text-rose-400',    bgColor: 'bg-rose-500/10'    },
];

// ── Score Components & Weights ───────────────────────────────────────────────
/**
 * Total must always sum to 100.
 * Designed to push students to be consistently active.
 *
 * Theory/Written Work   20 — pen-on-paper tests, theory tasks
 * Classwork             10 — in-class participation and exercises
 * Practical / Projects  25 — hands-on deliverables, showcase items
 * Assignments           20 — weekly homework, submitted tasks
 * Attendance            10 — showing up and being present matters
 * Mid-term Assessments  15 — Week 3 (1st) + Week 6 (2nd) combined
 */
export interface ScoreComponents {
  /** Pen-and-paper theory tests / written tasks (out of 100) */
  theory: number;
  /** In-class exercises and participation (out of 100) */
  classwork: number;
  /** Practical work, projects, deliverables (out of 100) */
  practical: number;
  /** Homework / weekly assignments submitted (out of 100) */
  assignments: number;
  /** Attendance percentage (0–100) */
  attendance: number;
  /** Average of Week 3 (1st assessment) + Week 6 (2nd assessment) scores (out of 100) */
  assessment: number;
}

export const SCORE_WEIGHTS: Record<keyof ScoreComponents, number> = {
  theory:      0.20,  // 20%
  classwork:   0.10,  // 10%
  practical:   0.25,  // 25%
  assignments: 0.20,  // 20%
  attendance:  0.10,  // 10%
  assessment:  0.15,  // 15%
};

// ── Activity Enforcement ─────────────────────────────────────────────────────
/**
 * Students must be ACTIVE to earn top grades.
 * If they skip assignments, a grade cap is applied.
 *
 * ≥ 80% assignments submitted → No cap (full grade possible)
 * 60–79%                      → Capped at B3 (68) — still credit
 * 40–59%                      → Capped at C6 (53) — minimum credit
 * < 40%                       → Capped at D7 (48) — borderline pass only
 */
export interface ActivityCap {
  minPct: number;   // minimum assignment submission % for this band
  maxScore: number; // score is capped at this value
  label: string;
  message: string;
}

export const ACTIVITY_CAPS: ActivityCap[] = [
  {
    minPct: 80,
    maxScore: 100,
    label: 'Active',
    message: 'Outstanding engagement — no cap applied.',
  },
  {
    minPct: 60,
    maxScore: 68,
    label: 'Moderate',
    message: 'Submit more assignments to unlock A1/B2 grades.',
  },
  {
    minPct: 40,
    maxScore: 53,
    label: 'Low',
    message: 'Low assignment completion — grade capped at C6. Catch up to improve.',
  },
  {
    minPct: 0,
    maxScore: 48,
    label: 'Inactive',
    message: 'Very few assignments submitted — grade capped at D7. Immediate action required.',
  },
];

// ── XP & Motivation System ───────────────────────────────────────────────────
export interface XPEvent {
  key: string;
  label: string;
  xp: number;
  description: string;
}

export const XP_EVENTS: XPEvent[] = [
  { key: 'assignment_submitted',      label: 'Assignment Submitted',     xp: 50,  description: 'You submitted an assignment on time' },
  { key: 'assignment_early',          label: 'Early Bird',               xp: 20,  description: 'Submitted 2+ days before deadline' },
  { key: 'project_submitted',         label: 'Project Delivered',        xp: 100, description: 'You completed and submitted a project' },
  { key: 'perfect_score',             label: 'Perfect Score!',           xp: 75,  description: 'Scored 100% on an assignment or quiz' },
  { key: 'assessment_passed',         label: 'Assessment Cleared',       xp: 60,  description: 'Passed a mid-term assessment' },
  { key: 'exam_cleared',              label: 'Exam Completed',           xp: 120, description: 'Completed the term examination' },
  { key: 'week_streak_3',             label: '3-Week Streak!',           xp: 80,  description: 'Active 3 weeks in a row — keep it up!' },
  { key: 'week_streak_6',             label: '6-Week Streak!',           xp: 150, description: 'Half-term hero — incredible consistency!' },
  { key: 'full_term',                 label: 'Term Champion!',           xp: 300, description: 'Zero missed assignments for the full term' },
  { key: 'attendance_perfect',        label: 'Perfect Attendance',       xp: 100, description: 'Attended every class this term' },
  { key: 'classwork_complete',        label: 'Classwork Hero',           xp: 30,  description: 'Completed all in-class exercises today' },
];

export interface Badge {
  key: string;
  label: string;
  icon: string;
  description: string;
  unlockCondition: string;
}

// Badge visual metadata — tier: 'bronze' | 'silver' | 'gold' | 'platinum'
// color: solid accent hex used in SVG + gradient background
export const BADGE_VISUAL: Record<string, { tier: string; color: string; bg: string; borderColor: string }> = {
  first_assignment: { tier: 'bronze',   color: '#f97316', bg: 'from-orange-600/20 to-orange-400/5',   borderColor: 'border-orange-500/40' },
  consistent_10:    { tier: 'silver',   color: '#8b5cf6', bg: 'from-violet-600/20 to-violet-400/5',   borderColor: 'border-violet-500/40' },
  project_master:   { tier: 'silver',   color: '#06b6d4', bg: 'from-cyan-600/20 to-cyan-400/5',       borderColor: 'border-cyan-500/40'   },
  term_champion:    { tier: 'gold',     color: '#f59e0b', bg: 'from-amber-600/20 to-amber-400/5',     borderColor: 'border-amber-500/40'  },
  ai_explorer:      { tier: 'silver',   color: '#10b981', bg: 'from-emerald-600/20 to-emerald-400/5', borderColor: 'border-emerald-500/40'},
  streak_hero:      { tier: 'gold',     color: '#f97316', bg: 'from-orange-600/25 to-rose-600/5',     borderColor: 'border-orange-500/50' },
  top_of_class:     { tier: 'platinum', color: '#06b6d4', bg: 'from-cyan-600/25 to-blue-600/5',       borderColor: 'border-cyan-400/60'   },
  showcase_ready:   { tier: 'gold',     color: '#ec4899', bg: 'from-pink-600/20 to-pink-400/5',       borderColor: 'border-pink-500/40'   },
  never_late:       { tier: 'silver',   color: '#3b82f6', bg: 'from-blue-600/20 to-blue-400/5',       borderColor: 'border-blue-500/40'   },
  nigeria_proud:    { tier: 'platinum', color: '#10b981', bg: 'from-emerald-600/25 to-green-600/5',   borderColor: 'border-emerald-400/60'},
};

export const BADGES: Badge[] = [
  { key: 'first_assignment', label: 'Initiator',       icon: 'INIT', description: 'First assignment submitted — the journey begins', unlockCondition: 'assignment_submitted (count: 1)' },
  { key: 'consistent_10',   label: 'Relentless',       icon: 'RLNT', description: '10 assignments completed — no shortcuts taken',   unlockCondition: 'assignment_submitted (count: 10)' },
  { key: 'project_master',  label: 'Architect',        icon: 'ARCH', description: '3 projects delivered — builder mindset proven',   unlockCondition: 'project_submitted (count: 3)' },
  { key: 'term_champion',   label: 'Flawless',         icon: 'FLWS', description: 'Perfect term — zero missed tasks',                unlockCondition: 'full_term' },
  { key: 'ai_explorer',     label: 'AI Native',        icon: 'AINV', description: 'AI integrated into 5 projects — future-ready',    unlockCondition: 'project_submitted with AI tag (count: 5)' },
  { key: 'streak_hero',     label: 'Iron Streak',      icon: 'IRON', description: '6 consecutive active weeks — unbreakable',        unlockCondition: 'week_streak_6' },
  { key: 'top_of_class',    label: 'Apex',             icon: 'APEX', description: 'Highest assessment score in cohort',              unlockCondition: 'highest assessment score in cohort' },
  { key: 'showcase_ready',  label: 'Showcase',         icon: 'SHWC', description: 'Project selected for school showcase display',    unlockCondition: 'project marked showcase_ready by teacher' },
  { key: 'never_late',      label: 'Punctual',         icon: 'PNCT', description: 'Full term — every submission on or before due',   unlockCondition: 'no late submissions in a term' },
  { key: 'nigeria_proud',   label: 'Naija Built',      icon: 'NAIJ', description: 'Nigerian real-world context in 3 projects',       unlockCondition: 'project with nigeria_context tag (count: 3)' },
];

// ── Calculation Functions ─────────────────────────────────────────────────────

/**
 * Get the activity cap that applies for a given assignment submission rate.
 */
export function getActivityCap(assignmentSubmissionPct: number): ActivityCap {
  for (const cap of ACTIVITY_CAPS) {
    if (assignmentSubmissionPct >= cap.minPct) return cap;
  }
  return ACTIVITY_CAPS[ACTIVITY_CAPS.length - 1];
}

/**
 * Compute the raw weighted score from score components.
 * Result is 0–100 (before activity cap).
 */
export function computeWeightedScore(scores: ScoreComponents): number {
  let total = 0;
  for (const [key, weight] of Object.entries(SCORE_WEIGHTS)) {
    const raw = scores[key as keyof ScoreComponents] ?? 0;
    const clamped = Math.max(0, Math.min(100, raw));
    total += clamped * weight;
  }
  return Math.round(total);
}

/**
 * Compute the final score after applying the activity enforcement cap.
 *
 * @param scores       - Raw component scores
 * @param assignmentSubmissionPct - 0–100: % of assignments the student submitted
 */
export function computeFinalScore(scores: ScoreComponents, assignmentSubmissionPct: number): {
  raw: number;
  capped: number;
  cap: ActivityCap;
  grade: WAECGrade;
} {
  const raw = computeWeightedScore(scores);
  const cap = getActivityCap(assignmentSubmissionPct);
  const capped = Math.min(raw, cap.maxScore);
  const grade = getWAECGrade(capped);
  return { raw, capped, cap, grade };
}

/**
 * Look up the WAEC grade for a given numeric score.
 */
export function getWAECGrade(score: number): WAECGrade {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return WAEC_GRADES.find(g => clamped >= g.min && clamped <= g.max) ?? WAEC_GRADES[WAEC_GRADES.length - 1];
}

/**
 * Get a motivational message for a student based on their current state.
 */
export function getMotivationMessage(
  score: number,
  assignmentPct: number,
  streakWeeks: number
): string {
  if (streakWeeks >= 6) return "🔥 6-week streak! You're unstoppable. Keep this energy!";
  if (streakWeeks >= 3) return "⚡ 3-week streak! Consistency is your superpower.";
  if (assignmentPct < 40) return "⚠️ You've missed too many assignments. Submit now to lift your grade!";
  if (assignmentPct < 60) return "📝 Good start! Submit more assignments to unlock higher grades.";
  if (score >= 75) return "🌟 Distinction zone! Maintain this standard and make your school proud.";
  if (score >= 60) return "✅ You're on Credit territory. Push a little more for Distinction!";
  if (score >= 50) return "💪 Credit achieved! Stay consistent to move up.";
  if (score >= 40) return "🎯 You're passing. Engage more with assignments to rise higher.";
  return "📚 Don't give up — every assignment submitted is a step forward. Start today!";
}

/**
 * Compute the assignment submission percentage from a list of assignments.
 */
export function computeAssignmentSubmissionPct(
  totalAssignments: number,
  submittedCount: number
): number {
  if (totalAssignments === 0) return 100; // no assignments = no penalty
  return Math.round((submittedCount / totalAssignments) * 100);
}

/**
 * Format a score number for display — always 2 decimal places if needed.
 */
export function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

// ── Score Display Helpers ─────────────────────────────────────────────────────

/**
 * Get a display-friendly label for a score component key.
 */
export const COMPONENT_LABELS: Record<keyof ScoreComponents, string> = {
  theory:      'Theory / Written',
  classwork:   'Classwork',
  practical:   'Practical / Projects',
  assignments: 'Assignments',
  attendance:  'Attendance',
  assessment:  'Mid-term Assessments',
};

export const COMPONENT_DESCRIPTIONS: Record<keyof ScoreComponents, string> = {
  theory:      'Pen-and-paper written tests and theory tasks (20%)',
  classwork:   'In-class exercises and active participation (10%)',
  practical:   'Hands-on projects, lab work, and deliverables (25%)',
  assignments: 'Weekly homework and submitted assignment tasks (20%)',
  attendance:  'Punctual attendance and class presence (10%)',
  assessment:  'Week 3 (1st) and Week 6 (2nd) mid-term assessments (15%)',
};
