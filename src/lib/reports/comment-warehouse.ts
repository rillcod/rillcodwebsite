/**
 * Large-scale intelligent comment & growth warehouse for report cards.
 * Provides high-speed, predictive, pedagogical narrative assembly with
 * zero network delay, domain-specific contextualization, and pronoun handling.
 */

export type PerformanceBand = 'distinction' | 'merit' | 'pass' | 'support';
export type ComponentType = 'theory' | 'practical' | 'classwork' | 'assignments' | 'attendance' | 'assessment';
export type Gender = 'male' | 'female' | string | null | undefined;

export interface WarehouseStudentInput {
  studentName?: string;
  gender?: Gender;
  topic?: string;
  courseName?: string;
  overallScore?: number;
  theoryScore?: number;
  classworkScore?: number;
  practicalScore?: number;
  attendanceScore?: number;
  participationScore?: number;
  assessmentScore?: number;
  qualifiers?: {
    classwork?: string;
    projects?: string;
    homework?: string;
  };
  recommendations?: string[];
}

export interface Pronouns {
  subject: string;      // he / she / they
  Subject: string;      // He / She / They
  object: string;       // him / her / them
  Object: string;       // Him / Her / Them
  possessive: string;   // his / her / their
  Possessive: string;   // His / Her / Their
  possessiveNoun: string; // his / hers / theirs
}

export function resolvePronouns(gender: Gender, studentName?: string): Pronouns {
  const g = String(gender || '').trim().toLowerCase();
  if (g === 'male' || g === 'm' || g === 'boy') {
    return {
      subject: 'he', Subject: 'He',
      object: 'him', Object: 'Him',
      possessive: 'his', Possessive: 'His',
      possessiveNoun: 'his',
    };
  }
  if (g === 'female' || g === 'f' || g === 'girl') {
    return {
      subject: 'she', Subject: 'She',
      object: 'her', Object: 'Her',
      possessive: 'her', Possessive: 'Her',
      possessiveNoun: 'hers',
    };
  }
  const firstName = (studentName || 'The student').trim().split(/\s+/)[0] || 'The student';
  return {
    subject: firstName, Subject: firstName,
    object: firstName, Object: firstName,
    possessive: firstName + "'s", Possessive: firstName + "'s",
    possessiveNoun: firstName + "'s",
  };
}

export function formatStudentFirstName(fullName?: string): string {
  if (!fullName?.trim()) return 'The student';
  const parts = fullName.trim().split(/\s+/);
  return parts[0];
}

export function cleanTopic(topic?: string, courseName?: string): string {
  const t = topic?.trim() || courseName?.trim() || 'practical computing';
  return t.replace(/^module\s*\d*[:\-–]\s*/i, '').trim();
}

export function determinePerformanceBand(score: number): PerformanceBand {
  if (score >= 80) return 'distinction';
  if (score >= 65) return 'merit';
  if (score >= 48) return 'pass';
  return 'support';
}

function detectDomain(topic: string, course: string): 'coding' | 'web' | 'robotics' | 'general' {
  const combined = (topic + ' ' + course).toLowerCase();
  if (/python|scratch|java|c\+\+|coding|code|algorithm|variable|loop|function|backend/.test(combined)) return 'coding';
  if (/web|html|css|frontend|ui|ux|website|site/.test(combined)) return 'web';
  if (/robot|micro:?bit|arduino|sensor|hardware|circuit|iot|stem/.test(combined)) return 'robotics';
  return 'general';
}

function findKeyComponents(input: WarehouseStudentInput): { strongest: ComponentType; weakest: ComponentType } {
  const scores: { type: ComponentType; val: number }[] = [
    { type: 'theory', val: input.theoryScore ?? 70 },
    { type: 'practical', val: input.practicalScore ?? 70 },
    { type: 'classwork', val: input.classworkScore ?? 70 },
    { type: 'assignments', val: input.attendanceScore ?? 70 }, // assignments weight in system
    { type: 'attendance', val: input.participationScore ?? 70 },
    { type: 'assessment', val: input.assessmentScore ?? 70 },
  ];

  scores.sort((a, b) => b.val - a.val);
  return {
    strongest: scores[0].type,
    weakest: scores[scores.length - 1].type,
  };
}

