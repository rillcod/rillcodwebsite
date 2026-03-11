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
  "google/gemini-2.0-flash-lite-preview-02-05", // Primary (Fast, Free)
  "qwen/qwen-2.5-72b-instruct",               // Excellent context
  "mistralai/mistral-7b-instruct:free",       // Fast fallback
  "meta-llama/llama-3-8b-instruct:free",      // Robust fallback
  "google/gemma-2-9b-it:free",                // Lightweight fallback
  "moonshotai/moonshot-v1-8k"                  // Kimi (Alternative)
];

const SYSTEM_PROMPT = `You are an expert STEM curriculum designer for Rillcod Academy. You create engaging, age-appropriate educational content. 
You can use specialized blocks in content_layout:
- 'mermaid': for flowcharts/diagrams (graph TD...)
- 'math': for LaTeX formulas (E = mc^2)
- 'code': for programming snippets
- 'image': for illustrations
- 'video': for educational videos
Always return valid JSON only. For Nigerian context (Basic 1 to SS3), the tone is premium and modern.`;

type GenerateType = 'lesson' | 'lesson-plan' | 'library-content' | 'assignment' | 'cbt' | 'report-feedback';

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
}

function buildPrompt(req: GenerateRequest): string {
  switch (req.type) {
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

    case 'lesson':
      return `Generate a complete lesson for a Rillcod Academy class session.
Topic: "${req.topic}"
Grade level: ${req.gradeLevel ?? 'JSS1–SS3'}
Subject: ${req.subject ?? 'Coding & Technology'}
Duration: ${req.durationMinutes ?? 60} minutes
Lesson type: ${req.contentType ?? 'hands-on'} (Choose from: hands-on, video, interactive, workshop, coding, reading. Use 'reading' for long-form theoretical notes, 'coding' for technical labs, 'video' if a video is central).

Return a JSON object with this exact shape:
{
  "title": "string — engaging lesson title",
  "description": "string — 2-3 sentence lesson overview for teachers",
  "lesson_notes": "string — COMPREHENSIVE study notes for the student. Use markdown for bolding and structure. This is the primary reading material.",
  "objectives": ["string"],
  "content_layout": [
    { "type": "heading", "content": "string" },
    { "type": "text", "content": "string" },
    { "type": "code", "language": "python", "content": "string" },
    { "type": "callout", "style": "info", "content": "string" },
    { "type": "image", "url": "https://images.unsplash.com/photo-1...", "caption": "string" },
    { "type": "activity", "title": "string", "instructions": "string" },
    { "type": "quiz", "question": "string", "options": ["string"], "correct_answer": "string" },
    { "type": "mermaid", "code": "graph TD\nA-->B" },
    { "type": "math", "formula": "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}" }
  ],
  "video_url": "https://www.youtube.com/watch?v=...",
  "tags": ["string"]
}

Important instructions:
1. lesson_notes must be high-quality, long-form content (300-500 words).
2. content_layout must be an array of blocks for visual rendering. Use 'content' key for text/heading/code.
3. Research and include a REAL relevant YouTube embed link (educational) if possible, otherwise leave null.`;

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
      "question_type": "multiple_choice",
      "options": ["string", "string", "string", "string"],
      "correct_answer": "string — exact text of the correct option",
      "points": 10
    }
  ]
}

Include at least 5 relevant multiple choice questions.`;

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
      "question_type": "multiple_choice",
      "options": ["string", "string", "string", "string"],
      "correct_answer": "string — exact text of the correct option",
      "points": 5
    }
  ]
}

Include at least 10 high-quality multiple choice questions covering the topic thoroughly.`;

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
    if (!['lesson', 'lesson-plan', 'library-content', 'assignment', 'cbt', 'report-feedback'].includes(type)) {
      return NextResponse.json({ error: 'invalid type' }, { status: 400 });
    }

    const prompt = buildPrompt(body);
    let lastError = null;

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
            max_tokens: type === 'lesson-plan' ? 3500 : 2048,
            temperature: 0.7
          })
        });

        if (response.ok) {
          const data = await response.json();
          const content = data.choices[0]?.message?.content;
          if (content) {
            return NextResponse.json({ success: true, model: modelId, data: JSON.parse(content) });
          }
        }
        else {
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
