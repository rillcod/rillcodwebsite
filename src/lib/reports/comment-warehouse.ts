/**
 * Large-scale intelligent comment & growth warehouse for report cards.
 * Provides high-speed, predictive, pedagogical narrative assembly with
 * zero network delay, domain-specific contextualization, pronoun handling,
 * diverse sentence architectures, and deep profile differentiation.
 */

export type PerformanceBand = 'distinction' | 'merit' | 'pass' | 'support';
export type ComponentType = 'theory' | 'practical' | 'classwork' | 'assignments' | 'attendance' | 'assessment';
export type Gender = 'male' | 'female' | string | null | undefined;
export type CommentTone = 'comprehensive' | 'analytical' | 'creative' | 'collaborative';
export type StudentArchetype = 'tinkerer' | 'theorist' | 'diligent' | 'creative' | 'balanced';

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
  tone?: CommentTone;
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
  return t.replace(/^module\s*\d*[:\--]\s*/i, '').trim();
}

export function determinePerformanceBand(score: number): PerformanceBand {
  if (score >= 80) return 'distinction';
  if (score >= 65) return 'merit';
  if (score >= 48) return 'pass';
  return 'support';
}

export type DomainType = 'python' | 'scratch' | 'web' | 'robotics' | 'design' | 'general';

export function detectDomain(topic: string, course: string): DomainType {
  const combined = (topic + ' ' + course).toLowerCase();
  if (/python|backend|django|flask|data science|numpy|pandas/.test(combined)) return 'python';
  if (/scratch|block|sprite|animation|game maker|roblox/.test(combined)) return 'scratch';
  if (/web|html|css|frontend|ui|ux|website|javascript|react/.test(combined)) return 'web';
  if (/robot|micro:?bit|arduino|sensor|hardware|circuit|iot|stem|electronics/.test(combined)) return 'robotics';
  if (/design|figma|graphics|photoshop|illustrator|canva|creative/.test(combined)) return 'design';
  return 'general';
}

export function detectArchetype(input: WarehouseStudentInput): StudentArchetype {
  const theory = input.theoryScore ?? 70;
  const practical = input.practicalScore ?? 70;
  const attendance = input.attendanceScore ?? 70;
  const classwork = input.classworkScore ?? 70;

  if (practical >= theory + 10) return 'tinkerer';
  if (theory >= practical + 10) return 'theorist';
  if (attendance >= 85 && classwork >= 80) return 'diligent';
  if (input.qualifiers?.projects && /creative|innovative|unique|ambitious/i.test(input.qualifiers.projects)) return 'creative';
  return 'balanced';
}

