import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient as createServerClient } from '@/lib/supabase/server';

// OpenRouter provides an OpenAI-compatible API — swap base URL + auth header
const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  defaultHeaders: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://rillcod.com',
    'X-Title': 'Rillcod Technologies',
  },
});

const MODELS = [
  // ── Tier 1: Premium (best quality) ─────────────────────────────
  "google/gemini-2.0-flash-001",              // Primary Stable (Fast)
  "x-ai/grok-2-1212",                         // Grok-2 (Wit & Logic)
  "moonshotai/kimi-k2.5",                     // High Intelligence (Kimi)
  // ── Tier 2: DeepSeek family ────────────────────────────────────
  "deepseek/deepseek-chat-v3-5",             // DeepSeek V3.2 (latest)
  "deepseek/deepseek-chat",                   // DeepSeek V3.0
  "deepseek/deepseek-r1:free",               // DeepSeek R1 (reasoning, free)
  // ── Tier 3: Qwen3 family ──────────────────────────────────────
  "qwen/qwen3-235b-a22b:free",               // Qwen3 235B (free tier)
  "qwen/qwen3-30b-a3b:free",                 // Qwen3 30B (free tier)
  "qwen/qwen3-14b:free",                     // Qwen3 14B (free tier)
  // ── Tier 4: MiniMax ───────────────────────────────────────────
  "minimax/minimax-01",                       // MiniMax M2.5 (long context)
  // ── Tier 5: GLM / ZhipuAI ─────────────────────────────────────
  "zhipuai/glm-4-flash:free",                // GLM-4 Flash (free tier)
  "zhipuai/glm-z1-flash:free",               // GLM-Z1 Flash (free tier)
  // ── Tier 6: StepFun ───────────────────────────────────────────
  "stepfun/step-3-5-flash",                  // StepFun Step 3.5 Flash
  // ── Tier 7: MiMo ──────────────────────────────────────────────
  "xiaomi/mimo-v2-flash:free",               // MiMo V2 Flash (free)
  // ── Tier 8: Reliability fallbacks ─────────────────────────────
  "google/gemini-flash-1.5",
  "meta-llama/llama-3.3-70b-instruct",
  "mistralai/mistral-large-2411",
  "meta-llama/llama-3.1-8b-instruct:free",   // Fast free fallback
  "mistralai/mistral-7b-instruct:free",       // Emergency fallback
];

const SYSTEM_PROMPT = `You are the 'Great Learning Explorer' for Rillcod Technologies. 
Your mission is to create super-fun, exciting, and easy-to-understand STEM & Robotics lessons for kids (Basic 1 to SS3).

CORE PHILOSOPHY:
- "The Deep Adventure Loop": Every lesson is a fun journey—starting with a "Hook" (Exciting start), followed by a "Big Picture" (Visual maps/lessons), and ending with a "Level-Up Mission" (Kid-friendly project).
- "Enthusiastic Guide": Tone should be warm, encouraging, visionary, and very kid-friendly. Use simple words. No jargon. Use British English.
- "No-Work Experiments": Automatically include fun projects, labs, and easy experiments. The goal is 100% student fun with no teacher work.

SPECIALIZED BLOCKS (MANDATORY VARIETY):
- 'illustration': Simplified "Key Points" cards. Schema: { title: string, items: { label: string, value: string }[] }.
- 'code-map': "Logic Map" of how things work. Schema: { components: { name: string, description: string }[] }.
- 'activity': 'Synthesis Mission' with easy-to-follow 'steps' and 'is_coding' flag.
- 'assignment-block': A specific 'Level-Up Challenge'. Schema: { title: string, instructions: string, deliverables: string[] }.
- 'scratch': For KG-Basic 6 only. 'projectId' (optional), 'blocks' (Array), and 'instructions' (Fixing Guide).
- 'quiz': 'Fun Checkpoint' with 'question', 'options', and 'correctAnswer' (Index).

EXTENSIVENESS: 
Lesson notes MUST be detailed and deep but CONCISE and EASY TO SCAN. Avoid long paragraphs. Use headers like "The Adventure Ahead", "The Secret Sauce", "Your Level-Up Mission". Use bullet points and simple analogies. 
For JSS1-SS3: Include clear code mission steps. 
For KG-Basic 6: Focus on "Visual Logic Models" and "Debugging Fun".

Return ONLY valid JSON.`;

type GenerateType = 'lesson' | 'lesson-notes' | 'lesson-plan' | 'library-content' | 'assignment' | 'cbt' | 'report-feedback' | 'cbt-grading' | 'newsletter' | 'code-generation' | 'daily-missions' | 'lesson-hook' | 'custom';

interface GenerateRequest {
  type: GenerateType;
  topic: string;
  studentName?: string;
  gradeLevel?: string;
  subject?: string;
  durationMinutes?: number;
  termWeeks?: number;
  contentType?: string;
  lessonMode?: 'academic' | 'project' | 'interactive';
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
  // For daily missions & hooks
  xp?: number;
  streak?: number;
  lessonsDone?: number;
  avgScore?: number;
  nextLesson?: string;
  program?: string;
  // For report feedback
  theoryScore?: number | string;
  practicalScore?: number | string;
  participationScore?: number | string;
  overallScore?: number | string;
  overallGrade?: string;
  proficiencyLevel?: string;
  courseName?: string;
  programName?: string;
  prompt?: string;
  // Curriculum context — used to tailor lessons to specific course/program
  siblingLessons?: string[]; // Titles of other lessons in the same course (for continuity)
}

