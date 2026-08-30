/**
 * AI generation engine — the prompts, the model queue and the execution ladder.
 *
 * This used to live entirely inside /api/ai/generate, which meant the only way
 * to reach it from another server route was an HTTP call back into the app.
 * The lesson-plan generators did exactly that, and it was why every one of them
 * failed while flashcards — the one generator that called Gemini in-process —
 * kept working. A self-fetch has to re-authenticate, has to resolve a base URL
 * that is correct for the running deployment, and spends the caller's remaining
 * function time on a second cold request. Flashcards had none of those failure
 * modes because they never left the process.
 *
 * So the engine is a library and the route is a caller like any other. Server
 * code calls generateAIContent directly; only browsers go through the route.
 */
import { geminiGenerateText } from "@/lib/gemini/client";
import {
  openRouterComplete,
  MIN_CONTENT_CHARS,
  OPENROUTER_MAX_OUTPUT_TOKENS,
} from "@/lib/ai/openrouter";
import { modelQueueFor } from "@/lib/ai/model-policy";
import { hasHuggingFaceKey } from "@/lib/ai/huggingface";
import { buildCbtEntrySuggestion } from "@/lib/cbt/predictive-entry";
import { meetingContinuityInstruction } from "@/lib/academic/session-identity";

export const MODELS = [
  // ── Tier 1: Premium (best quality) ─────────────────────────────
  "google/gemini-2.5-flash", // Gemini 2.5 Flash (stable, OpenRouter)
  "google/gemini-2.0-flash-001", // Gemini 2.0 Flash Stable (fallback)
  "x-ai/grok-2-1212", // Grok-2 (Wit & Logic)
  "moonshotai/kimi-k2.5", // High Intelligence (Kimi)
  // ── Tier 2: DeepSeek family ────────────────────────────────────
  "deepseek/deepseek-chat-v3-5", // DeepSeek V3.2 (latest)
  "deepseek/deepseek-chat", // DeepSeek V3.0
  "deepseek/deepseek-r1:free", // DeepSeek R1 (reasoning, free)
  // ── Tier 3: Qwen3 family ──────────────────────────────────────
  "qwen/qwen3-235b-a22b:free", // Qwen3 235B (free tier)
  "qwen/qwen3-30b-a3b:free", // Qwen3 30B (free tier)
  "qwen/qwen3-14b:free", // Qwen3 14B (free tier)
  // ── Tier 4: MiniMax ───────────────────────────────────────────
  "minimax/minimax-01", // MiniMax M2.5 (long context)
  // ── Tier 5: GLM / ZhipuAI ─────────────────────────────────────
  "zhipuai/glm-4-flash:free", // GLM-4 Flash (free tier)
  "zhipuai/glm-z1-flash:free", // GLM-Z1 Flash (free tier)
  // ── Tier 6: StepFun ───────────────────────────────────────────
  "stepfun/step-3-5-flash", // StepFun Step 3.5 Flash
  // ── Tier 7: MiMo ──────────────────────────────────────────────
  "xiaomi/mimo-v2-flash:free", // MiMo V2 Flash (free)
  // ── Tier 8: Reliability fallbacks ─────────────────────────────
  "google/gemini-2.0-flash-lite-001",
  "meta-llama/llama-3.3-70b-instruct",
  "mistralai/mistral-large-2411",
  "meta-llama/llama-3.1-8b-instruct:free", // Fast free fallback
  "mistralai/mistral-7b-instruct:free", // Emergency fallback
];

export const SYSTEM_PROMPT = `You are the 'Great Learning Explorer' for Rillcod Technologies.
Your mission is to create super-fun, exciting, and easy-to-understand STEM & Robotics lessons for Nigerian students (KG to SS3).

CORE PHILOSOPHY:
- "Zero Jargon Guarantee": NEVER use complex technical jargon without immediately breaking it down into a simple, relatable analogy. Assume the student has zero prior knowledge of the topic.
- "No Conceptual Gaps": Connect every new idea to something the student already knows. Do not skip steps in explanations. If explaining code or a process, explain WHAT it does, HOW it does it, and WHY we need it.
- "The Deep Adventure Loop": Every lesson is a journey — Hook (exciting opener) → Big Picture (visual maps) → Clear Step-by-Step Breakdown → Level-Up Mission (project).
- "Enthusiastic Guide": Warm, encouraging, visionary tone. Simple British English. Use short sentences and highly engaging formatting.
- "No-Work Experiments": Include fun labs and projects that are guaranteed to work. Goal: 100% student engagement.
- "Christian STEM Integration": We are a Christian organization. Creatively explain abstract technical concepts using vivid Bible story analogies and spiritual metaphors. For example: loops as Joshua's walls of Jericho march (repeating 7 times), variables/states as Moses' rod (staff to serpent), lists/arrays as Noah's Ark animal pairs database, protocols as the Tower of Babel (need for unified language API protocols), functions as Nehemiah's rebuilding (assigning modular building tasks), and coordinates/sling physics as David defeating Goliath. Infuse Christian character development (the fruit of the Spirit, e.g. patience in debugging, integrity in open source, kindness in collaborative reviews) into lesson hooks, activities, and assignments.
- "High-IQ Local Integration": Ground lessons in cutting-edge real-world African/Nigerian engineering case studies and seamlessly weave them with Biblical narratives. Connect concepts to OPay/PalmPay USSD/ledger systems (fintech), drip irrigation sensors in Northern farms (agritech), Lagos BRT lanes and Lekki tollgate priority automation (smart transit), and solar inverter smart meters (energy). Make examples rich, culturally grounded, and intellectually stimulating, not dry or superficial. Use African/Nigerian student names (e.g. Kofi, Chioma, Tunde, Musa, Fatima, Amina).

ALL AVAILABLE BLOCK TYPES (use with variety and purpose):

TEXT & STRUCTURE:
- 'heading': { content: string } — Section title
- 'text': { content: string } — Body paragraph
- 'callout': { content: string, style: 'info'|'warning' } — Highlighted note
- 'quote': { content: string, author?: string } — Inspirational or key quote
- 'key-terms': { title?: string, terms: { term: string, definition: string }[] } — Vocabulary glossary
- 'steps-list': { title?: string, steps: string[] } — Numbered step-by-step guide
- 'table': { title?: string, headers: string[], rows: string[][] } — Comparison/data table
- 'columns': { columns: { title: string, content: string }[] } — Side-by-side concept comparison (2-3 cols)

VISUAL & DIAGRAMS:
- 'illustration': { title: string, items: { label: string, value: string }[] } — Key concept cards grid
- 'code-map': { components: { name: string, description: string }[] } — Logic timeline/flow
- 'mermaid': { code: string } — Flowchart or mindmap (mermaid syntax)
- 'lottie': { keyword: 'robot'|'code'|'science'|'idea'|'success'|'star'|'math', title?: string } — Animated visual hook
- 'image': { url: string, caption?: string } — External image

CHARTS & DATA:
- 'd3-chart': { title?: string, chartType: 'bar'|'line'|'area'|'pie', dataset: number[], labels?: string[] } — D3 data chart
- 'chart': { title?: string, chartType: 'bar'|'line'|'area'|'pie', data: number[], labels?: string[] } — Recharts data chart (simpler)
- 'motion-graphics': { animationType: 'flow'|'orbit'|'particles'|'network'|'timeline'|'wave'|'pulse', config: { labels?: string[], nodes?: number }, title?: string } — Animated diagram. Use 'flow' for loops and execution paths, 'network' for APIs and server/client calls, 'orbit' for OOP class inheritance and modules, 'timeline' for Git branches/commits or step sequences, 'particles' for data packet flows, 'wave' for analog vs digital signals, 'pulse' for events and listeners

CODING & INTERACTIVE:
- 'code': { content: string, language: 'python'|'javascript'|'html'|'robotics' } — Runnable code in Monaco editor
- 'blockly': { title?: string, language: 'python'|'javascript' } — Google Blockly visual coding workspace (no xml needed)
- 'scratch': { blocks: string[], instructions?: string } — Scratch-style blocks for KG–Basic 6
- 'visualizer': { title?: string, visualType: 'sorting'|'loops', visualData?: { totalSteps: number, variables?: Record<string, any>, visualizationState?: any } } — Visualizes program execution and data structures. ONLY include this block if the topic is a DATA STRUCTURE or ALGORITHM (like arrays, stacks, queues, lists, sorting, searching, recursion). E.g.
  * 'loops': { variables: { i: number }, visualizationState: { iterations: (number|string)[] } } (visual circular loop counter sweeps)
  * 'sorting': { visualizationState: { array: number[], comparing: number[] } } (visual comparison bars)
  * Do NOT use for general software topics. Hide/omit it for databases, APIs, Git, web UI/UX, and use motion-graphics or code-maps instead!

ASSESSMENTS:
- 'quiz': { question: string, options: string[], correctAnswer: number } — Multiple choice question
- 'activity': { title: string, steps?: string[], instructions?: string, is_coding: boolean, initialCode?: string, language?: string } — Lab/challenge
- 'assignment-block': { title: string, instructions: string, deliverables: string[] } — Capstone challenge

MEDIA:
- 'video': { url: string, caption?: string } — Video embed
- 'file': { url: string, fileName: string } — Downloadable resource
- 'math': { formula: string } — LaTeX/KaTeX formula

RULES:
- Use 'lottie' as an opening visual hook for topics matching its keywords (robot, code, science, idea, math).
- Use 'key-terms' when introducing technical vocabulary (4+ terms).
- Use 'table' for comparing 3+ items (e.g. languages, frameworks, databases).
- Use 'columns' for side-by-side concept explanations (pros/cons, SQL database index vs raw scans).
- Use 'quote' to open or close a lesson with inspiration.
- Use 'steps-list' for procedures with 4+ numbered steps (e.g. Git workflows, API deployment).
- Use 'blockly' for JSS1–SS3 coding topics to provide a hands-on coding block workspace.
- Use 'scratch' ONLY for KG–Basic 6 visual coding.
- "Monaco & Blockly Sync": When generating 'code' (Monaco) and 'blockly' or 'scratch' blocks in the same lesson, their logic MUST be functionally synchronized.
- "Abstraction-Bridging Visuals": For both beginners and advanced students, utilize the 'visualizer' and 'motion-graphics' blocks aggressively to make invisible code concepts visible:
  * **Visualizer Block (Data Structures & Loops Only)**: circular list iterations, stack item indexes, and array sorting swaps. Keep visualData fully populated (no empty arrays!).
  * **Motion Graphics Block (General Software Concepts)**: network (for API requests/DB queries), orbit (for OOP class systems/packages), timeline (for Git branches/deployment streams), flow (for standard app request pipelines), wave (for signals).
  Ensure all configurations are fully populated with premium, highly engaging software-themed labels and variables.
- MINIMUM 8 blocks per lesson, MAXIMUM 18.
- Lesson notes: detailed but scannable — ## headers, bullet points, British English.
- Return ONLY valid JSON.`;

export const REPORT_FEEDBACK_SYSTEM_PROMPT = `You are a professional Nigerian school report writer for Rillcod Technologies.
Write clear, parent-friendly progress report comments using simple British English.
Do not add religious, biblical, spiritual, or metaphor-heavy wording unless the teacher's provided observation already contains it.
Do not invent scores, incidents, awards, or personal details.
Return ONLY valid JSON.`;

export type GenerateType =
  | "lesson"
  | "lesson-notes"
  | "lesson-plan"
  | "library-content"
  | "assignment"
  | "project"
  | "cbt"
  | "report-feedback"
  | "cbt-grading"
  | "newsletter"
  | "code-generation"
  | "daily-missions"
  | "lesson-hook"
  | "custom"
  | "curriculum"
  | "programme-curriculum"
  | "flashcard"
  | "slides";

