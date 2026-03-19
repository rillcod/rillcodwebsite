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
  "google/gemini-2.0-flash-001",              // Primary Stable (Fast)
  "google/gemini-2.0-flash-lite-preview-02-05", // User requested, kept with fallbacks
  "google/gemini-flash-1.5",                  // Extremely reliable fallback
  "meta-llama/llama-3.3-70b-instruct",        // High performance
  "qwen/qwen-2.5-72b-instruct",               // Alternative expert
  "mistralai/mistral-large-2411",             // Complex reasoning fallback
  "meta-llama/llama-3.1-8b-instruct:free",    // Fast free fallback
  "mistralai/mistral-7b-instruct:free"        // Emergency fallback
];const SYSTEM_PROMPT = `You are an elite STEM & Robotics Curriculum Architect for Rillcod Technologies. 
Your mission is to engineer high-fidelity, visually stunning, and academically rigorous educational content for the Nigerian elite education sector (Basic 1 to SS3).

CORE PHILOSOPHY:
- "The Rillcod Standard": Every lesson must feel premium, modern, and technologically advanced. 
- "Nigerian Excellence": Tone should be high-expectation, visionary, and encouraging. Use British English.
- "Visual-First Learning": Maximize the use of specialized blocks (Mermaid, Motion Graphics, D3, Visualizers) to explain complex concepts.

SPECIALIZED BLOCKS (MANDATORY VARIETY):
- 'mermaid': High-precision system architecture or flowcharts. Use 'flowchart TD'. No markdown fences.
- 'motion-graphics': Premium Framer Motion animations (orbit|pulse|flow|grid|particles).
- 'd3-chart': Data-driven insights (bar|line|pie|area).
- 'visualizer': Real-time algorithm/logic simulation (sorting|physics|turtle|loops|stateMachine).
- 'activity': Practical 'Hands-on Sync' with explicit 'steps' (Array of strings).
- 'scratch': For KG-Basic 6 only. 'projectId' (optional), 'blocks' (Array), and 'instructions' (Step-by-Step Fixing Guide).
- 'quiz': Validation checkpoints with 'question', 'options', and 'correctAnswer' (Index).

EXTENSIVENESS: 
Lesson notes ("lesson_notes" field) MUST be at least 1500 words of deep, academic discourse, structured with professional headers. 
For KG-Basic 6: Focus on "Mental Models", "Visual Logic Strategies", and "Step-by-Step Debugging".
For JSS1-SS3: Focus on "Technical Architecture", "Algorithmic Complexity", and "Global Tech Trends".

Return ONLY valid JSON.`;

type GenerateType = 'lesson' | 'lesson-notes' | 'lesson-plan' | 'library-content' | 'assignment' | 'cbt' | 'report-feedback' | 'cbt-grading' | 'newsletter' | 'code-generation';

interface GenerateRequest {
  type: GenerateType;
  topic: string;
  studentName?: string;
  gradeLevel?: string;
  subject?: string;
  durationMinutes?: number;
  termWeeks?: number;
  contentType?: string;
  attendance?: string;
  assignments?: string;
  currentContent?: any;
  questionCount?: number;
  tone?: string;
  audience?: string;
  // For grading
  questions?: any[];
  studentAnswers?: Record<string, string>;
}

