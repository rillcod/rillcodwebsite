/**
 * Skills a learner has actually demonstrated, and the milestones that mark it.
 *
 * Points say how much someone did. They say nothing about what they can now do,
 * which is the thing a learner, a parent and a teacher all actually want to
 * know. This module answers that from evidence already in the platform — the
 * `learning_outcomes` attached to assignments and exams — rather than inventing
 * a skills taxonomy nobody maintains.
 *
 * On badges: the platform had three tables. `badges` + `user_badges` (a
 * catalogue plus a join) is what the award API writes; `student_badges`
 * (self-describing: key, label, icon) is what every student, parent and
 * dashboard surface reads. So a badge that was awarded could never be seen. All
 * three were empty, so there is nothing to migrate and no reason to keep two
 * shapes: milestones here describe themselves, in the shape the displays
 * already read.
 */

/** A skill counts as demonstrated only on work that was actually assessed. */
export type SkillEvidence = {
  /** The outcome text carried by the assignment or exam. */
  outcome: string;
  /** Percentage scored on that piece of work, 0-100. */
  score: number | null;
  when: string | null;
};

export type SkillLevel = 'introduced' | 'practising' | 'confident';

export type Skill = {
  name: string;
  level: SkillLevel;
  /** How many separate pieces of assessed work show this skill. */
  timesShown: number;
  /** Best score achieved on work carrying it. */
  bestScore: number | null;
  lastShown: string | null;
};

/**
 * A pass. Below this the work does not evidence the skill, it evidences an
 * attempt — counting it would tell a learner they can do something they cannot.
 */
export const PASS_MARK = 50;

/** Two solid showings is practising; three with a strong mark is confident. */
export const CONFIDENT_MARK = 70;

function tidyOutcome(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').replace(/[.;]+$/, '');
}

/**
 * Grouping key for an outcome.
 *
 * Case-insensitive on purpose: outcomes are typed by hand across assignments
 * and exams, so the same skill arrives as "Loops and Repetition" on one and
 * "Loops and repetition" on another. Keyed by the visible text they would split
 * into two half-evidenced skills, and neither would ever reach confident.
 */
function outcomeKey(raw: string): string {
  return tidyOutcome(raw).toLowerCase();
}

/**
 * Roll evidence up per skill.
 *
 * Deliberately ignores unscored work: an assignment submitted but never graded
 * proves nothing yet, and treating it as evidence is how a learner ends up
 * being told they are confident at something no one has checked.
 */
export function skillsFromEvidence(evidence: readonly SkillEvidence[]): Skill[] {
  const byName = new Map<string, { label: string; scores: number[]; last: string | null }>();

  for (const item of evidence) {
    if (!item?.outcome) continue;
    if (item.score === null || item.score === undefined) continue;
    if (!Number.isFinite(item.score)) continue;
    if (item.score < PASS_MARK) continue;

    const label = tidyOutcome(item.outcome);
    const key = outcomeKey(item.outcome);
    if (!key) continue;

    const entry = byName.get(key) ?? { label, scores: [], last: null };
    entry.scores.push(item.score);
    if (item.when && (!entry.last || item.when > entry.last)) entry.last = item.when;
    byName.set(key, entry);
  }

  return [...byName.values()]
    .map((entry) => {
      const name = entry.label;
      const timesShown = entry.scores.length;
      const bestScore = entry.scores.length ? Math.max(...entry.scores) : null;
      let level: SkillLevel = 'introduced';
      if (timesShown >= 3 && (bestScore ?? 0) >= CONFIDENT_MARK) level = 'confident';
      else if (timesShown >= 2) level = 'practising';
      return { name, level, timesShown, bestScore, lastShown: entry.last };
    })
    .sort((a, b) => b.timesShown - a.timesShown || a.name.localeCompare(b.name));
}

