import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient as createServerClient } from '@/lib/supabase/server';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  defaultHeaders: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://rillcod.com',
    'X-Title': 'Rillcod Technologies',
  },
});

const PRIMARY_MODEL = 'google/gemini-2.0-flash-001';
const FALLBACK_MODEL = 'qwen/qwen3-235b-a22b:free';

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
  conversationHistory?: ConversationMessage[];
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
    const { message, lessonTitle, lessonType, courseTitle, programName, gradeLevel, lessonObjectives, conversationHistory = [] } = body;

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
        ? `Learning objectives:\n${lessonObjectives.slice(0, 4).map(o => `- ${o}`).join('\n')}`
        : '',
    ].filter(Boolean).join('\n');

    const systemPrompt = `You are a friendly, encouraging STEM tutor at Rillcod Technologies helping a Nigerian student understand their current lesson.

Lesson: "${lessonTitle}"
${contextLines}

YOUR RULES:
- Give clear, accurate, step-by-step explanations tailored to the student's grade level and course.
- Use real Nigerian or African examples (e.g. Eko Bridge traffic algorithms, NEPA power systems, mobile money apps, Nollywood streaming) wherever they naturally fit.
- For coding or technical questions: always show a short working code snippet with clear comments.
- Connect your answer to the specific course ("${courseTitle || lessonTitle}") so the student understands WHY this matters in their learning path.
- If asked off-topic questions, warmly redirect back to the lesson.
- Tone: warm, enthusiastic, encouraging — like a brilliant older sibling who loves STEM.
- Keep responses under 280 words. Prefer bullet points or numbered steps for clarity.`;

    // Include up to the last 8 messages of conversation history
    const historyMessages = conversationHistory.slice(-8).map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: message.trim() },
    ];

    // Try primary model, fall back if it fails
    let reply: string | null = null;

    for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
      try {
        const completion = await client.chat.completions.create({
          model,
          messages,
          max_tokens: 512,
          temperature: 0.7,
        });

        reply = completion.choices[0]?.message?.content ?? null;
        if (reply) break;
      } catch (modelError) {
        console.error(`Study chat: model ${model} failed:`, modelError);
        // Continue to next model
      }
    }

    if (!reply) {
      return NextResponse.json(
        { error: 'AI service is temporarily unavailable. Please try again.' },
        { status: 503 }
      );
    }

    return NextResponse.json({ reply });
  } catch (error) {
    console.error('Study chat error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
