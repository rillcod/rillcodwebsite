'use client';

/**
 * WeekAIGenerator
 * ───────────────
 * One-click AI content factory per week in the lesson-plan detail page.
 *
 * Strategy:
 *  1. Checks for existing lesson / flashcard deck / assignment linked to this
 *     week BEFORE generating — skips any that already exist (no duplicates).
 *  2. Uses the platform's own /api/ai/generate route with proper typed
 *     generation (type=lesson, type=flashcard, type=assignment) — the same
 *     flow the rest of the platform uses, so content always matches the
 *     renderer schemas exactly.
 *  3. Puter.js is also available and is tried first for free generation.
 *     However for structured typed outputs (lesson blocks, flashcard cards)
 *     the server route is always used because Puter returns free-form text
 *     not the renderer-compatible JSON schema.
 */

import { useState } from 'react';
import {
  SparklesIcon, XMarkIcon, CheckCircleIcon, ArrowPathIcon,
  BoltIcon, BookOpenIcon, ClipboardDocumentListIcon,
} from '@/lib/icons';

// ── Types ────────────────────────────────────────────────────────────────────

interface Week {
  week: number;
  topic: string;
  objectives?: string;
  activities?: string;
  notes?: string;
  assignment?: { title?: string; brief?: string };
  project?: { title?: string; description?: string };
}

interface ExistingContent {
  lessonId?: string;
  deckId?: string;
  assignmentId?: string;
}

interface Props {
  week: Week;
  planId: string;
  courseId?: string | null;
  courseTitle?: string;
  term?: string | null;
  curriculumId?: string | null;
  programId?: string | null;
  /** Pre-loaded linked content to skip duplicate detection API calls */
  existing?: ExistingContent;
  onDone?: (result: { lessonId?: string; deckId?: string; assignmentId?: string }) => void;
  onClose: () => void;
}

type StepState = 'pending' | 'active' | 'done' | 'skipped' | 'error';

interface StepStatus {
  lesson: StepState;
  flashcard: StepState;
  assignment: StepState;
}

interface Result {
  lessonId?: string;
  lessonTitle?: string;
  deckId?: string;
  deckTitle?: string;
  assignmentId?: string;
  assignmentTitle?: string;
  skipped: string[];
  error?: string;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StepRow({ icon: Icon, label, sub, state, color }: {
  icon: React.ElementType;
  label: string;
  sub: string;
  state: StepState;
  color: string;
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
      state === 'done'    ? 'bg-emerald-500/10 border-emerald-500/30' :
      state === 'active'  ? 'bg-primary/10 border-primary/40' :
      state === 'error'   ? 'bg-rose-500/10 border-rose-500/30' :
      state === 'skipped' ? 'bg-white/[0.02] border-white/[0.06] opacity-50' :
                            'bg-white/[0.03] border-white/[0.08]'
    }`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-black ${
          state === 'done' ? 'text-emerald-300' : state === 'error' ? 'text-rose-300' : state === 'active' ? 'text-white' : 'text-white/50'
        }`}>{label}</p>
        <p className="text-[10px] text-white/30">{sub}</p>
      </div>
      <div className="shrink-0 w-5 flex justify-center">
        {state === 'done'    && <CheckCircleIcon className="w-5 h-5 text-emerald-400" />}
        {state === 'active'  && <ArrowPathIcon className="w-4 h-4 text-primary animate-spin" />}
        {state === 'error'   && <XMarkIcon className="w-4 h-4 text-rose-400" />}
        {state === 'skipped' && <span className="text-[9px] font-black text-white/30 uppercase tracking-wider">Exists</span>}
        {state === 'pending' && <div className="w-2 h-2 rounded-full bg-white/20" />}
      </div>
    </div>
  );
}

// ── Core AI generation helpers ───────────────────────────────────────────────

