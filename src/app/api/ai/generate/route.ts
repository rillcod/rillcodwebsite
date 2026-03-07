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

// Use Claude Sonnet via OpenRouter
const MODEL = 'anthropic/claude-sonnet-4-5';

const SYSTEM_PROMPT = `You are an expert STEM curriculum designer for Rillcod Academy, a Nigerian coding and digital skills academy serving students from Basic 1 through SS3 (primary to secondary school). You create engaging, age-appropriate educational content covering coding (Python, JavaScript, Scratch), robotics, AI, digital entrepreneurship, and general STEM topics. Always return valid JSON only — no markdown fences, no explanations outside the JSON.`;

type GenerateType = 'lesson' | 'lesson-plan' | 'library-content';

interface GenerateRequest {
  type: GenerateType;
  topic: string;
  gradeLevel?: string;
  subject?: string;
  durationMinutes?: number;
  termWeeks?: number;
  contentType?: string;
}

function buildPrompt(req: GenerateRequest): string {
  switch (req.type) {
    case 'lesson':
      return `Generate a complete lesson for a Rillcod Academy class session.
Topic: "${req.topic}"
Grade level: ${req.gradeLevel ?? 'JSS1–SS3'}
Subject: ${req.subject ?? 'Coding & Technology'}
Duration: ${req.durationMinutes ?? 60} minutes
Lesson type: ${req.contentType ?? 'hands-on'}

Return a JSON object with this exact shape:
{
  "title": "string — engaging lesson title",
  "description": "string — 2-3 sentence lesson overview for teachers",
  "objectives": ["string"],
  "content_layout": [
    { "type": "heading", "text": "string", "level": 1 },
    { "type": "paragraph", "text": "string" },
    { "type": "list", "items": ["string"], "ordered": false },
    { "type": "code", "language": "python", "code": "string" },
    { "type": "activity", "title": "string", "instructions": "string", "duration": "string" },
    { "type": "quiz", "question": "string", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "answer": "A" }
  ],
  "video_url": null,
  "tags": ["string"]
}

content_layout must include: one intro heading, objectives list, main content paragraph, at least one code block relevant to the topic, one hands-on activity, and two quiz questions.`;

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
Content type: ${req.contentType ?? 'document'}
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

    if (!body.topic?.trim()) {
      return NextResponse.json({ error: 'topic is required' }, { status: 400 });
    }
    if (!['lesson', 'lesson-plan', 'library-content'].includes(body.type)) {
      return NextResponse.json({ error: 'invalid type' }, { status: 400 });
    }

    const prompt = buildPrompt(body);

    const completion = await client.chat.completions.create({
      model: MODEL,
      max_tokens: body.type === 'lesson-plan' ? 4096 : 2048,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? '';

    // Strip markdown fences if model wraps output anyway
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json({ error: 'AI returned invalid JSON', raw }, { status: 502 });
    }

    return NextResponse.json({ data: parsed });
  } catch (err: any) {
    const status = err?.status ?? 500;
    const message = err?.message ?? 'AI generation failed';
    return NextResponse.json({ error: message }, { status });
  }
}
