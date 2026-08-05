import { describe, expect, it } from 'vitest';
import {
  alignPlanWeeksToWindow,
  formatModuleWeekLabel,
  matchTrackToCourse,
  moduleWindowFingerprint,
  parseTrackWeekRange,
  planWeeksFromCurriculum,
  resolveTrackTeachingWindow,
  windowsMatch,
  type PageContent,
} from './programme-bridge';

const COURSES = [
  { id: 'c1', title: 'Generative Art & Visual Storytelling' },
  { id: 'c2', title: 'AI Foundations & Python Programming' },
  { id: 'c3', title: 'Web & App Creation with AI' },
  { id: 'c4', title: 'AI Game Design with Python & Pygame' },
];

/** Live AI Summer School 2026 page shape (tracks + shared week spine). */
const SUMMER_PAGE: PageContent = {
  hero_blurb:
    'An intensive hands-on programme teaching kids and teens (ages 8-18) to create, code, and innovate using modern Artificial Intelligence tools.',
  duration_label: '7 Weeks Cohort',
  ages_label: 'Ages 8+',
  weeks: [
    { num: 'Week 1', tag: 'Foundations', title: 'AI Basics & Prompts Kickoff', desc: 'Understanding how models think, prompt mechanics, and starting image generation.' },
    { num: 'Week 2', tag: 'Creative AI', title: 'Storytelling & Digital Art', desc: 'Creating consistent characters, layout planning, and assembling the art portfolio.' },
    { num: 'Week 3', tag: 'Python Basics', title: 'Python Programming Fundamentals', desc: 'Variables, conditions, and loops.' },
    { num: 'Week 4', tag: 'AI Coding', title: 'Gemini AI Integrations', desc: 'Python scripts that connect to Google Gemini APIs.' },
    { num: 'Week 5', tag: 'Build Apps', title: 'AI Web Apps & Game Logic', desc: 'Web servers and Pygame environments.' },
    { num: 'Week 6', tag: 'Media Module', title: 'Bonus Module: Video Ads & Marketing', desc: 'Scriptwriting and video ads.' },
    { num: 'Week 7', tag: 'Graduation', title: 'Final Projects & Graduation', desc: 'Polishing and presenting.' },
  ],
  tracks: [
    {
      title: 'Generative Art & Visual Storytelling',
      week: 'Module 1 · Weeks 1–2',
      desc: 'Create stunning visuals, digital art, and narrative storyboards using advanced text-to-image AI tools.',
      topics: [
        'Introduction to generative AI & prompting',
        'Prompt engineering for art & illustration',
        'Style consistency and creative direction',
        'AI-assisted graphic design & branding',
        'Project: Personal AI Art Portfolio',
      ],
    },
    {
      title: 'AI Foundations',
      week: 'Module 2 · Weeks 1–3',
      topics: ['AI vs. Machine Learning basics', 'Python programming fundamentals'],
    },
    {
      title: 'Web & App Creation with AI',
      week: 'Module 3 · Weeks 4–5',
      topics: ['HTML, CSS, and JavaScript basics', 'Building a custom AI chatbot helper'],
    },
    {
      title: 'AI Game Design',
      week: 'Module 4 · Weeks 5–6',
      topics: ['Core game design & mechanics', 'Coding games using Python & Pygame'],
    },
  ],
};

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

describe('parseTrackWeekRange', () => {
  it('reads the published Generative Art module window', () => {
    expect(parseTrackWeekRange('Module 1 · Weeks 1–2')).toEqual({ start: 1, end: 2 });
    expect(parseTrackWeekRange('Module 3 · Weeks 4-5')).toEqual({ start: 4, end: 5 });
    expect(parseTrackWeekRange('Week 4')).toEqual({ start: 4, end: 4 });
  });

  it('returns nothing when the label has no week numbers', () => {
    expect(parseTrackWeekRange('Creative studio')).toBeNull();
    expect(parseTrackWeekRange('')).toBeNull();
  });
});