function renderTemplate(
  template: string,
  name: string,
  p: Pronouns,
  topic: string
): string {
  return template
    .replace(/\{name\}/g, name)
    .replace(/\{He\}/g, p.Subject)
    .replace(/\{he\}/g, p.subject)
    .replace(/\{Him\}/g, p.Object)
    .replace(/\{him\}/g, p.object)
    .replace(/\{His\}/g, p.Possessive)
    .replace(/\{his\}/g, p.possessive)
    .replace(/\{topic\}/g, topic);
}

// ── Massive Bank of Narrative Clauses ──────────────────────────────────────

const STRENGTH_OPENERS: Record<PerformanceBand, string[]> = {
  distinction: [
    "{name} has demonstrated exceptional command and intellectual agility in {topic} this term.",
    "{name} consistently produces work of outstanding quality and technical depth in {topic}.",
    "Throughout our study of {topic}, {name} has distinguished {him}self as a remarkably capable learner.",
    "{name} demonstrates an advanced natural intuition and methodical discipline toward {topic}.",
    "This term, {name} exhibited genuine academic excellence and leadership in all {topic} tasks.",
    "{name} approaches {topic} with curiosity, precision, and an impressive capacity for independent thought.",
    "{name}'s performance in {topic} has been nothing short of exemplary throughout this academic term."
  ],
  merit: [
    "{name} has shown commendable understanding and sustained focus across our {topic} modules.",
    "{name} consistently approaches {topic} with positive energy, diligence, and strong practical intent.",
    "This term, {name} demonstrated good mastery of core concepts and steady technical development in {topic}.",
    "{name} exhibits a dependable work ethic and engages purposefully during all {topic} lessons.",
    "We are very pleased with {name}'s industrious attitude and progressive achievements in {topic}.",
    "{name} displays strong comprehension and applies teacher feedback constructively to {topic} activities.",
    "{name} works with admirable enthusiasm and shows steady growth across both theory and practical {topic}."
  ],
  pass: [
    "{name} has developed a foundational grasp of {topic} and is making encouraging progress.",
    "{name} participates respectfully and demonstrates a genuine desire to learn during {topic} lessons.",
    "This term, {name} demonstrated developing competence in {topic}, completing tasks with honest effort.",
    "{name} shows positive engagement during hands-on exercises in {topic} and responds well to guidance.",
    "{name} makes a steady effort in {topic} and shows observable improvement when applying core concepts.",
    "With structured encouragement, {name} has consolidated basic procedures in {topic} this term."
  ],
  support: [
    "{name} demonstrates a warm willingness to learn and responds constructively to individual support in {topic}.",
    "{name} shows encouraging curiosity during visual demonstrations and practical walkthroughs in {topic}.",
    "With patience and consistent guidance, {name} participates cooperatively in introductory {topic} exercises.",
    "{name} maintains an earnest attitude in class and welcomes step-by-step assistance when working on {topic}."
  ]
};

const COMPONENT_STRENGTH_EVIDENCE: Record<ComponentType, string[]> = {
  practical: [
    "{His} hands-on laboratory work is executed with confidence, neat structure, and creative flair.",
    "{He} shines especially during practical exercises, troubleshooting challenges with patience and skill.",
    "{His} practical projects reflect thoughtful design, sound logic, and an ability to translate theory into working results."
  ],
  theory: [
    "{He} grasps abstract concepts swiftly and articulates technical terminology with impressive accuracy.",
    "{His} strong theoretical foundation enables {him} to reason through unfamiliar scenarios with poise.",
    "{He} exhibits excellent analytical ability, demonstrating sharp logic in written evaluations."
  ],
  classwork: [
    "{His} active participation and insightful contributions enrich our classroom discussions.",
    "{He} maintains keen concentration during demonstrations and consistently finishes class activities on time.",
    "{He} collaborates harmoniously with peers, often explaining key concepts to classmates with patience."
  ],
  assignments: [
    "{His} homework assignments are consistently submitted on time and reflect thorough, meticulous preparation.",
    "{He} shows self-directed study habits, reinforcing each lesson through reliable out-of-class practice.",
    "{His} regular completion of tasks demonstrates strong personal accountability and academic pride."
  ],
  attendance: [
    "{His} regular punctuality and alert classroom presence ensure unbroken continuity in {his} learning.",
    "{He} brings reliable focus to every session, setting a positive standard for the entire cohort.",
    "{His} dedicated attendance has laid a sturdy groundwork for rapid skill accumulation."
  ],
  assessment: [
    "{He} demonstrates excellent test composure, applying taught frameworks accurately under timed conditions.",
    "{His} evaluation results showcase consistent revision and a mature command of assessed competencies.",
    "{He} approaches periodic assessments with thorough preparation and clear technical expression."
  ]
};

