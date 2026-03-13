import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// OpenRouter provides an OpenAI-compatible API — swap base URL + auth header
const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  defaultHeaders: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://rillcod.com',
    'X-Title': 'Rillcod Academy',
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
];

const SYSTEM_PROMPT = `You are an expert STEM curriculum designer for Rillcod Academy. You create engaging, age-appropriate educational content. 
You can use specialized blocks in content_layout:
- 'mermaid': for flowcharts/diagrams (flowchart TD...)
- 'math': for LaTeX formulas (E = mc^2)
- 'code': for programming snippets
- 'coding_blocks': for visual logic tasks (sentence with [BLANK] placeholders, options, and correct ordering)
- 'image': for illustrations
- 'video': for educational videos
Always return valid JSON only. For Nigerian context (Basic 1 to SS3), the tone is premium and modern.`;

type GenerateType = 'lesson' | 'lesson-notes' | 'lesson-plan' | 'library-content' | 'assignment' | 'cbt' | 'report-feedback' | 'cbt-grading';

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
  // For grading
  questions?: any[];
  studentAnswers?: Record<string, string>;
}

function buildPrompt(req: GenerateRequest): string {
  switch (req.type) {
    case 'cbt-grading':
      return `You are an AI Grader for Rillcod Academy. Grade the following student's responses for a CBT exam.
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
      return `Generate professional, encouraging, and specific student progress report feedback for a Rillcod Academy student.
Student: "${req.studentName ?? 'The student'}"
Current Module: "${req.topic}"
Attendance: ${req.attendance ?? 'N/A'}
Assignment/Lab Completion: ${req.assignments ?? 'N/A'}

Return a JSON object with this exact shape:
{
  "key_strengths": "string — 2-3 sentences highlighting specific technical wins and soft skills demonstrated during the module.",
  "areas_for_growth": "string — 2-3 sentences suggesting realistic areas for improvement and specific next steps for the next module."
}

Ensure the tone is premium, academic yet accessible, and reflects the Rillcod Academy brand of modern STEM excellence.`;

    case 'lesson-notes':
      return `Generate ONLY the lesson notes for a Rillcod Academy class session.
Topic: "${req.topic}"
Grade level: ${req.gradeLevel ?? 'JSS1–SS3'}
Subject: ${req.subject ?? 'Coding & Technology'}
Duration: ${req.durationMinutes ?? 60} minutes

Return a JSON object with this exact shape:
{
  "lesson_notes": "string — COMPREHENSIVE markdown-formatted study notes for the student, 500-800 words minimum. Structure with ## headings, bullet points, bold key terms, and concrete examples. Cover: introduction, key concepts, worked examples, and a summary."
}`;

    case 'lesson':
      return `Generate a COMPLETE, RICH lesson for a Rillcod Academy class session.
Topic: "${req.topic}"
Grade level: ${req.gradeLevel ?? 'JSS1–SS3'}
Subject: ${req.subject ?? 'Coding & Technology'}
Duration: ${req.durationMinutes ?? 60} minutes
Lesson type: ${req.contentType ?? 'hands-on'}

Return a JSON object with this exact shape:
{
  "title": "string — engaging, specific lesson title",
  "description": "string — 2-3 sentence lesson overview for teachers",
  "lesson_notes": "string — COMPREHENSIVE markdown study notes, 500-800 words. Use ## headings, bullet points, bold key terms. Cover intro, concepts, examples, summary.",
  "objectives": ["string — at least 3 clear learning objectives"],
  "content_layout": [
    { "type": "heading", "content": "Learning Objectives" },
    { "type": "text", "content": "string" },
    { "type": "callout", "style": "info", "content": "string — key concept callout" },
    { "type": "heading", "content": "Core Concepts" },
    { "type": "text", "content": "string — explanation" },
    { "type": "code", "language": "python", "content": "string — working example" },
    { "type": "mermaid", "code": "flowchart TD\nA-->B" },
    { "type": "activity", "title": "string", "instructions": "string — step-by-step activity" },
    { "type": "callout", "style": "tip", "content": "string — pro tip" },
    { "type": "quiz", "question": "string", "options": ["A","B","C","D"], "correct_answer": "string" },
    { "type": "heading", "content": "Summary" },
    { "type": "text", "content": "string — summary paragraph" }
  ],
  "video_url": "string or null — a real relevant YouTube URL if one exists, otherwise null",
  "tags": ["string — at least 3 tags"],
  "duration_minutes": ${req.durationMinutes ?? 60},
  "lesson_type": "${req.contentType ?? 'hands-on'}"
}

CRITICAL requirements:
1. content_layout MUST have at least 10 blocks — use the full structure above as a guide.
2. lesson_notes must be 500+ words with real educational content, not placeholder text.
3. For coding/STEM topics always include a working code block.
4. For topics with processes or relationships, include a mermaid diagram.
5. Always end with at least one quiz block.
6. Nigerian school context (Basic 1–SS3), premium and modern tone.`;

    case 'assignment':
      return `Generate an assignment for Rillcod Academy students.
Topic: "${req.topic}"
Grade level: ${req.gradeLevel ?? 'JSS1–SS3'}
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

    case 'cbt':
      return `Generate a Computer Based Test (CBT) for Rillcod Academy.
Topic: "${req.topic}"
Grade level: ${req.gradeLevel ?? 'JSS1–SS3'}
Subject: ${req.subject ?? 'Coding & Technology'}

Return a JSON object with this exact shape:
{
  "title": "string — exam title",
  "description": "string — brief exam description",
  "duration_minutes": 60,
  "passing_score": 70,
  "questions": [
    {
      "question_text": "string",
      "question_type": "string — one of: multiple_choice, true_false, fill_blank, essay, coding_blocks",
      "options": ["string"],
      "correct_answer": "string",
      "points": 5,
      "metadata": {
        "logic_sentence": "string — only for coding_blocks, e.g. 'When [BLANK] clicked, move [BLANK] steps'",
        "logic_blocks": ["string"] 
      }
    }
  ]
}

Include at least 10 high-quality questions covering the topic thoroughly. For technical topics, include coding logic questions.`;

    case 'lesson-plan':
      return `Generate a term-long lesson plan for Rillcod Academy.
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
      return `Generate metadata for a piece of educational content for the Rillcod Academy content library.
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
  "license_type": "string — e.g. CC BY 4.0 or Rillcod Academy Proprietary",
  "attribution": "string"
}`;

    default:
      throw new Error(`Unknown generate type: ${req.type}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json({ error: 'AI service not configured. Add OPENROUTER_API_KEY to environment.' }, { status: 503 });
    }

    const body: GenerateRequest = await req.json();
    const { type } = body;

    if (!body.topic?.trim()) {
      return NextResponse.json({ error: 'topic is required' }, { status: 400 });
    }
    const VALID_TYPES = ['lesson', 'lesson-notes', 'lesson-plan', 'library-content', 'assignment', 'cbt', 'report-feedback', 'cbt-grading'];
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: 'invalid type' }, { status: 400 });
    }

    const prompt = buildPrompt(body);
    let lastError = null;

    // Rich lesson types need more tokens to avoid truncated JSON
    const maxTokens =
      type === 'lesson' ? 4000 :
      type === 'lesson-plan' ? 3500 :
      type === 'cbt' ? 3000 :
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
            'X-Title': 'Rillcod Academy',
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