describe('resolveTrackTeachingWindow — true bearing from the write-up', () => {
  it('scopes Generative Art to Weeks 1–2 of the page, not the full 7-week spine', () => {
    const art = SUMMER_PAGE.tracks![0];
    const window = resolveTrackTeachingWindow(art, SUMMER_PAGE);
    expect(window.weekCount).toBe(2);
    expect(window.weekNumbers).toEqual([1, 2]);
    expect(window.weeks.map((w) => w.title)).toEqual([
      'AI Basics & Prompts Kickoff',
      'Storytelling & Digital Art',
    ]);
    // Must not pull Python / graduation weeks into Generative Art.
    expect(window.weeks.some((w) => /Python|Graduation|Gemini/i.test(String(w.title)))).toBe(false);
  });

  it('keeps mid-cohort modules on their published calendar numbers', () => {
    const web = SUMMER_PAGE.tracks![2];
    const window = resolveTrackTeachingWindow(web, SUMMER_PAGE);
    expect(window.weekNumbers).toEqual([4, 5]);
    expect(window.weeks.map((w) => w.title)).toEqual([
      'Gemini AI Integrations',
      'AI Web Apps & Game Logic',
    ]);
  });

  it('does not inherit the full cohort when a track has topics but no week label', () => {
    const window = resolveTrackTeachingWindow(
      { title: 'Generative Art', topics: ['A', 'B', 'C'] },
      SUMMER_PAGE,
    );
    expect(window.weekCount).toBe(3);
    expect(window.weeks).toEqual([]);
  });
});

describe('module window expansion is capturable', () => {
  it('fingerprints Weeks 1–2 differently from Weeks 1–3', () => {
    expect(moduleWindowFingerprint([1, 2])).toBe('1,2');
    expect(moduleWindowFingerprint([1, 2, 3])).toBe('1,2,3');
    expect(windowsMatch([1, 2], [1, 2, 3])).toBe(false);
    expect(windowsMatch([1, 3, 2], [1, 2, 3])).toBe(true);
  });

  it('formats expandable module labels the bridge can parse', () => {
    expect(formatModuleWeekLabel({ moduleIndex: 1, start: 1, end: 2 })).toBe(
      'Module 1 · Weeks 1–2',
    );
    expect(formatModuleWeekLabel({ moduleIndex: 1, start: 1, end: 3 })).toBe(
      'Module 1 · Weeks 1–3',
    );
    expect(parseTrackWeekRange(formatModuleWeekLabel({ start: 1, end: 3 }))).toEqual({
      start: 1,
      end: 3,
    });
  });

  it('expands Generative Art from 1–2 to 1–3 without bleeding Python into the spine', () => {
    const art = {
      ...SUMMER_PAGE.tracks![0],
      week: formatModuleWeekLabel({ moduleIndex: 1, start: 1, end: 3 }),
    };
    const window = resolveTrackTeachingWindow(art, SUMMER_PAGE);
    expect(window.weekNumbers).toEqual([1, 2, 3]);
    expect(window.weekCount).toBe(3);
    // Extra week NUMBER is captured; foreign Python spine title is not.
    expect(window.weeks.map((w) => w.title)).toEqual([
      'AI Basics & Prompts Kickoff',
      'Storytelling & Digital Art',
    ]);
    expect(window.weeks.some((w) => /Python/i.test(String(w.title)))).toBe(false);
  });
});

describe('alignPlanWeeksToWindow', () => {
  it('rewrites local 1..N weeks onto a mid-cohort module calendar', () => {
    const aligned = alignPlanWeeksToWindow(
      [
        { week: 1, topic: 'HTML basics' },
        { week: 2, topic: 'Chatbot project', type: 'project' },
      ],
      [4, 5],
    );
    expect(aligned.map((w) => w.week)).toEqual([4, 5]);
    expect(aligned[1].topic).toBe('Chatbot project');
  });

  it('leaves already-correct programme week numbers alone', () => {
    const weeks = [
      { week: 1, topic: 'Prompts' },
      { week: 2, topic: 'Portfolio', type: 'project' },
    ];
    expect(alignPlanWeeksToWindow(weeks, [1, 2])).toEqual(weeks);
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