const GROWTH_OPENERS: Record<PerformanceBand, string[]> = {
  distinction: [
    "To stretch {his} capabilities even further, {name} is encouraged to tackle open-ended extension challenges in {topic}.",
    "We recommend that {name} explore advanced algorithmic refinement and code optimization to elevate {his} {topic} work.",
    "{name} will benefit from documenting {his} creative design architectures and sharing {his} insights through peer mentoring.",
    "Pursuing ambitious personal projects beyond the syllabus will accelerate {name}'s transition to mastery in {topic}."
  ],
  merit: [
    "{name} will make even greater strides by dedicating regular time to independent practical problem-solving in {topic}.",
    "We encourage {name} to push {him}self toward tackling unfamiliar problems before seeking hints in {topic}.",
    "To elevate {his} performance to distinction level, {name} should focus on double-checking edge cases and fine details.",
    "{name} is encouraged to voice {his} thoughts more assertively during technical discussions to sharpen {his} articulation."
  ],
  pass: [
    "{name} will benefit immensely from establishing a dedicated revision routine to reinforce core {topic} principles.",
    "We advise {name} to ask questions promptly whenever an instruction or technical concept in {topic} feels uncertain.",
    "Greater consistency in hands-on practice at home will help {name} build confidence and speed in {topic}.",
    "Reviewing lesson notes immediately after class will help {name} retain foundational definitions and procedures."
  ],
  support: [
    "{name} requires focused, ongoing revision of fundamental building blocks in {topic} to bridge conceptual gaps.",
    "We strongly encourage {name} to practice basic {topic} exercises in short, regular intervals to build self-assurance.",
    "{name} will make substantial gains by taking structured notes and confirming each practical step with the teacher.",
    "Consistent lesson attendance and closer adherence to instructions will be instrumental in {name}'s progress."
  ]
};

const COMPONENT_GROWTH_TARGETS: Record<ComponentType, string[]> = {
  practical: [
    "Spending more dedicated time practicing hands-on implementation will turn theoretical ideas into effortless fluency.",
    "Building personal mini-projects will help {him} overcome initial hesitations when facing blank work areas.",
    "Focusing on systematic debugging and testing will significantly enhance the durability of {his} solutions."
  ],
  theory: [
    "Regularly reviewing technical vocabulary and principles will ensure that {his} written evaluations match {his} practical skills.",
    "Summarizing key concepts in {his} own words will make abstract technical ideas much easier to remember.",
    "Devoting focused study time to conceptual definitions will give {him} a stronger foundation for upcoming assessments."
  ],
  classwork: [
    "Engaging more proactively in classroom discussions will help {him} clarify doubts before they accumulate.",
    "Maintaining undivided focus during step-by-step demonstrations will prevent missed instructions.",
    "Actively volunteering answers and asking questions will accelerate {his} confidence in the subject."
  ],
  assignments: [
    "Completing and submitting all assigned tasks on schedule will reinforce classroom learning effectively.",
    "Treating homework as valuable rehearsal will ensure that new concepts are cemented firmly in memory.",
    "Setting aside a set study hour each week will foster the discipline needed for sustained achievement."
  ],
  attendance: [
    "Maintaining regular, punctual attendance is essential to preserve learning momentum and avoid missing key topics.",
    "Minimizing absences will ensure {he} does not fall behind during sequential curriculum milestones.",
    "Being present and focused in every lesson will naturally bolster {his} mastery and grades."
  ],
  assessment: [
    "Practicing timed quizzes and past review questions will build the calmness needed during formal assessments.",
    "Carefully reading every rubric requirement before starting an assessment will prevent avoidable mark deductions.",
    "Reviewing corrected tests and revising identified weak areas will ensure steady upward progress."
  ]
};

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// ── Smart Predictive Assembly Engine ───────────────────────────────────────

