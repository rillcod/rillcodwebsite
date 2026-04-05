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

const MODELS = [
  'google/gemini-2.0-flash-001',
  'deepseek/deepseek-chat-v3-5',
  'meta-llama/llama-3.3-70b-instruct',
  'qwen/qwen3-14b:free',
];

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const body = await req.json();
    const {
      message,
      projectTitle,
      category = 'coding',
      instructions,
      studentTask,
      currentCode,
      language = 'javascript',
      conversationHistory = [] as ConversationMessage[],
    } = body;

    if (!message?.trim()) return NextResponse.json({ error: 'Message is required' }, { status: 400 });

    // Map category to preferred language
    const langMap: Record<string, string> = {
      web: 'HTML/CSS/JavaScript', coding: 'JavaScript or Python', ai: 'Python',
      design: 'HTML/CSS', hardware: 'Python or Arduino (C++)', research: 'Python or Markdown',
    };
    const preferredLang = langMap[category] || 'JavaScript';

    const systemPrompt = `You are an expert coding mentor and project builder at Rillcod Technologies, helping a Nigerian secondary school student BUILD a real project step-by-step.

PROJECT: "${projectTitle}"
CATEGORY: ${category} (preferred language: ${preferredLang})
${instructions ? `INSTRUCTIONS: ${instructions.slice(0, 500)}` : ''}
${studentTask ? `STUDENT'S SPECIFIC TASK: ${studentTask}` : ''}
${currentCode ? `CURRENT CODE IN EDITOR (${language}):\n\`\`\`${language}\n${currentCode.slice(0, 800)}\n\`\`\`` : ''}

YOUR RULES:
1. When generating code — ALWAYS provide COMPLETE, RUNNABLE code in a fenced markdown code block like:
   \`\`\`html
   <!DOCTYPE html>...complete code...
   \`\`\`
   Never show incomplete snippets. The student should be able to copy-paste and run it immediately.
2. For web projects (HTML/CSS/JS): generate full HTML files with embedded CSS and JS in one file.
3. For Python: generate complete scripts with all imports.
4. After the code block, explain in 2-3 bullet points what the code does and how to customise it.
5. Use Nigerian/African examples where natural (e.g. naira prices, Lagos traffic, Eko school names).
6. Tone: enthusiastic, like a brilliant senior student helping a junior. Max 400 words per response.
7. If asked to debug: identify the specific problem and show the fixed code in a code block.
8. If asked to add a feature: show the UPDATED full code (not just the new part).`;

    const historyMessages = (conversationHistory as ConversationMessage[]).slice(-10).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: message.trim() },
    ];

    for (const model of MODELS) {
      try {
        const completion = await client.chat.completions.create({
          model,
          messages,
          max_tokens: 1500,
          temperature: 0.65,
        });

        const reply = completion.choices[0]?.message?.content;
        if (!reply) continue;

        // Extract code block if present
        const codeMatch = reply.match(/```(\w+)?\n([\s\S]*?)```/);
        const extractedCode  = codeMatch ? codeMatch[2].trim() : null;
        const extractedLang  = codeMatch ? (codeMatch[1] || language) : null;

        return NextResponse.json({ reply, code: extractedCode, language: extractedLang });
      } catch {
        continue;
      }
    }

    return NextResponse.json({ error: 'AI service temporarily unavailable' }, { status: 503 });
  } catch (err) {
    console.error('project-builder error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