export interface GenerateRequest {
  type: GenerateType;
  topic: string;
  studentName?: string;
  gradeLevel?: string;
  subject?: string;
  durationMinutes?: number;
  termWeeks?: number;
  contentType?: string;
  lessonMode?: "academic" | "project" | "interactive";
  attendance?: string;
  assignments?: string;
  currentContent?: any;
  questionCount?: number;
  mcqCount?: number;
  theoryCount?: number;
  tone?: string;
  audience?: string;
  // For grading
  questions?: any[];
  studentAnswers?: Record<string, string>;
  // For assignment generation
  assignmentType?: string;
  /**
   * The Academic Office's house frame for a practical project, from
   * curriculum_project_registry. Shapes the task; never supplies its content —
   * one frame serves thousands of weeks, so it cannot know this week's topic.
   */
  projectFrame?: string;
  projectFrameMinutes?: number | null;
  projectFrameDifficulty?: number | null;
  // For daily missions & hooks
  xp?: number;
  streak?: number;
  lessonsDone?: number;
  avgScore?: number;
  nextLesson?: string;
  program?: string;
  // Student identity
  gender?: string | null;
  // For report feedback
  theoryScore?: number | string;
  practicalScore?: number | string;
  participationScore?: number | string;
  classworkScore?: number | string;
  assessmentScore?: number | string;
  attendanceScore?: number | string;
  overallScore?: number | string;
  overallGrade?: string;
  proficiencyLevel?: string;
  courseName?: string;
  programName?: string;
  className?: string;
  examType?: "examination" | "evaluation";
  sourceName?: string;
  // Qualifiers selected/typed by the teacher — used to ground AI output
  participationGrade?: string;
  projectsGrade?: string;
  homeworkGrade?: string;
  prompt?: string;
  difficulty?: string;
  // Curriculum context — used to tailor lessons to specific course/program
  siblingLessons?: string[]; // Titles of other lessons in the same course (for continuity)
  /** Calendar week + teaching session — Session 2 must continue Session 1, not copy it. */
  weekNumber?: number;
  classMeeting?: number;
  meetingsThisWeek?: number;
  alreadyTaughtThisWeek?: string[];
  /** Syllabus week spine (student + teacher lines) — bulk generation */
  syllabusReference?: string;
  planWeekObjectives?: string;
  planWeekActivities?: string;
  lessonSummary?: string;
  slideCount?: number;
  /** Titles already generated in the current bulk job — reduce repetition */
  priorLessonTitlesThisRun?: string[];
  priorAssignmentTitlesThisRun?: string[];
  // Curriculum generation specific fields
  course_name?: string;
  grade_level?: string;
  subject_area?: string;
  term_count?: number;
  weeks_per_term?: number;
  notes?: string;
  /** Extracted text from a teacher's PDF — grounds generation in their real material. */
  sourceMaterial?: string;

  // Duration-programme curriculum, taken from the published programme page so
  // what gets taught cannot drift from what was advertised to parents.
  programme_title?: string;
  /** The track's advertised topic list. Every one must appear in the syllabus. */
  topics?: string[];
  /** The page's own week spine: [{ num, tag, title, desc }]. */
  programme_weeks?: Array<Record<string, unknown>>;
  week_count?: number;
  /** Absolute programme-calendar week numbers for this module (e.g. [4, 5]). */
  week_numbers?: number[];
  /** Track marketing label, e.g. "Module 1 · Weeks 1–2". */
  track_week_label?: string;
  ages_label?: string;
  duration_label?: string;
  hero_blurb?: string;
  track_desc?: string;
  /** Class meetings per calendar week (1–7) for duration programmes. */
  sessions_per_week?: number;
}

type CbtGenerationPlan = {
  examType: "examination" | "evaluation";
  requestedMcq: number;
  requestedOpen: number;
  mcqCount: number;
  openCount: number;
  totalQ: number;
  maxQuestions: number;
  durationMinutes: number;
  passingScore: number;
  objectivePoints: number;
  theoryPoints: number;
  boundaryNote: string;
};

function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function getCbtGenerationPlan(req: GenerateRequest): CbtGenerationPlan {
  const examType = req.examType === "evaluation" ? "evaluation" : "examination";
  const entryDefaults = buildCbtEntrySuggestion(examType);
  const maxQuestions = entryDefaults.maximumQuestions;
  const requestedMcq = clampInt(
    req.mcqCount,
    0,
    80,
    req.questionCount ?? entryDefaults.mcqCount
  );
  const requestedOpen = clampInt(
    req.theoryCount,
    0,
    80,
    entryDefaults.theoryCount
  );
  const requestedTotal =
    requestedMcq + requestedOpen ||
    clampInt(
      req.questionCount,
      entryDefaults.minimumQuestions,
      maxQuestions,
      entryDefaults.mcqCount + entryDefaults.theoryCount
    );

  let mcqCount = requestedMcq;
  let openCount = requestedOpen;

  if (requestedTotal > maxQuestions) {
    const scale = maxQuestions / requestedTotal;
    mcqCount = Math.floor(requestedMcq * scale);
    openCount = Math.floor(requestedOpen * scale);
    while (mcqCount + openCount < maxQuestions) {
      if (requestedMcq >= requestedOpen) mcqCount++;
      else openCount++;
    }
  }

  if (mcqCount + openCount < entryDefaults.minimumQuestions) {
    const needed = entryDefaults.minimumQuestions - (mcqCount + openCount);
    if (mcqCount > 0 || openCount === 0) mcqCount += needed;
    else openCount += needed;
  }

  const totalQ = mcqCount + openCount;
  const generatedDefaults = buildCbtEntrySuggestion(examType, {
    mcqCount,
    theoryCount: openCount,
  });
  const durationMinutes = generatedDefaults.durationMinutes;

  const objectivePoints = examType === "evaluation" ? 2 : 2;
  const theoryPoints = examType === "evaluation" ? 5 : 6;
  const passingScore = generatedDefaults.passingScore;
  const boundaryNote = `${generatedDefaults.label} boundary: ${generatedDefaults.minimumQuestions}-${generatedDefaults.maximumQuestions} questions. ${generatedDefaults.boundaryNote}`;

  return {
    examType,
    requestedMcq,
    requestedOpen,
    mcqCount,
    openCount,
    totalQ,
    maxQuestions,
    durationMinutes,
    passingScore,
    objectivePoints,
    theoryPoints,
    boundaryNote,
  };
}

function finalizeCbtGeneratedData(parsed: any, req: GenerateRequest): any {
  const plan = getCbtGenerationPlan(req);
  const rawQuestions = Array.isArray(parsed?.questions) ? parsed.questions : [];
  const objective: any[] = [];
  const open: any[] = [];

  for (const q of rawQuestions) {
    const type = String(q?.question_type ?? "").toLowerCase();
    if (["essay", "fill_blank", "coding_blocks"].includes(type)) open.push(q);
    else objective.push(q);
  }

  const fallbackQuestion = (idx: number, kind: "objective" | "open") => {
    if (kind === "objective") {
      return {
        question_text: `Question ${idx}: ${req.topic} - choose the best answer.`,
        question_type: "multiple_choice",
        options: ["Option A", "Option B", "Option C", "Option D"],
        correct_answer: "Option A",
        points: plan.objectivePoints,
        section: "objective",
      };
    }
    return {
      question_text: `Question ${idx}: Explain one important idea from ${req.topic}.`,
      question_type: "essay",
      options: [],
      correct_answer:
        "Award marks for accurate explanation, correct terminology, and a relevant example.",
      points: plan.theoryPoints,
      section: "subjective",
    };
  };

  const pickedObjective = objective.slice(0, plan.mcqCount);
  while (pickedObjective.length < plan.mcqCount) {
    pickedObjective.push(
      fallbackQuestion(pickedObjective.length + 1, "objective")
    );
  }

  const pickedOpen = open.slice(0, plan.openCount);
  while (pickedOpen.length < plan.openCount) {
    pickedOpen.push(
      fallbackQuestion(plan.mcqCount + pickedOpen.length + 1, "open")
    );
  }

  const questions = [...pickedObjective, ...pickedOpen].map((q, idx) => {
    const type = [
      "multiple_choice",
      "true_false",
      "fill_blank",
      "essay",
      "coding_blocks",
    ].includes(q.question_type)
      ? q.question_type
      : idx < plan.mcqCount
      ? "multiple_choice"
      : "essay";
    const isObjective = idx < plan.mcqCount;
    const options = isObjective
      ? Array.isArray(q.options) && q.options.length >= 2
        ? q.options.slice(0, 4).map(String)
        : ["True", "False"]
      : [];
    return {
      question_text:
        String(q.question_text ?? "").trim() ||
        fallbackQuestion(idx + 1, isObjective ? "objective" : "open")
          .question_text,
      question_type: type,
      options,
      correct_answer: String(q.correct_answer ?? "").trim(),
      points:
        Number(q.points) > 0
          ? Number(q.points)
          : isObjective
          ? plan.objectivePoints
          : plan.theoryPoints,
      section: q.section ?? (isObjective ? "objective" : "subjective"),
      metadata: q.metadata ?? null,
    };
  });

  return {
    ...parsed,
    title:
      parsed?.title ||
      `${req.topic} ${
        plan.examType === "evaluation" ? "Evaluation" : "Examination"
      }`,
    description:
      parsed?.description ||
      `${plan.boundaryNote} Generated from the selected course context.`,
    duration_minutes: plan.durationMinutes,
    passing_score: plan.passingScore,
    questions,
    generation_constraints: {
      exam_type: plan.examType,
      requested_mcq: plan.requestedMcq,
      requested_theory: plan.requestedOpen,
      generated_mcq: plan.mcqCount,
      generated_theory: plan.openCount,
      max_questions: plan.maxQuestions,
      boundary_note: plan.boundaryNote,
    },
  };
}