export function generatePredictiveComments(input: WarehouseStudentInput): {
  key_strengths: string;
  areas_for_growth: string;
} {
  const name = formatStudentFirstName(input.studentName);
  const p = resolvePronouns(input.gender, name);
  const topic = cleanTopic(input.topic, input.courseName);
  const score = input.overallScore ?? (input.theoryScore ?? 70);
  const band = determinePerformanceBand(score);
  const { strongest, weakest } = findKeyComponents(input);

  const seed = hashString(String(input.studentName || 'student') + ':' + topic + ':' + score);

  // Strength sentence 1: Band-appropriate academic lead
  const openLeads = STRENGTH_OPENERS[band];
  const s1 = renderTemplate(openLeads[seed % openLeads.length], name, p, topic);

  // Strength sentence 2: Component-specific evidence or teacher qualifier
  let s2 = '';
  if (input.qualifiers?.projects && input.qualifiers.projects.length > 5) {
    s2 = renderTemplate("{His} work in projects (" + input.qualifiers.projects + ") demonstrates admirable commitment and creativity.", name, p, topic);
  } else if (input.qualifiers?.classwork && input.qualifiers.classwork.length > 5) {
    s2 = renderTemplate("{He} is observed as a " + input.qualifiers.classwork.toLowerCase() + " who brings positive energy to classroom tasks.", name, p, topic);
  } else {
    const evidenceList = COMPONENT_STRENGTH_EVIDENCE[strongest];
    s2 = renderTemplate(evidenceList[(seed + 1) % evidenceList.length], name, p, topic);
  }

  // Growth sentence 1: Band-appropriate constructive opening
  const gLeads = GROWTH_OPENERS[band];
  const g1 = renderTemplate(gLeads[(seed + 2) % gLeads.length], name, p, topic);

  // Growth sentence 2: Targeted component remedy or explicit teacher recommendation
  let g2 = '';
  if (Array.isArray(input.recommendations) && input.recommendations.length > 0 && input.recommendations[0]?.trim()) {
    const rec = input.recommendations[0].trim().replace(/^the student should /i, '').replace(/\.$/, '');
    g2 = 'Specifically, focusing on ' + rec + ' will yield immediate, tangible improvement.';
  } else if (input.qualifiers?.homework && input.qualifiers.homework.toLowerCase().includes('inconsistent')) {
    g2 = renderTemplate("Establishing a more consistent homework routine will provide the regular reinforcement {he} needs.", name, p, topic);
  } else {
    const targetList = COMPONENT_GROWTH_TARGETS[weakest];
    g2 = renderTemplate(targetList[(seed + 3) % targetList.length], name, p, topic);
  }

  return {
    key_strengths: (s1 + ' ' + s2).trim(),
    areas_for_growth: (g1 + ' ' + g2).trim(),
  };
}

export function getStrengthBankSuggestions(input: WarehouseStudentInput): string[] {
  const name = formatStudentFirstName(input.studentName);
  const p = resolvePronouns(input.gender, name);
  const topic = cleanTopic(input.topic, input.courseName);
  const score = input.overallScore ?? (input.theoryScore ?? 70);
  const band = determinePerformanceBand(score);
  const { strongest } = findKeyComponents(input);

  const leads = STRENGTH_OPENERS[band];
  const evidences = COMPONENT_STRENGTH_EVIDENCE[strongest];

  return leads.slice(0, 4).map((lead, i) => {
    const ev = evidences[i % evidences.length];
    return (renderTemplate(lead, name, p, topic) + ' ' + renderTemplate(ev, name, p, topic)).trim();
  });
}

export function getGrowthBankSuggestions(input: WarehouseStudentInput): string[] {
  const name = formatStudentFirstName(input.studentName);
  const p = resolvePronouns(input.gender, name);
  const topic = cleanTopic(input.topic, input.courseName);
  const score = input.overallScore ?? (input.theoryScore ?? 70);
  const band = determinePerformanceBand(score);
  const { weakest } = findKeyComponents(input);

  const leads = GROWTH_OPENERS[band];
  const targets = COMPONENT_GROWTH_TARGETS[weakest];

  return leads.slice(0, 4).map((lead, i) => {
    const target = targets[i % targets.length];
    return (renderTemplate(lead, name, p, topic) + ' ' + renderTemplate(target, name, p, topic)).trim();
  });
}