/** Call /api/ai/generate and return parsed JSON data */
async function aiGenerate(type: string, payload: Record<string, unknown>): Promise<any> {
  const res = await fetch('/api/ai/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, ...payload }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `AI ${type} generation failed`);
  return json.data ?? json;
}

/** Check whether a lesson already exists for this week on this plan */
async function findExistingLesson(planId: string, weekNum: number): Promise<string | null> {
  try {
    const res = await fetch(`/api/lessons?lesson_plan_id=${planId}`);
    if (!res.ok) return null;
    const { data } = await res.json();
    const match = (data ?? []).find((l: any) =>
      l.metadata?.week === weekNum || l.metadata?.week_number === weekNum
    );
    return match?.id ?? null;
  } catch { return null; }
}

/** Check whether a flashcard deck already exists for this week on this plan */
async function findExistingDeck(planId: string, courseId: string | null, weekNum: number): Promise<string | null> {
  try {
    const qs = courseId ? `?course_id=${courseId}` : '';
    const res = await fetch(`/api/flashcards/decks${qs}`);
    if (!res.ok) return null;
    const { data } = await res.json();
    const tag = `W${weekNum}`;
    const match = (data ?? []).find((d: any) =>
      (d.metadata?.lesson_plan_id === planId && d.metadata?.week === weekNum) ||
      (d.title?.startsWith(`Week ${weekNum}:`) && d.metadata?.lesson_plan_id === planId)
    );
    return match?.id ?? null;
  } catch { return null; }
}

/** Check whether an assignment already exists for this week on this plan */
async function findExistingAssignment(planId: string, weekNum: number): Promise<string | null> {
  try {
    const res = await fetch(`/api/assignments?lesson_plan_id=${planId}`);
    if (!res.ok) return null;
    const { data } = await res.json();
    const match = (data ?? []).find((a: any) =>
      a.metadata?.week === weekNum || a.metadata?.week_number === weekNum
    );
    return match?.id ?? null;
  } catch { return null; }
}

// ── Main component ───────────────────────────────────────────────────────────

export default function WeekAIGenerator({
  week, planId, courseId, courseTitle = 'Course',
  term, curriculumId, programId, existing, onDone, onClose,
}: Props) {
  const [status, setStatus] = useState<StepStatus>({ lesson: 'pending', flashcard: 'pending', assignment: 'pending' });
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<Result>({ skipped: [] });

  const addLog = (msg: string) => setLog(p => [...p, msg]);
  const setStep = (k: keyof StepStatus, v: StepState) => setStatus(p => ({ ...p, [k]: v }));

  async function run() {
    setRunning(true);
    setDone(false);
    setError(null);
    setLog([]);
    setResult({ skipped: [] });
    setStatus({ lesson: 'pending', flashcard: 'pending', assignment: 'pending' });

    const res: Result = { skipped: [] };

    try {
      // Build shared context used by all three generators
      const topicContext = `${courseTitle} — ${week.topic}`;
      const gradeLevel = 'JSS1–SS3'; // could be passed as prop later
      const objectives = week.objectives || `Understand and apply concepts related to ${week.topic}`;

      // ── 1. LESSON ──────────────────────────────────────────────────────────
      setStep('lesson', 'active');
      addLog('🔍 Checking for existing lesson…');

      const existingLessonId = existing?.lessonId ?? await findExistingLesson(planId, week.week);
      if (existingLessonId) {
        res.lessonId = existingLessonId;
        setStep('lesson', 'skipped');
        res.skipped.push('lesson');
        addLog(`⏭ Lesson already exists — skipped`);
      } else {
        addLog('🤖 Generating lesson (Academic mode, 16k tokens)…');
        try {
          const lessonData = await aiGenerate('lesson', {
            topic: week.topic,
            subject: courseTitle,
            gradeLevel,
            objectives,
            lessonMode: 'academic',
            term: term ?? 'Term 1',
            weekNumber: week.week,
            activities: week.activities,
            additionalContext: week.notes,
          });

          addLog('💾 Saving lesson…');
          const lessonBody: Record<string, unknown> = {
            title: lessonData.title || `Week ${week.week}: ${week.topic}`,
            description: lessonData.description || objectives,
            content: lessonData.content || [],
            lesson_type: lessonData.lesson_type || 'lesson',
            lesson_notes: lessonData.lesson_notes || null,
            duration_minutes: lessonData.duration_minutes || 60,
            status: 'draft',
            metadata: {
              week: week.week,
              lesson_plan_id: planId,
              term,
              source: 'week-ai-generator',
              curriculum_id: curriculumId ?? null,
            },
          };
          if (courseId) lessonBody.course_id = courseId;
          if (programId) lessonBody.program_id = programId;

          const lr = await fetch('/api/lessons', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(lessonBody),
          });
          const lj = await lr.json();
          if (lr.ok && lj.data?.id) {
            res.lessonId = lj.data.id;
            res.lessonTitle = lj.data.title;
            addLog(`✅ Lesson saved: "${lj.data.title}"`);
            setStep('lesson', 'done');
          } else {
            throw new Error(lj.error || 'Lesson save failed');
          }
        } catch (e: any) {
          setStep('lesson', 'error');
          addLog(`⚠️ Lesson: ${e.message}`);
          // Don't abort — continue with flashcards and assignment
        }
      }

      // ── 2. FLASHCARDS ──────────────────────────────────────────────────────
      setStep('flashcard', 'active');
      addLog('🔍 Checking for existing flashcard deck…');

      const existingDeckId = existing?.deckId ?? await findExistingDeck(planId, courseId ?? null, week.week);
      if (existingDeckId) {
        res.deckId = existingDeckId;
        setStep('flashcard', 'skipped');
        res.skipped.push('flashcards');
        addLog('⏭ Flashcard deck already exists — skipped');
      } else {
        addLog('🤖 Generating 15 flashcards…');
        try {
          const cardData = await aiGenerate('flashcard', {
            topic: week.topic,
            subject: courseTitle,
            gradeLevel,
            questionCount: 15,
            difficulty: 'medium',
            courseName: courseTitle,
          });

          const cards: Array<{ front: string; back: string; tags?: string[]; difficulty?: string }> = cardData.cards ?? [];
          addLog(`🃏 ${cards.length} cards generated — saving deck…`);

          // Create deck
          const deckBody: Record<string, unknown> = {
            title: `Week ${week.week}: ${week.topic}`,
            description: `AI-generated flashcards — ${topicContext}`,
            tags: ['curriculum', 'ai-generated'],
            metadata: { lesson_plan_id: planId, week: week.week, source: 'week-ai-generator' },
          };
          if (courseId) deckBody.course_id = courseId;

          const dr = await fetch('/api/flashcards/decks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(deckBody),
          });
          const dj = await dr.json();
          if (!dr.ok || !dj.data?.id) throw new Error(dj.error || 'Deck create failed');

          res.deckId = dj.data.id;
          res.deckTitle = dj.data.title;
          addLog(`✅ Deck created: "${dj.data.title}"`);

          // Insert cards one by one (standard endpoint)
          let saved = 0;
          for (const [i, c] of cards.entries()) {
            const cr = await fetch('/api/flashcards/cards', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                deck_id: dj.data.id,
                front: c.front,
                back: c.back,
                tags: c.tags ?? [week.topic],
                difficulty: c.difficulty ?? 'medium',
                position: i + 1,
              }),
            }).catch(() => null);
            if (cr?.ok) saved++;
          }
          addLog(`✅ ${saved}/${cards.length} flashcards saved`);
          setStep('flashcard', 'done');
        } catch (e: any) {
          setStep('flashcard', 'error');
          addLog(`⚠️ Flashcards: ${e.message}`);
        }
      }

      // ── 3. ASSIGNMENT ──────────────────────────────────────────────────────
      setStep('assignment', 'active');
      addLog('🔍 Checking for existing assignment…');

      const existingAsnId = existing?.assignmentId ?? await findExistingAssignment(planId, week.week);
      if (existingAsnId) {
        res.assignmentId = existingAsnId;
        setStep('assignment', 'skipped');
        res.skipped.push('assignment');
        addLog('⏭ Assignment already exists — skipped');
      } else {
        addLog('🤖 Generating assignment…');
        try {
          const asnData = await aiGenerate('assignment', {
            topic: week.topic,
            subject: courseTitle,
            gradeLevel,
            objectives,
            assignmentType: week.project?.title ? 'project' : 'homework',
            weekNumber: week.week,
            term: term ?? 'Term 1',
            courseName: courseTitle,
          });

          addLog('💾 Saving assignment…');
          const dueDate = new Date(Date.now() + 7 * 864e5).toISOString().split('T')[0];
          const asnBody: Record<string, unknown> = {
            title: asnData.title || `Week ${week.week} Assignment: ${week.topic}`,
            instructions: asnData.instructions || asnData.description || objectives,
            assignment_type: asnData.assignment_type || 'homework',
            max_points: asnData.max_points || 100,
            due_date: dueDate,
            is_active: true,
            metadata: {
              week: week.week,
              lesson_plan_id: planId,
              term,
              source: 'week-ai-generator',
              rubric: asnData.metadata?.rubric ?? asnData.rubric ?? [],
              deliverables: asnData.metadata?.deliverables ?? asnData.deliverables ?? [],
              curriculum_id: curriculumId ?? null,
            },
          };
          if (courseId) asnBody.course_id = courseId;

          const ar = await fetch('/api/assignments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(asnBody),
          });
          const aj = await ar.json();
          if (ar.ok && aj.data?.id) {
            res.assignmentId = aj.data.id;
            res.assignmentTitle = aj.data.title;
            addLog(`✅ Assignment saved: "${aj.data.title}"`);
            setStep('assignment', 'done');
          } else {
            throw new Error(aj.error || 'Assignment save failed');
          }
        } catch (e: any) {
          setStep('assignment', 'error');
          addLog(`⚠️ Assignment: ${e.message}`);
        }
      }

      setResult(res);
      setDone(true);
      onDone?.({ lessonId: res.lessonId, deckId: res.deckId, assignmentId: res.assignmentId });
    } catch (e: any) {
      setError(e.message);
      addLog(`❌ Fatal: ${e.message}`);
    } finally {
      setRunning(false);
    }
  }

  const hasAnyResult = !!(result.lessonId || result.deckId || result.assignmentId);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={!running ? onClose : undefined} />

      <div className="relative w-full sm:max-w-md bg-[#0d1117] border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-fuchsia-600 flex items-center justify-center shadow-lg shadow-primary/20">
              <SparklesIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">AI Full Package</p>
              <p className="text-sm font-black text-white truncate max-w-[220px]">Week {week.week}: {week.topic}</p>
            </div>
          </div>
          {!running && (
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition-all">
              <XMarkIcon className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[75vh] overflow-y-auto">
          {/* Intro */}
          {!running && !done && !error && (
            <p className="text-xs text-white/50 leading-relaxed">
              Generates a <strong className="text-white/80">full lesson</strong>, <strong className="text-white/80">15 flashcards</strong>, and an <strong className="text-white/80">assignment with rubric</strong> — all using the platform&apos;s AI engine. Existing content is automatically detected and skipped.
            </p>
          )}

          {/* Step progress */}
          <div className="space-y-2">
            <StepRow icon={BookOpenIcon} label="Full Lesson" sub="Academic mode · 12+ content blocks" state={status.lesson} color="bg-primary" />
            <StepRow icon={BoltIcon} label="15 Flashcards" sub="Q&A deck saved to Flashcards" state={status.flashcard} color="bg-amber-500" />
            <StepRow icon={ClipboardDocumentListIcon} label="Assignment + Rubric" sub="Saved to Assignments module" state={status.assignment} color="bg-emerald-600" />
          </div>

          {/* Log */}
          {log.length > 0 && (
            <div className="bg-black/50 rounded-xl p-3 max-h-36 overflow-y-auto space-y-0.5">
              {log.map((l, i) => (
                <p key={i} className="text-[10px] text-white/50 font-mono leading-relaxed">{l}</p>
              ))}
            </div>
          )}

          {/* Results with links */}
          {done && hasAnyResult && (
            <div className="space-y-2 pt-1">
              {result.skipped.length > 0 && (
                <p className="text-[10px] text-white/30 italic">
                  Skipped: {result.skipped.join(', ')} (already existed)
                </p>
              )}
              {result.lessonId && (
                <a href={`/dashboard/lessons/${result.lessonId}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary font-bold hover:bg-primary/20 transition-all">
                  <BookOpenIcon className="w-4 h-4 shrink-0" />
                  Open Lesson →
                </a>
              )}
              {result.deckId && (
                <a href={`/dashboard/flashcards?deckId=${result.deckId}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 font-bold hover:bg-amber-500/20 transition-all">
                  <BoltIcon className="w-4 h-4 shrink-0" />
                  Open Flashcards →
                </a>
              )}
              {result.assignmentId && (
                <a href={`/dashboard/assignments/${result.assignmentId}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 font-bold hover:bg-emerald-500/20 transition-all">
                  <ClipboardDocumentListIcon className="w-4 h-4 shrink-0" />
                  Open Assignment →
                </a>
              )}
            </div>
          )}

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
              <p className="text-xs text-rose-400 font-bold">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 border-t border-white/[0.06] flex gap-3">
          {!running && !done && (
            <button onClick={run}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-primary to-fuchsia-600 hover:opacity-90 text-white text-sm font-black rounded-2xl shadow-lg shadow-primary/20 transition-all">
              <SparklesIcon className="w-4 h-4" />
              Generate Lesson Package
            </button>
          )}
          {running && (
            <div className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary/10 border border-primary/30 text-primary text-sm font-bold rounded-2xl cursor-not-allowed">
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
              AI working — please wait…
            </div>
          )}
          {(done || error) && (
            <>
              {error && (
                <button onClick={run} className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-sm font-bold rounded-2xl transition-all">
                  <ArrowPathIcon className="w-4 h-4" /> Retry
                </button>
              )}
              <button onClick={onClose} className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-sm font-bold rounded-2xl transition-all">
                {done ? 'Done' : 'Close'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