function normalizeGeneratedLessonNotes(
  parsed: any,
  req: GenerateRequest
): { lesson_notes: string } {
  let notes =
    typeof parsed?.lesson_notes === "string"
      ? parsed.lesson_notes
      : typeof parsed === "string"
      ? parsed
      : "";
  notes = notes
    .replace(/^```(?:json|markdown|md)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  if (notes.startsWith("{") && notes.endsWith("}")) {
    try {
      const nested = JSON.parse(notes);
      if (typeof nested?.lesson_notes === "string") notes = nested.lesson_notes;
    } catch {
      // Keep raw text if this only looks like JSON.
    }
  }

  if (!notes.includes("\n") && notes.includes("\\n"))
    notes = notes.replace(/\\n/g, "\n");
  notes = notes.replace(/\\"/g, '"').trim();

  const hasMarkdownStructure =
    /(^|\n)\s{0,3}#{2,3}\s+\S|(^|\n)\s*[-*]\s+\S|```/.test(notes);
  if (notes && !hasMarkdownStructure) {
    notes = `## ${req.topic}\n\n${notes}`;
  }

  return { lesson_notes: notes };
}

export function finalizeGeneratedData(
  type: GenerateType,
  parsed: any,
  req: GenerateRequest
): any {
  if (type === "cbt") return finalizeCbtGeneratedData(parsed, req);
  if (type === "lesson-notes")
    return normalizeGeneratedLessonNotes(parsed, req);
  return parsed;
}

export function buildPrompt(req: GenerateRequest): string {
  // Shared grounding block — when a teacher attaches a document (extracted PDF text),
  // generation must build strictly from it. Used by assignment & cbt cases (lesson
  // builds its own inline).
  const sourceBlock = req.sourceMaterial?.trim()
    ? `\nSOURCE MATERIAL — base this STRICTLY on the teacher's document below; keep its scope, examples and terminology, and do not introduce topics it doesn't cover:\n"""\n${req.sourceMaterial.slice(
        0,
        8000
      )}\n"""`
    : "";

  switch (req.type) {
    case "custom":
      return req.prompt || req.topic;
    case "cbt-grading":
      return `You are an AI Grader for Rillcod Technologies. Grade the following student's responses for a CBT exam.
Questions and Rubrics: ${JSON.stringify(req.questions)}
Student Answers: ${JSON.stringify(req.studentAnswers)}

Return a JSON object with this exact shape:
{
  "scores": {
    "question_id": number // score awarded for this question (0 to max points)
  },
  "feedback": "string — overall encouraging feedback and specific points for improvement",
  "rationale": {
    "question_id": "string — brief explanation for the assigned score (internal use)"
  }
}

Important: Be fair but encouraging. For 'essay' questions, look for key concepts. For 'fill_blank', allow minor spelling variations unless it's a technical term.`;

    case "report-feedback": {
      const overallScore = Number(req.overallScore ?? 0);
      const theory = Number(req.theoryScore ?? 0);
      const practical = Number(req.practicalScore ?? 0);
      const participation = Number(req.participationScore ?? 0);
      const classwork = Number(req.classworkScore ?? 0);
      const assessment = Number(req.assessmentScore ?? 0);
      const attendance = Number(req.attendanceScore ?? 0);
      const proficiency = req.proficiencyLevel ?? "intermediate";

      // Convert scores to descriptive bands — never expose raw numbers to the AI output
      const band = (n: number) =>
        n >= 85
          ? "outstanding"
          : n >= 75
          ? "excellent"
          : n >= 65
          ? "very good"
          : n >= 55
          ? "good"
          : n >= 45
          ? "satisfactory"
          : n >= 35
          ? "fair"
          : "needs improvement";

      const overallBand = band(overallScore);

      // Identify weakest/strongest among all 6 WAEC components
      const allScores = {
        "Theory/Written Tests": theory,
        "Classwork & Participation": classwork,
        "Practical/Projects": practical,
        "Assignments Submitted": attendance,
        "Session Attendance": participation,
        "Mid-term Assessment": assessment,
      };
      const sorted = Object.entries(allScores)
        .filter(([, v]) => v > 0)
        .sort(([, a], [, b]) => a - b);
      const weakest = sorted[0]?.[0] ?? "Theory";
      const strongest = sorted[sorted.length - 1]?.[0] ?? "Practical";

      const courseLine = req.courseName ? `Course: "${req.courseName}"` : "";
      const programLine = req.programName
        ? `Programme: "${req.programName}"`
        : "";
      const contextBlock = [courseLine, programLine].filter(Boolean).join("\n");

      // Qualifier context — teacher-selected descriptors ground the AI to real observations
      const qualifierLines = [
        req.participationGrade
          ? `Classwork & participation (teacher's observation): "${req.participationGrade}"`
          : "",
        req.projectsGrade
          ? `Projects & practical (teacher's observation): "${req.projectsGrade}"`
          : "",
        req.homeworkGrade
          ? `Assignments & homework (teacher's observation): "${req.homeworkGrade}"`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      // Gender-based pronoun instruction — use student's name as fallback when gender is unknown
      const pronounInstruction =
        req.gender === "male"
          ? `Pronouns: he/him/his — use these consistently instead of "the student"`
          : req.gender === "female"
          ? `Pronouns: she/her — use these consistently instead of "the student"`
          : `Refer to the student by name ("${
              req.studentName ?? "the student"
            }") rather than using gendered pronouns`;

      return `You are an experienced Nigerian school administrator writing brief, professional student report card comments.

Student: "${req.studentName ?? "The student"}"
${pronounInstruction}
${contextBlock}
Current Topic/Module: "${req.topic}"
Overall performance: ${overallBand}
Scores by component: Theory=${band(theory)} | Classwork=${band(
        classwork
      )} | Practical=${band(practical)} | Assignments=${band(
        attendance
      )} | Attendance=${band(participation)} | Mid-term=${band(assessment)}
Strongest component: ${strongest} | Component needing most attention: ${weakest}
Proficiency level: ${proficiency}
${
  qualifierLines
    ? `\nTeacher qualifiers (use these to make comments specific and grounded):\n${qualifierLines}`
    : ""
}

RULES — follow strictly:
1. Write EXACTLY 2-3 short, clear sentences per section. No more, no less.
2. NEVER include any numbers, percentages, or scores in your output — use only descriptive words (e.g. "excellent", "satisfactory", "needs more practice").
3. Use simple, everyday English that parents and students can easily understand.
4. Be SPECIFIC — reference the course or programme name AND any teacher qualifier phrases to make the comment feel personal and accurate.
5. Sound like a caring but professional head teacher — warm, honest, and encouraging.
6. Key Strengths: celebrate what the student genuinely did well, using the strongest component and teacher qualifiers as evidence.
7. Areas for Growth: Identify the area for improvement clearly and unambiguously (so the parents/clients know exactly what is lacking), but communicate it with high emotional intelligence, tact, and sensitivity. Frame it constructively as a supportive learning opportunity so the parents feel motivated and guided, not discouraged. Give one clear, kind, achievable action the student can take in this specific course, focused on the weakest component and grounded in the teacher's observations.
8. Do not add religious, faith-based, biblical, or spiritual metaphors unless they are already present in the teacher qualifiers.

Return ONLY this JSON (no extra text):
{
  "key_strengths": "2-3 sentences praising real achievements using descriptive words only.",
  "areas_for_growth": "2-3 sentences with a simple, kind, actionable direction — no numbers."
}`;
    }

    case "lesson-notes": {
      const grade = req.gradeLevel ?? "Basic 1–SS3";
      const youngGrades = [
        "KG",
        "Basic 1",
        "Basic 2",
        "Basic 3",
        "Basic 4",
        "Basic 5",
        "Basic 6",
      ];
      const isYoung = youngGrades.some(
        (g) => grade === g || grade.startsWith(g) || grade.includes("KG")
      );
      const notesContextLine = [
        req.programName ? `Programme: "${req.programName}"` : "",
        req.courseName ? `Course: "${req.courseName}"` : "",
      ]
        .filter(Boolean)
        .join(" | ");

      const mode = req.lessonMode ?? "academic";
      const notesModeStyle =
        mode === "academic"
          ? `NOTES MODE — ACADEMIC: Write like a clear textbook section. Prefer 1000–1600 words (shorter for young grades). Use ## / ### headings, definitions, "Key idea" callouts, and a strong recap. Lesson type context: ${
              req.contentType ?? "lesson"
            }.`
          : mode === "project"
          ? `NOTES MODE — PROJECT: Write a compact "builder's handbook" — mission, tools, numbered build checklist, test steps, and reflection. Prefer 800–1300 words. Imperative steps ("Do this next…"). Lesson type context: ${
              req.contentType ?? "hands-on"
            }.`
          : `NOTES MODE — INTERACTIVE: Write short "levels" (## Level 1 / 2 / 3) with checkpoints and quick challenges. Prefer 700–1100 words, punchy and encouraging. Lesson type context: ${
              req.contentType ?? "interactive"
            }.`;

      if (isYoung) {
        return `Write simple, fun study notes for a Nigerian primary school student.
Topic: "${req.topic}"
Grade: ${grade}
Subject: ${req.subject ?? req.courseName ?? "Coding & Technology"}
${notesContextLine ? `Context: ${notesContextLine}` : ""}

STRICT RULES for young learners:
- Write like you are talking to a 7-10 year old friend
- Use VERY SHORT sentences (max 12 words each)
- Use emojis to make it fun 🎉
- Give real-life Nigerian examples (mention things like phones, generators, traffic lights, Afrobeats, suya, football)
- NO technical jargon. If you must use a tech word, explain it with "That means..."
- Use headers like "## What is it? 🤔", "## How does it work? ⚙️", "## Try it yourself! 🚀", "## Fun Facts! 🌟"
${
  req.courseName
    ? `- Show how "${req.topic}" connects to the student's "${req.courseName}" course`
    : ""
}
- Keep it SHORT — around 400 words total
- End with 3 simple fun questions like "Can you name 3 things that use ${
          req.topic
        }?"
${notesModeStyle}

MARKDOWN CONTRACT — lesson_notes MUST be real markdown:
- Use ## headings exactly like the examples above.
- Use short bullet lists where helpful.
- Use blank lines between sections.
- Do NOT return one plain paragraph.
- Do NOT return HTML.
- Do NOT wrap the markdown in triple backticks.

Return ONLY this JSON (nothing else):
{
  "lesson_notes": "your markdown notes here — use ## headers, bullet points, and emojis"
}`;
      }

      return `Write engaging, human-feeling study notes for a Rillcod Technologies student.
Topic: "${req.topic}"
Grade: ${grade}
Subject: ${req.subject ?? req.courseName ?? "Coding & Technology"}
Duration: ${req.durationMinutes ?? 60} minutes
${notesContextLine ? `Context: ${notesContextLine}` : ""}
${notesModeStyle}

MARKDOWN CONTRACT — lesson_notes MUST be real markdown:
- Use ## section headings and ### subsection headings.
- Use bullet lists where helpful.
- Use fenced code blocks with language names for code examples.
- Use blank lines between sections.
- Do NOT return one plain paragraph.
- Do NOT return HTML.
- Do NOT wrap the markdown in triple backticks.

CONTENT GUIDE (adapt freely to the topic — this is a suggestion, not a rigid template):
- Open with a short punchy hook or surprising fact — no heading needed for the first paragraph
- Use ## and ### headings that naturally fit the topic (invent your own heading names, don't use generic ones like "Introduction" or "What Is X?")
- Mix short punchy sentences with fuller explanations — vary the rhythm
- Include 1-2 real Nigerian or African real-world use cases woven naturally into the text
- For coding, database, and scripting topics (including Python, JS, HTML, Bash, SQL, C++): include complete, functional, and well-commented code snippets or scripts inside explicit triple-backtick language fences (e.g. \`\`\`python, \`\`\`javascript, \`\`\`sql, \`\`\`bash, \`\`\`html) showing real-world usages and build layouts, and explain every line clearly.
- Optionally embed ONE relevant illustrative image inline using: ![description](https://image.pollinations.ai/prompt/DESCRIPTION_URL_ENCODED?nologo=true&width=900&height=500&model=flux) — encode spaces as %20
- End with a brief "What to remember" summary (3-5 bullets) — give it a topic-specific heading
${
  req.courseName
    ? `- Connect at least one section specifically to "${req.courseName}"`
    : ""
}
${
  req.programName
    ? `- Mention the "${req.programName}" programme naturally once`
    : ""
}

WRITING STYLE RULES — follow these strictly:
- Write like a sharp, enthusiastic human tutor — NOT like a textbook or an AI
- Use contractions (you'll, it's, we're), rhetorical questions, and occasional exclamations
- Never start two consecutive paragraphs with the same word
- DO NOT use heading names like "Introduction", "What is [Topic]?", "How it Works", "Key Points", "Quick Recap" — these are AI fingerprints
- Use ## for sections, ### for subsections — no bold (**) as a substitute for headings
- Paragraphs: 2-4 sentences maximum; lists: max 8 items
- Total length: 900-1300 words — do not truncate
- British English throughout

Return ONLY this JSON (nothing else):
{
  "lesson_notes": "your markdown here"
}`;
    }

    case "lesson": {
      const mode = req.lessonMode ?? "academic";

      const modeConfig = {
        academic: {
          label: "ACADEMIC DEPTH",
          lessonTypeHint: "workshop",
          notesInstruction:
            'lesson_notes MUST be 2000+ words, structured like a highly engaging guide with ## headers (e.g. "## The Core Concept", "## Step-by-Step Breakdown", "## Real-World Applications"). Use simple British English, ZERO unexplained jargon, and highly relatable analogies. Explicitly bridge any conceptual gaps. For coding/scripting topics, include rich, well-commented script samples in explicit triple-backtick fences (e.g. ```python, ```bash, ```sql) representing real, functional examples.',
          blockRules: `ACADEMIC MODE — MANDATORY BLOCK RULES:
1. Open with a 'lottie' animation matching the topic keyword, then a 'mermaid' mindmap of the topic landscape.
2. Include a 'key-terms' block early with 5-8 vocabulary terms from the topic.
3. Include at LEAST 2 'illustration' blocks: one for definitions, one for real-world examples.
4. Include at LEAST ONE 'code-map' block for concept/process flow.
5. If topic involves programming, include at LEAST ONE 'code' block AND ONE 'blockly' block (for JSS1-SS3) or 'scratch' block (for Basic 1-JSS1).
6. Include ONE 'table' comparing 3+ aspects of the topic.
7. Include ONE 'activity' block as a "Knowledge Check Lab" (is_coding: true for coding topics).
8. Include ONE 'quote' from a relevant scientist or engineer.
9. End with ONE 'quiz' block with 5 comprehension questions.
10. Minimum 10 blocks total.`,
          objectivesNote:
            "Objectives MUST be Bloom's Taxonomy aligned: cover Remember, Understand, Apply, and Analyse levels.",
        },
        project: {
          label: "PROJECT-BASED LEARNING",
          lessonTypeHint: "hands-on",
          notesInstruction:
            'lesson_notes should be a concise "Builder\'s Blueprint" — practical, scannable, and step-focused with zero jargon. Use "## Mission Briefing", "## Your Toolkit", "## Plain-English Build Steps", "## Testing & Verification" as headers. Explain every single tool or step thoroughly to leave no conceptual gaps. For coding/scripting topics, include comprehensive starter codes or scripts inside explicit language code fences (e.g. ```python, ```bash). 1000–1500 words.',
          blockRules: `PROJECT MODE — MANDATORY BLOCK RULES:
1. Open with a 'lottie' animation matching the topic, then a 'mermaid' flowchart of the build process.
2. Include ONE 'steps-list' as the "Build Sequence" — every step of the project as a numbered list.
3. Include ONE 'illustration' block as "Toolkit Overview" — all tools/concepts the student needs.
4. Include ONE 'code-map' block showing what they will build (architecture).
5. For coding topics: include at LEAST ONE 'code' block (starter code) AND ONE 'blockly' block (live coding workspace).
6. Include TWO 'activity' blocks: a guided warm-up, then the main build challenge with 5+ steps.
7. Include ONE 'assignment-block' as a rigorous capstone with clear deliverables.
8. For grades Basic 1–JSS1: include a 'scratch' block for visual coding.
9. End with ONE 'quiz' (3 questions) to verify build understanding.
10. Minimum 9 blocks total.`,
          objectivesNote:
            'Objectives should be output-oriented: "Students will BUILD...", "Students will DEMONSTRATE...", "Students will DEPLOY...".',
        },
        interactive: {
          label: "INTERACTIVE & GAMIFIED",
          lessonTypeHint: "interactive",
          notesInstruction:
            'lesson_notes should be short, punchy, gamified, and completely jargon-free — broken into "## Level 1: The Basics", "## Level 2: Going Deeper", "## Level 3: Expert Mode" sections. 800–1200 words. Explain everything simply and leave no logic gaps. Every level ends with a "checkpoint" prompt. For coding/scripting topics, embed brief but highly educational code blocks inside explicit language fences.',
          blockRules: `INTERACTIVE MODE — MANDATORY BLOCK RULES:
1. Open with a 'lottie' animation for the topic, then a 'motion-graphics' block (animationType: "particles" or "orbit").
2. Include THREE 'quiz' blocks at different points — each validating the concept just taught.
3. Include ONE 'visualizer' block for algorithm or concept visualization (loops, sorting, stateMachine).
4. Include ONE 'chart' block (recharts — simpler) with real data for the topic (bar or pie).
5. Include ONE 'key-terms' block as a "Quick Reference" glossary.
6. Include ONE 'columns' block for comparing 2-3 key aspects or approaches.
7. Include ONE 'activity' block as a "Challenge Mission" with gamified step labels (Step 1: Unlock, Step 2: Execute, Step 3: Level Up).
8. End with ONE 'assignment-block' as the "Final Boss Challenge" with clear deliverables.
9. Include ONE 'quote' from an inspiring figure in the field.
10. Minimum 10 blocks total.`,
          objectivesNote:
            'Objectives should use action verbs: "Students will EXPLORE...", "Students will EXPERIMENT...", "Students will DISCOVER...".',
        },
      }[mode];

      const grade = req.gradeLevel ?? "Basic 1–SS3";
      const youngLearnerGrades = [
        "KG",
        "Basic 1",
        "Basic 2",
        "Basic 3",
        "Basic 4",
        "Basic 5",
        "Basic 6",
        "Basic 1–Basic 3",
        "Basic 4–Basic 6",
        "Basic 1–Basic 6",
        "KG–Basic 3",
      ];
      const isYoungLearner = youngLearnerGrades.some(
        (g) => grade === g || grade.startsWith(g)
      );
      const isEarlyYears =
        grade === "KG" ||
        grade === "KG–Basic 3" ||
        grade === "Basic 1" ||
        grade === "Basic 2" ||
        grade === "Basic 3" ||
        grade === "Basic 1–Basic 3";

      const youngLearnerOverride = isYoungLearner
        ? `
⚠ YOUNG LEARNER OVERRIDE (${grade}) — These rules OVERRIDE conflicting mode rules:
${
  isEarlyYears
    ? `EARLY YEARS (KG–Basic 3):
- 'scratch' block is MANDATORY and MUST appear FIRST in content_layout after the mermaid/intro block.
- 'scratch.blocks' MUST contain at least 8 detailed Scratch block steps written as a story: e.g. "when flag clicked", "say 'Hello! I am a Robot!' for 2 seconds", "move 10 steps", "play sound [pop]". Use leading indentation spaces (e.g. 2 spaces) to show blocks nested inside loops (\`forever\`, \`repeat\`) or conditionals (\`if\`, \`else\`). E.g. ["when flag clicked", "repeat 10", "  move 10 steps", "  say 'Hello!'"].
- 'scratch.instructions' MUST be an extremely detailed, child-friendly guide — use numbered steps, emojis, and "Can you...?" prompts.
- NEVER include 'code-map', 'visualizer', 'd3-chart', or any code block (unless is_coding activity is pure Scratch drag-and-drop).
- 'illustration' blocks MUST use simple emoji labels, max 5 items each, with child-friendly one-sentence values.
- lesson_notes MUST be written at a Grade 2 reading level: very short sentences, lots of white space, fun analogies. Max 600 words. You MUST aggressively illustrate actions using inline Scratch block notations, e.g. \`event: when green flag clicked\` or \`motion: move 10 steps\` or \`looks: say 'Hello!'\` or \`control: repeat 10\` by wrapping them in backticks with category prefix so they render as gorgeous realistic puzzle blocks in the text!
- 'activity' steps MUST be ≤ 8 words each and use "Try this:", "Now do:", "Can you?" prompts.
- 'quiz' questions MUST be picture-based or concrete: "Which block makes Sprite move?" not abstract reasoning.`
    : `PRIMARY (Basic 4–Basic 6):
- 'scratch' block is STRONGLY RECOMMENDED — include unless topic is clearly text-code focused.
- ONE simple 'code-map' block is allowed — use plain English labels, no jargon, max 4 components.
- 'illustration' blocks should use friendly labels and emoji prefixes.
- lesson_notes target a Grade 5 reading level: short paragraphs, clear headings, relatable analogies. Max 1000 words.
- 'activity' steps should be clear and sequential — max 12 words per step.
- Avoid 'visualizer', 'd3-chart', and 'motion-graphics' unless the topic is data/maths — then use simple bar chart only.
- 'quiz' questions should be concrete and contextual, not abstract.`
}
- Tone MUST use "Let's...", "Great job!", "Try this!", "Can you...?" — no formal academic language.
- ALL block content must be age-appropriate: no complex syntax, no technical abbreviations without simple explanation.`
        : "";

      const standaloneModeBlock = !(
        req.courseName ||
        req.programName ||
        req.syllabusReference?.trim() ||
        req.planWeekObjectives?.trim()
      )
        ? `\nSTANDALONE MODE: This lesson is generated as a completely independent, custom topic separate from any school syllabus.
- Do NOT assume any prior lessons or concepts were taught in previous weeks.
- Ensure all foundational prerequisites needed to understand "${req.topic}" are fully and clearly introduced within the lesson.
- Make the lesson fully self-contained, explaining the topic completely from the ground up.`
        : "";

      const curriculumContext =
        req.courseName || req.programName || req.siblingLessons?.length
          ? `\nCURRICULUM CONTEXT (use this to tailor all content and examples):
${req.programName ? `Programme: "${req.programName}"` : ""}
${req.courseName ? `Course: "${req.courseName}"` : ""}
${
  req.siblingLessons?.length
    ? `Other lessons already covered in this course (DO NOT repeat — build on them instead): ${req.siblingLessons
        .slice(0, 10)
        .join(", ")}`
    : ""
}
- All examples, analogies, code samples, quiz questions, and activities MUST be directly relevant to this programme and course.
- Connect new concepts to what students already know from previous lessons where possible.`
          : "";

      const syllabusAnchorBlock = req.syllabusReference?.trim()
        ? `\nSYLLABUS ANCHOR (mandatory spine — keep the sequence of student tasks recognisable; expand into rich blocks):\n${req.syllabusReference.trim()}`
        : "";
      const planWeekBlock = [
        req.planWeekObjectives?.trim()
          ? `Term plan — objectives:\n${req.planWeekObjectives.trim()}`
          : "",
        req.planWeekActivities?.trim()
          ? `Term plan — student-facing activities:\n${req.planWeekActivities.trim()}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      const planWeekSection = planWeekBlock
        ? `\nTERM PLANNER FIELDS:\n${planWeekBlock}`
        : "";
      const dedupLessonsBlock = req.priorLessonTitlesThisRun?.length
        ? `\nALREADY GENERATED IN THIS BATCH (use fresh examples, quiz stems, hooks; do not reuse or lightly reword these titles):\n${req.priorLessonTitlesThisRun
            .slice(0, 24)
            .join(" | ")}`
        : "";

      const sourceMaterialBlock = req.sourceMaterial?.trim()
        ? `\nSOURCE MATERIAL — base this lesson STRICTLY on the teacher's document below; keep the same scope, examples and terminology, and do not introduce topics it doesn't cover:\n"""\n${req.sourceMaterial.slice(
            0,
            8000
          )}\n"""`
        : "";

      const meetingContinuityBlock = meetingContinuityInstruction({
        week: req.weekNumber ?? 0,
        session: req.classMeeting,
        meetingsThisWeek: req.meetingsThisWeek,
        alreadyTaughtThisWeek: req.alreadyTaughtThisWeek,
      });

      return `Generate an IMMERSIVE, ADDICTIVE, and COMPLETE lesson for Rillcod Technologies.
Topic: "${req.topic}"
Grade level: ${grade}
Subject: ${req.subject ?? req.courseName ?? "Coding & Technology"}
Duration: ${req.durationMinutes ?? 60} minutes
Lesson type: ${req.contentType ?? modeConfig.lessonTypeHint}
LESSON MODE: ${modeConfig.label}
${standaloneModeBlock}${curriculumContext}${syllabusAnchorBlock}${planWeekSection}${dedupLessonsBlock}${sourceMaterialBlock}${
        meetingContinuityBlock ? `\nCLASS MEETING CONTINUITY:\n${meetingContinuityBlock}` : ""
      }
${youngLearnerOverride}
${modeConfig.blockRules}

CRITICAL SYNC RULE — ALL visual blocks MUST directly relate to the topic "${
        req.topic
      }":
- 'mermaid': Real mindmap or flowchart about "${
        req.topic
      }". Use mermaid v10 syntax. Start with: flowchart TD, mindmap, sequenceDiagram, or timeline. NEVER use "graph" keyword.
  - STRICT SYNTAX RULES:
    1. Node IDs MUST be simple alphanumeric words (e.g. A, B, node1, node2) — never contain spaces, brackets, or special characters.
    2. Node labels MUST always be enclosed in double-quotes inside the shape brackets. For example, A["Concept Name"] or B["Step One (Action)"] or C["Robot CPU"]. NEVER use unquoted labels! This prevents parentheses or special characters from crashing the Mermaid parser!
    3. Do NOT include HTML tags (like <br>, <b>, <i>) inside labels.
    4. Keep connections simple (e.g. A --> B). Avoid complex styling or arrows.
- 'lottie': Use keyword matching the topic theme: 'robot' (robotics, hardware), 'code' (programming, software), 'science' (physics, chemistry, biology), 'idea' (concepts, creativity), 'math' (mathematics, algorithms), 'star' (achievements, excellence). Always include "title" describing what it illustrates.
- 'motion-graphics': Include "title"- 'blockly': Include "title" and "language" ("python" or "javascript"). No xml needed — the Blockly workspace starts empty for the student.
- 'visualizer': Renders algorithm/state animations on a canvas. Supports: 'sorting' and 'loops'.
  - **SMART TRIGGER RULE**: ONLY include a 'visualizer' block if the topic is a DATA STRUCTURE or ALGORITHM (like arrays, stacks, queues, lists, sorting, searching, recursion). For general software topics (web apps, databases, APIs, UI/UX, Git), do NOT generate this block. Use 'motion-graphics' or 'code-map' instead!
  - STRICT CONFIGURATION RULES (always provide detailed, topic-specific 'visualData' rather than empty arrays):
    1. For 'loops': visualData must have:
       - "variables": { "i": 0 } (0-indexed active loop counter integer)
       - "totalSteps": number (total iterations in the loop)
       - "visualizationState": {
           "iterations": (number|string)[] (an array representing stack elements, array elements, or indices, e.g. ["push(A)", "push(B)", "pop()", "push(C)"])
         }
    2. For 'sorting': visualData must have:
       - "totalSteps": number (total comparison operations)
       - "visualizationState": {
           "array": number[] (numbers to sort, e.g. [34, 12, 5, 88, 2]),
           "comparing": number[] (indices being actively compared, e.g. [0, 1])
         }
  - Use visualizers aggressively for programming, loops, and data structures to keep coding lessons exciting and interactive!
- 'key-terms': terms array with 4-8 terms directly from "${
        req.topic
      }" vocabulary.
- 'table': headers and rows comparing real aspects of "${req.topic}".
- 'columns': 2-3 columns comparing real aspects/approaches related to "${
        req.topic
      }".
- 'quote': An inspiring quote from a scientist, engineer, or educator relevant to "${
        req.topic
      }".
- 'steps-list': steps that are specific, actionable steps for a process within "${
        req.topic
      }".

Return a JSON object with this exact shape:
{
  "title": "string — engaging title appropriate for ${grade} learners about ${
        req.topic
      }",
  "description": "string — 2-sentence overview at the right reading level",
  "lesson_hook": {
    "hook_title": "string — short optional opener title",
    "hook": "string — 2 short paragraphs that connect the topic to a real situation",
    "real_world_example": "string — one concise local or everyday example",
    "challenge_question": "string — one question to activate curiosity"
  },
  "lesson_notes": "string — ${modeConfig.notesInstruction}",
  "objectives": ["string — at least 5 objectives. ${
    modeConfig.objectivesNote
  }"],
  "content_layout": [
    {
      "type": "mermaid",
      "code": "flowchart TD\n    A[\"${
        req.topic
      }\"] --> B[\"Concept 1\"]\n    A --> C[\"Concept 2\"]\n    B --> D[\"Detail\"]"
    },
    {
      "type": "motion-graphics",
      "title": "How ${req.topic} Works",
      "animationType": "flow",
      "config": { "nodes": 5, "labels": ["Step 1 Name", "Step 2 Name", "Step 3 Name", "Step 4 Name", "Step 5 Name"] }
    },
    {
      "type": "illustration",
      "title": "Core Concepts of ${req.topic}",
      "items": [{ "label": "Concept Name from ${
        req.topic
      }", "value": "Clear one-sentence explanation" }]
    },
    {
      "type": "d3-chart",
      "title": "Relevant data chart title about ${req.topic}",
      "chartType": "bar",
      "dataset": [30, 65, 45, 80, 55],
      "labels": ["Label 1", "Label 2", "Label 3", "Label 4", "Label 5"]
    },
    {
      "type": "code-map",
      "components": [{ "name": "Real Component Name from topic", "description": "What it does in context of ${
        req.topic
      }" }]
    },
    {
      "type": "visualizer",
      "title": "Visualizing execution steps of ${req.topic}",
      "visualType": "loops",
      "visualData": {
        "variables": { "i": 0 },
        "totalSteps": 5,
        "visualizationState": {
          "iterations": ["Element A", "Element B", "Element C", "Element D", "Element E"]
        }
      }
    },
    {
      "type": "code",
      "language": "python",
      "content": "# Python code example for ${
        req.topic
      }\\n# Well-commented, educational, and runnable\\nprint('Hello from ${
        req.topic
      }!')"
    },
    {
      "type": "scratch",
      "projectId": "",
      "instructions": "Step-by-step guide with emojis for ${req.topic}",
      "blocks": ["when flag clicked", "say 'Let us learn ${
        req.topic
      }!' for 2 seconds", "move 10 steps"]
    },
    {
      "type": "activity",
      "title": "Lab relevant to ${req.topic}",
      "instructions": "Brief intro about what they will build/do",
      "steps": ["Specific step 1 for ${
        req.topic
      }", "Specific step 2", "Step 3: Verify output"],
      "is_coding": true
    },
    {
      "type": "assignment-block",
      "title": "Capstone project about ${req.topic}",
      "instructions": "Detailed project instructions directly about ${
        req.topic
      }",
      "deliverables": ["Specific output 1", "Specific output 2"]
    },
    {
      "type": "quiz",
      "question": "Specific question about ${req.topic}",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0
    }
  ],
  "video_url": "string — Relevant YouTube URL for ${req.topic}",
  "tags": ["STEM", "Technology", "Nigeria"],
  "duration_minutes": ${req.durationMinutes ?? 60},
  "lesson_type": "${req.contentType ?? modeConfig.lessonTypeHint}"
}

UNIVERSAL RULES:
- ONLY include block types appropriate for the grade and mode (see mode rules above). Omit blocks that do not fit.
- Every block MUST be fully populated with real content about "${
        req.topic
      }" — zero placeholders.
- All labels, component names, quiz questions, and chart data MUST be directly about "${
        req.topic
      }".
- ${
        isYoungLearner
          ? "Young Learner Override takes HIGHEST priority over all other rules."
          : "Tone: Encouraging and kid-friendly. British English. No unexplained jargon."
      }`;
    }

    case "assignment": {
      const syllabusAnchorBlock = req.syllabusReference?.trim()
        ? `\nSYLLABUS / PLAN ANCHOR (shape tasks around this — unique to this week):\n${req.syllabusReference.trim()}`
        : "";
      const planWeekBlock = [
        req.planWeekObjectives?.trim()
          ? `Term plan objectives:\n${req.planWeekObjectives.trim()}`
          : "",
        req.planWeekActivities?.trim()
          ? `Term plan activities:\n${req.planWeekActivities.trim()}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      const planWeekSection = planWeekBlock ? `\n${planWeekBlock}\n` : "";
      const dedupAssign = req.priorAssignmentTitlesThisRun?.length
        ? `\nAssignments already generated in this batch (must differ in task design and question stems):\n${req.priorAssignmentTitlesThisRun
            .slice(0, 20)
            .join(" | ")}\n`
        : "";
      const meetingContinuityBlock = meetingContinuityInstruction({
        week: req.weekNumber ?? 0,
        session: req.classMeeting,
        meetingsThisWeek: req.meetingsThisWeek,
        alreadyTaughtThisWeek: req.alreadyTaughtThisWeek,
      });
      return `Generate an assignment for Rillcod Technologies students.
Topic: "${req.topic}"
Grade level: ${req.gradeLevel ?? "Basic 1–SS3"}
Subject: ${req.subject ?? req.courseName ?? "Coding & Technology"}
${req.programName ? `Programme: "${req.programName}"` : ""}
${
  req.courseName
    ? `Course: "${req.courseName}" — all questions and scenarios MUST relate to this course`
    : ""
}${sourceBlock}
Assignment type hint: ${req.assignmentType ?? "auto-detect"}
Max Points: 100
${syllabusAnchorBlock}${planWeekSection}${dedupAssign}${
        meetingContinuityBlock
          ? `\nCLASS MEETING CONTINUITY:\n${meetingContinuityBlock}\n`
          : ""
      }${
        req.projectFrame
          ? `
HOUSE FRAME — the shape every Rillcod practical project takes. Follow it, do not repeat it.
The frame is written once for hundreds of weeks, so it deliberately says nothing about THIS
week. That part is your job: name the actual tool and the actual concept from the topic and
syllabus above, and pitch every sentence at ${req.gradeLevel ?? "the stated grade"} — a Basic 1
pupil and an SS 3 student must not receive the same wording.

"${req.projectFrame}"
${req.projectFrameMinutes ? `Run time: about ${req.projectFrameMinutes} minutes.` : ""}${
              req.projectFrameDifficulty
                ? ` Difficulty: ${req.projectFrameDifficulty} of 10.`
                : ""
            }
`
          : ""
      }

Return a JSON object with this exact shape:
{
  "title": "string — clear assignment title",
  "description": "string — brief overview",
  "instructions": "string — detailed step-by-step instructions for the student",
  "assignment_type": "string — one of: homework, project, quiz, coding, exam, presentation",
  "metadata": {
    "deliverables": ["string — only for project type, e.g. 'A working Python script', 'Screenshot of output', 'Written explanation'"],
    "rubric": [
      { "criterion": "string — e.g. 'Code Functionality'", "description": "string — what earns full marks", "maxPoints": 25 }
    ]
  },
  "questions": [
    {
      "question_text": "string",
      "question_type": "string — one of: multiple_choice, true_false, fill_blank, essay, coding_blocks, block_sequence",
      "options": ["string — only for multiple_choice/true_false"],
      "correct_answer": "string",
      "points": 10,
      "metadata": {
        "logic_sentence": "string — only for coding_blocks, e.g. 'When [BLANK] clicked, move [BLANK] steps'",
        "logic_blocks": ["string — only for coding_blocks, all available block options"],
        "blocks": ["string — only for block_sequence: ALL available blocks including distractors"],
        "correct_sequence": ["string — only for block_sequence: correct order of blocks"]
      }
    }
  ]
}

RULES:
- For 'coding_blocks': correct_answer = comma-separated blocks for [BLANK] slots in order. logic_sentence uses [BLANK] for each gap.
- For 'block_sequence': correct_answer = comma-separated correct sequence. blocks[] includes the correct ones PLUS 1-2 distractor blocks mixed in.
- For 'project': include deliverables[] with 3-5 concrete items, and rubric[] with 3-4 criteria summing to ~100 pts.
- For visual/Scratch/block coding topics (grade Basic 1-JSS1): include at least 1 block_sequence question.
- For programming topics (JSS2-SS3): include at least 1 coding_blocks and 1 coding challenge question.
- Include at least 5 questions total.
- metadata.deliverables and metadata.rubric should be null/omitted for non-project assignments.
- Format the assignment description and instructions using rich Markdown (bold accents, bullet points, numbered lists, blockquotes).
- Include clear, well-commented sample code or template scripts inside standard language code fences (e.g. \`\`\`python, \`\`\`javascript, \`\`\`sql, \`\`\`bash, \`\`\`html, \`\`\`cpp) supporting all coding, database, and scripting topics.
- Keep explanations zero-jargon, and provide step-by-step guidance on what to build, test, and submit.`;
    }

    case "cbt": {
      const plan = getCbtGenerationPlan(req);
      const mcqCount = plan.mcqCount;
      const openCount = plan.openCount;
      const totalQ = plan.totalQ;

      const mcqInstruction =
        mcqCount > 0
          ? `SECTION A — Objective/MCQ: Generate EXACTLY ${mcqCount} multiple-choice or true/false questions. Each MUST have an "options" array of 4 choices and a "correct_answer". Set "question_type" to "multiple_choice" or "true_false". Use ${plan.objectivePoints} points unless a question is unusually demanding.`
          : "";
      const theoryInstruction =
        openCount > 0
          ? `SECTION B — Theory/Open: Generate EXACTLY ${openCount} open-ended questions (essay, fill_blank, or coding_blocks). These MUST have NO "options" array (or empty []). Set "question_type" to "essay", "fill_blank", or "coding_blocks" as appropriate. Use ${plan.theoryPoints} points for essay/coding_blocks and 3-5 points for fill_blank.`
          : "";

      return `Generate a Computer Based Test (CBT) for Rillcod Technologies.
Topic: "${req.topic}"
Grade level: ${req.gradeLevel ?? "Basic 1–SS3"}
Subject: ${req.subject ?? req.courseName ?? "Coding & Technology"}
Exam type: ${
        plan.examType === "evaluation" ? "Evaluation/Test" : "Main Examination"
      }
${req.programName ? `Programme: "${req.programName}"` : ""}
${
  req.courseName
    ? `Course: "${req.courseName}" — all questions MUST be framed within this course's scope and context`
    : ""
}
${
  req.className
    ? `Class/Cohort: "${req.className}" — pitch difficulty and scenarios to this class.`
    : ""
}
${
  req.sourceName ? `Attached teacher material: "${req.sourceName}"` : ""
}${sourceBlock}
Total questions required: EXACTLY ${totalQ}. You MUST generate all ${totalQ} — do not stop early.
Realistic boundary: ${plan.boundaryNote}
Duration to return: ${plan.durationMinutes} minutes. Passing score to return: ${
        plan.passingScore
      }.

${mcqInstruction}
${theoryInstruction}

CONTEXT-AWARE RULES:
- Stay inside the selected programme/course/source scope. Do not introduce unrelated technologies or advanced topics not implied by the teacher context.
- If source material is provided, at least 80% of questions must be traceable to it.
- Use realistic Nigerian classroom or academy scenarios only when they help the concept; avoid decorative stories that distract from assessment.
- Difficulty spread: about 40% recall/foundation, 40% application, 20% reasoning/debugging.
- For coding/web/database topics, include short code snippets in some questions using triple-backtick fences with the language. Keep snippets printable: 4-12 lines where possible.
- For MCQ questions, make distractors plausible and similar in length. Avoid "all of the above" and joke options.
- For theory questions, ask for explain/apply/debug/compare tasks, not vague "discuss everything" prompts.
- Do not ask students to use tools, internet, phones, or unavailable hardware during the CBT.

Return a JSON object with this exact shape:
{
  "title": "string — exam title",
  "description": "string — brief exam description",
  "duration_minutes": ${plan.durationMinutes},
  "passing_score": ${plan.passingScore},
  "questions": [
    {
      "question_text": "string — for code-based questions wrap the code snippet in triple backtick fences with the language, e.g. \`\`\`python\\nprint('hello')\\n\`\`\`",
      "question_type": "string — one of: multiple_choice, true_false, fill_blank, essay, coding_blocks",
      "options": ["string — ONLY for MCQ/true_false; omit or use [] for open-ended"],
      "correct_answer": "string",
      "points": 5,
      "metadata": {
        "logic_sentence": "string — only for coding_blocks",
        "logic_blocks": ["string"]
      }
    }
  ]
}

CRITICAL:
- questions array MUST contain exactly ${totalQ} items total.
${
  mcqCount > 0
    ? `- First ${mcqCount} questions MUST be objective (MCQ/true_false) with options arrays.`
    : ""
}
${
  openCount > 0
    ? `- Last ${openCount} questions MUST be open-ended (essay/fill_blank/coding_blocks) with no options.`
    : ""
}
- Keep boundaries realistic: do not exceed ${
        plan.maxQuestions
      } questions, do not return a duration outside ${
        plan.examType === "evaluation" ? "20-45" : "45-120"
      } minutes.
- Cover the topic across foundation, application, and reasoning levels.
- For technical/coding topics, include code snippets in triple-backtick fences where relevant.`;
    }

    case "lesson-plan":
      return `Generate a HIGH-ACTION, BENEFICIAL lesson plan for a Rillcod Technologies instructor.
      Topic: "${req.topic}"
      Grade level: ${req.gradeLevel ?? "Basic 1–SS3"}
      ${req.programName ? `Programme: "${req.programName}"` : ""}
      ${req.courseName ? `Course: "${req.courseName}"` : ""}

      This plan is for the TEACHER/PARENT. It should contain a "Secret Blueprint" on how to teach this topic effectively.
      ${
        req.courseName
          ? `All activities, examples, and teaching strategies MUST align with the "${req.courseName}" course scope.`
          : ""
      }
      
      Return a JSON object with this exact shape:
      {
        "plan_data": {
          "course_title": "string",
          "description": "string — teacher's overview",
          "teaching_strategy": "string — Specific 'Secret Sauce' on how to engage the kids",
          "weeks": [
            {
              "week": 1,
              "theme": "string — focus",
              "topics": ["string"],
              "teacher_instructions": ["Actionable step 1", "Actionable step 2"],
              "activities": ["string"]
            }
          ],
          "assessment_strategy": "string — how to check if they learned it",
          "materials": ["list of items needed"]
        }
      }`;

    case "library-content":
      return `Generate metadata for a piece of educational content for the Rillcod Technologies content library.
Topic: "${req.topic}"
Content type: ${
        req.contentType ?? req.currentContent?.contentType ?? "document"
      }
Grade level: ${req.gradeLevel ?? "JSS1–SS3"}
Subject: ${req.subject ?? "Technology"}

Return a JSON object with this exact shape:
{
  "title": "string — clear descriptive content title",
  "description": "string — 2-3 sentences describing the content and how to use it",
  "category": "string — one of: Coding, Robotics, AI & ML, Digital Entrepreneurship, STEM Projects, Assessments, Reference Materials",
  "tags": ["string"],
  "subject": "string",
  "grade_level": "string — Nigerian grade range e.g. Basic 4–JSS2",
  "license_type": "string — e.g. CC BY 4.0 or Rillcod Technologies Proprietary",
  "attribution": "string"
}`;
    case "newsletter":
      return `Generate a premium, visionary academic newsletter for Rillcod Technologies.
Topic/Event: "${req.topic}"
Target Audience: ${req.audience ?? "All School Stakeholders"}
Brand Tone: ${req.tone ?? "Professional & Educational"}

EVALUATIVE DIRECTIVES:
1. Context: Rillcod Technologies is a high-end STEM/Coding academy in Nigeria. Use prestigious, empowering language. 
2. Structure: 
   - A captivating edition title/headline.
   - Opening: A forward-thinking message about technology and education in Nigeria.
   - Core Body: Deep, detailed breakdown of the topic/event. Avoid surface-level fluff.
   - Encouraging Conclusion: Strategic closing message.
3. Spelling: Use British English only (e.g. 'programme', 'centre', 'favour').
4. Specificity: Weave in the importance of digital skills for the future Nigerian economy.
5. Length: Keep the newsletter compact enough for a polished 1-2 page PDF. Target 550-850 words unless the topic absolutely requires more.

FORMATTING RULES (CRITICAL):
- Do NOT use markdown symbols: no #, ##, ###, **, *, -, or bullet point symbols.
- Do NOT use code blocks or backticks.
- Use ONLY plain text. Use blank lines to separate sections.
- Use ALL CAPS for section headings (e.g. "INTRODUCTION", "CORE HIGHLIGHTS").
- Use a line of dashes (———) as a visual section divider if needed.
- Write in flowing paragraphs. Numbered points should use "1." "2." format with no asterisks.
- Avoid long repeated greetings, oversized introductions, and padded sign-offs.

Return a JSON object with this exact shape:
{
  "title": "string — a catchy, professional newsletter title (plain text, no symbols)",
  "content": "string — clean plain text content with blank lines between sections. No markdown symbols whatsoever.",
  "summary": "string — 1-2 sentence compelling summary for notification previews"
}
`;

    case "daily-missions": {
      return `You are a smart learning coach for Rillcod Technologies. Generate 3 highly personalized daily missions for a student.

Student Profile:
- Name: ${req.studentName ?? "Student"}
${req.gender ? `- Gender: ${req.gender}` : ""}
- XP Total: ${req.xp ?? 0}
- Current Streak: ${req.streak ?? 0} days
- Lessons Completed: ${req.lessonsDone ?? 0}
- Average Score: ${req.avgScore ?? 0}%
- Current Program: ${req.program ?? "STEM Curriculum"}
- Next Lesson: ${req.nextLesson ?? "Not started"}

Generate 3 missions that are:
1. Specific and actionable (not generic)
2. Appropriately challenging for their level
3. Rewarding with clear XP values
4. Encouraging and motivating in tone
5. ${
        req.gender === "male"
          ? "Use he/him/his pronouns when referring to the student"
          : req.gender === "female"
          ? "Use she/her pronouns when referring to the student"
          : `Refer to the student by name (${
              req.studentName ?? "the student"
            }) — avoid gendered pronouns`
      }

Return a JSON object with this exact shape:
{
  "missions": [
    {
      "id": "string — unique id like 'lesson-today'",
      "label": "string — short action title (max 40 chars)",
      "desc": "string — 1-sentence motivational description personalized to their stats",
      "xp": number — XP reward (10, 25, or 50),
      "emoji": "string — single relevant emoji",
      "href": "string — one of: /dashboard/lessons/{id}, /dashboard/assignments, /dashboard/cbt, /dashboard/leaderboard, /dashboard/learning",
      "type": "string — one of: lesson, assignment, quiz, streak, challenge"
    }
  ],
  "motivational_quote": "string — 1 short personalized quote in the voice of a Nigerian tech mentor. Max 20 words."
}`;
    }

    case "lesson-hook": {
      const hookContext = [
        req.programName ? `Programme: "${req.programName}"` : "",
        req.courseName ? `Course: "${req.courseName}"` : "",
      ]
        .filter(Boolean)
        .join(" | ");
      return `You are the Great Learning Explorer for Rillcod Technologies. Generate an EXCITING, addictive opening hook for a lesson.

Topic: "${req.topic}"
Grade Level: ${req.gradeLevel ?? "JSS1–SS3"}
${hookContext ? `Curriculum Context: ${hookContext}` : ""}

The hook should:
- Open with a surprising real-world fact or story about "${req.topic}"
- Create immediate curiosity and excitement
- Be 2-3 short paragraphs maximum
${
  req.courseName
    ? `- Show how this topic is a key building block in "${req.courseName}"`
    : ""
}
- End with a challenge question to the student

Return a JSON object:
{
  "hook": "string — the exciting lesson opening hook in markdown format",
  "hook_title": "string — catchy hook title (max 8 words)",
  "real_world_example": "string — one specific Nigerian or African real-world use case of this topic",
  "challenge_question": "string — an intriguing question to engage the student before the lesson starts"
}`;
    }

    case "code-generation": {
      let langLabel = req.subject ?? req.topic ?? "programming";
      if (langLabel === "robotics")
        langLabel = "Python (for Robotics Simulation)";

      return `You are an expert ${langLabel} assistant for Rillcod Technologies. 
Generate a high-quality, clean, and well-commented code snippet for the following request:
Task: "${req.topic}"
Language Target: ${langLabel}

Return a JSON object with this exact shape:
{
  "code": "string — The complete source code"
}

Requirements:
- Provide ONLY code that is directly runnable or easily integrated.
- Include thorough comments to explain the logic to a student.
- Follow industry standards and premium coding patterns.`;
    }

    case "curriculum": {
      const courseName = req.course_name ?? req.courseName ?? req.topic;
      const gradeLevel = req.grade_level ?? req.gradeLevel ?? "JSS1";
      const subjectArea = req.subject_area ?? req.subject ?? "STEM / Coding";
      const termCount = req.term_count ?? 3;
      const weeksPerTerm = req.weeks_per_term ?? 8;

      // Standard assessment schedule — fixed for all schools
      const assessWeek1 = 3;
      const assessWeek2 = 6;
      const examWeek = 8;

      return `You are an expert curriculum designer for Rillcod Technologies — a STEM/Coding innovation academy serving Nigerian partner schools (KG to SS3).

Your task: Design a COMPLETE, INNOVATIVE, and READY-TO-TEACH school curriculum for the following course.

Course: "${courseName}"
Grade Level: ${gradeLevel}
Subject Area: ${subjectArea}
Academic Terms: ${termCount}
Weeks Per Term: ${weeksPerTerm}
Target: Nigerian secondary/primary school students (school-partner programme)
${req.notes ? `Special Notes: ${req.notes}` : ""}

━━━ MANDATORY ASSESSMENT SCHEDULE (NEVER DEVIATE) ━━━
Every term follows this EXACT weekly structure (adapt proportionally if weeks_per_term > 8):
- Week 1: Lesson (foundations)
- Week 2: Lesson (core concepts)
- Week 3: FIRST ASSESSMENT — covers weeks 1–2 (type: "assessment")
- Week 4: Lesson (new application)
- Week 5: Lesson (advanced/project work)
- Week 6: SECOND ASSESSMENT — covers weeks 4–5 (type: "assessment")
- Week 7: Lesson (revision + consolidation)
- Week 8: END-OF-TERM EXAMINATION — covers all weeks 1–7 (type: "examination")`;
    }

    case "programme-curriculum": {
      // A holiday programme or short course runs once, straight through. The
      // school `curriculum` type above hard-codes three terms with assessments
      // fixed at weeks 3, 6 and 8 — a shape that means nothing here, and the
      // reason a special programme could never have its curriculum generated
      // without being bent onto the school spine.
      //
      // Grounded in the published programme page rather than invented from a
      // course title, so what is taught cannot drift from what was advertised.
      // Each track/module only covers its own window (e.g. Generative Art =
      // Weeks 1–2), never the whole cohort calendar.
      const weeks = Number(req.weeks_per_term ?? req.week_count ?? 7);
      const topics = Array.isArray(req.topics) ? req.topics : [];
      const spine = Array.isArray(req.programme_weeks) ? req.programme_weeks : [];
      const weekNumbers = Array.isArray(req.week_numbers) && req.week_numbers.length
        ? req.week_numbers.map(Number).filter((n) => Number.isFinite(n) && n > 0)
        : Array.from({ length: weeks }, (_, i) => i + 1);
      const sessionsPerWeek = Math.max(
        1,
        Math.min(7, Math.floor(Number(req.sessions_per_week) || 1)),
      );
      const shortModule = weekNumbers.length <= 3;
      const numberingLine = weekNumbers.join(", ");
      const multiSession = sessionsPerWeek > 1;

      return `You are designing a ready-to-teach curriculum for Rillcod Technologies.

This is a DURATION PROGRAMME MODULE — one track inside a holiday programme or
short course. Generate ONLY this track's teaching weeks. Do NOT invent content
from other modules (no Python, web apps, games, or graduation filler unless
those topics are listed below for THIS track).

Programme: "${req.programme_title ?? req.topic}"
Track / Course: "${req.course_name ?? req.courseName ?? req.topic}"
${req.track_week_label ? `Module window on the published page: ${req.track_week_label}` : ""}
Learners: ${req.ages_label ?? req.gradeLevel ?? "mixed ages"}
Duration: ${req.duration_label ?? `${weeks} weeks`}
Sessions per calendar week: ${sessionsPerWeek}
${req.hero_blurb ? `Programme promise: ${req.hero_blurb}` : ""}
${req.track_desc ? `Track promise: ${req.track_desc}` : ""}

━━━ THE ADVERTISED TOPICS — COVER ALL OF THEM ━━━
These were published to parents on the programme page for THIS track only.
Every one must appear. Do not add topics from other tracks.
${topics.map((t: unknown, i: number) => `${i + 1}. ${String(t)}`).join("\n") || "(none listed — stay inside the week spine below)"}

${spine.length ? `━━━ THIS MODULE'S PUBLISHED WEEK SPINE ━━━\n${spine
        .map((w: any) => `${w.num ?? ""}: ${w.title ?? ""}${w.desc ? ` — ${w.desc}` : ""}`)
        .join("\n")}` : ""}

━━━ SHAPE ━━━
- Exactly ${weekNumbers.length} calendar weeks, numbered ${numberingLine} (programme calendar numbers).
${multiSession
  ? `- Each calendar week has exactly ${sessionsPerWeek} class sessions (session 1..${sessionsPerWeek}).
- Put a nested "sessions" array on every week object — one entry per class meeting.
- Spread the advertised topics across sessions in order; each session is its own teachable unit.`
  : `- One teachable unit per calendar week (session 1 implied).`}
- Put the advertised topics in the order given; expand them across THESE weeks
  only — do not stretch the module across the rest of the cohort.
- Stay inside THIS track's promise and topics only; never pad with unrelated
  modules from the rest of the cohort.
${shortModule
  ? `- Short module: the final week's last session is a project showcase (type: "project"); earlier sessions are lessons.`
  : `- A project-based checkpoint every third week (type: "project" on that week's last session).
- The final week's last session is a showcase of the learner's own work (type: "project"), never an examination.`}
- Practical and screen-based throughout; these learners chose this programme.

━━━ RETURN EXACTLY THIS SHAPE ━━━
One term object holding every week, because the module is one continuous run.
{
  "course_title": "string",
  "description": "string — what a parent would read",
  "overview": "string — what the learner will be able to do by the end",
  "learning_outcomes": ["string"],
  "materials_required": ["string"],
  "recommended_tools": ["string"],
  "assessment_strategy": "string — how progress is judged without an exam",
  "terms": [
    {
      "term": 1,
      "title": "string — this module run, not a school term",
      "weeks": [
        {
          "week": ${weekNumbers[0] ?? 1},
          "type": "lesson" | "project",
          "topic": "string — week theme",
${multiSession
  ? `          "sessions": [
            {
              "session": 1,
              "type": "lesson" | "project",
              "topic": "string — this class meeting",
              "subtopics": ["string"],
              "objectives": "string",
              "activities": "string",
              "notes": "string — what the teacher should know before the session"
            }
          ]`
  : `          "subtopics": ["string"],
          "objectives": "string",
          "activities": "string",
          "notes": "string — what the teacher should know before the session"`}
        }
      ]
    }
  ]
}`;
    }

    case "slides": {
      const count = Math.min(8, Math.max(5, Number(req.slideCount) || 7));
      return `Create a teacher-ready ${count}-slide learning deck for Rillcod Technologies.

Topic: "${req.topic}"
Class: ${req.className ?? req.gradeLevel ?? "Basic 1 to SS3"}
Course: ${req.courseName ?? req.subject ?? "STEM & Technology"}
${
  req.planWeekObjectives?.trim()
    ? `Official week objectives:\n${req.planWeekObjectives.trim()}`
    : ""
}
${
  req.planWeekActivities?.trim()
    ? `Official week activities:\n${req.planWeekActivities.trim()}`
    : ""
}
${
  req.syllabusReference?.trim()
    ? `Syllabus anchor:\n${req.syllabusReference.trim()}`
    : ""
}
${
  req.lessonSummary?.trim()
    ? `Generated lesson context:\n${req.lessonSummary.slice(0, 7000)}`
    : ""
}

Design the deck as one coherent classroom story:
1. Title and curiosity hook.
2. Learning goals and prior-knowledge bridge.
3. Two or three clear concept slides with simple British English.
4. A Nigerian or African real-world example.
5. A guided learner activity or worked example.
6. Recap with a short exit question.

Keep each slide scannable: one short title, zero to five concise bullets, and one optional takeaway. Do not repeat the lesson word-for-word. Do not include URLs, markdown, HTML, speaker instructions, or image placeholders.

Return ONLY this JSON shape:
{
  "slides": [
    {
      "kind": "title" | "concept" | "example" | "activity" | "recap",
      "kicker": "short section label",
      "title": "clear slide title",
      "bullets": ["concise learner-facing point"],
      "takeaway": "optional one-sentence memory anchor"
    }
  ]
}`;
    }

    case "flashcard": {
      const count = req.questionCount ?? 10;
      return `Generate a set of ${count} high-quality educational flashcards for Rillcod Technologies.
Topic: "${req.topic}"
Grade Level: ${req.gradeLevel ?? "JSS1–SS3"}
Subject: ${req.subject ?? req.courseName ?? "Coding & Technology"}
Difficulty: ${req.difficulty ?? "medium"}
${req.sourceMaterial?.trim() ? `Lesson context — stay within this material:\n"""\n${req.sourceMaterial.trim().slice(0, 4000)}\n"""` : ""}

RULES:
1. Generate exactly ${count} cards.
2. "Front" should be a clear, concise question or term (maximum 20 words).
3. "Back" should be a self-contained answer or explanation in 1–3 sentences.
4. Content must be age-appropriate for ${req.gradeLevel ?? "all levels"}.
5. Vary definitions, applications, comparisons, code output and true/false reasoning.
6. Use British English and avoid repetition.

Return a JSON object with this exact shape:
{
  "cards": [
    {
      "front": "string — question or term",
      "back": "string — answer or explanation",
      "tags": ["string"],
      "difficulty": "easy" | "medium" | "hard"
    }
  ]
}`;
    }

    case "project": {
      return `Generate a detailed project activity for Rillcod Technologies students.
Topic / Project Title: "${req.topic}"
Grade level: ${req.gradeLevel ?? "JSS1–SS3"}
Subject: ${req.subject ?? req.courseName ?? "Coding & Technology"}
${req.programName ? `Programme: "${req.programName}"` : ""}
${req.courseName ? `Course: "${req.courseName}"` : ""}
Difficulty: ${req.difficulty ?? "intermediate"}

Return a JSON object with this exact shape:
{
  "title": "string — engaging project title",
  "description": "string — 2-3 sentence project overview that excites students",
  "instructions": "string — detailed step-by-step instructions (numbered lists, be specific about requirements)",
  "category": "string — one of: coding, web, ai, design, research, hardware, presentation",
  "difficulty": "string — one of: beginner, intermediate, advanced",
  "tags": ["string — 3-6 relevant skill tags"],
  "submission_types": ["string — one or more of: link, code, file, screenshot, text"],
  "rubric": [
    { "name": "string — e.g. Functionality", "desc": "string — what earns full marks", "maxPts": 40 }
  ]
}

RULES:
- Instructions must be clear enough for a student to follow independently — numbered steps, specific deliverables.
- rubric must have 3-4 criteria with maxPts values summing to exactly 100.
- submission_types must match the deliverable (code project → link + code; hardware → screenshot + text).
- Make it engaging and achievable for Nigerian secondary school students.
- Incorporate structured programming scripts, terminal commands, database setups, or HTML block outlines inside explicit language code fences (e.g. \`\`\`python, \`\`\`javascript, \`\`\`sql, \`\`\`bash, \`\`\`html, \`\`\`cpp) to ground the project's codebase.`;
    }

    default:
      throw new Error(`Unknown generate type: ${req.type}`);
  }
}

// ── Engine ───────────────────────────────────────────────────────────────────

export const VALID_GENERATE_TYPES: GenerateType[] = [
  "lesson",
  "lesson-notes",
  "lesson-plan",
  "library-content",
  "assignment",
  "project",
  "cbt",
  "report-feedback",
  "cbt-grading",
  "newsletter",
  "code-generation",
  "daily-missions",
  "lesson-hook",
  "custom",
  "curriculum",
  "programme-curriculum",
  "flashcard",
  "slides",
];

/** Safe JSON extraction — handles markdown code fences and truncated responses. */
export function safeParseJSON(raw: string): any {
  // Strip markdown code fences if present
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(stripped);
  } catch {
    // Try to recover a JSON object from the string
    const match = stripped.match(/(\{[\s\S]*\})/);
    if (match) {
      try {
        // Aggressively clean up trailing commas and potential escaped control chars which AI loves
        const cleaned = match[1]
          .replace(/,\s*([\}\]])/g, "$1") // Trailing commas
          .replace(/\/\/.*/g, "") // Comments
          .replace(/\\n/g, " ") // Escaped newlines that might break some parsers
          .trim();
        return JSON.parse(cleaned);
      } catch (e2) {
        console.error("Safe parse failed even after rescue:", e2);
      }
    }
    throw new Error("AI returned malformed data — please refresh and try again");
  }
}

export interface GenerationPlan {
  prompt: string;
  systemPrompt: string;
  modelQueue: string[];
  temperature: number;
  maxTokens: number;
  useJsonFormat: boolean;
}

/**
 * Resolves everything a generation needs before a single token is spent: the
 * prompt, the persona, and the model queue for this task type.
 */
export async function resolveGenerationPlan(
  body: GenerateRequest
): Promise<GenerationPlan> {
  const { type } = body;
  const prompt = buildPrompt(body);

  // Rich lesson types need more tokens to avoid truncated JSON
  // For CBT scale tokens with question count: ~150 tokens per question minimum
  const cbtPlan = type === "cbt" ? getCbtGenerationPlan(body) : null;
  const cbtTotal =
    cbtPlan?.totalQ ??
    ((body.mcqCount ?? 0) + (body.theoryCount ?? 0) ||
      (body.questionCount ?? 10));
  const cbtTokens = type === "cbt" ? Math.max(3000, cbtTotal * 200) : 0;
  const maxTokens =
    type === "lesson"
      ? 4000
      : type === "lesson-plan"
      ? 3500
      : type === "cbt"
      ? cbtTokens
      : type === "assignment"
      ? 3000
      : type === "slides"
      ? 3500
      : 2048;

  // --- AGENTIC HIERARCHICAL TASK ROUTING ---
  // We select the "Expert Persona" based on the task type
  let modelQueue = [...MODELS];
  let adaptiveTemperature = 0.7;
  let adaptiveMaxTokens = maxTokens;

  switch (type) {
    case "lesson":
      // Best models for rich, structured, creative educational content
      modelQueue = [
        "google/gemini-2.5-flash", // Gemini 2.5 Flash via OpenRouter fallback
        "qwen/qwen3-235b-a22b:free", // 235B params, massive reasoning, free
        "deepseek/deepseek-r1:free", // Reasoning model — rich structured content
        "moonshotai/kimi-k2.5", // High intelligence, great for detailed content
        "deepseek/deepseek-chat-v3-5", // Strong writer fallback
        "x-ai/grok-2-1212", // Creative/playful fallback
      ];
      adaptiveTemperature = 0.75;
      adaptiveMaxTokens = 16000;
      break;

    case "lesson-notes":
      modelQueue = [
        "google/gemini-2.5-flash", // Gemini 2.5 Flash via OpenRouter fallback
        "qwen/qwen3-235b-a22b:free", // 235B free — excellent at structured writing
        "moonshotai/kimi-k2.5", // Deep synthesis
        "deepseek/deepseek-chat-v3-5", // Strong writer
        "meta-llama/llama-3.3-70b-instruct", // Solid free fallback
        "google/gemini-2.0-flash-lite-001", // Reliable emergency fallback
        "meta-llama/llama-3.1-8b-instruct:free", // Last resort
      ];
      adaptiveTemperature = 0.6;
      adaptiveMaxTokens = 3500;
      break;

    case "code-generation":
      // DeepSeek V3 is the undisputed king of logic/code
      modelQueue = [
        "deepseek/deepseek-chat-v3-5",
        "deepseek/deepseek-chat",
        "google/gemini-2.0-flash-001",
      ];
      adaptiveTemperature = 0.2; // High precision
      break;

    case "cbt":
    case "cbt-grading":
      // Analytical models for precision — Qwen 2.5 removed from primary (returns malformed JSON)
      modelQueue = [
        "google/gemini-2.0-flash-001", // Reliable JSON + fast
        "deepseek/deepseek-chat-v3-5", // Strong analytical fallback
        "meta-llama/llama-3.3-70b-instruct", // Solid fallback
        "google/gemini-2.0-flash-lite-001", // Emergency fallback
      ];
      adaptiveTemperature = 0.1; // Zero hallucination
      break;

    case "lesson-hook":
      modelQueue = [
        "google/gemini-2.0-flash-001",
        "x-ai/grok-2-1212",
        "meta-llama/llama-3.3-70b-instruct",
      ];
      adaptiveTemperature = 0.92; // High creativity for hooks
      adaptiveMaxTokens = 1024;
      break;

    case "daily-missions":
      modelQueue = [
        "google/gemini-2.0-flash-001",
        "x-ai/grok-2-1212",
        "meta-llama/llama-3.3-70b-instruct",
      ];
      adaptiveTemperature = 0.85;
      adaptiveMaxTokens = 2048;
      break;

    case "assignment":
      modelQueue = [
        "google/gemini-2.0-flash-001",
        "deepseek/deepseek-chat-v3-5",
        "deepseek/deepseek-r1:free", // Free reasoning fallback
        "qwen/qwen3-235b-a22b:free",
        "meta-llama/llama-3.3-70b-instruct",
        "google/gemini-2.0-flash-lite-001",
      ];
      adaptiveTemperature = 0.4; // Balanced — consistent but not rigid
      adaptiveMaxTokens = 2000;
      break;

    case "project":
      modelQueue = [
        "google/gemini-2.0-flash-001",
        "deepseek/deepseek-r1:free", // Reasoning — structured project specs
        "qwen/qwen3-235b-a22b:free",
        "deepseek/deepseek-chat-v3-5",
        "meta-llama/llama-3.3-70b-instruct",
        "google/gemini-2.0-flash-lite-001",
      ];
      adaptiveTemperature = 0.65;
      adaptiveMaxTokens = 3000;
      break;

    case "lesson-plan":
      modelQueue = [
        "qwen/qwen3-235b-a22b:free", // Primary: 235B free, superb at structured plans
        "google/gemini-2.0-flash-001", // Fast reliable second choice
        "moonshotai/kimi-k2.5", // High intelligence fallback
        "meta-llama/llama-3.3-70b-instruct",
      ];
      adaptiveTemperature = 0.5; // Structured and pedagogically sound
      adaptiveMaxTokens = 2000;
      break;

    case "report-feedback":
      modelQueue = [
        "qwen/qwen3-235b-a22b:free", // Primary: nuanced writing, 235B free
        "google/gemini-2.0-flash-001", // Fast reliable second
        "deepseek/deepseek-chat-v3-5", // Strong at empathetic prose
      ];
      adaptiveTemperature = 0.75;
      adaptiveMaxTokens = 2048;
      break;

    case "newsletter":
      modelQueue = [
        "google/gemini-2.5-flash", // Gemini 2.5 Flash via OpenRouter fallback
        "deepseek/deepseek-chat-v3-5", // Strong at professional writing
        "x-ai/grok-2-1212", // Witty, visionary tone
        "qwen/qwen3-235b-a22b:free", // Large context, free fallback
        "meta-llama/llama-3.3-70b-instruct", // Solid fallback
        "meta-llama/llama-3.1-8b-instruct:free", // Emergency free fallback
      ];
      adaptiveTemperature = 0.8;
      adaptiveMaxTokens = 3000;
      break;

    case "curriculum":
    case "programme-curriculum":
      modelQueue = [
        "google/gemini-2.5-flash", // Gemini 2.5 Flash (stable, cheaper)
        "deepseek/deepseek-r1:free", // Free reasoning model
        "qwen/qwen3-235b-a22b:free", // 235B free — thorough but may truncate
        "google/gemini-2.0-flash-001", // 1M ctx fallback
        "meta-llama/llama-3.3-70b-instruct", // Reliable fallback
        "google/gemini-2.0-flash-lite-001", // Emergency fallback
      ];
      adaptiveTemperature = 0.55; // Creative enough for fresh topics, structured enough for JSON
      adaptiveMaxTokens = 16000; // Full lesson plans per week need many tokens
      break;

    case "slides":
      modelQueue = [
        "google/gemini-2.5-flash",
        "google/gemini-2.0-flash-001",
        "deepseek/deepseek-chat-v3-5",
        "meta-llama/llama-3.3-70b-instruct",
      ];
      adaptiveTemperature = 0.55;
      adaptiveMaxTokens = 3500;
      break;

    case "flashcard":
      modelQueue = [
        "google/gemini-2.0-flash-001",
        "deepseek/deepseek-chat-v3-5",
        "meta-llama/llama-3.3-70b-instruct",
      ];
      adaptiveTemperature = 0.8;
      adaptiveMaxTokens = 4000;
      break;

    default:
      // Smart fallback (Gemini 2.0 is the best all-rounder)
      modelQueue = [
        "google/gemini-2.0-flash-001",
        "x-ai/grok-2-1212",
        "meta-llama/llama-3.1-8b-instruct:free",
      ];
  }

  // lesson-notes uses plain-text response (no response_format) to avoid malformed JSON errors
  const useJsonFormat = type !== "lesson-notes";

  // The queues above are preferences, not the decision. One policy resolves
  // them against the live free tier for every AI route in the app, so
  // free-first, retired ids and JSON capability are settled in one place
  // rather than re-litigated per route.
  //
  // A dead OpenRouter catalogue must not take the free Gemini ladder down with
  // it: this queue is the paid fallback, and failing to build one is not a
  // reason to skip generating at all.
  const resolvedQueue = await modelQueueFor({
    prefer: modelQueue,
    needsJson: useJsonFormat,
  }).catch(() => modelQueue);

  return {
    prompt,
    systemPrompt:
      type === "report-feedback"
        ? REPORT_FEEDBACK_SYSTEM_PROMPT
        : SYSTEM_PROMPT,
    modelQueue: resolvedQueue,
    temperature: adaptiveTemperature,
    maxTokens: adaptiveMaxTokens,
    useJsonFormat,
  };
}

export interface GenerationResult {
  success: true;
  model?: string;
  /** Present for every type except "custom". */
  data?: any;
  /** "custom" returns free-form content plus whatever the model parsed into. */
  content?: string;
  extra?: Record<string, unknown>;
}

/**
 * Runs a generation to completion — free Gemini first, then the OpenRouter
 * queue. Throws when every model fails.
 *
 * This is the in-process entry point. Callers that have already authorised the
 * user (route handlers, lesson-plan generators) should use it directly rather
 * than making an HTTP request back to /api/ai/generate.
 */
export async function generateAIContent(
  body: GenerateRequest
): Promise<GenerationResult> {
  const { type } = body;

  if (!VALID_GENERATE_TYPES.includes(type)) {
    throw new Error("invalid type");
  }
  if (!body.topic?.trim() && !body.prompt?.trim()) {
    throw new Error("topic or prompt is required");
  }

  const plan = await resolveGenerationPlan(body);
  let lastError: string | null = null;

  // ── Gemini Direct API fast path ────────────────────────────────────────────
  // Try the free direct Gemini API before spending OpenRouter credits.
  const geminiResult = await geminiGenerateText(
    plan.systemPrompt,
    plan.prompt,
    plan.useJsonFormat
  ).catch(() => null);

  if (geminiResult?.text) {
    if (type === "lesson-notes") {
      const clean = geminiResult.text
        .replace(/^```(?:json|markdown)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      if (clean.length > 100) {
        try {
          const parsed = safeParseJSON(clean);
          if (parsed.lesson_notes) {
            return {
              success: true,
              model: geminiResult.model,
              data: finalizeGeneratedData(type, parsed, body),
            };
          }
        } catch {
          // Not JSON — the raw text is the notes.
        }
        return {
          success: true,
          model: geminiResult.model,
          data: finalizeGeneratedData(type, { lesson_notes: clean }, body),
        };
      }
    } else {
      try {
        const parsed = safeParseJSON(geminiResult.text);
        if (type === "custom") {
          return {
            success: true,
            model: geminiResult.model,
            content:
              parsed.content ||
              parsed.text ||
              parsed.answer ||
              geminiResult.text,
            extra: parsed,
          };
        }
        return {
          success: true,
          model: geminiResult.model,
          data: finalizeGeneratedData(type, parsed, body),
        };
      } catch {
        // Malformed JSON from Gemini — fall through to the OpenRouter queue
      }
    }
  }

  // ── OpenRouter queue ───────────────────────────────────────────────────────
  const openRouterKey = process.env.OPENROUTER_API_KEY ?? "";
  // The queue may end in Hugging Face entries, which carry their own
  // credential and endpoint. Bailing purely on a missing OpenRouter key would
  // throw away a tier that is configured and working, so the giving-up
  // condition is "no paid provider at all" rather than "no OpenRouter".
  const hasPaidFallback = Boolean(openRouterKey) || hasHuggingFaceKey();
  if (!hasPaidFallback) {
    throw new Error(
      "AI generation failed: the free Gemini tier returned nothing and no OpenRouter or Hugging Face key is configured."
    );
  }

  for (const modelId of plan.modelQueue) {
    try {
      const controller = new AbortController();
      const timeoutMs = ["lesson", "lesson-notes", "curriculum", "programme-curriculum"].includes(type)
        ? 55000
        : 30000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      // Resumes itself when it hits max_tokens instead of returning a body
      // cut mid-token that the parser then rejects.
      let completion: Awaited<ReturnType<typeof openRouterComplete>> | null =
        null;
      let requestFailed = false;
      try {
        completion = await openRouterComplete({
          apiKey: openRouterKey,
          model: modelId,
          system: plan.systemPrompt,
          user: plan.prompt,
          maxTokens: Math.min(plan.maxTokens, OPENROUTER_MAX_OUTPUT_TOKENS),
          temperature: plan.temperature,
          json: plan.useJsonFormat,
          signal: controller.signal,
        });
      } catch {
        requestFailed = true;
      }

      clearTimeout(timeoutId);

      if (!requestFailed && completion) {
        const content = completion.content;
        // Same quality gate as the streaming path: a stub that parses is not
        // content, and the queue exists so a weak reply can be improved on.
        if (content && content.length < MIN_CONTENT_CHARS) {
          console.warn(
            `Model ${modelId} returned ${content.length} chars — below the content floor, trying the next model`
          );
          lastError = `${modelId} returned too little content`;
        } else if (content) {
          // For lesson-notes: try JSON parse first, then fall back to wrapping raw text
          if (type === "lesson-notes") {
            try {
              const parsed = safeParseJSON(content);
              // If parsed but lesson_notes is missing, wrap the whole content
              if (!parsed.lesson_notes && typeof content === "string") {
                return {
                  success: true,
                  model: modelId,
                  data: finalizeGeneratedData(
                    type,
                    { lesson_notes: content },
                    body
                  ),
                };
              }
              return {
                success: true,
                model: modelId,
                data: finalizeGeneratedData(type, parsed, body),
              };
            } catch {
              // JSON parse failed — use raw text as lesson_notes directly
              const cleanContent = content
                .replace(/^```(?:json|markdown)?\s*/i, "")
                .replace(/\s*```$/i, "")
                .trim();
              if (cleanContent.length > 100) {
                return {
                  success: true,
                  model: modelId,
                  data: finalizeGeneratedData(
                    type,
                    { lesson_notes: cleanContent },
                    body
                  ),
                };
              }
            }
          } else {
            const parsed = safeParseJSON(content);
            // Handle 'custom' type specifically to match ProtocolPage expectation
            if (type === "custom") {
              return {
                success: true,
                model: modelId,
                content:
                  parsed.content ||
                  parsed.text ||
                  parsed.answer ||
                  (typeof content === "string"
                    ? content
                    : JSON.stringify(content)),
                extra: parsed,
              };
            }
            return {
              success: true,
              model: modelId,
              data: finalizeGeneratedData(type, parsed, body),
            };
          }
        }
      } else {
        console.warn(`Model ${modelId} failed — trying the next one`);
        lastError = `Model ${modelId} did not return a usable response`;
      }
    } catch (err: any) {
      console.error(`Error attempting model ${modelId}:`, err.message);
      lastError = err.message;
    }
  }

  throw new Error(
    `AI generation failed after trying all models. Last error: ${lastError}`
  );
}