/** One line a parent can read without knowing anything about the platform. */
export function skillsSummary(skills: readonly Skill[]): string {
  if (skills.length === 0) return 'No skills evidenced yet — graded work will show them here.';
  const confident = skills.filter((s) => s.level === 'confident').length;
  const practising = skills.filter((s) => s.level === 'practising').length;
  const parts: string[] = [];
  if (confident) parts.push(`${confident} confident`);
  if (practising) parts.push(`${practising} practising`);
  const rest = skills.length - confident - practising;
  if (rest) parts.push(`${rest} just started`);
  return `${skills.length} skill${skills.length === 1 ? '' : 's'} evidenced — ${parts.join(', ')}.`;
}

// ── Milestones ───────────────────────────────────────────────────────────────

export type MilestoneKey =
  | 'first_lesson'
  | 'first_assignment'
  | 'first_quiz_passed'
  | 'first_project'
  | 'three_skills'
  | 'week_streak'
  | 'ten_lessons'
  | 'confident_skill';

export type Milestone = {
  key: MilestoneKey;
  label: string;
  icon: string;
  /** Beginner milestones must be reachable in the first sessions. */
  stage: 'beginner' | 'intermediate';
  /** What earns it, in the learner's words. */
  how: string;
};

/**
 * The ladder, front-loaded.
 *
 * Four of the eight are reachable in a learner's first week — finishing one
 * lesson, handing in one piece of work, passing one quiz, saving one project.
 * A scheme whose first reward takes a term is a scheme nobody sees.
 */
export const MILESTONES: readonly Milestone[] = [
  { key: 'first_lesson', label: 'First Lesson', icon: '📘', stage: 'beginner', how: 'Finish your first lesson' },
  { key: 'first_assignment', label: 'First Hand-In', icon: '📝', stage: 'beginner', how: 'Submit your first assignment' },
  { key: 'first_quiz_passed', label: 'First Quiz Passed', icon: '✅', stage: 'beginner', how: 'Pass a quiz' },
  { key: 'first_project', label: 'First Project', icon: '🛠️', stage: 'beginner', how: 'Save your first project to your portfolio' },
  { key: 'ten_lessons', label: 'Ten Lessons', icon: '📚', stage: 'intermediate', how: 'Finish ten lessons' },
  { key: 'week_streak', label: 'Seven Day Streak', icon: '🔥', stage: 'intermediate', how: 'Work seven days in a row' },
  { key: 'three_skills', label: 'Three Skills', icon: '🎯', stage: 'intermediate', how: 'Evidence three different skills' },
  { key: 'confident_skill', label: 'Confident In A Skill', icon: '🌟', stage: 'intermediate', how: 'Show one skill three times, scoring 70 or more' },
] as const;

export type LearnerActivity = {
  lessonsCompleted: number;
  assignmentsSubmitted: number;
  quizzesPassed: number;
  portfolioProjects: number;
  currentStreak: number;
  skills: readonly Skill[];
};

/** Milestones the learner has earned, given where they are now. */
export function earnedMilestones(activity: LearnerActivity): Milestone[] {
  const confident = activity.skills.filter((s) => s.level === 'confident').length;
  const earned = new Set<MilestoneKey>();

  if (activity.lessonsCompleted >= 1) earned.add('first_lesson');
  if (activity.lessonsCompleted >= 10) earned.add('ten_lessons');
  if (activity.assignmentsSubmitted >= 1) earned.add('first_assignment');
  if (activity.quizzesPassed >= 1) earned.add('first_quiz_passed');
  if (activity.portfolioProjects >= 1) earned.add('first_project');
  if (activity.currentStreak >= 7) earned.add('week_streak');
  if (activity.skills.length >= 3) earned.add('three_skills');
  if (confident >= 1) earned.add('confident_skill');

  return MILESTONES.filter((m) => earned.has(m.key));
}

/**
 * The next milestone to aim for — beginner ones first, so someone starting out
 * is never shown an intermediate target they cannot reach yet.
 */
export function nextMilestone(activity: LearnerActivity): Milestone | null {
  const earned = new Set(earnedMilestones(activity).map((m) => m.key));
  const remaining = MILESTONES.filter((m) => !earned.has(m.key));
  return remaining.find((m) => m.stage === 'beginner') ?? remaining[0] ?? null;
}
