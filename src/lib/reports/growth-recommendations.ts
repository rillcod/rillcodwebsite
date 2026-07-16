export type GrowthCategory = 'concepts' | 'classwork' | 'practical' | 'assignments' | 'attendance' | 'assessment';

export type GrowthRecommendation = {
  id: string;
  category: GrowthCategory;
  label: string;
  text: string;
  priority: number;
  evidence: string;
};

export type GrowthRecommendationInput = {
  studentName?: string;
  courseName?: string;
  currentModule?: string;
  nextModule?: string;
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

export function buildGrowthRecommendations(input: GrowthRecommendationInput): GrowthRecommendation[] {
  const course = context(input.courseName, 'the course');
  const current = context(input.currentModule, course);
  const next = context(input.nextModule, 'the next module');
  const completion = cleanScore(input.assignmentCompletion ?? input.assignments);

  const candidates: GrowthRecommendation[] = [
    {
      id: 'understanding', category: 'concepts', label: 'Understanding the Lesson',
      priority: 100 - cleanScore(input.theory), evidence: `Written work: ${cleanScore(input.theory)}%`,
      text: `The student should review ${current} in smaller steps, and explaining each step in their own words will help the lesson become clearer.`,
    },
    {
      id: 'class-participation', category: 'classwork', label: 'Class Participation',
      priority: 100 - cleanScore(input.classwork), evidence: `Class activities: ${cleanScore(input.classwork)}%`,
      text: `The student is encouraged to take a more active part in class activities, while asking for help when unsure will prevent small difficulties from growing.`,
    },
    {
      id: 'practical-confidence', category: 'practical', label: 'Practical Confidence',
      priority: 100 - cleanScore(input.practical), evidence: `Practical work: ${cleanScore(input.practical)}%`,
      text: `The student will benefit from practising one task at a time, and checking each completed step will improve confidence and accuracy.`,
    },
    {
      id: 'work-completion', category: 'assignments', label: 'Completing Assigned Work',
      priority: Math.max(100 - cleanScore(input.assignments), 100 - completion), evidence: `Work completed: ${completion}%`,
      text: `The student should complete and submit assigned work more regularly, because steady practice will strengthen understanding and produce more consistent progress.`,
    },
    {
      id: 'attendance-focus', category: 'attendance', label: 'Attendance and Focus',
      priority: 100 - cleanScore(input.attendance), evidence: `Attendance and participation: ${cleanScore(input.attendance)}%`,
      text: `More regular attendance and focused participation will help the student follow each lesson, and promptly reviewing missed work will prevent learning gaps.`,
    },
    {
      id: 'independent-practice', category: 'assessment', label: 'Independent Practice',
      priority: 100 - cleanScore(input.assessment), evidence: `Independent assessment: ${cleanScore(input.assessment)}%`,
      text: `The student should repeat one ${current} activity without assistance, and reviewing any difficult part will provide better preparation for ${next}.`,
    },
  ];

  return candidates.sort((a, b) => b.priority - a.priority || a.label.localeCompare(b.label)).slice(0, 6);
}

export function composeGrowthRecommendations(recommendations: GrowthRecommendation[], maxSentences = 2): string {
  return recommendations
    .filter((item, index, all) => all.findIndex(other => other.category === item.category) === index)
    .slice(0, Math.max(1, maxSentences))
    .map(item => item.text)
    .join(' ');
}