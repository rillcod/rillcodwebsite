/**
 * Everything a learner's engagement screen needs, gathered once.
 *
 * The pieces live in different tables — lesson progress, submissions, exam
 * sittings, portfolio, points — and every surface that wanted a "how am I
 * doing" answer was assembling its own subset, which is how the level ended up
 * being computed in four places with three different sets of thresholds. This
 * composes them once, and the pure rules in ./progress and ./mastery decide what
 * any of it means.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { levelFor, nextStep, progressFor, type Progress } from './progress';
import {
  earnedMilestones,
  nextMilestone,
  skillsFromEvidence,
  skillsSummary,
  type Milestone,
  type Skill,
  type SkillEvidence,
} from './mastery';

export type EngagementSnapshot = {
  progress: Progress;
  /** One instruction the learner can act on today. */
  nextStep: string;
  streak: { current: number; longest: number };
  activity: {
    lessonsCompleted: number;
    assignmentsSubmitted: number;
    quizzesPassed: number;
    portfolioProjects: number;
  };
  skills: Skill[];
  skillsSummary: string;
  milestones: { earned: Milestone[]; next: Milestone | null };
};

/** A sitting counts as passed at this mark, matching the skill pass mark. */
const QUIZ_PASS = 50;

function toPercent(grade: unknown): number | null {
  const n = Number(grade);
  return Number.isFinite(n) ? n : null;
}

export async function buildEngagementSnapshot(
  db: SupabaseClient,
  userId: string,
): Promise<EngagementSnapshot> {
  const [pointsRes, lessonsRes, submissionsRes, sittingsRes, projectsRes] = await Promise.all([
    db.from('user_points').select('total_points, current_streak, longest_streak').eq('portal_user_id', userId).maybeSingle(),
    db.from('lesson_progress').select('id', { count: 'exact', head: true }).eq('portal_user_id', userId).eq('status', 'completed'),
    // Graded work carries the outcomes that evidence a skill, so the rows are
    // needed, not just a count.
    db.from('assignment_submissions')
      .select('id, grade, graded_at, status, assignments(learning_outcomes)')
      .eq('portal_user_id', userId),
    db.from('cbt_sessions')
      .select('id, score, cbt_exams(learning_outcomes)')
      .eq('user_id', userId),
    db.from('portfolio_projects').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);

  const totalPoints = Number(pointsRes.data?.total_points ?? 0);
  const submissions = (submissionsRes.data ?? []) as any[];
  const sittings = (sittingsRes.data ?? []) as any[];

  const evidence: SkillEvidence[] = [];
  const pushOutcomes = (raw: unknown, score: number | null, when: string | null) => {
    if (score === null) return;
    // learning_outcomes is stored as an array on some rows and free text on
    // others; both are read rather than one being treated as malformed.
    const list = Array.isArray(raw)
      ? raw
      : typeof raw === 'string' && raw.trim()
        ? raw.split(/[\n;•]+/)
        : [];
    for (const outcome of list) {
      if (typeof outcome === 'string' && outcome.trim()) evidence.push({ outcome, score, when });
    }
  };

  for (const s of submissions) {
    const joined = Array.isArray(s.assignments) ? s.assignments[0] : s.assignments;
    pushOutcomes(joined?.learning_outcomes, toPercent(s.grade), s.graded_at ?? null);
  }
  for (const s of sittings) {
    const joined = Array.isArray(s.cbt_exams) ? s.cbt_exams[0] : s.cbt_exams;
    pushOutcomes(joined?.learning_outcomes, toPercent(s.score), null);
  }

  const skills = skillsFromEvidence(evidence);

  const activity = {
    lessonsCompleted: lessonsRes.count ?? 0,
    assignmentsSubmitted: submissions.length,
    quizzesPassed: sittings.filter((s) => (toPercent(s.score) ?? -1) >= QUIZ_PASS).length,
    portfolioProjects: projectsRes.count ?? 0,
  };

  const currentStreak = Number(pointsRes.data?.current_streak ?? 0);
  const learner = { ...activity, currentStreak, skills };

  return {
    progress: progressFor(totalPoints),
    nextStep: nextStep(totalPoints),
    streak: { current: currentStreak, longest: Number(pointsRes.data?.longest_streak ?? 0) },
    activity,
    skills,
    skillsSummary: skillsSummary(skills),
    milestones: { earned: earnedMilestones(learner), next: nextMilestone(learner) },
  };
}

/** Re-exported so callers never hand-roll a level. */
export { levelFor };
