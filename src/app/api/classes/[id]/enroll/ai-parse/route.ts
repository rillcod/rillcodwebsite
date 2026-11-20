import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { generateTextFreeFirst } from '@/lib/ai/text-free-first';
import { canonicalGrade } from '@/lib/classes/naming';

type CandidateInput = {
  id: string;
  full_name: string;
  grade?: string | null;
  current_class_name?: string | null;
};

type ParsedStudentRow = {
  extractedName: string;
  grade: string | null;
  matchedStudentId: string | null;
  confidence: 'high' | 'medium' | 'low';
  reason: string | null;
};

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : trimmed).trim();
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
    const rawText = String(body?.rawText || '').trim().slice(0, 18_000);
    if (rawText.length < 2) {
      return NextResponse.json({ error: 'Please paste or upload some text containing student names.' }, { status: 400 });
    }

    const className = String(body?.className || '').trim().slice(0, 120);
    const defaultGrade = String(body?.defaultGrade || '').trim().slice(0, 40);
    const availableStudents: CandidateInput[] = Array.isArray(body?.availableStudents)
      ? body.availableStudents.slice(0, 350).map((s: any) => ({
          id: String(s?.id || ''),
          full_name: String(s?.full_name || '').trim(),
          grade: s?.grade ? String(s.grade).trim() : null,
          current_class_name: s?.current_class_name ? String(s.current_class_name).trim() : null,
        })).filter((s: CandidateInput) => s.id && s.full_name)
      : [];

    const validIds = new Set(availableStudents.map((s) => s.id));
    const catalogLines = availableStudents.map(
      (s, i) => `${i + 1}|${s.id}|${s.full_name}|${s.grade || ''}|${s.current_class_name || 'Unassigned'}`,
    );

    const systemPrompt = [
      'You are an ultra-accurate school registrar AI for Rillcod Academy.',
      'Your job is to extract clean student names (and optional grade) from ANY messy teacher input:',
      '- WhatsApp messages, numbered lists, Excel/CSV tables, attendance registers, PDF/Word extracts, or casual notes.',
      '- IGNORE headers, dates, timestamps, phone numbers, fees/payment notes ("paid", "owing"), gender ("M", "F", "Male", "Female"), serial numbers, teacher greetings, and non-student lines.',
      '- Clean each student name to proper Title Case (e.g. "OKONKWO ADAEZE" -> "Okonkwo Adaeze").',
      '- If a grade is explicitly mentioned for a student (e.g. JSS 1, Basic 5, SS 2, Primary 4, KG 2), normalize it (e.g. "JSS 2", "Basic 5", "SS 1"); otherwise null.',
      '- Compare each extracted student against the EXISTING SCHOOL RECORDS list (format: index|id|full_name|grade|class).',
      '- Match existing records intelligently even if names are reversed (Surname First vs First Surname), have middle names omitted/added, have minor spelling typos, or use clear nicknames/initials (e.g. "Sam Agha" -> "Samuel Agha").',
      '- ONLY set matchedStudentId when it is genuinely the same person from EXISTING SCHOOL RECORDS; otherwise set matchedStudentId to null.',
      '- Return STRICT JSON ONLY matching this exact schema:',
      '{"students":[{"extractedName":"string","grade":"string|null","matchedStudentId":"string|null","confidence":"high|medium|low","reason":"short 3-8 word explanation or null"}],"notes":"1 short summary sentence"}',
    ].join('\n');

    const userPrompt = [
      `Target Class: ${className || 'Class'}${defaultGrade ? ` (Default Grade: ${defaultGrade})` : ''}`,
      '',
      'EXISTING SCHOOL RECORDS (index|id|full_name|grade|class):',
      catalogLines.length > 0 ? catalogLines.join('\n') : '(None)',
      '',
      'RAW TEACHER INPUT TO EXTRACT & MATCH:',
      rawText,
    ].join('\n');

    const aiResult = await generateTextFreeFirst(systemPrompt, userPrompt, true, {
      maxOutputTokens: 4096,
      temperature: 0.1,
      minLength: 10,
    });

    if (!aiResult?.text) {
      return NextResponse.json(
        { error: 'AI service is temporarily busy. Your names are still matched live locally!' },
        { status: 503 },
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(stripCodeFences(aiResult.text));
    } catch {
      return NextResponse.json(
        { error: 'AI returned an unreadable format. Please try again or paste plain names.' },
        { status: 502 },
      );
    }

    const rawRows: any[] = Array.isArray(parsed?.students) ? parsed.students : [];
    const seenNames = new Set<string>();
    const students: ParsedStudentRow[] = [];

    for (const row of rawRows) {
      const extractedName = String(row?.extractedName || row?.name || '').trim().replace(/\s+/g, ' ');
      if (extractedName.length < 2) continue;
      const key = extractedName.toLowerCase();
      if (seenNames.has(key)) continue;
      seenNames.add(key);

      const rawGrade = row?.grade ? String(row.grade).trim() : '';
      const normGrade = rawGrade ? (canonicalGrade(rawGrade) || rawGrade) : null;
      const rawMatchId = row?.matchedStudentId ? String(row.matchedStudentId).trim() : '';
      const matchedStudentId = rawMatchId && validIds.has(rawMatchId) ? rawMatchId : null;
      const conf = row?.confidence === 'high' || row?.confidence === 'medium' || row?.confidence === 'low'
        ? row.confidence
        : matchedStudentId ? 'medium' : 'high';
      const reason = row?.reason ? String(row.reason).trim().slice(0, 120) : null;

      students.push({
        extractedName,
        grade: normGrade,
        matchedStudentId,
        confidence: conf,
        reason,
      });
    }

    return NextResponse.json({
      students,
      notes: typeof parsed?.notes === 'string' ? parsed.notes.trim() : `Extracted ${students.length} student${students.length === 1 ? '' : 's'}.`,
      model: aiResult.model,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'AI student list parsing failed' },
      { status: 500 },
    );
  }
}