function buildPrompt(req: GenerateRequest): string {
  switch (req.type) {
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

    case 'report-feedback':
      return `Generate high-precision, result-specific student progress report feedback for a Rillcod Technologies student.
Context: Rillcod Technologies is a premium STEM/Coding academy in Nigeria (Basic 1 to SS3).
Student: "${req.studentName ?? 'The student'}"
Current Module: "${req.topic}"
Attendance: ${req.attendance ?? 'N/A'}
Assignment/Lab Completion: ${req.assignments ?? 'N/A'}

EVALUATIVE DIRECTIVES:
1. "Nigerian Intelligence": Adopt a tone that is high-expectation, profoundly encouraging, and visionary—reflecting the aspirations of top-tier Nigerian families for their children to become global technological architects. Use sophisticated British English (e.g., 'programme', 'meticulous', 'endeavour').
2. Metric-Driven specificity: Synthesize the provided statistics (attendance, labs). If labs are 100%, celebrate their 'technical fluidly' and 'practical synthesis'. If attendance is perfect, highlight their 'discipline and professional presence'. If metrics are average, provide a 'strategic roadmap for technical acceleration'.
3. Result-Specific Commentary: Avoid all generic academic fluff. Mention specific technical components of "${req.topic}". For example, if the topic is 'Web Development', discuss 'DOM manipulation' or 'Responsive Grid layouts' specifically.
4. Unique Narrative: Each persona is unique. The feedback MUST reflect a deep understanding of their individual engagement, operations, and practical output in the vault. Broadly scope the child's potential against global standards.

Return a JSON object with this exact shape:
{
  "key_strengths": "string — 2-3 sentences of elevated, highly specific technical appraisal. Discuss their mastery of specific concepts in ${req.topic} and their intellectual engagement.",
  "areas_for_growth": "string — 2-3 sharp, precise sentences on how to sharpen their technical edge. Provide a visionary directive for the transition into the next phase."
}

Maintain a balance between prestigious academic standards and the vibrant, goal-oriented culture of Rillcod Technologies.`;

    case 'lesson-notes':
      return `Generate ONLY the lesson notes for a Rillcod Technologies class session.
Topic: "${req.topic}"
Grade level: ${req.gradeLevel ?? 'Basic 1–SS3'}
Subject: ${req.subject ?? 'Coding & Technology'}
Duration: ${req.durationMinutes ?? 60} minutes

Return a JSON object with this exact shape:
{
  "lesson_notes": "string — EXTENSIVE, ACADEMIC markdown-formatted study notes for the student, 1800+ words minimum. Deep curriculum depth for Basic 1-SS3. For KG-Basic 6, focus on visual block strategies, 'Step-by-Step Debugging Guides', and Scratch mental models. For JSS1-SS3, include technical deep-dives into Python/JS/Deep Tech."
}`;

    case 'lesson':
      return `Generate a PREMIER, MULTI-DIMENSIONAL lesson for Rillcod Technologies.
Topic: "${req.topic}"
Grade level: ${req.gradeLevel ?? 'Basic 1–SS3'}
Subject: ${req.subject ?? 'Coding & Technology'}
Duration: ${req.durationMinutes ?? 60} minutes
Lesson type: ${req.contentType ?? 'hands-on'}

Return a JSON object with this exact shape:
{
  "title": "string — elite, technical title",
  "description": "string — visionary overview",
  "lesson_notes": "string — 1500+ words of extensive academic material.",
  "objectives": ["string — at least 5 clear learning objectives"],
  "content_layout": [
    { "type": "mermaid", "content": "flowchart TD\\nA-->B" },
    { "type": "motion-graphics", "animationType": "particles | flow | orbit", "config": { "nodes": 12 } },
    { "type": "d3-chart", "chartType": "area | line | bar", "dataset": [20, 45, 28, 80, 99] },
    { "type": "visualizer", "visualType": "loops | sorting | stateMachine", "visualData": { "variables": {}, "totalSteps": 20, "step": 0, "visualizationState": {} } },
    { "type": "activity", "title": "Hands-on Synthesis Lab", "instructions": "Intro string", "steps": ["Precise Step 1", "Precise Step 2", "Step 3: Verification"], "is_coding": true },
    { "type": "scratch", "projectId": "string (optional)", "instructions": "STRICT Step-by-Step Block Fixing/Debugging Guide for children", "blocks": ["BLOCK 1", "BLOCK 2", "BLOCK 3"] },
    { "type": "quiz", "question": "Technical Validation", "options": ["A","B","C","D"], "correctAnswer": 0 }
  ],
  "video_url": "string — Relevant High-Quality YouTube URL",
  "tags": ["STEM", "Technology", "Nigeria", "Innovation"],
  "duration_minutes": ${req.durationMinutes ?? 60},
  "lesson_type": "${req.contentType ?? 'hands-on'}"
}

MANDATORY RULES FOR PREMIUM ILLUSTRATION & GRADE LEVEL ADAPTATION:
1. Grade Range: Basic 1–SS3 (KG-Primary 6 focus on Scratch/visual logic; JSS1-SS3 focus on Python/JS/Deep Tech).
2. For KG–Basic 6: EVERY lesson MUST include a 'scratch' block with a logical sequence of blocks and a "Step-by-Step Fixing Guide" to help them debug.
3. Every lesson MUST include at least ONE 'visualizer' block.
4. Every lesson MUST include at least ONE 'motion-graphics' block.
5. Every lesson MUST include at least ONE 'd3-chart' block.
6. content_layout MUST have AT LEAST 12 blocks.
7. Mermaid code must NEVER contain triple backticks. It must be a raw string.
8. Nigerian School Context (Basic 1–SS3), sharp, premium, and goal-oriented tone.
9. Lesson notes MUST be 1500+ words.`;

    case 'assignment':
      return `Generate an assignment for Rillcod Technologies students.
Topic: "${req.topic}"
Grade level: ${req.gradeLevel ?? 'Basic 1–SS3'}
Subject: ${req.subject ?? 'Coding & Technology'}
Max Points: 100

Return a JSON object with this exact shape:
{
  "title": "string — clear assignment title",
  "description": "string — brief overview",
  "instructions": "string — detailed step-by-step instructions for the student",
  "assignment_type": "string — one of: homework, project, quiz, exam, presentation",
  "questions": [
    {
      "question_text": "string",
      "question_type": "string — one of: multiple_choice, true_false, fill_blank, essay, coding_blocks",
      "options": ["string"],
      "correct_answer": "string",
      "points": 10,
      "metadata": {
        "logic_sentence": "string — only for coding_blocks, e.g. 'When [BLANK] clicked, move [BLANK] steps'",
        "logic_blocks": ["string"] 
      }
    }
  ]
}

For 'coding_blocks', 'correct_answer' should be the sequence of blocks for [BLANK] placeholders, comma-separated.
Include at least one coding challenge if the topic is technical.
Include at least 5 relevant questions total.`;

    case 'cbt': {
      const qCount = req.questionCount ?? 10;
      return `Generate a Computer Based Test (CBT) for Rillcod Technologies.
Topic: "${req.topic}"
Grade level: ${req.gradeLevel ?? 'Basic 1–SS3'}
Subject: ${req.subject ?? 'Coding & Technology'}
Number of questions required: EXACTLY ${qCount} questions. You MUST generate all ${qCount} questions — do not stop early.

Return a JSON object with this exact shape:
{
  "title": "string — exam title",
  "description": "string — brief exam description",
  "duration_minutes": ${Math.max(30, qCount * 2)},
  "passing_score": 70,
  "questions": [
    {
      "question_text": "string — for code-based questions wrap the code snippet in triple backtick fences with the language, e.g. \`\`\`python\\nprint('hello')\\n\`\`\`",
      "question_type": "string — one of: multiple_choice, true_false, fill_blank, essay, coding_blocks",
      "options": ["string"],
      "correct_answer": "string",
      "points": 5,
      "metadata": {
        "logic_sentence": "string — only for coding_blocks",
        "logic_blocks": ["string"]
      }
    }
  ]
}

CRITICAL: The questions array MUST contain exactly ${qCount} items. Cover the topic comprehensively across different difficulty levels. For technical/coding topics, include at least ${Math.ceil(qCount * 0.3)} questions that show code snippets in triple-backtick fences.`;}


    case 'lesson-plan':
      return `Generate a term-long lesson plan for Rillcod Technologies.
Subject/Course: "${req.topic}"
Grade level: ${req.gradeLevel ?? 'JSS1–SS3'}
Number of weeks: ${req.termWeeks ?? 12}

Return a JSON object with this exact shape:
{
  "course_title": "string",
  "description": "string — 2-3 sentence course overview",
  "grade_level": "string",
  "duration": "${req.termWeeks ?? 12} weeks",
  "objectives": ["string"],
  "weeks": [
    {
      "week": 1,
      "theme": "string",
      "topics": ["string"],
      "activities": ["string"],
      "assessment": "string"
    }
  ],
  "assessment_strategy": "string",
  "materials": ["string"]
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

Return a JSON object with this exact shape:
{
  "title": "string — a catchy, professional newsletter title",
  "content": "string — markdown-formatted content. Structure with ## headings and clear sections. Use a sophisticated font-style tone in writing.",
  "summary": "string — 1-2 sentence compelling summary for notification previews"
}
`;

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

    // Security Check: Only staff can use most generation endpoints
    if (!isStaff && type !== 'report-feedback') { // Allow students some limited feedback maybe? No, let's restrict all for now unless specified.
       return NextResponse.json({ error: 'Forbidden: Professional access required' }, { status: 403 });
    }

    if (type === 'code-generation' && !isStaff) {
       return NextResponse.json({ error: 'Professional license required for code generation' }, { status: 403 });
    }

    if (!body.topic?.trim()) {
      return NextResponse.json({ error: 'topic is required' }, { status: 400 });
    }
    const VALID_TYPES = ['lesson', 'lesson-notes', 'lesson-plan', 'library-content', 'assignment', 'cbt', 'report-feedback', 'cbt-grading', 'newsletter', 'code-generation'];
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: 'invalid type' }, { status: 400 });
    }

    const prompt = buildPrompt(body);
    let lastError = null;

    // Rich lesson types need more tokens to avoid truncated JSON
    // For CBT scale tokens with question count: ~150 tokens per question minimum
    const cbtTokens = type === 'cbt' ? Math.max(3000, (body.questionCount ?? 10) * 200) : 0;
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
        // Try to recover a partial object by finding the last complete top-level key
        const match = stripped.match(/^(\{[\s\S]*\})/);
        if (match) {
          try { return JSON.parse(match[1]); } catch { /* fall through */ }
        }
        throw new Error('AI returned malformed JSON — please try again');
      }
    }

    // Iterate through models until one succeeds
    for (const modelId of MODELS) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'X-Title': 'Rillcod Technologies',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: modelId,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: prompt }
            ],
            response_format: { type: 'json_object' },
            max_tokens: maxTokens,
            temperature: 0.7
          })
        });

        if (response.ok) {
          const data = await response.json();
          const content = data.choices[0]?.message?.content;
          if (content) {
            const parsed = safeParseJSON(content);
            return NextResponse.json({ success: true, model: modelId, data: parsed });
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
