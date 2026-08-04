import { describe, expect, it } from 'vitest';
import { matchTrackToCourse, planWeeksFromCurriculum } from './programme-bridge';

const COURSES = [
  { id: 'c1', title: 'Generative Art & Visual Storytelling' },
  { id: 'c2', title: 'AI Foundations & Python Programming' },
  { id: 'c3', title: 'Web & App Creation with AI' },
  { id: 'c4', title: 'AI Game Design with Python & Pygame' },
];

describe('matchTrackToCourse', () => {
  it('matches the real Summer School tracks to their courses', () => {
    // These are the four titles actually on the published page.
    expect(matchTrackToCourse('Generative Art & Visual Storytelling', COURSES)?.id).toBe('c1');
    expect(matchTrackToCourse('AI Foundations & Python Programming', COURSES)?.id).toBe('c2');
    expect(matchTrackToCourse('Web & App Creation with AI', COURSES)?.id).toBe('c3');
    expect(matchTrackToCourse('AI Game Design with Python & Pygame', COURSES)?.id).toBe('c4');
  });

  it('survives the punctuation drift between marketing copy and a course row', () => {
    expect(matchTrackToCourse('generative art and visual storytelling', COURSES)?.id).toBe('c1');
    expect(matchTrackToCourse('AI Game Design with Python + Pygame', COURSES)?.id).toBe('c4');
  });

  it('adopts nothing when the track belongs to no course', () => {
    // Better to report a skipped track than to publish a curriculum against
    // the wrong course.
    expect(matchTrackToCourse('Robotics & Drone Engineering', COURSES)).toBeNull();
    expect(matchTrackToCourse('', COURSES)).toBeNull();
    expect(matchTrackToCourse('AI', COURSES)).toBeNull();
  });

  it('needs a real overlap, not one shared word', () => {
    // "AI" alone appears in three course titles; one weak hit must not win.
    expect(matchTrackToCourse('AI Ethics Seminar', COURSES)).toBeNull();
  });
});

describe('planWeeksFromCurriculum', () => {
  const curriculum = {
    terms: [
      {
        term: 1,
        weeks: [
          { week: 2, topic: 'Prompt engineering', type: 'lesson', objectives: 'o2' },
          { week: 1, topic: 'Intro to generative AI', type: 'lesson', subtopics: ['a', 'b'] },
          { week: 3, topic: 'Portfolio checkpoint', type: 'project' },
        ],
      },
    ],
  };

  it('flattens one continuous run into ordered plan weeks', () => {
    const weeks = planWeeksFromCurriculum(curriculum);
    expect(weeks.map((w) => w.week)).toEqual([1, 2, 3]);
    expect(weeks[0].topic).toBe('Intro to generative AI');
  });

  it('keeps the project checkpoints distinct from lessons', () => {
    const weeks = planWeeksFromCurriculum(curriculum);
    expect(weeks[2].type).toBe('project');
    expect(weeks[0].type).toBe('lesson');
  });

  it('numbers weeks by position when the model omits them', () => {
    const weeks = planWeeksFromCurriculum({
      terms: [{ weeks: [{ topic: 'One' }, { topic: 'Two' }] }],
    });
    expect(weeks.map((w) => w.week)).toEqual([1, 2]);
  });

  it('returns nothing rather than a broken plan when there is no syllabus', () => {
    // The caller treats an empty result as a failure, so a plan is never
    // published with no weeks in it.
    expect(planWeeksFromCurriculum({})).toEqual([]);
    expect(planWeeksFromCurriculum({ terms: [] })).toEqual([]);
    expect(planWeeksFromCurriculum(null)).toEqual([]);
  });
});

describe('matchTrackToCourse — the real page titles', () => {
  it('accepts a page title that abbreviates the course', () => {
    // The page says "AI Foundations"; the course is "AI Foundations & Python
    // Programming". Requiring two shared words rejected this, leaving one of
    // the four tracks unbuildable.
    expect(matchTrackToCourse('AI Foundations', COURSES)?.id).toBe('c2');
    expect(matchTrackToCourse('AI Game Design', COURSES)?.id).toBe('c4');
  });

  it('still refuses a title that merely shares a word', () => {
    expect(matchTrackToCourse('AI Ethics Seminar', COURSES)).toBeNull();
    expect(matchTrackToCourse('Python Robotics', COURSES)).toBeNull();
  });
});
