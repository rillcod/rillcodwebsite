/**
 * A full twelve-year progression, for measuring documents without a database.
 *
 * The page-fit check has to run in CI, where there is no Supabase to read the
 * published edition from — and it has to measure the real shape of the document,
 * so a two-level stub would prove nothing about the curriculum pages.
 */
import type { CurriculumProgression } from '../../src/lib/partnerships/curriculum';

const LEVELS = [
  ['Basic 1', 'Digital Discovery + AI Awareness', 'Voice-Controlled Storytelling Robot.', '3 Scratch Games + 1 AI Story.'],
  ['Basic 2', 'Animation & Algorithms', 'Maze Escape Game.', '4 Animations + 1 Game.'],
  ['Basic 3', 'Game Development Foundations', 'Two-Player Platformer.', '3 Games + 1 Sprite Pack.'],
  ['Basic 4', 'Physical Computing', 'Smart Classroom Alarm.', '1 Circuit Build + 2 Sketches.'],
  ['Basic 5', 'Applied Robotics', 'Line-Following Robot.', '1 Robot + 1 Build Log.'],
  ['Basic 6', 'Web & AI Fundamentals', 'AI Image Classifier.', '1 Website + 1 Trained Model.'],
  ['JSS 1', 'Python & Text Coding', 'Turtle Drawing Bot.', '1 Text Adventure + 3 Scripts.'],
  ['JSS 2', 'Data, Electronics & IoT', 'Smart Irrigation Monitor.', '1 IoT Build + 1 Dashboard.'],
  ['JSS 3', 'App Engineering', 'Community Attendance App.', '1 Published App.'],
  ['SS 1', 'Full Stack Development', 'School Portal.', '1 Web Application.'],
  ['SS 2', 'Machine Learning & Vision', 'Vision Classifier.', '1 Model + 1 Report.'],
  ['SS 3', 'Mobile AI + Tech Entrepreneurship', 'Commercial African Impact Startup Mobile App.', '3 Mobile Apps + 1 Commercial Product.'],
] as const;

const TERM_FOCUS = [
  'Core concepts, tooling and first builds.',
  'Applied practice, sensors and interaction.',
  'Capstone build, showcase and written report.',
];

export function buildFixtureCurriculum(): CurriculumProgression {
  return {
    id: 'fixture-progression',
    slug: 'k12-ai-coding',
    title: 'AI-Integrated Coding & Robotics Progression',
    subtitle: 'Basic 1 to SS 3',
    summary: null,
    edition: 1,
    status: 'published',
    levels: LEVELS.map(([grade, theme, capstone, portfolio], i) => ({
      year_number: i + 1,
      grade,
      theme,
      terms: TERM_FOCUS.map((focus, t) => ({ term: t + 1, focus })),
      capstone,
      portfolio,
    })),
  } as CurriculumProgression;
}
