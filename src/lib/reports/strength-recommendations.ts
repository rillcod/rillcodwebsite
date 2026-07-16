export type StrengthCategory = 'concepts' | 'classwork' | 'practical' | 'assignments' | 'attendance' | 'assessment';

export type StrengthRecommendation = {
  id: string;
  category: StrengthCategory;
  label: string;
  text: string;
  score: number;
  evidence: string;
};

export type StrengthRecommendationInput = {
  studentName?: string;
  courseName?: string;
  currentModule?: string;
  theory: number;
  classwork: number;
  practical: number;
  assignments: number;
  attendance: number;
  assessment: number;
  assignmentCompletion?: number;
};

const cleanScore = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
const context = (value: string | undefined, fallback: string) => value?.trim() || fallback;

export function buildStrengthRecommendations(input: StrengthRecommendationInput): StrengthRecommendation[] {
  const course = context(input.courseName, 'the course');
  const current = context(input.currentModule, course);
  const completion = cleanScore(input.assignmentCompletion ?? input.assignments);

  const candidates: StrengthRecommendation[] = [
    { id: 'clear-understanding', category: 'concepts', label: 'Clear Understanding', score: cleanScore(input.theory), evidence: `Written work: ${cleanScore(input.theory)}%`, text: `The student shows a clear understanding of ${current}, and explains important ideas with growing confidence.` },
    { id: 'positive-participation', category: 'classwork', label: 'Positive Participation', score: cleanScore(input.classwork), evidence: `Class activities: ${cleanScore(input.classwork)}%`, text: `The student participates positively in class activities, and responds well to guidance and new learning.` },
    { id: 'practical-application', category: 'practical', label: 'Practical Application', score: cleanScore(input.practical), evidence: `Practical work: ${cleanScore(input.practical)}%`, text: `The student applies what has been learned confidently during practical work, and completes tasks with care and creativity.` },
    { id: 'reliable-work', category: 'assignments', label: 'Reliable Work Habits', score: Math.max(cleanScore(input.assignments), completion), evidence: `Work completed: ${completion}%`, text: `The student completes assigned work responsibly, and consistent practice is producing steady progress.` },
    { id: 'consistent-presence', category: 'attendance', label: 'Consistent Attendance', score: cleanScore(input.attendance), evidence: `Attendance and participation: ${cleanScore(input.attendance)}%`, text: `The student attends regularly and remains engaged during lessons, which supports strong learning continuity.` },
    { id: 'independent-progress', category: 'assessment', label: 'Independent Progress', score: cleanScore(input.assessment), evidence: `Independent assessment: ${cleanScore(input.assessment)}%`, text: `The student works with increasing independence, and demonstrates good judgement when completing assessed activities.` },
  ];

  return candidates.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, 6);
}

export function composeStrengthRecommendations(recommendations: StrengthRecommendation[], studentName?: string, maxSentences = 2): string {
  const text = recommendations
    .filter((item, index, all) => all.findIndex(other => other.category === item.category) === index)
    .slice(0, Math.max(1, maxSentences))
    .map(item => item.text)
    .join(' ');
  const name = studentName?.trim();
  return name ? text.replace(/^The student\b/, name) : text;
}