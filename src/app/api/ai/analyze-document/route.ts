import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { generateTextFreeFirst } from '@/lib/ai/text-free-first';
import { condenseSourceForModel } from '@/lib/ai/generate-core';

export interface AiDocumentAnalysis {
  summary: string;
  subject: string;
  gradeLevel: string | null;
  keyConcepts: string[];
  learningObjectives: string[];
  detectedQuestionCount: number;
  recommendedMix: {
    mcq: number;
    theory: number;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    reason: string;
  };
  qualityLevel: 'high' | 'medium' | 'low';
  qualityNote: string | null;
  model?: string;
}

function stripJsonFences(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (match ? match[1] : trimmed).trim();
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('portal_users')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || !['admin', 'teacher', 'school'].includes(profile.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const rawCombined = String(body?.combinedText || '').trim();
    const combinedText = condenseSourceForModel(rawCombined, 8_500);
    if (combinedText.length < 30) {
      return NextResponse.json(
        { error: 'Not enough readable text in the uploaded attachment(s) to analyze.' },
        { status: 400 },
      );
    }

    const fileNames: string[] = Array.isArray(body?.fileNames)
      ? body.fileNames.map((n: unknown) => String(n || '').trim()).filter(Boolean).slice(0, 10)
      : [];
    const totalSections = Number(body?.totalSections) || 1;
    const totalWords = Number(body?.totalWords) || combinedText.split(/\s+/).filter(Boolean).length;

    const systemPrompt = [
      'You are a senior curriculum & examination board analyst for Rillcod Academy.',
      'Carefully read the uploaded teaching/exam attachment(s) and produce a formal, publication-grade academic intelligence brief.',
      'Formality & Quality Rules:',
      '- Write in crisp, formal, examination-board academic English (complete grammatical sentences, proper capitalization, zero slang or casual filler).',
      '- Never invent topics or facts that are not actually grounded in the uploaded text.',
      '- Extract 6 to 10 concrete, formally phrased testable concepts/terms/skills directly from the attachment.',
      '- Extract 3 to 5 formal, measurable Bloom-aligned learning objectives (starting with action verbs such as "Define", "Analyze", "Construct", "Evaluate").',
      '- If the attachment already contains exam/test questions, count approximately how many complete questions (`detectedQuestionCount`) — treating multi-part sub-questions (a), (b), (c) under one number as ONE question. Otherwise 0.',
      '- Recommend a practical question mix (`mcq`, `theory`, `difficulty`, `reason`) suited to the content depth and length.',
      '- Honestly assess extraction quality (`high`, `medium`, `low`): mark `low` or `medium` with a short formal `qualityNote` if text looks sparse, OCR-noisy, or missing an answer key.',
      '- Return STRICT JSON ONLY matching this exact schema:',
      '{"summary":"2 concise formal academic sentences","subject":"string","gradeLevel":"string|null","keyConcepts":["string"],"learningObjectives":["string"],"detectedQuestionCount":0,"recommendedMix":{"mcq":15,"theory":5,"difficulty":"beginner|intermediate|advanced","reason":"short 1-sentence formal rationale"},"qualityLevel":"high|medium|low","qualityNote":"string|null"}',
    ].join('\n');

    const userPrompt = [
      `Uploaded Files: ${fileNames.join(', ') || 'Attachment'}`,
      `Structure: ${totalSections} section(s)/page(s), ~${totalWords} words`,
      '',
      'EXTRACTED ATTACHMENT CONTENT:',
      combinedText,
    ].join('\n');

    const aiRes = await generateTextFreeFirst(systemPrompt, userPrompt, true, {
      maxOutputTokens: 2048,
      temperature: 0.15,
      minLength: 20,
      fastFirst: true,
    });

    if (!aiRes?.text) {
      return NextResponse.json(
        { error: 'AI analyzer is temporarily busy; local document analysis is still active.' },
        { status: 503 },
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(stripJsonFences(aiRes.text));
    } catch {
      return NextResponse.json(
        { error: 'AI returned an invalid analysis format.' },
        { status: 502 },
      );
    }

    const diff = parsed?.recommendedMix?.difficulty;
    const safeDifficulty: 'beginner' | 'intermediate' | 'advanced' =
      diff === 'beginner' || diff === 'intermediate' || diff === 'advanced' ? diff : 'intermediate';
    const qLevel = parsed?.qualityLevel;
    const safeQuality: 'high' | 'medium' | 'low' =
      qLevel === 'high' || qLevel === 'medium' || qLevel === 'low'
        ? qLevel
        : totalWords < 80 ? 'low' : 'high';

    const analysis: AiDocumentAnalysis = {
      summary: String(parsed?.summary || '').trim() || 'Uploaded teaching material analyzed and ready for question generation.',
      subject: String(parsed?.subject || '').trim() || 'General Studies',
      gradeLevel: parsed?.gradeLevel ? String(parsed.gradeLevel).trim() : null,
      keyConcepts: Array.isArray(parsed?.keyConcepts)
        ? parsed.keyConcepts.map((c: unknown) => String(c || '').trim()).filter(Boolean).slice(0, 10)
        : [],
      learningObjectives: Array.isArray(parsed?.learningObjectives)
        ? parsed.learningObjectives.map((o: unknown) => String(o || '').trim()).filter(Boolean).slice(0, 5)
        : [],
      detectedQuestionCount: Math.max(0, Math.round(Number(parsed?.detectedQuestionCount) || 0)),
      recommendedMix: {
        mcq: Math.max(0, Math.min(60, Math.round(Number(parsed?.recommendedMix?.mcq) || 15))),
        theory: Math.max(0, Math.min(20, Math.round(Number(parsed?.recommendedMix?.theory) || 5))),
        difficulty: safeDifficulty,
        reason: String(parsed?.recommendedMix?.reason || '').trim() || 'Balanced mix for the uploaded content depth.',
      },
      qualityLevel: safeQuality,
      qualityNote: parsed?.qualityNote ? String(parsed.qualityNote).trim() : null,
      model: aiRes.model,
    };

    return NextResponse.json({ data: analysis });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Document analysis failed' },
      { status: 500 },
    );
  }
}