function buildPrompt(req: GenerateRequest): string {
  switch (req.type) {
    case 'custom':
      return req.prompt || req.topic;
    case 'cbt-grading':
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

    case 'report-feedback': {
      const overallScore = Number(req.overallScore ?? 0);
      const theory = Number(req.theoryScore ?? 0);
      const practical = Number(req.practicalScore ?? 0);
      const participation = Number(req.participationScore ?? 0);
      const proficiency = req.proficiencyLevel ?? 'intermediate';

      // Convert scores to descriptive bands — never expose raw numbers to the AI output
      const band = (n: number) =>
        n >= 85 ? 'outstanding' :
        n >= 75 ? 'excellent' :
        n >= 65 ? 'very good' :
        n >= 55 ? 'good' :
        n >= 45 ? 'satisfactory' :
        n >= 35 ? 'fair' : 'needs improvement';

      const overallBand = band(overallScore);
      const theoryBand = band(theory);
      const practicalBand = band(practical);
      const participationBand = band(participation);

      // Identify weakest/strongest area by label only
      const scores = { Theory: theory, Practical: practical, Participation: participation };
      const weakest = Object.entries(scores).sort(([, a], [, b]) => a - b)[0][0];
      const strongest = Object.entries(scores).sort(([, a], [, b]) => b - a)[0][0];

      const courseLine = req.courseName ? `Course: "${req.courseName}"` : '';
      const programLine = req.programName ? `Programme: "${req.programName}"` : '';
      const contextBlock = [courseLine, programLine].filter(Boolean).join('\n');

      return `You are an experienced Nigerian school administrator writing brief, professional student report card comments.

Student: "${req.studentName ?? 'The student'}"
${contextBlock}
Current Topic/Module: "${req.topic}"
Overall performance: ${overallBand}
Theory: ${theoryBand} | Practical: ${practicalBand} | Participation: ${participationBand}
Strongest area: ${strongest} | Area needing most attention: ${weakest}
Proficiency level: ${proficiency}

RULES — follow strictly:
1. Write EXACTLY 2-3 short, clear sentences per section. No more, no less.
2. NEVER include any numbers, percentages, or scores in your output — use only descriptive words (e.g. "excellent", "satisfactory", "needs more practice").
3. Use simple, everyday English that parents and students can easily understand.
4. Be SPECIFIC — reference the course or programme name to make the comment feel personal.
5. Sound like a caring but professional head teacher — warm, honest, and encouraging.
6. Key Strengths: celebrate what the student genuinely did well, referencing their strongest area and overall performance level.
7. Areas for Growth: give one clear, kind, achievable action the student can take in this specific course, focused on the weakest area.

Return ONLY this JSON (no extra text):
{
  "key_strengths": "2-3 sentences praising real achievements using descriptive words only.",
  "areas_for_growth": "2-3 sentences with a simple, kind, actionable direction — no numbers."
}`; }


    case 'lesson-notes': {
      const grade = req.gradeLevel ?? 'Basic 1–SS3';
      const youngGrades = ['KG', 'Basic 1', 'Basic 2', 'Basic 3', 'Basic 4', 'Basic 5', 'Basic 6'];
      const isYoung = youngGrades.some(g => grade === g || grade.startsWith(g) || grade.includes('KG'));
      const notesContextLine = [
        req.programName ? `Programme: "${req.programName}"` : '',
        req.courseName ? `Course: "${req.courseName}"` : '',
      ].filter(Boolean).join(' | ');

      if (isYoung) {
        return `Write simple, fun study notes for a Nigerian primary school student.
Topic: "${req.topic}"
Grade: ${grade}
Subject: ${req.subject ?? req.courseName ?? 'Coding & Technology'}
${notesContextLine ? `Context: ${notesContextLine}` : ''}

STRICT RULES for young learners:
- Write like you are talking to a 7-10 year old friend
- Use VERY SHORT sentences (max 12 words each)
- Use emojis to make it fun 🎉
- Give real-life Nigerian examples (mention things like phones, generators, traffic lights, Afrobeats, suya, football)
- NO technical jargon. If you must use a tech word, explain it with "That means..."
- Use headers like "## What is it? 🤔", "## How does it work? ⚙️", "## Try it yourself! 🚀", "## Fun Facts! 🌟"
${req.courseName ? `- Show how "${req.topic}" connects to the student's "${req.courseName}" course` : ''}
- Keep it SHORT — around 400 words total
- End with 3 simple fun questions like "Can you name 3 things that use ${req.topic}?"

Return ONLY this JSON (nothing else):
{
  "lesson_notes": "your markdown notes here — use ## headers, bullet points, and emojis"
}`;
      }

      return `Write clear, engaging study notes for a Rillcod Technologies student.
Topic: "${req.topic}"
Grade: ${grade}
Subject: ${req.subject ?? req.courseName ?? 'Coding & Technology'}
Duration: ${req.durationMinutes ?? 60} minutes
${notesContextLine ? `Context: ${notesContextLine}` : ''}

RULES:
- Use ## and ### markdown headers to structure the notes clearly
- Keep paragraphs short (3-4 sentences max)
- Include real-world examples relevant to African/Nigerian students
- For coding topics: include ONE short code example with comments
- Use bullet points for lists and key concepts
${req.courseName ? `- Frame every example and analogy within the context of "${req.courseName}" so the student can connect this topic to their course` : ''}
${req.programName ? `- Mention how this topic fits the broader "${req.programName}" programme once, naturally, in the introduction` : ''}
- Tone: encouraging, clear, British English
- Length: 800-1200 words (not more — quality over quantity)
- End with a "## Quick Recap 📌" section with 5 bullet points

Return ONLY this JSON (nothing else):
{
  "lesson_notes": "your complete markdown study notes here"
}`; }

    case 'lesson': {
      const mode = req.lessonMode ?? 'academic';

      const modeConfig = {
        academic: {
          label: 'ACADEMIC DEPTH',
          lessonTypeHint: 'workshop',
          notesInstruction: 'lesson_notes MUST be 2000+ words, structured like a textbook chapter with ## headers (e.g. "## The Core Concept", "## How It Works", "## Real-World Applications"). Use British English, Bloom\'s Taxonomy language, and clear analogies.',
          blockRules: `ACADEMIC MODE — MANDATORY BLOCK RULES:
1. Open with a 'mermaid' mindmap covering the entire topic landscape.
2. Include at LEAST 3 'illustration' blocks: one for key definitions, one for concept breakdown, one for real-world examples.
3. Include at LEAST 2 'code-map' blocks: one for concept flow, one for technical architecture.
4. If the topic involves any programming/coding (Python, HTML, JavaScript, Robotics, etc.), include at LEAST ONE 'code' block with real, runnable code directly related to "${req.topic}". Use language: "python", "javascript", "html", or "robotics". The code MUST be educational, well-commented, and appropriate for ${req.gradeLevel ?? 'the grade level'}.
5. Include ONE 'activity' block as a "Knowledge Check Lab" (is_coding: true for coding topics, false otherwise).
6. End with ONE 'quiz' block with 5 comprehension questions (multiple choice).
7. NO motion-graphics or d3-chart — keep the focus on curriculum depth.
8. Minimum 8 blocks total.`,
          objectivesNote: 'Objectives MUST be Bloom\'s Taxonomy aligned: cover Remember, Understand, Apply, and Analyse levels.',
        },
        project: {
          label: 'PROJECT-BASED LEARNING',
          lessonTypeHint: 'hands-on',
          notesInstruction: 'lesson_notes should be a concise "Builder\'s Blueprint" — practical, scannable, and step-focused. Use "## Mission Briefing", "## Your Toolkit", "## Build Steps", "## Testing & Verification" as headers. 1000–1500 words.',
          blockRules: `PROJECT MODE — MANDATORY BLOCK RULES:
1. Open with a 'mermaid' flowchart showing the build process from start to finish.
2. Include ONE 'illustration' block as "Toolkit Overview" listing all tools/concepts the student needs.
3. Include ONE 'code-map' block showing the architecture of what they will build.
4. For coding/programming topics, include at LEAST ONE 'code' block with real, working starter code for the project. Format: { "type": "code", "language": "python"|"javascript"|"html"|"robotics", "content": "# well-commented starter code here" }
5. Include TWO 'activity' blocks: first a short guided warm-up (is_coding: true/false), second the main build challenge with 5+ precise steps.
6. Include TWO 'assignment-block' items: one mini-task (quick win) and one rigorous capstone project with clear deliverables.
7. If grade level is Basic 1–JSS1, include a 'scratch' block with step-by-step block instructions for visual coding.
8. End with ONE 'quiz' block (3 questions) to verify build understanding.
9. Minimum 8 blocks total.`,
          objectivesNote: 'Objectives should be output-oriented: "Students will BUILD...", "Students will DEMONSTRATE...", "Students will DEPLOY...".',
        },
        interactive: {
          label: 'INTERACTIVE & GAMIFIED',
          lessonTypeHint: 'interactive',
          notesInstruction: 'lesson_notes should be short, punchy, and gamified — broken into "## Level 1: The Basics", "## Level 2: Going Deeper", "## Level 3: Expert Mode" sections. 800–1200 words. Every level ends with a "checkpoint" prompt.',
          blockRules: `INTERACTIVE MODE — MANDATORY BLOCK RULES:
1. Open with a 'motion-graphics' block (animationType: "particles" or "orbit") to hook attention.
2. Include THREE 'quiz' blocks placed at different points throughout — not just the end. Each quiz validates the concept just taught.
3. Include ONE 'visualizer' block for algorithm or concept visualization (loops, sorting, stateMachine).
4. Include ONE 'd3-chart' block with a real dataset relevant to the topic (bar or line chart).
5. Include ONE 'illustration' block as a "Quick Reference Card" for key terms.
6. Include ONE 'activity' block as a "Challenge Mission" with gamified step labels like "Step 1: Unlock", "Step 2: Execute", "Step 3: Level Up".
7. End with ONE 'assignment-block' as the "Final Boss Challenge" with clear deliverables.
8. Minimum 9 blocks total for maximum engagement.`,
          objectivesNote: 'Objectives should use action verbs: "Students will EXPLORE...", "Students will EXPERIMENT...", "Students will DISCOVER...".',
        },
      }[mode];

      const grade = req.gradeLevel ?? 'Basic 1–SS3';
      const youngLearnerGrades = ['KG', 'Basic 1', 'Basic 2', 'Basic 3', 'Basic 4', 'Basic 5', 'Basic 6', 'Basic 1–Basic 3', 'Basic 4–Basic 6', 'Basic 1–Basic 6', 'KG–Basic 3'];
      const isYoungLearner = youngLearnerGrades.some(g => grade === g || grade.startsWith(g));
      const isEarlyYears = grade === 'KG' || grade === 'KG–Basic 3' || grade === 'Basic 1' || grade === 'Basic 2' || grade === 'Basic 3' || grade === 'Basic 1–Basic 3';

      const youngLearnerOverride = isYoungLearner ? `
⚠ YOUNG LEARNER OVERRIDE (${grade}) — These rules OVERRIDE conflicting mode rules:
${isEarlyYears ? `EARLY YEARS (KG–Basic 3):
- 'scratch' block is MANDATORY and MUST appear FIRST in content_layout after the mermaid/intro block.
- 'scratch.blocks' MUST contain at least 8 detailed Scratch block steps written as a story: e.g. "when flag clicked", "say 'Hello! I am a Robot!' for 2 seconds", "move 10 steps", "play sound [pop]".
- 'scratch.instructions' MUST be an extremely detailed, child-friendly guide — use numbered steps, emojis, and "Can you...?" prompts.
- NEVER include 'code-map', 'visualizer', 'd3-chart', or any code block (unless is_coding activity is pure Scratch drag-and-drop).
- 'illustration' blocks MUST use simple emoji labels, max 5 items each, with child-friendly one-sentence values.
- lesson_notes MUST be written at a Grade 2 reading level: very short sentences, lots of white space, fun analogies (e.g. "Think of it like LEGO bricks!"). Max 600 words.
- 'activity' steps MUST be ≤ 8 words each and use "Try this:", "Now do:", "Can you?" prompts.
- 'quiz' questions MUST be picture-based or concrete: "Which block makes Sprite move?" not abstract reasoning.` : `PRIMARY (Basic 4–Basic 6):
- 'scratch' block is STRONGLY RECOMMENDED — include unless topic is clearly text-code focused.
- ONE simple 'code-map' block is allowed — use plain English labels, no jargon, max 4 components.
- 'illustration' blocks should use friendly labels and emoji prefixes.
- lesson_notes target a Grade 5 reading level: short paragraphs, clear headings, relatable analogies. Max 1000 words.
- 'activity' steps should be clear and sequential — max 12 words per step.
- Avoid 'visualizer', 'd3-chart', and 'motion-graphics' unless the topic is data/maths — then use simple bar chart only.
- 'quiz' questions should be concrete and contextual, not abstract.`}
- Tone MUST use "Let's...", "Great job!", "Try this!", "Can you...?" — no formal academic language.
- ALL block content must be age-appropriate: no complex syntax, no technical abbreviations without simple explanation.` : '';

      const curriculumContext = (req.courseName || req.programName || req.siblingLessons?.length)
        ? `\nCURRICULUM CONTEXT (use this to tailor all content and examples):
${req.programName ? `Programme: "${req.programName}"` : ''}
${req.courseName ? `Course: "${req.courseName}"` : ''}
${req.siblingLessons?.length ? `Other lessons already covered in this course (DO NOT repeat — build on them instead): ${req.siblingLessons.slice(0, 10).join(', ')}` : ''}
- All examples, analogies, code samples, quiz questions, and activities MUST be directly relevant to this programme and course.
- Connect new concepts to what students already know from previous lessons where possible.`
        : '';

      return `Generate an IMMERSIVE, ADDICTIVE, and COMPLETE lesson for Rillcod Technologies.
Topic: "${req.topic}"
Grade level: ${grade}
Subject: ${req.subject ?? req.courseName ?? 'Coding & Technology'}
Duration: ${req.durationMinutes ?? 60} minutes
Lesson type: ${req.contentType ?? modeConfig.lessonTypeHint}
LESSON MODE: ${modeConfig.label}
${curriculumContext}
${youngLearnerOverride}
${modeConfig.blockRules}

CRITICAL SYNC RULE — ALL visual blocks MUST directly relate to the topic "${req.topic}":
- 'mermaid': Generate a real mindmap or flowchart about "${req.topic}" concepts. Use mermaid v10 syntax ONLY. Start with one of: flowchart TD, mindmap, sequenceDiagram, timeline. NEVER use "graph" keyword. Keep labels short (max 4 words). No special characters or brackets inside node labels except quotes.
- 'motion-graphics': MUST include "title" (the concept being illustrated), "animationType" (one of: flow, network, orbit, particles, wave, pulse), and "config" with "labels" array (4-6 short topic-specific terms) and "nodes" count. Example: { "type": "motion-graphics", "title": "How Python Loops Work", "animationType": "flow", "config": { "nodes": 5, "labels": ["Start", "Check Condition", "Execute Body", "Increment", "End"] } }
- 'd3-chart': MUST include "title" (what the chart shows about the topic) and a "dataset" of real or representative numbers relevant to the topic — NOT random numbers. Include "labels" array matching dataset length. Example: { "type": "d3-chart", "title": "Algorithm Efficiency Comparison", "chartType": "bar", "dataset": [10, 45, 20, 80, 60], "labels": ["Bubble", "Quick", "Merge", "Heap", "Insertion"] }
- 'illustration': Each item MUST be a concept from "${req.topic}" — NOT generic. Label should be the concept name, value should explain it in one sentence.
- 'code-map': Components MUST be actual components/concepts from the topic — NOT "Module A" placeholders.
- 'code': Content MUST be real, runnable code about "${req.topic}". Set "language" to one of: "python", "javascript", "html", "robotics". Use thorough inline comments so students understand every line.
- 'quiz': Questions MUST test understanding of "${req.topic}" specifically.

Return a JSON object with this exact shape:
{
  "title": "string — engaging title appropriate for ${grade} learners about ${req.topic}",
  "description": "string — 2-sentence overview at the right reading level",
  "lesson_notes": "string — ${modeConfig.notesInstruction}",
  "objectives": ["string — at least 5 objectives. ${modeConfig.objectivesNote}"],
  "content_layout": [
    {
      "type": "mermaid",
      "code": "flowchart TD\\n    A[${req.topic}] --> B[Concept 1]\\n    A --> C[Concept 2]\\n    B --> D[Detail]"
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
      "items": [{ "label": "Concept Name from ${req.topic}", "value": "Clear one-sentence explanation" }]
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
      "components": [{ "name": "Real Component Name from topic", "description": "What it does in context of ${req.topic}" }]
    },
    {
      "type": "visualizer",
      "title": "Visualising ${req.topic}",
      "visualType": "loops",
      "visualData": { "variables": {}, "totalSteps": 10, "step": 0, "visualizationState": {} }
    },
    {
      "type": "code",
      "language": "python",
      "content": "# Python code example for ${req.topic}\\n# Well-commented, educational, and runnable\\nprint('Hello from ${req.topic}!')"
    },
    {
      "type": "scratch",
      "projectId": "",
      "instructions": "Step-by-step guide with emojis for ${req.topic}",
      "blocks": ["when flag clicked", "say 'Let us learn ${req.topic}!' for 2 seconds", "move 10 steps"]
    },
    {
      "type": "activity",
      "title": "Lab relevant to ${req.topic}",
      "instructions": "Brief intro about what they will build/do",
      "steps": ["Specific step 1 for ${req.topic}", "Specific step 2", "Step 3: Verify output"],
      "is_coding": true
    },
    {
      "type": "assignment-block",
      "title": "Capstone project about ${req.topic}",
      "instructions": "Detailed project instructions directly about ${req.topic}",
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
- Every block MUST be fully populated with real content about "${req.topic}" — zero placeholders.
- All labels, component names, quiz questions, and chart data MUST be directly about "${req.topic}".
- ${isYoungLearner ? 'Young Learner Override takes HIGHEST priority over all other rules.' : 'Tone: Encouraging and kid-friendly. British English. No unexplained jargon.'}`;
    }

    case 'assignment':
      return `Generate an assignment for Rillcod Technologies students.
Topic: "${req.topic}"
Grade level: ${req.gradeLevel ?? 'Basic 1–SS3'}
Subject: ${req.subject ?? req.courseName ?? 'Coding & Technology'}
${req.programName ? `Programme: "${req.programName}"` : ''}
${req.courseName ? `Course: "${req.courseName}" — all questions and scenarios MUST relate to this course` : ''}
Assignment type hint: ${req.assignmentType ?? 'auto-detect'}
Max Points: 100

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
- metadata.deliverables and metadata.rubric should be null/omitted for non-project assignments.`;

    case 'cbt': {
      const qCount    = req.questionCount ?? 10;
      const mcqCount  = req.mcqCount  ?? qCount;   // default: all MCQ if not split
      const openCount = req.theoryCount ?? 0;
      const totalQ    = mcqCount + openCount;

      const mcqInstruction = mcqCount > 0
        ? `SECTION A — Objective/MCQ: Generate EXACTLY ${mcqCount} multiple-choice or true/false questions. Each MUST have an "options" array of 4 choices and a "correct_answer". Set "question_type" to "multiple_choice" or "true_false".`
        : '';
      const theoryInstruction = openCount > 0
        ? `SECTION B — Theory/Open: Generate EXACTLY ${openCount} open-ended questions (essay, fill_blank, or coding_blocks). These MUST have NO "options" array (or empty []). Set "question_type" to "essay", "fill_blank", or "coding_blocks" as appropriate.`
        : '';

      return `Generate a Computer Based Test (CBT) for Rillcod Technologies.
Topic: "${req.topic}"
Grade level: ${req.gradeLevel ?? 'Basic 1–SS3'}
Subject: ${req.subject ?? req.courseName ?? 'Coding & Technology'}
${req.programName ? `Programme: "${req.programName}"` : ''}
${req.courseName ? `Course: "${req.courseName}" — all questions MUST be framed within this course's scope and context` : ''}
Total questions required: EXACTLY ${totalQ}. You MUST generate all ${totalQ} — do not stop early.

${mcqInstruction}
${theoryInstruction}

Return a JSON object with this exact shape:
{
  "title": "string — exam title",
  "description": "string — brief exam description",
  "duration_minutes": ${Math.max(30, totalQ * 2)},
  "passing_score": 70,
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
${mcqCount > 0 ? `- First ${mcqCount} questions MUST be objective (MCQ/true_false) with options arrays.` : ''}
${openCount > 0 ? `- Last ${openCount} questions MUST be open-ended (essay/fill_blank/coding_blocks) with no options.` : ''}
- Cover the topic comprehensively across different difficulty levels.
- For technical/coding topics, include code snippets in triple-backtick fences where relevant.`;}


    case 'lesson-plan':
      return `Generate a HIGH-ACTION, BENEFICIAL lesson plan for a Rillcod Technologies instructor.
      Topic: "${req.topic}"
      Grade level: ${req.gradeLevel ?? 'Basic 1–SS3'}
      ${req.programName ? `Programme: "${req.programName}"` : ''}
      ${req.courseName ? `Course: "${req.courseName}"` : ''}

      This plan is for the TEACHER/PARENT. It should contain a "Secret Blueprint" on how to teach this topic effectively.
      ${req.courseName ? `All activities, examples, and teaching strategies MUST align with the "${req.courseName}" course scope.` : ''}
      
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

    case 'library-content':
      return `Generate metadata for a piece of educational content for the Rillcod Technologies content library.
Topic: "${req.topic}"
Content type: ${req.contentType ?? req.currentContent?.contentType ?? 'document'}
Grade level: ${req.gradeLevel ?? 'JSS1–SS3'}
Subject: ${req.subject ?? 'Technology'}

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
    case 'newsletter':
      return `Generate a premium, visionary academic newsletter for Rillcod Technologies.
Topic/Event: "${req.topic}"
Target Audience: ${req.audience ?? 'All School Stakeholders'}
Brand Tone: ${req.tone ?? 'Professional & Educational'}

EVALUATIVE DIRECTIVES:
1. Context: Rillcod Technologies is a high-end STEM/Coding academy in Nigeria. Use prestigious, empowering language. 
2. Structure: 
   - A captivating edition title/headline.
   - Opening: A forward-thinking message about technology and education in Nigeria.
   - Core Body: Deep, detailed breakdown of the topic/event. Avoid surface-level fluff.
   - Encouraging Conclusion: Strategic closing message.
3. Spelling: Use British English only (e.g. 'programme', 'centre', 'favour').
4. Specificity: Weave in the importance of digital skills for the future Nigerian economy.

FORMATTING RULES (CRITICAL):
- Do NOT use markdown symbols: no #, ##, ###, **, *, -, or bullet point symbols.
- Do NOT use code blocks or backticks.
- Use ONLY plain text. Use blank lines to separate sections.
- Use ALL CAPS for section headings (e.g. "INTRODUCTION", "CORE HIGHLIGHTS").
- Use a line of dashes (———) as a visual section divider if needed.
- Write in flowing paragraphs. Numbered points should use "1." "2." format with no asterisks.

Return a JSON object with this exact shape:
{
  "title": "string — a catchy, professional newsletter title (plain text, no symbols)",
  "content": "string — clean plain text content with blank lines between sections. No markdown symbols whatsoever.",
  "summary": "string — 1-2 sentence compelling summary for notification previews"
}
`;

    case 'daily-missions': {
      return `You are a smart learning coach for Rillcod Technologies. Generate 3 highly personalized daily missions for a student.

Student Profile:
- Name: ${req.studentName ?? 'Student'}
- XP Total: ${req.xp ?? 0}
- Current Streak: ${req.streak ?? 0} days
- Lessons Completed: ${req.lessonsDone ?? 0}
- Average Score: ${req.avgScore ?? 0}%
- Current Program: ${req.program ?? 'STEM Curriculum'}
- Next Lesson: ${req.nextLesson ?? 'Not started'}

Generate 3 missions that are:
1. Specific and actionable (not generic)
2. Appropriately challenging for their level
3. Rewarding with clear XP values
4. Encouraging and motivating in tone

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

    case 'lesson-hook': {
      const hookContext = [
        req.programName ? `Programme: "${req.programName}"` : '',
        req.courseName ? `Course: "${req.courseName}"` : '',
      ].filter(Boolean).join(' | ');
      return `You are the Great Learning Explorer for Rillcod Technologies. Generate an EXCITING, addictive opening hook for a lesson.

Topic: "${req.topic}"
Grade Level: ${req.gradeLevel ?? 'JSS1–SS3'}
${hookContext ? `Curriculum Context: ${hookContext}` : ''}

The hook should:
- Open with a surprising real-world fact or story about "${req.topic}"
- Create immediate curiosity and excitement
- Be 2-3 short paragraphs maximum
${req.courseName ? `- Show how this topic is a key building block in "${req.courseName}"` : ''}
- End with a challenge question to the student

Return a JSON object:
{
  "hook": "string — the exciting lesson opening hook in markdown format",
  "hook_title": "string — catchy hook title (max 8 words)",
  "real_world_example": "string — one specific Nigerian or African real-world use case of this topic",
  "challenge_question": "string — an intriguing question to engage the student before the lesson starts"
}`;
    }

    case 'code-generation': {
      let langLabel = req.subject ?? req.topic ?? 'programming';
      if (langLabel === 'robotics') langLabel = 'Python (for Robotics Simulation)';
      
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

    default:
      throw new Error(`Unknown generate type: ${req.type}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('portal_users')
      .select('role')
      .eq('id', user.id)
      .single();

    const isStaff = ['admin', 'teacher'].includes(profile?.role || '');

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json({ error: 'AI service not configured.' }, { status: 503 });
    }

    const body: GenerateRequest = await req.json();
    const { type } = body;

    // Security: students can use lesson-hook and daily-missions; staff gets everything
    const STUDENT_ALLOWED: GenerateType[] = ['lesson-hook', 'daily-missions', 'report-feedback', 'custom'];
    if (!isStaff && !STUDENT_ALLOWED.includes(type)) {
      return NextResponse.json({ error: 'Forbidden: Professional access required' }, { status: 403 });
    }

    if (!body.topic?.trim() && !body.prompt?.trim()) {
      return NextResponse.json({ error: 'topic or prompt is required' }, { status: 400 });
    }
    const VALID_TYPES = ['lesson', 'lesson-notes', 'lesson-plan', 'library-content', 'assignment', 'cbt', 'report-feedback', 'cbt-grading', 'newsletter', 'code-generation', 'daily-missions', 'lesson-hook', 'custom'];
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: 'invalid type' }, { status: 400 });
    }

    const prompt = buildPrompt(body);
    let lastError = null;

    // Rich lesson types need more tokens to avoid truncated JSON
    // For CBT scale tokens with question count: ~150 tokens per question minimum
    const cbtTotal  = (body.mcqCount ?? 0) + (body.theoryCount ?? 0) || (body.questionCount ?? 10);
    const cbtTokens = type === 'cbt' ? Math.max(3000, cbtTotal * 200) : 0;
    const maxTokens =
      type === 'lesson' ? 4000 :
      type === 'lesson-plan' ? 3500 :
      type === 'cbt' ? cbtTokens :
      type === 'assignment' ? 3000 :
      2048;

    // Safe JSON extraction — handles markdown code fences and truncated responses
    function safeParseJSON(raw: string): any {
      // Strip markdown code fences if present
      const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      try {
        return JSON.parse(stripped);
      } catch {
        // Try to recover a JSON object from the string
        const match = stripped.match(/(\{[\s\S]*\})/);
        if (match) {
          try { 
            // Aggressively clean up trailing commas and comments which AI loves
            const cleaned = match[1]
              .replace(/,\s*([\}\]])/g, '$1')
              .replace(/\/\/.*/g, '');
            return JSON.parse(cleaned); 
          } catch { /* fail */ }
        }
        throw new Error('AI returned malformed data — please refresh and try again');
      }
    }

    // --- AGENTIC HIERARCHICAL TASK ROUTING --- 
    // We select the "Expert Persona" based on the task type
    let modelQueue = [...MODELS];
    let adaptiveTemperature = 0.7;
    let adaptiveMaxTokens = maxTokens;

    switch (type) {
      case 'lesson':
        // Best models for rich, structured, creative educational content
        modelQueue = [
          "google/gemini-2.0-flash-001",           // Primary: fast, reliable, 1M ctx, excellent JSON
          "qwen/qwen3-235b-a22b:free",             // 235B params, massive reasoning, free
          "moonshotai/kimi-k2.5",                  // High intelligence, great for detailed content
          "x-ai/grok-2-1212",                      // Creative/playful fallback
        ];
        adaptiveTemperature = 0.75;
        adaptiveMaxTokens = 16000;
        break;

      case 'lesson-notes':
        modelQueue = [
          "google/gemini-2.0-flash-001",           // Primary: fast, reliable, long-form text
          "qwen/qwen3-235b-a22b:free",             // 235B free — excellent at structured writing
          "moonshotai/kimi-k2.5",                  // Deep synthesis
          "deepseek/deepseek-chat-v3-5",           // Strong writer
          "meta-llama/llama-3.3-70b-instruct",     // Solid free fallback
          "google/gemini-flash-1.5",               // Reliable emergency fallback
          "meta-llama/llama-3.1-8b-instruct:free", // Last resort
        ];
        adaptiveTemperature = 0.6;
        adaptiveMaxTokens = 4000; // Reduced from 16000 — prevents timeouts while keeping good quality
        break;

      case 'code-generation':
        // DeepSeek V3 is the undisputed king of logic/code
        modelQueue = [
          "deepseek/deepseek-chat-v3-5",
          "deepseek/deepseek-chat",
          "google/gemini-2.0-flash-001"
        ];
        adaptiveTemperature = 0.2; // High precision
        break;

      case 'cbt':
      case 'cbt-grading':
        // Analytical models for precision — Qwen 2.5 removed from primary (returns malformed JSON)
        modelQueue = [
          "google/gemini-2.0-flash-001",          // Reliable JSON + fast
          "deepseek/deepseek-chat-v3-5",           // Strong analytical fallback
          "meta-llama/llama-3.3-70b-instruct",    // Solid fallback
          "google/gemini-flash-1.5",               // Emergency fallback
        ];
        adaptiveTemperature = 0.1; // Zero hallucination
        break;

      case 'lesson-hook':
        modelQueue = [
          "google/gemini-2.0-flash-001",
          "x-ai/grok-2-1212",
          "meta-llama/llama-3.3-70b-instruct",
        ];
        adaptiveTemperature = 0.92; // High creativity for hooks
        adaptiveMaxTokens = 1024;
        break;

      case 'daily-missions':
        modelQueue = [
          "google/gemini-2.0-flash-001",
          "x-ai/grok-2-1212",
          "meta-llama/llama-3.3-70b-instruct",
        ];
        adaptiveTemperature = 0.85;
        adaptiveMaxTokens = 2048;
        break;

      case 'assignment':
        modelQueue = [
          "google/gemini-2.0-flash-001",
          "deepseek/deepseek-chat-v3-5",
          "meta-llama/llama-3.3-70b-instruct",
          "google/gemini-flash-1.5",
        ];
        adaptiveTemperature = 0.4; // Balanced — consistent but not rigid
        adaptiveMaxTokens = 3000;
        break;

      case 'lesson-plan':
        modelQueue = [
          "qwen/qwen3-235b-a22b:free",             // Primary: 235B free, superb at structured plans
          "google/gemini-2.0-flash-001",           // Fast reliable second choice
          "moonshotai/kimi-k2.5",                  // High intelligence fallback
          "meta-llama/llama-3.3-70b-instruct",
        ];
        adaptiveTemperature = 0.5; // Structured and pedagogically sound
        adaptiveMaxTokens = 3500;
        break;

      case 'report-feedback':
        modelQueue = [
          "qwen/qwen3-235b-a22b:free",             // Primary: nuanced writing, 235B free
          "google/gemini-2.0-flash-001",           // Fast reliable second
          "deepseek/deepseek-chat-v3-5",           // Strong at empathetic prose
        ];
        adaptiveTemperature = 0.75;
        adaptiveMaxTokens = 2048;
        break;

      default:
        // Smart fallback (Gemini 2.0 is the best all-rounder)
        modelQueue = [
          "google/gemini-2.0-flash-001",
          "x-ai/grok-2-1212",
          "meta-llama/llama-3.1-8b-instruct:free"
        ];
    }

    // lesson-notes uses plain-text response (no response_format) to avoid malformed JSON errors
    const useJsonFormat = type !== 'lesson-notes';

    // ── SSE Streaming path — used when client sends ?stream=1 (lesson type only) ──
    const wantsStream = req.nextUrl?.searchParams.get('stream') === '1' && type === 'lesson';

    if (wantsStream) {
      const enc = new TextEncoder();
      const sseStream = new ReadableStream({
        async start(streamController) {
          const emit = (payload: object) => {
            try {
              streamController.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));
            } catch { /* stream may be closed */ }
          };

          emit({ status: 'Initialising lesson engine...' });

          for (const modelId of modelQueue) {
            const shortName = modelId.split('/').pop()?.split(':')[0] ?? modelId;
            emit({ status: `Generating with ${shortName}...` });

            try {
              const abortCtrl = new AbortController();
              const tid = setTimeout(() => abortCtrl.abort(), 55000);

              const apiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                  'X-Title': 'Rillcod Technologies (Kid-Friendly Platform)',
                  'Content-Type': 'application/json',
                },
                signal: abortCtrl.signal,
                body: JSON.stringify({
                  model: modelId,
                  messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: prompt },
                  ],
                  max_tokens: Math.min(adaptiveMaxTokens, 16000),
                  temperature: adaptiveTemperature,
                  response_format: { type: 'json_object' },
                }),
              });

              clearTimeout(tid);

              if (apiRes.ok) {
                emit({ status: 'Assembling lesson blocks...' });
                const apiData = await apiRes.json();
                const content = apiData.choices[0]?.message?.content;
                if (content) {
                  try {
                    const parsed = safeParseJSON(content);
                    emit({ done: true, model: modelId, data: parsed });
                    streamController.close();
                    return;
                  } catch {
                    emit({ status: 'Retrying with better model...' });
                  }
                }
              } else {
                emit({ status: 'Switching to backup model...' });
              }
            } catch {
              emit({ status: 'Switching to backup model...' });
            }
          }

          emit({ error: 'All AI models are currently busy. Please try again.' });
          streamController.close();
        },
      });

      return new Response(sseStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Iterate through models until one succeeds
    for (const modelId of modelQueue) {
      try {
        const controller = new AbortController();
        const timeoutMs = ['lesson', 'lesson-notes'].includes(type) ? 55000 : 30000;
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const requestBody: any = {
          model: modelId,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt }
          ],
          max_tokens: Math.min(adaptiveMaxTokens, 16000),
          temperature: adaptiveTemperature,
        };
        // Only add response_format for types that need strict JSON — skip for lesson-notes
        if (useJsonFormat) {
          requestBody.response_format = { type: 'json_object' };
        }

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'X-Title': 'Rillcod Technologies (Kid-Friendly Platform)',
            'Content-Type': 'application/json'
          },
          signal: controller.signal,
          body: JSON.stringify(requestBody),
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          const content = data.choices[0]?.message?.content;
          if (content) {
            // For lesson-notes: try JSON parse first, then fall back to wrapping raw text
            if (type === 'lesson-notes') {
              try {
                const parsed = safeParseJSON(content);
                // If parsed but lesson_notes is missing, wrap the whole content
                if (!parsed.lesson_notes && typeof content === 'string') {
                  return NextResponse.json({ success: true, model: modelId, data: { lesson_notes: content.replace(/^```(?:json|markdown)?\s*/i, '').replace(/\s*```$/i, '').trim() } });
                }
                return NextResponse.json({ success: true, model: modelId, data: parsed });
              } catch {
                // JSON parse failed — use raw text as lesson_notes directly
                const cleanContent = content.replace(/^```(?:json|markdown)?\s*/i, '').replace(/\s*```$/i, '').trim();
                if (cleanContent.length > 100) {
                  return NextResponse.json({ success: true, model: modelId, data: { lesson_notes: cleanContent } });
                }
              }
            } else {
              const parsed = safeParseJSON(content);
              // Handle 'custom' type specifically to match ProtocolPage expectation
              if (type === 'custom') {
                return NextResponse.json({
                  success: true,
                  content: parsed.content || parsed.text || parsed.answer || (typeof content === 'string' ? content : JSON.stringify(content)),
                  ...parsed
                });
              }
              return NextResponse.json({ success: true, model: modelId, data: parsed });
            }
          }
        } else {
          const errData = await response.json().catch(() => ({}));
          console.warn(`Model ${modelId} failed with status ${response.status}:`, errData.error?.message || response.statusText);
          lastError = errData.error?.message || `Status ${response.status}`;
        }
      } catch (err: any) {
        console.error(`Error attempting model ${modelId}:`, err.message);
        lastError = err.message;
      }
    }

    throw new Error(`AI generation failed after trying all models. Last error: ${lastError}`);
  } catch (err: any) {
    const status = err?.status ?? 500;
    const message = err?.message ?? 'AI generation failed';
    return NextResponse.json({ error: message }, { status });
  }
}
