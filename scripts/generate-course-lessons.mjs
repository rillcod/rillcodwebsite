// AI-seed lessons for a programme's courses (default: AI Engineering & Automation).
//
// Quality guard: inserts lessons as status='draft' so students never see unreviewed
// AI content. Review in the dashboard, then publish with --publish (sets active).
// Idempotent: skips any course that already has lessons.
//
//   node scripts/generate-course-lessons.mjs                       # all AI courses -> draft
//   node scripts/generate-course-lessons.mjs --course="<id>"       # one course only
//   node scripts/generate-course-lessons.mjs --per=5               # lessons per course
//   node scripts/generate-course-lessons.mjs --publish             # insert as active
//   node scripts/generate-course-lessons.mjs --activate-drafts     # only flip existing drafts -> active

import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GKEY = process.env.GEMINI_API_KEY;
if (!URL || !KEY) { console.error('Missing Supabase env.'); process.exit(1); }

const arg = (n, d = null) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const has = (n) => process.argv.includes(`--${n}`);

const PROGRAM_ID = arg('program', '5a3d1ab6-cc61-45ba-907a-da83b0b0f7d1'); // AI Engineering & Automation
const ONE_COURSE = arg('course', null);
const PER = parseInt(arg('per', '5'), 10) || 5;
const STATUS = has('publish') ? 'active' : 'draft';
const ACTIVATE_ONLY = has('activate-drafts');

const TEXT_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'];
const ALLOWED_TYPES = new Set(['lesson','video','interactive','hands-on','workshop','coding','reading','quiz','project','lab','practice','ai']);

const db = createClient(URL, KEY, { auth: { persistSession: false } });
const ai = GKEY ? new GoogleGenAI({ apiKey: GKEY }) : null;

async function genLessons(course) {
  const system = `You are a senior curriculum designer for Rillcod Academy, an online STEM/AI bootcamp for Nigerian secondary-school and young learners. Write practical, hands-on lessons in clear British English. Output STRICT JSON only.`;
  const user = `Design exactly ${PER} sequential lessons for the course "${course.title}" in the "AI Engineering & Automation" track.
${course.description ? `Course description: ${course.description}` : ''}
Return JSON: { "lessons": [ { "title": string, "description": string (1-2 sentences), "lesson_type": one of ["lesson","interactive","hands-on","coding","project","reading","quiz"], "duration_minutes": integer 30-90, "content": markdown string ~350-500 words with: ## Objectives (3 bullets), ## Explanation, ## Worked Example (with code where relevant), ## Try It Yourself activity } ] }
Make them progressively harder, beginner-friendly, and concrete. No preamble.`;

  for (const model of TEXT_MODELS) {
    try {
      const res = await ai.models.generateContent({ model, contents: user, config: { systemInstruction: system, responseMimeType: 'application/json' } });
      const txt = res.text ?? '';
      const json = JSON.parse(txt.match(/\{[\s\S]*\}/)?.[0] ?? txt);
      const lessons = Array.isArray(json.lessons) ? json.lessons : [];
      if (lessons.length) return lessons;
    } catch (e) {
      console.warn(`   [${model}] ${e.message?.slice(0, 120)}`);
    }
  }
  return [];
}

async function main() {
  // Activate-only mode: flip existing AI-seeded drafts to active.
  if (ACTIVATE_ONLY) {
    const { data: cs } = await db.from('courses').select('id').eq('program_id', PROGRAM_ID);
    const ids = (cs ?? []).map((c) => c.id);
    const { data, error } = await db.from('lessons').update({ status: 'active', updated_at: new Date().toISOString() })
      .in('course_id', ids).eq('status', 'draft').contains('metadata', { source: 'ai-course-seed' }).select('id');
    if (error) { console.error(error.message); process.exit(1); }
    console.log(`Activated ${data.length} draft lesson(s).`);
    return;
  }

  if (!ai) { console.error('Missing GEMINI_API_KEY.'); process.exit(1); }

  let q = db.from('courses').select('id, title, description, is_active').eq('program_id', PROGRAM_ID);
  if (ONE_COURSE) q = q.eq('id', ONE_COURSE);
  const { data: courses, error } = await q.order('level_order');
  if (error) { console.error(error.message); process.exit(1); }

  console.log(`Seeding lessons as status='${STATUS}' for ${courses.length} course(s).\n`);
  let totalInserted = 0;

  for (const course of courses) {
    const { count } = await db.from('lessons').select('id', { count: 'exact', head: true }).eq('course_id', course.id);
    if (count > 0) { console.log(`• "${course.title}" — already has ${count} lesson(s), skipping.`); continue; }

    process.stdout.write(`• "${course.title}" — generating ${PER}… `);
    const lessons = await genLessons(course);
    if (!lessons.length) { console.log('FAILED (no AI output)'); continue; }

    const rows = lessons.slice(0, PER).map((l, i) => ({
      course_id: course.id,
      title: String(l.title || `${course.title} — Lesson ${i + 1}`).slice(0, 200),
      description: String(l.description || '').slice(0, 500),
      content: String(l.content || ''),
      lesson_notes: String(l.content || ''),
      content_layout: [],
      lesson_type: ALLOWED_TYPES.has(l.lesson_type) ? l.lesson_type : 'lesson',
      duration_minutes: Math.min(180, Math.max(15, parseInt(l.duration_minutes, 10) || 60)),
      order_index: i + 1,
      status: STATUS,
      metadata: { source: 'ai-course-seed', generated_at: new Date().toISOString() },
    }));

    const { data: ins, error: insErr } = await db.from('lessons').insert(rows).select('id');
    if (insErr) { console.log(`SAVE ERROR: ${insErr.message}`); continue; }
    totalInserted += ins.length;
    console.log(`inserted ${ins.length}`);
  }

  console.log(`\nDone. Inserted ${totalInserted} lesson(s) as '${STATUS}'.`);
  if (STATUS === 'draft') console.log(`Review them, then publish: node scripts/generate-course-lessons.mjs --activate-drafts`);
}

main().catch((e) => { console.error(e); process.exit(1); });
