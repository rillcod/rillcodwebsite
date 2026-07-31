import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { geminiGenerateText, hasGeminiKey } from '@/lib/gemini/client';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  defaultHeaders: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://rillcod.com',
    'X-Title': 'Rillcod Technologies',
  },
});

/**
 * OpenRouter is the *fallback*, not the primary — the direct Gemini free tier is
 * tried first. Every model here carries the `:free` suffix so a Gemini outage
 * degrades to a free model instead of quietly spending credits.
 */
const FALLBACK_MODELS = [
  'qwen/qwen3-235b-a22b:free',
  'deepseek/deepseek-r1:free',
  'meta-llama/llama-3.1-8b-instruct:free',
];

/** Turns of conversation kept in context. Gemini's 1M window makes this cheap. */
const HISTORY_TURNS = 24;
const MAX_REPLY_TOKENS = 2048;

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface StudyChatRequest {
  message: string;
  lessonTitle: string;
  lessonType?: string;
  courseTitle?: string;
  programName?: string;
  gradeLevel?: string;
  lessonObjectives?: string[];
  /** Long-form reference material (lesson notes, transcript, student's code). */
  lessonContext?: string;
  conversationHistory?: ConversationMessage[];
  /** Set by callers that parse the reply as JSON (e.g. the Canva block filler). */
  json?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    // Verify authenticated session
    const supabase = await createServerClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body: StudyChatRequest = await req.json();
    const {
      message, lessonTitle, lessonType, courseTitle, programName, gradeLevel,
      lessonObjectives, lessonContext, conversationHistory = [], json = false,
    } = body;

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    if (!lessonTitle?.trim()) {
      return NextResponse.json({ error: 'Lesson title is required' }, { status: 400 });
    }

    const contextLines = [
      programName ? `Programme: ${programName}` : '',
      courseTitle ? `Course: ${courseTitle}` : '',
      gradeLevel ? `Grade level: ${gradeLevel}` : '',
      lessonType ? `Lesson type: ${lessonType}` : '',
      lessonObjectives?.length
        ? `Learning objectives:\n${lessonObjectives.slice(0, 8).map(o => `- ${o}`).join('\n')}`
        : '',
    ].filter(Boolean).join('\n');

    const systemPrompt = json
      ? `You are a STEM curriculum generator for Rillcod Technologies. Return ONLY valid JSON matching the shape the user asks for. No prose, no code fences.

Lesson: "${lessonTitle}"
${contextLines}`
      : `You are a friendly, encouraging STEM tutor at Rillcod Technologies helping a Nigerian student understand their current lesson.

Lesson: "${lessonTitle}"
${contextLines}

YOUR RULES:
- Give clear, accurate, step-by-step explanations tailored to the student's grade level and course.
- Use real Nigerian or African examples (e.g. Eko Bridge traffic algorithms, NEPA power systems, mobile money apps, Nollywood streaming) wherever they naturally fit.
- Connect your answer to the specific course ("${courseTitle || lessonTitle}") so the student understands WHY this matters in their learning path.
- If asked off-topic questions, warmly redirect back to the lesson.
- Tone: warm, enthusiastic, encouraging — like a brilliant older sibling who loves STEM.
- Aim for 150–300 words. Be complete but never padded.

FORMATTING — your reply is rendered as Markdown, so use it:
- **Bold** the key terms a student should remember.
- Use \`-\` bullet lists or \`1.\` numbered steps for anything with more than two parts.
- Put every code sample in a fenced block with its language tag, e.g. \`\`\`python.
- Use \`inline code\` for variable, function, tag and command names.
- Use a short \`###\` heading only when the answer genuinely has multiple sections.
- Use tables for side-by-side comparisons.
- Never write raw HTML.`;

    const history = conversationHistory.slice(-HISTORY_TURNS);

    // ── Free direct Gemini first ─────────────────────────────────────────────
    // Large context window, free tier, and thinking enabled for better reasoning.
    if (hasGeminiKey()) {
      const transcript = history
        .map(m => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`)
        .join('\n\n');

      const contextBlocks = [
        lessonContext ? `LESSON REFERENCE MATERIAL:\n${lessonContext}` : '',
        transcript ? `CONVERSATION SO FAR:\n${transcript}` : '',
      ].filter(Boolean);

      const result = await geminiGenerateText(
        systemPrompt,
        message.trim(),
        {
          json,
          reasoning: json ? 'low' : 'medium',
          temperature: json ? 0.3 : 0.7,
          maxOutputTokens: MAX_REPLY_TOKENS,
          context: contextBlocks,
          timeoutMs: 45_000,
        },
      ).catch(() => null);

      if (result?.text?.trim()) {
        return NextResponse.json({ reply: result.text, model: result.model, source: 'gemini' });
      }
    }

    // ── Free OpenRouter fallback ─────────────────────────────────────────────
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: 'AI service is temporarily unavailable. Please try again.' },
        { status: 503 },
      );
    }

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...(lessonContext
        ? [{ role: 'system' as const, content: `LESSON REFERENCE MATERIAL:\n${lessonContext}` }]
        : []),
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message.trim() },
    ];

    for (const model of FALLBACK_MODELS) {
      try {
        const completion = await client.chat.completions.create({
          model,
          messages,
          max_tokens: MAX_REPLY_TOKENS,
          temperature: json ? 0.3 : 0.7,
          ...(json ? { response_format: { type: 'json_object' as const } } : {}),
        });

        const reply = completion.choices[0]?.message?.content;
        if (reply) {
          return NextResponse.json({ reply, model, source: 'openrouter' });
        }
      } catch (modelError) {
        console.error(`Study chat: model ${model} failed:`, modelError);
        // Continue to next model
      }
    }

    return NextResponse.json(
      { error: 'AI service is temporarily unavailable. Please try again.' },
      { status: 503 }
    );
  } catch (error) {
    console.error('Study chat error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
