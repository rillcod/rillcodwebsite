'use client';

/**
 * WeekAIGenerator
 * ───────────────
 * One-click AI content factory per week in the lesson-plan detail page.
 *
 * Design:
 *  1. Lesson — calls /api/ai/generate?stream=1 with type=lesson (identical
 *     to the standalone lesson builder). Saves with content_layout field.
 *     Auto-extracts assignment-block entries from content_layout and saves
 *     them to /api/assignments (same as the lesson add page does).
 *
 *  2. Flashcards — creates a deck, then calls the dedicated AI endpoint
 *     /api/flashcards/decks/[id]/generate which handles generation + insert
 *     atomically. This is the same endpoint the flashcard page uses.
 *
 *  3. Assignment — taken from the assignment-block inside the lesson's
 *     content_layout (no extra AI call). Falls back to a separate
 *     /api/ai/generate type=assignment call only if no block was found.
 *
 *  4. Deduplication — pre-loaded existing content from page state is checked
 *     first; API query is only used as fallback when state is empty.
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
  /** Pre-loaded linked content from parent state — used for dedup check. */
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
}

// ── Helper ───────────────────────────────────────────────────────────────────

function StepRow({ icon: Icon, label, sub, state, color }: {
  icon: React.ElementType; label: string; sub: string;
  state: StepState; color: string;
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
          state === 'done' ? 'text-emerald-300' : state === 'error' ? 'text-rose-300' :
          state === 'active' ? 'text-white' : 'text-white/50'
        }`}>{label}</p>
        <p className="text-[10px] text-white/30">{sub}</p>
      </div>
      <div className="shrink-0">
        {state === 'done'    && <CheckCircleIcon className="w-5 h-5 text-emerald-400" />}
        {state === 'active'  && <ArrowPathIcon className="w-4 h-4 text-primary animate-spin" />}
        {state === 'error'   && <XMarkIcon className="w-4 h-4 text-rose-400" />}
        {state === 'skipped' && <span className="text-[9px] font-black text-white/30 uppercase tracking-wider">Exists</span>}
        {state === 'pending' && <div className="w-2 h-2 rounded-full bg-white/20" />}
      </div>
    </div>
  );
}

async function checkExistingLesson(planId: string, weekNum: number): Promise<string | null> {
  try {
    const res = await fetch(`/api/lessons?lesson_plan_id=${planId}`);
    if (!res.ok) return null;
    const { data } = await res.json();
    return (data ?? []).find((l: any) =>
      l.metadata?.week === weekNum || l.metadata?.week_number === weekNum
    )?.id ?? null;
  } catch { return null; }
}

async function checkExistingAssignment(planId: string, weekNum: number): Promise<string | null> {
  try {
    const res = await fetch(`/api/assignments?lesson_plan_id=${planId}`);
    if (!res.ok) return null;
    const { data } = await res.json();
    return (data ?? []).find((a: any) =>
      a.metadata?.week === weekNum
    )?.id ?? null;
  } catch { return null; }
}

// ── Main ─────────────────────────────────────────────────────────────────────

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
    // Content blocks from lesson generation — shared across steps
    let contentLayout: any[] = [];
    let lessonId = existing?.lessonId;
    let assignmentId = existing?.assignmentId;

    try {
      // ─────────────────────────────────────────────────────────────────────
      // STEP 1 — LESSON (identical call to standalone lesson builder)
      // ─────────────────────────────────────────────────────────────────────
      setStep('lesson', 'active');
      addLog('🔍 Checking for existing lesson…');

      const existingLessonId = lessonId ?? await checkExistingLesson(planId, week.week);

      if (existingLessonId) {
        res.lessonId = existingLessonId;
        setStep('lesson', 'skipped');
        res.skipped.push('lesson');
        addLog('⏭  Lesson already exists — skipped');
      } else {
        addLog('🤖 Generating lesson (streaming, 16k tokens)…');

        // Build the same request body the standalone builder sends
        const aiBody = JSON.stringify({
          type: 'lesson',
          topic: week.topic,
          gradeLevel: 'JSS1–SS3',
          subject: courseTitle,
          durationMinutes: 60,
          contentType: 'lesson',
          lessonMode: 'academic',
          courseName: courseTitle,
          programName: undefined,
          objectives: week.objectives,
          activities: week.activities,
          additionalContext: week.notes,
        });

        let lessonData: any = null;

        try {
          const aiRes = await fetch('/api/ai/generate?stream=1', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: aiBody,
          });

          if (!aiRes.ok) {
            const err = await aiRes.json().catch(() => ({}));
            throw new Error(err.error ?? 'AI lesson generation failed');
          }

          const ct = aiRes.headers.get('Content-Type') ?? '';

          if (ct.includes('text/event-stream') && aiRes.body) {
            // Handle SSE stream — same logic as lesson add page
            const reader = aiRes.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            while (true) {
              const { done: streamDone, value } = await reader.read();
              if (streamDone) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() ?? '';
              for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                  const event = JSON.parse(line.slice(6));
                  if (event.status) addLog(`   ↳ ${event.status}`);
                  if (event.error) throw new Error(event.error);
                  if (event.done && event.data) lessonData = event.data;
                } catch (pe: any) {
                  if (pe.message !== 'Unexpected end of JSON input') throw pe;
                }
              }
            }
          } else {
            const payload = await aiRes.json();
            lessonData = payload.data;
          }

          if (!lessonData) throw new Error('AI returned empty lesson data');

          contentLayout = Array.isArray(lessonData.content_layout) && lessonData.content_layout.length > 0
            ? lessonData.content_layout
            : [];

          addLog(`✅ AI generated ${contentLayout.length} content blocks — saving lesson…`);

          const lessonPayload: Record<string, unknown> = {
            title: lessonData.title || `Week ${week.week}: ${week.topic}`,
            description: lessonData.description ?? null,
            lesson_notes: lessonData.lesson_notes ?? null,
            lesson_type: lessonData.lesson_type ?? 'lesson',
            status: 'draft',
            content_layout: contentLayout,
            video_url: lessonData.video_url ?? null,
            duration_minutes: lessonData.duration_minutes ?? 60,
            metadata: {
              week: week.week,
              lesson_plan_id: planId,
              term,
              source: 'week-ai-generator',
              curriculum_id: curriculumId ?? null,
            },
          };
          if (courseId) lessonPayload.course_id = courseId;

          const lr = await fetch('/api/lessons', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(lessonPayload),
          });
          const lj = await lr.json();
          if (!lr.ok || !lj.data?.id) throw new Error(lj.error || 'Lesson save failed');

          res.lessonId = lj.data.id;
          res.lessonTitle = lj.data.title;
          addLog(`✅ Lesson saved: "${lj.data.title}"`);
          setStep('lesson', 'done');

          // Auto-create assignment from assignment-block (mirrors lesson add page behaviour)
          const assignmentBlocks = contentLayout.filter(
            (b: any) => b.type === 'assignment-block' && b.title?.trim()
          );
          if (assignmentBlocks.length > 0 && !assignmentId) {
            const blk = assignmentBlocks[0];
            const instrParts = [
              blk.instructions,
              blk.deliverables?.length
                ? `\n\nDeliverables:\n${blk.deliverables.map((d: string, i: number) => `${i + 1}. ${d}`).join('\n')}`
                : '',
            ].filter(Boolean).join('');

            const asnRes = await fetch('/api/assignments', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: blk.title,
                instructions: instrParts,
                course_id: courseId ?? null,
                lesson_id: lj.data.id,
                assignment_type: 'project',
                max_points: 100,
                is_active: true,
                metadata: { week: week.week, lesson_plan_id: planId, source: 'week-ai-generator' },
              }),
            });
            const aj = await asnRes.json();
            if (asnRes.ok && aj.data?.id) {
              res.assignmentId = aj.data.id;
              res.assignmentTitle = aj.data.title;
              assignmentId = aj.data.id;
              addLog(`✅ Assignment auto-created from lesson block: "${aj.data.title}"`);
            }
          }
        } catch (e: any) {
          setStep('lesson', 'error');
          addLog(`⚠️  Lesson: ${e.message}`);
          // Don't abort — continue to flashcards
        }
      }

      // ─────────────────────────────────────────────────────────────────────
      // STEP 2 — FLASHCARDS (create deck + call /decks/[id]/generate)
      // ─────────────────────────────────────────────────────────────────────
      setStep('flashcard', 'active');
      addLog('🔍 Checking for existing flashcard deck…');

      // Simple check: does a deck for this week/plan exist already?
      // We don't have a pre-loaded deck list so we skip the API check and
      // rely on the existing?.deckId from parent (cheaper).
      if (existing?.deckId) {
        res.deckId = existing.deckId;
        setStep('flashcard', 'skipped');
        res.skipped.push('flashcards');
        addLog('⏭  Flashcard deck already exists — skipped');
      } else {
        addLog('🃏 Creating flashcard deck…');
        try {
          const deckBody: Record<string, unknown> = {
            title: `Week ${week.week}: ${week.topic}`,
          };
          if (courseId) deckBody.course_id = courseId;

          const dr = await fetch('/api/flashcards/decks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(deckBody),
          });
          const dj = await dr.json();
          if (!dr.ok || !dj.data?.id) throw new Error(dj.error || 'Deck create failed');

          const deckId = dj.data.id;
          res.deckId = deckId;
          res.deckTitle = dj.data.title;
          addLog(`🤖 Deck created — generating 15 AI cards…`);

          // Use the dedicated generate endpoint (same as flashcard page)
          const genRes = await fetch(`/api/flashcards/decks/${deckId}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              topic: week.topic,
              count: 15,
              difficulty: 'medium',
              // Pass lesson content as extra context if available
              content: contentLayout.length > 0
                ? contentLayout
                    .filter((b: any) => ['text', 'heading', 'key-terms', 'steps-list'].includes(b.type))
                    .map((b: any) => b.content || b.title || '')
                    .filter(Boolean)
                    .join('\n')
                    .slice(0, 2000)
                : undefined,
            }),
          });
          const gj = await genRes.json();
          if (!genRes.ok) throw new Error(gj.error || 'Card generation failed');
          const cardCount = Array.isArray(gj.data) ? gj.data.length : (gj.count ?? '?');
          addLog(`✅ ${cardCount} flashcards generated and saved to deck`);
          setStep('flashcard', 'done');
        } catch (e: any) {
          setStep('flashcard', 'error');
          addLog(`⚠️  Flashcards: ${e.message}`);
        }
      }

      // ─────────────────────────────────────────────────────────────────────
      // STEP 3 — ASSIGNMENT (from block or fallback AI call)
      // ─────────────────────────────────────────────────────────────────────
      setStep('assignment', 'active');
      addLog('🔍 Checking for existing assignment…');

      const existingAsnId = assignmentId ?? existing?.assignmentId ?? await checkExistingAssignment(planId, week.week);

      if (existingAsnId) {
        if (!res.assignmentId) {
          res.assignmentId = existingAsnId;
          res.skipped.push('assignment');
          addLog('⏭  Assignment already exists — skipped');
        } else {
          addLog('✅ Assignment already created from lesson block');
        }
        setStep('assignment', 'done');
      } else {
        // Fallback: generate assignment via AI if no block produced one
        addLog('🤖 Generating assignment via AI (fallback)…');
        try {
          const aiRes = await fetch('/api/ai/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'assignment',
              topic: week.topic,
              subject: courseTitle,
              gradeLevel: 'JSS1–SS3',
              objectives: week.objectives,
              assignmentType: week.project?.title ? 'project' : 'homework',
              courseName: courseTitle,
            }),
          });
          const aj = await aiRes.json();
          const asnData = aj.data ?? {};

          const dueDate = new Date(Date.now() + 7 * 864e5).toISOString().split('T')[0];
          const saveRes = await fetch('/api/assignments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: asnData.title || `Week ${week.week}: ${week.topic} — Assignment`,
              description: asnData.description ?? null,
              instructions: asnData.instructions || asnData.description || week.objectives || '',
              questions: Array.isArray(asnData.questions) ? asnData.questions : [],
              assignment_type: asnData.assignment_type || 'homework',
              max_points: asnData.max_points ?? 100,
              due_date: dueDate,
              is_active: true,
              course_id: courseId ?? null,
              lesson_id: res.lessonId ?? null,
              metadata: {
                week: week.week,
                lesson_plan_id: planId,
                term,
                source: 'week-ai-generator',
                rubric: asnData.metadata?.rubric ?? asnData.rubric ?? [],
                deliverables: asnData.metadata?.deliverables ?? [],
              },
            }),
          });
          const sj = await saveRes.json();
          if (saveRes.ok && sj.data?.id) {
            res.assignmentId = sj.data.id;
            res.assignmentTitle = sj.data.title;
            addLog(`✅ Assignment saved: "${sj.data.title}"`);
            setStep('assignment', 'done');
          } else {
            throw new Error(sj.error || 'Assignment save failed');
          }
        } catch (e: any) {
          setStep('assignment', 'error');
          addLog(`⚠️  Assignment: ${e.message}`);
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

  const hasResult = !!(result.lessonId || result.deckId || result.assignmentId);

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
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">AI Lesson Package</p>
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
          {!running && !done && !error && (
            <p className="text-xs text-white/50 leading-relaxed">
              Generates a <strong className="text-white/80">full lesson</strong> (same AI engine as the lesson builder), a <strong className="text-white/80">15-card flashcard deck</strong>, and an <strong className="text-white/80">assignment</strong> — all linked to this week. Existing content is skipped automatically.
            </p>
          )}

          <div className="space-y-2">
            <StepRow icon={BookOpenIcon} label="Full Lesson" sub="Streaming AI · Academic mode · 12+ blocks + notes" state={status.lesson} color="bg-primary" />
            <StepRow icon={BoltIcon} label="Flashcard Deck" sub="15 AI cards · saved to Flashcards module" state={status.flashcard} color="bg-amber-500" />
            <StepRow icon={ClipboardDocumentListIcon} label="Assignment" sub="Auto-extracted from lesson block or AI-generated" state={status.assignment} color="bg-emerald-600" />
          </div>

          {log.length > 0 && (
            <div className="bg-black/50 rounded-xl p-3 max-h-40 overflow-y-auto space-y-0.5">
              {log.map((l, i) => (
                <p key={i} className="text-[10px] text-white/50 font-mono leading-relaxed">{l}</p>
              ))}
            </div>
          )}

          {done && hasResult && (
            <div className="space-y-2 pt-1">
              {result.skipped.length > 0 && (
                <p className="text-[10px] text-white/30 italic">Skipped (already existed): {result.skipped.join(', ')}</p>
              )}
              {result.lessonId && (
                <a href={`/dashboard/lessons/${result.lessonId}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary font-bold hover:bg-primary/20 transition-all">
                  <BookOpenIcon className="w-4 h-4 shrink-0" /> Open Lesson →
                </a>
              )}
              {result.deckId && (
                <a href={`/dashboard/flashcards?deckId=${result.deckId}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 font-bold hover:bg-amber-500/20 transition-all">
                  <BoltIcon className="w-4 h-4 shrink-0" /> Open Flashcards →
                </a>
              )}
              {result.assignmentId && (
                <a href={`/dashboard/assignments/${result.assignmentId}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 font-bold hover:bg-emerald-500/20 transition-all">
                  <ClipboardDocumentListIcon className="w-4 h-4 shrink-0" /> Open Assignment →
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

        <div className="px-5 pb-5 pt-3 border-t border-white/[0.06] flex gap-3">
          {!running && !done && (
            <button onClick={run}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-primary to-fuchsia-600 hover:opacity-90 text-white text-sm font-black rounded-2xl shadow-lg shadow-primary/20 transition-all">
              <SparklesIcon className="w-4 h-4" /> Generate Lesson Package
            </button>
          )}
          {running && (
            <div className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary/10 border border-primary/30 text-primary text-sm font-bold rounded-2xl cursor-not-allowed select-none">
              <ArrowPathIcon className="w-4 h-4 animate-spin" /> AI working — please wait…
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
