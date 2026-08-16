// Fill empty draft lessons with AI-generated bodies, preserving the staff-authored
// title + description (curriculum structure), then publish (status='active').
//
// Targets flagship programmes by default (Teen Developers + Young Innovators).
// Only touches DRAFT lessons whose content is empty/short — never overwrites real content.
//
//   node scripts/fill-empty-lessons.mjs                 # fill + publish flagship empties
//   node scripts/fill-empty-lessons.mjs --program=<id>  # restrict to one programme
//   node scripts/fill-empty-lessons.mjs --draft         # fill but keep as draft (no publish)

import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GKEY = process.env.GEMINI_API_KEY;
if (!URL || !KEY || !GKEY) { console.error('Missing Supabase or Gemini env.'); process.exit(1); }

const arg = (n, d = null) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const KEEP_DRAFT = process.argv.includes('--draft');
const ONE_PROGRAM = arg('program', null);
const FLAGSHIP = ['9a07d16c-19ca-4dcf-8696-1c050b90458f', '946189d1-27a1-461c-b866-271e5244314a']; // Teen Developers, Young Innovators
const PROGRAMS = ONE_PROGRAM ? [ONE_PROGRAM] : FLAGSHIP;

const TEXT_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'];
const db = createClient(URL, KEY, { auth: { persistSession: false } });
const ai = new GoogleGenAI({ apiKey: GKEY });

async function genBody(lesson, courseTitle, programName) {
  const audience = /young|innovator/i.test(programName)
    ? 'Nigerian primary-school children (ages 7-11) — playful, very simple language, lots of encouragement'
    : 'Nigerian secondary-school students (JSS/SS) — clear, practical, hands-on';
  const system = `You are a curriculum designer for Rillcod Technologies. Write ONE engaging lesson body in markdown for ${audience}. British English. Output STRICT JSON only.`;
  const user = `Course: "${courseTitle}" (${programName}).
Lesson title: "${lesson.title}"
${lesson.description ? `Lesson summary: ${lesson.description}` : ''}
Return JSON: { "content": markdown ~350-500 words with: ## Objectives (3 bullets), ## Explanation, ## Worked Example (with code/steps where relevant), ## Try It Yourself activity, ## Recap. Match the title exactly; do not invent a different topic. }`;
  for (const model of TEXT_MODELS) {
    try {
      const res = await ai.models.generateContent({ model, contents: user, config: { systemInstruction: system, responseMimeType: 'application/json' } });
      const txt = res.text ?? '';
      const json = JSON.parse(txt.match(/\{[\s\S]*\}/)?.[0] ?? txt);
      if (json.content && String(json.content).trim().length > 200) return String(json.content);
    } catch (e) { /* try next model */ }
  }
  return null;
}

async function main() {
  // courses in target programmes
  const { data: courses } = await db.from('courses').select('id, title, program_id, programs(name)').in('program_id', PROGRAMS);
  const cmap = Object.fromEntries((courses ?? []).map((c) => [c.id, c]));
  const courseIds = (courses ?? []).map((c) => c.id);
  if (!courseIds.length) { console.log('No courses found for target programmes.'); return; }

  // empty/short DRAFT lessons in those courses
  const { data: lessons } = await db.from('lessons')
    .select('id, title, description, content, course_id, status')
    .in('course_id', courseIds).eq('status', 'draft');
  const empties = (lessons ?? []).filter((l) => (l.content || '').trim().length < 200);

  console.log(`Found ${empties.length} empty draft lesson(s) to fill across ${courseIds.length} flagship course(s).\n`);
  let filled = 0, failed = 0;

  for (const l of empties) {
    const course = cmap[l.course_id];
    const progName = course?.programs?.name || 'Rillcod';
    process.stdout.write(`• "${l.title}" (${progName}) … `);
    const body = await genBody(l, course?.title || '', progName);
    if (!body) { console.log('FAILED'); failed++; continue; }
    const patch = { content: body, lesson_notes: body, updated_at: new Date().toISOString() };
    if (!KEEP_DRAFT) patch.status = 'active';
    const { error } = await db.from('lessons').update(patch).eq('id', l.id);
    if (error) { console.log('SAVE ERR:', error.message); failed++; continue; }
    filled++; console.log(KEEP_DRAFT ? 'filled (draft)' : 'filled + published');
  }

  console.log(`\nDone. Filled ${filled}, failed ${failed}.`);
  if (failed) console.log('Re-run to retry failures (idempotent — only touches remaining empty drafts).');
}

main().catch((e) => { console.error(e); process.exit(1); });
