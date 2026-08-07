/**
 * What a learner earns, what level it puts them on, and what to do next.
 *
 * The old scheme rewarded being present rather than learning, and put the first
 * level-up 500 points away — fifty lessons at ten points each. A beginner saw a
 * number go up and nothing else happen for a term, which is why it reads as
 * noise. This module is the whole scheme in one place: the earn rules, the
 * ladder, and the sentence that tells someone what to do next.
 *
 * Three principles:
 *
 *  1. Reward learning, not attendance. Opening the app is not an achievement.
 *  2. The first rung must be reachable in the first week, or it motivates
 *     nobody. Later rungs stretch out for learners who keep going.
 *  3. A number on its own is not feedback. "You are 3 lessons from Silver" is.
 */

/** Things a learner can actually do that we award for. */
export type ActivityType =
  | 'lesson_complete'
  | 'assignment_submit'
  | 'quiz_pass'
  | 'discussion_post';

/**
 * Points per activity.
 *
 * `daily_login` used to sit here at 10 points. It was never awarded by any code
 * path — dead config — and it should not come back: paying a learner for
 * opening the app rewards attendance and inflates the streak of someone who has
 * learned nothing.
 *
 * `assignment_submit` dropped from 25 to 15. Submitting is the start of the
 * work, not the finish; the remaining value is meant to come from being graded
 * well, which is worth more than turning something in.
 */
export const POINTS: Record<ActivityType, number> = {
  lesson_complete: 10,
  assignment_submit: 15,
  quiz_pass: 50,
  discussion_post: 5,
};

/**
 * Discussion posts are the one activity a learner can repeat freely, so they
 * are the one that can be farmed: each post has its own reference id, so
 * idempotency does not stop a hundred one-word replies. Beyond this many in a
 * day the posts still stand, they just stop paying.
 */
export const DISCUSSION_DAILY_CAP = 3;

export type LevelName = 'Bronze' | 'Silver' | 'Gold' | 'Platinum';

export type Level = {
  /** Stored value. The database constrains this column to these four. */
  name: LevelName;
  /**
   * What the learner is called on screen.
   *
   * The dashboard had a second ladder — Nehemiah Builder, Gideon Scout, Joshua
   * Commander, Solomon Sage — kept in its own table with its own thresholds, so
   * one screen showed two level names and two progress bars for the same work.
   * The names are the school's own and worth keeping; the second engine is not.
   * They are titles on this ladder now, not a rival one.
   */
  title: string;
  icon: string;
  at: number;
  /** What reaching it says about the learner, in their own terms. */
  meaning: string;
};

/**
 * The ladder.
 *
 * Thresholds were 0 / 500 / 2000 / 5000. Silver alone was fifty lessons, so in
 * practice every learner was Bronze forever — the live table had one row and it
 * said Bronze. These are set so the first rung lands inside the first week of
 * real work (two quizzes, or a quiz with a few lessons), then widens.
 */
export const LEVELS: readonly Level[] = [
  { name: 'Bronze', title: 'Nehemiah Builder', icon: '🧱', at: 0, meaning: 'Getting started' },
  { name: 'Silver', title: 'Gideon Scout', icon: '🏹', at: 100, meaning: 'Finding your feet' },
  { name: 'Gold', title: 'Joshua Commander', icon: '🛡️', at: 400, meaning: 'Working steadily' },
  { name: 'Platinum', title: 'Solomon Sage', icon: '👑', at: 1200, meaning: 'Going well beyond the set work' },
] as const;

export function levelDetail(points: number): Level {
  const name = levelFor(points);
  return LEVELS.find((l) => l.name === name) ?? LEVELS[0];
}

export function levelFor(points: number): LevelName {
  const safe = Number.isFinite(points) ? Math.max(0, points) : 0;
  let current: LevelName = LEVELS[0].name;
  for (const level of LEVELS) if (safe >= level.at) current = level.name;
  return current;
}

export type Progress = {
  points: number;
  level: LevelName;
  /** The school's own name for this level — what the learner is shown. */
  levelTitle: string;
  levelIcon: string;
  levelMeaning: string;
  /** Null at the top of the ladder. */
  nextLevel: LevelName | null;
  nextLevelTitle: string | null;
  pointsToNextLevel: number;
  /** 0-100 through the current band; 100 when there is nothing above. */
  percentToNextLevel: number;
};

export function progressFor(points: number): Progress {
  const safe = Number.isFinite(points) ? Math.max(0, Math.floor(points)) : 0;
  const index = LEVELS.reduce((found, level, i) => (safe >= level.at ? i : found), 0);
  const current = LEVELS[index];
  const next = LEVELS[index + 1] ?? null;

  const base = {
    points: safe,
    level: current.name,
    levelTitle: current.title,
    levelIcon: current.icon,
    levelMeaning: current.meaning,
  };

  if (!next) {
    return {
      ...base,
      nextLevel: null,
      nextLevelTitle: null,
      pointsToNextLevel: 0,
      percentToNextLevel: 100,
    };
  }

  const span = next.at - current.at;
  const gained = safe - current.at;
  return {
    ...base,
    nextLevel: next.name,
    nextLevelTitle: next.title,
    pointsToNextLevel: next.at - safe,
    percentToNextLevel: Math.max(0, Math.min(100, Math.round((gained / span) * 100))),
  };
}

/**
 * The next thing worth doing, said plainly.
 *
 * Deliberately names one action rather than listing every option: a beginner
 * looking at four choices and a points table is being given homework about the
 * points system. It picks the cheapest honest route to the next level, so the
 * suggestion is always achievable rather than aspirational.
 */
export function nextStep(points: number): string {
  const progress = progressFor(points);
  if (!progress.nextLevel) return 'You have reached the top level — keep going to stay there.';

  const need = progress.pointsToNextLevel;
  const quizzes = Math.ceil(need / POINTS.quiz_pass);
  const lessons = Math.ceil(need / POINTS.lesson_complete);

  // Smallest honest action first. A couple of lessons is better advice than
  // "pass a quiz" when the gap is 20 points, even though one quiz would also
  // clear it — the point is to name something the learner can finish today.
  const target = progress.nextLevelTitle ?? progress.nextLevel;
  if (lessons <= 3) return `Finish ${lessons} more lesson${lessons === 1 ? '' : 's'} to become ${target}.`;
  if (quizzes === 1) return `Pass one quiz to become ${target}.`;
  return `Pass ${quizzes} quizzes — or finish ${lessons} lessons — to become ${target}.`;
}

/**
 * Points for one activity, given how much of it the learner has already done
 * today. Returns 0 when a daily cap is spent, so the action still succeeds and
 * simply stops paying.
 */
export function pointsForActivity(
  activity: ActivityType,
  opts: { alreadyToday?: number } = {},
): number {
  const base = POINTS[activity] ?? 0;
  if (activity !== 'discussion_post') return base;
  return (opts.alreadyToday ?? 0) >= DISCUSSION_DAILY_CAP ? 0 : base;
}

/**
 * A streak counts days of real work, and only moves forward one day at a time.
 *
 * Kept here beside the earn rules so "what counts as activity" has one
 * definition. A same-day repeat must not raise it, or a learner doing five
 * things on Monday looks like they worked five days.
 */
export function nextStreak(
  previousStreak: number,
  lastActivityDate: string | null | undefined,
  today: string,
): number {
  const prior = Number.isFinite(previousStreak) ? Math.max(0, Math.floor(previousStreak)) : 0;
  if (!lastActivityDate) return 1;
  if (lastActivityDate === today) return Math.max(prior, 1);

  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  return lastActivityDate === yesterdayStr ? prior + 1 : 1;
}