export function findKeyComponents(input: WarehouseStudentInput): { strongest: ComponentType; weakest: ComponentType } {
  const scores: { type: ComponentType; val: number }[] = [
    { type: 'theory', val: input.theoryScore ?? 70 },
    { type: 'practical', val: input.practicalScore ?? 70 },
    { type: 'classwork', val: input.classworkScore ?? 70 },
    { type: 'assignments', val: input.attendanceScore ?? 70 },
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

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// ============================================================================
// DIVERSE OPENING ARCHITECTURES (Prevents all comments starting identically)
// ============================================================================

const OPENING_STRUCTURES: Record<PerformanceBand, {
  direct: string[];
  contextual: string[];
  possessive: string[];
  trait: string[];
}> = {
  distinction: {
    direct: [
      "{name} has demonstrated exemplary command and intellectual agility in {topic} throughout this term.",
      "{name} consistently produces work of outstanding technical depth and creative rigor in {topic}.",
      "{name} stands out as a remarkably capable learner with a sharp natural intuition for {topic}."
    ],
    contextual: [
      "Engaging with sustained intellectual curiosity across all {topic} modules, {name} has achieved outstanding results.",
      "Throughout our intensive study of {topic}, {name} has distinguished {him}self as an analytical and inventive thinker.",
      "From initial foundational concepts to complex implementation challenges in {topic}, {name} has performed with excellence."
    ],
    possessive: [
      "{name}'s work in {topic} reflects high academic maturity, creative problem-solving, and superior execution.",
      "{name}'s analytical mindset and clean technical execution have set a standout benchmark in {topic} this term.",
      "{name}'s contributions to {topic} consistently exceed expectations in both complexity and attention to detail."
    ],
    trait: [
      "An exceptionally inquisitive and disciplined student, {name} approaches every {topic} challenge with confidence.",
      "Methodical, inventive, and technically adept, {name} navigates complex problems in {topic} with impressive poise.",
      "A natural computational thinker with strong initiative, {name} brings clarity and precision to all {topic} coursework."
    ]
  },
  merit: {
    direct: [
      "{name} has shown commendable understanding and sustained technical focus across our {topic} lessons.",
      "{name} consistently approaches {topic} with positive energy, diligence, and purposeful intent.",
      "{name} demonstrates good mastery of core concepts and steady technical development in {topic}."
    ],
    contextual: [
      "Consistently active and attentive during {topic} sessions, {name} has built solid practical confidence this term.",
      "Through steady commitment and active participation in {topic}, {name} has achieved praiseworthy progress.",
      "Applying teacher demonstrations constructively to hands-on exercises in {topic}, {name} works with admirable enthusiasm."
    ],
    possessive: [
      "{name}'s dependable work ethic and collaborative attitude have made {him} a valued participant in {topic}.",
      "{name}'s progressive grasp of {topic} is evident in {his} well-structured exercises and thoughtful class contributions.",
      "{name}'s dedication to mastering {topic} has resulted in steady, reliable academic achievement."
    ],
    trait: [
      "A diligent and receptive learner, {name} engages purposefully during all theoretical and practical {topic} activities.",
      "Constructive, focused, and hardworking, {name} regularly turns instructional guidance into working results in {topic}.",
      "An enthusiastic contributor with a strong work ethic, {name} takes visible pride in {his} {topic} milestones."
    ]
  },
  pass: {
    direct: [
      "{name} has developed a foundational grasp of {topic} and is making encouraging, observable progress.",
      "{name} participates respectfully and demonstrates an authentic desire to learn during {topic} lessons.",
      "{name} has completed core introductory tasks in {topic} with honest effort and steady commitment."
    ],
    contextual: [
      "With structured guidance and patience, {name} has successfully consolidated basic procedures in {topic}.",
      "Engaging cooperatively during hands-on exercises in {topic}, {name} responds positively to direct instructor support.",
      "Showing steady resilience when encountering new technical ideas, {name} continues to develop in {topic}."
    ],
    possessive: [
      "{name}'s earnest attitude in {topic} provides a solid springboard for further conceptual consolidation.",
      "{name}'s practical curiosity is clearly growing, especially when tackling visual walkthroughs in {topic}.",
      "{name}'s steady classroom engagement reflects a commendable willingness to develop competence in {topic}."
    ],
    trait: [
      "An earnest and respectful learner, {name} welcomes constructive direction and completes foundational {topic} activities.",
      "Gentle and determined, {name} shows developing confidence whenever guided through practical {topic} workflows.",
      "A cooperative learner, {name} benefits from structured pacing and maintains a positive outlook in {topic}."
    ]
  },
  support: {
    direct: [
      "{name} demonstrates a warm willingness to learn and responds constructively to individual support in {topic}.",
      "{name} shows encouraging curiosity during visual demonstrations and practical walkthroughs in {topic}.",
      "{name} maintains an earnest attitude in class and welcomes step-by-step assistance when working on {topic}."
    ],
    contextual: [
      "With patient, sequential scaffolding, {name} participates cooperatively in introductory {topic} exercises.",
      "When supported with clear visual demonstrations, {name} works diligently to complete basic {topic} tasks.",
      "Through consistent teacher check-ins, {name} has begun building familiarity with introductory {topic} workflows."
    ],
    possessive: [
      "{name}'s positive receptiveness to one-on-one coaching creates an encouraging starting point for growth in {topic}.",
      "{name}'s cooperative nature during lessons allows {him} to follow guided instructions in {topic} calmly.",
      "{name}'s genuine willingness to try ensures that with structured practice, progress in {topic} will follow."
    ],
    trait: [
      "Receptive and well-mannered, {name} engages best in {topic} when given concise step-by-step milestones.",
      "A patient learner, {name} works cooperatively alongside teachers to navigate unfamiliar concepts in {topic}.",
      "Encouraging in effort, {name} shows genuine appreciation for structured reinforcement in {topic}."
    ]
  }
};

// ============================================================================
// DOMAIN-SPECIFIC TECHNICAL EVIDENCE CLAUSES
// ============================================================================

const DOMAIN_TECHNICAL_EVIDENCE: Record<DomainType, Record<PerformanceBand, string[]>> = {
  python: {
    distinction: [
      "{He} demonstrates sharp algorithmic reasoning, independently designing clean functions, conditionals, and logical control flow.",
      "{His} code structure is concise and readable, showing a strong grasp of variable scopes, data structures, and debugging syntax.",
      "{He} quickly pinpoints logic bugs and refactors scripts with impressive technical independence."
    ],
    merit: [
      "{He} writes functional Python code with good command of basic syntax, loops, and conditional statements.",
      "{His} programming logic has become noticeably cleaner, especially when translating problem statements into code.",
      "{He} actively tests {his} programs, identifying syntax errors with increasing confidence."
    ],
    pass: [
      "{He} can implement basic Python commands and follow guided syntax patterns with reasonable success.",
      "{He} is gaining familiarity with variable assignment and step-by-step code execution.",
      "With teacher prompts, {he} successfully troubleshoots simple indentation and syntax mismatches."
    ],
    support: [
      "{He} benefits from step-by-step guidance when typing code and identifying missing brackets or indentation.",
      "{He} is beginning to recognize the connection between written instructions and Python execution.",
      "Visual syntax reminders and structured templates help {him} complete starter coding tasks."
    ]
  },
  scratch: {
    distinction: [
      "{He} architected intricate interactive scripts, mastering broadcast triggers, variables, and multi-sprite synchronization.",
      "{His} creative animations and games demonstrate sophisticated event handling and modular block logic.",
      "{He} naturally explores advanced mechanics, such as clone management and collision detection, with flair."
    ],
    merit: [
      "{He} creates colorful, responsive projects utilizing loops, costume changes, and conditional sensing blocks effectively.",
      "{His} project layouts exhibit clear storytelling and methodical sequencing of block commands.",
      "{He} troubleshoots event timing thoughtfully to ensure smooth gameplay and sprite transitions."
    ],
    pass: [
      "{He} connects basic movement and event blocks accurately to create working mini-animations.",
      "{He} understands how to sequence actions and change sprite backdrops using core blocks.",
      "With guided demonstrations, {he} modifies existing scripts to incorporate sound and character movement."
    ],
    support: [
      "{He} participates happily in guided block placement, following visual tutorials to animate characters.",
      "Step-by-step modeling helps {him} pair green-flag events with simple movement commands.",
      "Repetitive hands-on practice helps {him} locate and snap blocks together with increasing ease."
    ]
  },
  web: {
    distinction: [
      "{He} crafts semantic HTML structures and stylish CSS layouts with keen attention to visual hierarchy and responsiveness.",
      "{His} web pages display mature styling, intuitive navigation, and clean, well-organized code architecture.",
      "{He} demonstrates an advanced eye for design aesthetics while adhering strictly to modern web conventions."
    ],
    merit: [
      "{He} effectively applies styling rules, colors, and typography to build attractive, well-ordered web pages.",
      "{His} grasp of HTML elements and CSS selectors allows {him} to assemble functional page sections confidently.",
      "{He} works systematically through layout exercises, testing changes across browser previews diligently."
    ],
    pass: [
      "{He} constructs basic web pages using heading, paragraph, image, and container tags accurately.",
      "{He} applies basic color and font styles using CSS, showing growing appreciation for presentation.",
      "With structured code templates, {he} links stylesheets and structures content cleanly."
    ],
    support: [
      "{He} follows visual tutorials to insert headings and images, benefiting from guided tag placement.",
      "Practice with opening and closing tags has helped {him} build confidence in basic web formatting.",
      "Clear code snippets allow {him} to see how styling choices change the appearance of web elements."
    ]
  },
  robotics: {
    distinction: [
      "{He} bridges hardware and software seamlessly, programming sensors and actuators with methodical accuracy.",
      "{His} circuit assemblies and microcontroller logic demonstrate sophisticated troubleshooting and engineering insight.",
      "{He} takes the lead in testing real-world hardware responses, iterating on pin configurations with patience."
    ],
    merit: [
      "{He} successfully wires sensors and writes control scripts that react predictably to environmental inputs.",
      "{His} hands-on laboratory discipline is exemplary, maintaining organized hardware setups throughout.",
      "{He} tests microcontroller reactions methodically, resolving loose connections with good diagnostic skill."
    ],
    pass: [
      "{He} connects fundamental electronic components and downloads starter scripts onto microcontrollers safely.",
      "{He} understands basic input-output relationships such as LED blink patterns and push-button triggers.",
      "With instructor supervision, {he} reads basic wiring diagrams and connects breadboard leads."
    ],
    support: [
      "{He} participates enthusiastically during physical demonstrations, handling hardware tools with care.",
      "Guided circuit walkthroughs help {him} identify pins, jumper wires, and ground connections.",
      "Patience and step-by-step assistance enable {him} to observe how sensor readings trigger actions."
    ]
  },
  design: {
    distinction: [
      "{He} creates visually striking digital assets with professional-level layout balance, color harmony, and typography.",
      "{His} design thinking is sophisticated, incorporating user empathy and iterative wireframing into each piece.",
      "{He} masters tool layers, vector curves, and asset exporting with creative confidence and speed."
    ],
    merit: [
      "{He} produces balanced digital compositions with good understanding of contrast, margins, and palette choices.",
      "{His} creative projects reflect thoughtful planning, neat layer grouping, and consistent aesthetic polish.",
      "{He} uses digital canvas tools purposefully, refining visual details according to project briefs."
    ],
    pass: [
      "{He} utilizes core design tools to crop, align, and apply basic color schemes to digital posters and graphics.",
      "{He} is developing an awareness of visual layout rules and text placement on screen.",
      "With visual templates, {he} combines graphic elements into neat and communicative final outputs."
    ],
    support: [
      "{He} explores creative tools enthusiastically, experimenting with shape placement and color fills.",
      "Clear step-by-step instructions help {him} navigate software menus and layer selections.",
      "Teacher assistance enables {him} to organize design components neatly on the workspace."
    ]
  },
  general: {
    distinction: [
      "{He} exhibits exceptional analytical prowess, dissecting complex technical problems into elegant, workable solutions.",
      "{His} assignments reflect meticulous research, thorough documentation, and a sophisticated conceptual foundation.",
      "{He} routinely extends project specifications, demonstrating genuine intellectual curiosity and initiative."
    ],
    merit: [
      "{He} works through computing exercises with commendable discipline, accuracy, and clear practical understanding.",
      "{His} technical fluency is progressing well, supported by consistent effort and insightful questions.",
      "{He} translates theoretical concepts into practical solutions with dependable consistency."
    ],
    pass: [
      "{He} demonstrates steady application of core digital principles, completing required deliverables reliably.",
      "{He} shows observable growth in navigating computing interfaces and following technical instructions.",
      "With consistent encouragement, {he} solves structured practical exercises with rising confidence."
    ],
    support: [
      "{He} participates actively in guided activities and benefits from structured, sequential walkthroughs.",
      "{He} shows an earnest commitment to improving {his} digital literacy and classroom workflow.",
      "Consistent individual support helps {him} solidify foundational computing concepts."
    ]
  }
};

// ============================================================================
// ARCHETYPE-BASED SYNTHESIS CLAUSES
// ============================================================================

const ARCHETYPE_SYNTHESIS: Record<StudentArchetype, string[]> = {
  tinkerer: [
    "{His} natural instinct to experiment and learn through direct hands-on testing is a formidable asset.",
    "{He} learns best when building, and {his} enthusiasm during practical workshop time is truly contagious.",
    "This strong hands-on intuition allows {him} to solve real-world problems with practical creativity."
  ],
  theorist: [
    "{His} capacity to grasp abstract concepts quickly provides a rock-solid foundation for future technical growth.",
    "{He} thinks deeply before executing, displaying an analytical patience that serves {him} exceptionally well.",
    "This strong conceptual foundation enables {him} to reason through unfamiliar scenarios with poise."
  ],
  diligent: [
    "{His} dependable punctuality, organized habits, and sustained focus set an inspiring standard for the entire class.",
    "{His} consistent preparation and earnest work ethic ensure continuous, uninterrupted mastery of each milestone.",
    "{He} models exemplary academic citizenship, approaching every task with personal pride and accountability."
  ],
  creative: [
    "{His} inventive imagination and willingness to explore unconventional ideas infuse {his} projects with authentic flair.",
    "{He} brings fresh creative perspective to technical tasks, frequently surprising us with unique implementations.",
    "This blend of creative courage and technical curiosity positions {him} for exciting future breakthroughs."
  ],
  balanced: [
    "{He} balances theoretical comprehension with practical execution harmoniously across all course units.",
    "{His} all-round consistency and calm focus allow {him} to navigate diverse challenges with steady confidence.",
    "{He} maintains a well-rounded academic standard that reflects both intellectual discipline and positive attitude."
  ]
};

// ============================================================================
// COMPONENT-AWARE GROWTH OPENINGS & TARGETS
// ============================================================================

const GROWTH_OPENING_ARCHITECTURES: Record<PerformanceBand, {
  forward: string[];
  methodical: string[];
  encouraging: string[];
}> = {
  distinction: {
    forward: [
      "To stretch {his} capabilities toward mastery, {name} is encouraged to tackle open-ended extension challenges in {topic}.",
      "To further elevate {his} impressive skill set, {name} should explore advanced algorithmic optimization and self-directed projects in {topic}.",
      "We recommend that {name} channel {his} strong aptitude into designing complex multi-tier projects that test {his} architectural planning in {topic}."
    ],
    methodical: [
      "Looking ahead, {name} will benefit from documenting {his} code architectures systematically and mentoring classmates during lab workshops.",
      "Developing a habit of writing comprehensive test cases and stress-testing edge scenarios will further refine {name}'s {topic} solutions.",
      "Exploring real-world industry patterns and modular frameworks will provide {name} with an exciting new creative canvas in {topic}."
    ],
    encouraging: [
      "With {his} outstanding natural aptitude, {name} is primed to take on competitive coding problems and ambitious portfolio projects.",
      "{name} has unlimited potential in this field; maintaining {his} current standard of curiosity will yield exceptional future achievements.",
      "Channeling {his} creative instincts into longer-term, independent software projects will accelerate {name}'s transition to true expertise."
    ]
  },
  merit: {
    forward: [
      "{name} will make even greater strides by dedicating regular time to independent practical problem-solving in {topic}.",
      "To elevate {his} performance to distinction level, {name} should focus on double-checking edge cases and fine syntactic details.",
      "We encourage {name} to push {him}self toward tackling unfamiliar problems independently before consulting hints in {topic}."
    ],
    methodical: [
      "Establishing a habit of planning algorithms with sketches or pseudocode before coding will greatly enhance {name}'s efficiency.",
      "Reviewing and refining completed tasks will help {name} identify optimization opportunities and solidify {his} technical depth.",
      "{name} is encouraged to voice {his} reasoning more assertively during class discussions to sharpen {his} technical vocabulary."
    ],
    encouraging: [
      "{name} possesses strong momentum; building confidence in troubleshooting unfamiliar errors will propel {him} to the top tier.",
      "With slightly greater attention to structured revision, {name} has every capability required to achieve consistent distinction grades.",
      "We are excited by {name}'s trajectory and encourage {him} to maintain this commendable dedication in future modules."
    ]
  },
  pass: {
    forward: [
      "{name} will benefit immensely from establishing a dedicated revision routine to reinforce core {topic} principles.",
      "We advise {name} to ask questions promptly whenever an instruction or technical concept in {topic} feels ambiguous.",
      "Greater consistency in hands-on practice at home will help {name} build both fluency and operational speed in {topic}."
    ],
    methodical: [
      "Reviewing lesson notes immediately following each session will help {name} retain foundational definitions and workflows.",
      "Breaking larger tasks into bite-sized, sequential steps will prevent {name} from feeling overwhelmed during multi-stage projects.",
      "Keeping a personal glossary of technical terms will boost {name}'s confidence during assessments and written evaluations."
    ],
    encouraging: [
      "{name} has shown genuine capacity to succeed; regular practice will soon make these technical procedures second nature.",
      "With steady self-belief and persistent effort, {name} can comfortably turn developing skills into secure competencies.",
      "We warmly encourage {name} to keep taking positive risks in class, knowing that mistakes are natural steps in learning."
    ]
  },
  support: {
    forward: [
      "{name} requires focused, ongoing revision of fundamental building blocks in {topic} to bridge conceptual gaps.",
      "We strongly encourage {name} to practice basic {topic} exercises in short, regular intervals to build self-assurance.",
      "Consistent lesson attendance and closer adherence to instructions will be instrumental in {name}'s progress."
    ],
    methodical: [
      "{name} will make substantial gains by taking structured notes and confirming each practical step with the teacher.",
      "Re-attempting guided classroom exercises independently at home will help cement essential computer operations.",
      "Focusing on one clear milestone at a time will allow {name} to build steady confidence without cognitive overload."
    ],
    encouraging: [
      "With patient support and regular practice, {name} has every ability to make meaningful, rewarding progress in {topic}.",
      "Every small practice session counts; celebrating incremental victories will help {name} flourish in upcoming lessons.",
      "{name}'s positive attitude is a great foundation, and we are committed to helping {him} grow {his} digital competence."
    ]
  }
};

const COMPONENT_GROWTH_TARGETS: Record<ComponentType, string[]> = {
  practical: [
    "Spending more dedicated time practicing hands-on implementation will turn theoretical ideas into effortless muscle memory.",
    "Building personal mini-projects will help {him} overcome initial hesitations when facing blank development environments.",
    "Focusing on systematic debugging and testing will significantly enhance the durability and polish of {his} solutions."
  ],
  theory: [
    "Regularly reviewing technical vocabulary and principles will ensure that {his} written evaluations match {his} practical skills.",
    "Summarizing key concepts in {his} own words will make abstract technical ideas much easier to retain and apply.",
    "Devoting focused study time to conceptual definitions will give {him} a stronger foundation for upcoming formal assessments."
  ],
  classwork: [
    "Engaging more proactively in classroom discussions will help {him} clarify doubts before they accumulate into roadblocks.",
    "Maintaining undivided focus during step-by-step demonstrations will prevent missed instructions and rework.",
    "Actively volunteering answers and asking questions will accelerate {his} confidence in the subject."
  ],
  assignments: [
    "Completing and submitting all assigned tasks on schedule will reinforce classroom learning effectively.",
    "Treating homework as valuable rehearsal will ensure that new concepts are cemented firmly in long-term memory.",
    "Setting aside a set study hour each week will foster the personal discipline needed for sustained achievement."
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

// ============================================================================
// SMART PREDICTIVE ASSEMBLY ENGINE
// ============================================================================

export function generatePredictiveComments(input: WarehouseStudentInput): {
  key_strengths: string;
  areas_for_growth: string;
} {
  const name = formatStudentFirstName(input.studentName);
  const p = resolvePronouns(input.gender, name);
  const topic = cleanTopic(input.topic, input.courseName);
  const score = input.overallScore ?? (input.theoryScore ?? 70);
  const band = determinePerformanceBand(score);
  const domain = detectDomain(topic, input.courseName || '');
  const archetype = detectArchetype(input);
  const { weakest } = findKeyComponents(input);

  // Multi-tier deterministic seed so every student gets a stable, unique fingerprint
  const seed = hashString(
    String(input.studentName || 'student') + ':' +
    topic + ':' +
    score + ':' +
    (input.theoryScore || 0) + ':' +
    (input.practicalScore || 0)
  );

  // --------------------------------------------------------------------------
  // STRENGTH GENERATION (3-tier personalized synthesis)
  // --------------------------------------------------------------------------

  const openingStyles: Array<keyof typeof OPENING_STRUCTURES['distinction']> = [
    'direct', 'contextual', 'possessive', 'trait'
  ];
  const chosenStyle = openingStyles[seed % openingStyles.length];
  const openLeads = OPENING_STRUCTURES[band][chosenStyle];
  const s1 = renderTemplate(openLeads[seed % openLeads.length], name, p, topic);

  let s2 = '';
  if (input.qualifiers?.projects && input.qualifiers.projects.length > 5) {
    s2 = renderTemplate("{His} work on projects (" + input.qualifiers.projects + ") demonstrates admirable commitment and creativity.", name, p, topic);
  } else if (input.qualifiers?.classwork && input.qualifiers.classwork.length > 5) {
    s2 = renderTemplate("{He} is recognized as a " + input.qualifiers.classwork.toLowerCase() + " who brings positive energy to classroom tasks.", name, p, topic);
  } else {
    const domainEvidence = DOMAIN_TECHNICAL_EVIDENCE[domain][band];
    s2 = renderTemplate(domainEvidence[(seed + 1) % domainEvidence.length], name, p, topic);
  }

  let s3 = '';
  if (band === 'distinction' || band === 'merit' || archetype !== 'balanced') {
    const synList = ARCHETYPE_SYNTHESIS[archetype];
    s3 = renderTemplate(synList[(seed + 2) % synList.length], name, p, topic);
  }

  const fullStrengths = [s1, s2, s3].filter(Boolean).join(' ').trim();

  // --------------------------------------------------------------------------
  // GROWTH GENERATION (Constructive, domain-aware & targeted)
  // --------------------------------------------------------------------------

  const growthStyles: Array<keyof typeof GROWTH_OPENING_ARCHITECTURES['distinction']> = [
    'forward', 'methodical', 'encouraging'
  ];
  const chosenGrowthStyle = growthStyles[(seed + 3) % growthStyles.length];
  const gLeads = GROWTH_OPENING_ARCHITECTURES[band][chosenGrowthStyle];
  const g1 = renderTemplate(gLeads[(seed + 4) % gLeads.length], name, p, topic);

  let g2 = '';
  if (Array.isArray(input.recommendations) && input.recommendations.length > 0 && input.recommendations[0]?.trim()) {
    const rec = input.recommendations[0].trim().replace(/^the student should /i, '').replace(/\.$/, '');
    g2 = 'Specifically, focusing on ' + rec + ' will yield immediate, tangible improvement.';
  } else if (input.qualifiers?.homework && input.qualifiers.homework.toLowerCase().includes('inconsistent')) {
    g2 = renderTemplate("Establishing a more consistent homework routine will provide the regular reinforcement {he} needs.", name, p, topic);
  } else {
    const targetList = COMPONENT_GROWTH_TARGETS[weakest];
    g2 = renderTemplate(targetList[(seed + 5) % targetList.length], name, p, topic);
  }

  const fullGrowth = [g1, g2].filter(Boolean).join(' ').trim();

  return {
    key_strengths: fullStrengths,
    areas_for_growth: fullGrowth,
  };
}

// ============================================================================
// 1-CLICK BANK SUGGESTIONS (Diverse across styles & archetypes)
// ============================================================================

export function getStrengthBankSuggestions(input: WarehouseStudentInput): string[] {
  const name = formatStudentFirstName(input.studentName);
  const p = resolvePronouns(input.gender, name);
  const topic = cleanTopic(input.topic, input.courseName);
  const score = input.overallScore ?? (input.theoryScore ?? 70);
  const band = determinePerformanceBand(score);
  const domain = detectDomain(topic, input.courseName || '');
  const archetype = detectArchetype(input);

  const structures = OPENING_STRUCTURES[band];
  const domainEvidences = DOMAIN_TECHNICAL_EVIDENCE[domain][band];
  const archetypeSyn = ARCHETYPE_SYNTHESIS[archetype];

  const results: string[] = [];

  // 1. Technical / Analytical Variation
  const lead1 = renderTemplate(structures.direct[0] || structures.direct[0], name, p, topic);
  const ev1 = renderTemplate(domainEvidences[0] || domainEvidences[0], name, p, topic);
  results.push(`${lead1} ${ev1}`.trim());

  // 2. Creative / Practical Contextual Variation
  const lead2 = renderTemplate(structures.contextual[0] || structures.direct[1], name, p, topic);
  const ev2 = renderTemplate(domainEvidences[1 % domainEvidences.length], name, p, topic);
  results.push(`${lead2} ${ev2}`.trim());

  // 3. Trait & Character Variation
  const lead3 = renderTemplate(structures.trait[0] || structures.direct[2], name, p, topic);
  const syn3 = renderTemplate(archetypeSyn[0], name, p, topic);
  results.push(`${lead3} ${syn3}`.trim());

  // 4. Concise / High-Impact Variation
  const lead4 = renderTemplate(structures.possessive[0] || structures.direct[0], name, p, topic);
  const ev4 = renderTemplate(domainEvidences[2 % domainEvidences.length], name, p, topic);
  results.push(`${lead4} ${ev4}`.trim());

  return results;
}

export function getGrowthBankSuggestions(input: WarehouseStudentInput): string[] {
  const name = formatStudentFirstName(input.studentName);
  const p = resolvePronouns(input.gender, name);
  const topic = cleanTopic(input.topic, input.courseName);
  const score = input.overallScore ?? (input.theoryScore ?? 70);
  const band = determinePerformanceBand(score);
  const { weakest } = findKeyComponents(input);

  const architectures = GROWTH_OPENING_ARCHITECTURES[band];
  const targets = COMPONENT_GROWTH_TARGETS[weakest];

  const results: string[] = [];

  // 1. Forward Mastery / Extension Target
  const lead1 = renderTemplate(architectures.forward[0], name, p, topic);
  const target1 = renderTemplate(targets[0], name, p, topic);
  results.push(`${lead1} ${target1}`.trim());

  // 2. Methodical Strategy Target
  const lead2 = renderTemplate(architectures.methodical[0], name, p, topic);
  const target2 = renderTemplate(targets[1 % targets.length], name, p, topic);
  results.push(`${lead2} ${target2}`.trim());

  // 3. Encouraging / Confidence Target
  const lead3 = renderTemplate(architectures.encouraging[0], name, p, topic);
  const target3 = renderTemplate(targets[2 % targets.length], name, p, topic);
  results.push(`${lead3} ${target3}`.trim());

  // 4. Action-focused Direct Target
  const lead4 = renderTemplate(architectures.forward[1 % architectures.forward.length], name, p, topic);
  results.push(`${lead4} ${target1}`.trim());

  return results;
}
