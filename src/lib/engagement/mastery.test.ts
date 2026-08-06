import { describe, expect, it } from 'vitest';
import {
  MILESTONES,
  PASS_MARK,
  earnedMilestones,
  nextMilestone,
  skillsFromEvidence,
  skillsSummary,
  type LearnerActivity,
  type Skill,
} from './mastery';

const ev = (outcome: string, score: number | null, when: string | null = '2026-08-01') => ({ outcome, score, when });

describe('a skill needs evidence, not activity', () => {
  it('ignores work that was never graded', () => {
    // An assignment handed in but never marked proves nothing yet. Counting it
    // tells a learner they can do something nobody has checked.
    expect(skillsFromEvidence([ev('Loops', null)])).toEqual([]);
  });

  it('ignores work that did not reach a pass', () => {
    expect(skillsFromEvidence([ev('Loops', PASS_MARK - 1)])).toEqual([]);
    expect(skillsFromEvidence([ev('Loops', PASS_MARK)])).toHaveLength(1);
  });

  it('ignores blank or missing outcomes rather than inventing a skill', () => {
    expect(skillsFromEvidence([ev('', 90), ev('   ', 90)])).toEqual([]);
  });

  it('treats the same outcome written untidily as one skill', () => {
    const skills = skillsFromEvidence([ev('  Loops and Repetition ', 80), ev('Loops and repetition.', 90)]);
    expect(skills).toHaveLength(1);
    expect(skills[0].timesShown).toBe(2);
  });
});

describe('mastery grows with repeated evidence', () => {
  it('starts at introduced on one showing', () => {
    expect(skillsFromEvidence([ev('Loops', 90)])[0].level).toBe('introduced');
  });

  it('reaches practising on two', () => {
    expect(skillsFromEvidence([ev('Loops', 60), ev('Loops', 65)])[0].level).toBe('practising');
  });

  it('reaches confident only with three showings AND a strong mark', () => {
    const weak = skillsFromEvidence([ev('Loops', 55), ev('Loops', 58), ev('Loops', 52)])[0];
    expect(weak.level).toBe('practising');

    const strong = skillsFromEvidence([ev('Loops', 55), ev('Loops', 58), ev('Loops', 88)])[0];
    expect(strong.level).toBe('confident');
    expect(strong.bestScore).toBe(88);
  });

  it('keeps the most recent date it was shown', () => {
    const s = skillsFromEvidence([ev('Loops', 80, '2026-01-01'), ev('Loops', 80, '2026-06-06')])[0];
    expect(s.lastShown).toBe('2026-06-06');
  });

  it('puts the most-evidenced skill first', () => {
    const skills = skillsFromEvidence([ev('Loops', 80), ev('Loops', 80), ev('Variables', 80)]);
    expect(skills.map((s) => s.name)).toEqual(['Loops', 'Variables']);
  });
});

describe('the summary reads without explanation', () => {
  it('says so plainly when there is nothing yet', () => {
    expect(skillsSummary([])).toMatch(/No skills evidenced yet/);
  });

  it('counts each band', () => {
    const skills = skillsFromEvidence([
      ev('Loops', 90), ev('Loops', 90), ev('Loops', 90),
      ev('Variables', 60), ev('Variables', 60),
      ev('Functions', 60),
    ]);
    expect(skillsSummary(skills)).toBe('3 skills evidenced — 1 confident, 1 practising, 1 just started.');
  });
});

const blank: LearnerActivity = {
  lessonsCompleted: 0, assignmentsSubmitted: 0, quizzesPassed: 0,
  portfolioProjects: 0, currentStreak: 0, skills: [],
};

describe('milestones are reachable from day one', () => {
  it('offers a beginner something they can do today', () => {
    const next = nextMilestone(blank);
    expect(next?.stage).toBe('beginner');
    expect(next?.key).toBe('first_lesson');
  });

  it('has four beginner milestones, all single-action', () => {
    // A scheme whose first reward takes a term is a scheme nobody sees.
    expect(MILESTONES.filter((m) => m.stage === 'beginner')).toHaveLength(4);
  });

  it('awards nothing to a learner who has done nothing', () => {
    expect(earnedMilestones(blank)).toEqual([]);
  });

  it('awards the first four for one of each action', () => {
    const earned = earnedMilestones({
      ...blank, lessonsCompleted: 1, assignmentsSubmitted: 1, quizzesPassed: 1, portfolioProjects: 1,
    });
    expect(earned.map((m) => m.key).sort()).toEqual(
      ['first_assignment', 'first_lesson', 'first_project', 'first_quiz_passed'],
    );
  });

  it('never shows an intermediate target while a beginner one is open', () => {
    const next = nextMilestone({ ...blank, lessonsCompleted: 40, currentStreak: 30 });
    expect(next?.stage).toBe('beginner');
  });

  it('moves on to intermediate once the beginner rungs are done', () => {
    const next = nextMilestone({
      ...blank, lessonsCompleted: 1, assignmentsSubmitted: 1, quizzesPassed: 1, portfolioProjects: 1,
    });
    expect(next?.stage).toBe('intermediate');
  });

  it('ties the skill milestones to evidenced mastery', () => {
    const confident: Skill[] = [{ name: 'Loops', level: 'confident', timesShown: 3, bestScore: 90, lastShown: null }];
    const keys = earnedMilestones({ ...blank, skills: confident }).map((m) => m.key);
    expect(keys).toContain('confident_skill');
    expect(keys).not.toContain('three_skills');
  });

  it('returns null when everything is earned instead of a dangling target', () => {
    const skills: Skill[] = [
      { name: 'A', level: 'confident', timesShown: 3, bestScore: 90, lastShown: null },
      { name: 'B', level: 'practising', timesShown: 2, bestScore: 60, lastShown: null },
      { name: 'C', level: 'introduced', timesShown: 1, bestScore: 60, lastShown: null },
    ];
    const full: LearnerActivity = {
      lessonsCompleted: 10, assignmentsSubmitted: 1, quizzesPassed: 1,
      portfolioProjects: 1, currentStreak: 7, skills,
    };
    expect(earnedMilestones(full)).toHaveLength(MILESTONES.length);
    expect(nextMilestone(full)).toBeNull();
  });
});
