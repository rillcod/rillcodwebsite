'use client';

/**
 * WeekAIGenerator
 * ───────────────
 * One-click AI content factory per week in the lesson-plan detail page.
 *
 * Generation is delegated to the plan's own generators rather than calling
 * /api/ai/generate directly. Those routes resolve the plan's protected
 * official edition and anchor the prompt to that week's syllabus — topic,
 * subtopics, objectives, activities — plus sibling topics for anti-repetition,
 * and they write server-side. Prompting from the week topic alone, as this
 * component used to, produced content that could drift away from the official
 * curriculum the plan is locked to.
 *
 * Design:
 *  1. Lesson — POST /api/lesson-plans/[id]/generate-lessons for this one week,
 *     streaming its progress. Assignment blocks found in the saved lesson's
 *     content_layout still become assignments, as the lesson add page does.
 *
 *  2. Flashcards — creates a deck, then calls the dedicated AI endpoint
 *     /api/flashcards/decks/[id]/generate which handles generation + insert
 *     atomically. This is the same endpoint the flashcard page uses.
 *
 *  3. Assignment / project — the matching plan generator, used only when the
 *     lesson did not already yield one.
 *
 *  4. Deduplication — pre-loaded existing content from page state is checked
 *     first; API query is only used as fallback when state is empty. The
 *     routes also skip weeks that already have content.
 */

import { useState } from 'react';
import {
  SparklesIcon, XMarkIcon, CheckCircleIcon, ArrowPathIcon,
  BoltIcon, BookOpenIcon, ClipboardDocumentListIcon,
  PresentationChartLineIcon,
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
  projectId?: string;
}

interface Props {
  week: Week;
  planId: string;
  /** Only needed for the flashcard deck and lesson-block assignment. Course,
   *  programme, grade and curriculum context now come from the plan itself,
   *  server-side, so they are no longer passed in. */
  courseId?: string | null;
  /** Pre-loaded linked content from parent state — used for dedup check. */
  existing?: ExistingContent;
  onDone?: (result: { lessonId?: string; deckId?: string; assignmentId?: string; projectId?: string }) => void;
  onClose: () => void;
}

type StepState = 'pending' | 'active' | 'done' | 'skipped' | 'error';

interface StepStatus {
  lesson: StepState;
  flashcard: StepState;
  assignment: StepState;
  project: StepState;
}

interface Result {
  lessonId?: string;
  lessonTitle?: string;
  deckId?: string;
  deckTitle?: string;
  assignmentId?: string;
  assignmentTitle?: string;
  projectId?: string;
  projectTitle?: string;
  skipped: string[];
}

// ── Helper ───────────────────────────────────────────────────────────────────

function StepRow({ icon: Icon, label, sub, state, color }: {
  icon: React.ElementType; label: string; sub: string;
  state: StepState; color: string;
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all duration-300 ${
      state === 'done'    ? 'bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]' :
      state === 'active'  ? 'bg-primary/10 border-primary/30 shadow-[0_0_20px_rgba(139,92,246,0.1)] animate-[pulse_2s_infinite]' :
      state === 'error'   ? 'bg-rose-500/10 border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.05)]' :
      state === 'skipped' ? 'bg-muted/20 border-border opacity-60' :
                            'bg-muted/30 border-border hover:border-primary/30'
    }`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-inner ${color}`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-black ${
          state === 'done' ? 'text-emerald-700 dark:text-emerald-300' : state === 'error' ? 'text-rose-700 dark:text-rose-300' :
          state === 'active' ? 'text-foreground' : 'text-muted-foreground'
        }`}>{label}</p>
        <p className="text-[10px] text-muted-foreground/80">{sub}</p>
      </div>
      <div className="shrink-0">
        {state === 'done'    && <CheckCircleIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
        {state === 'active'  && <ArrowPathIcon className="w-4 h-4 text-primary animate-spin" />}
        {state === 'error'   && <XMarkIcon className="w-4 h-4 text-rose-600 dark:text-rose-400" />}
        {state === 'skipped' && <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">Exists</span>}
        {state === 'pending' && <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />}
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

async function fetchLesson(planId: string, weekNum: number): Promise<any | null> {
  try {
    const res = await fetch(`/api/lessons?lesson_plan_id=${planId}`);
    if (!res.ok) return null;
    const { data } = await res.json();
    return (data ?? []).find((l: any) =>
      l.metadata?.week === weekNum || l.metadata?.week_number === weekNum
    ) ?? null;
  } catch { return null; }
}

/**
 * Runs one of the plan generators for a single week and streams its progress.
 *
 * These routes read the plan's protected official edition through
 * canonicalPlanCurriculum and anchor the prompt to that week's syllabus —
 * topic, subtopics, objectives and activities — as well as sibling topics for
 * anti-repetition. Generating straight from /api/ai/generate skipped all of
 * that, so content could drift from the official curriculum the plan is
 * locked to.
 */
async function runPlanGenerator(
  planId: string,
  target: 'generate-lessons' | 'generate-assignments' | 'generate-projects',
  weekNum: number,
  onStatus: (message: string) => void,
): Promise<void> {
  const res = await fetch(`/api/lesson-plans/${planId}/${target}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ only_weeks: [weekNum], auto_publish: false }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Generation failed');
  }
  const contentType = res.headers.get('Content-Type') ?? '';
  if (!contentType.includes('text/event-stream') || !res.body) return;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.error) throw new Error(event.error);
        if (event.status) onStatus(event.status);
      } catch (parseError: any) {
        if (parseError?.message !== 'Unexpected end of JSON input') throw parseError;
      }
    }
  }
}

async function checkExistingAssignment(planId: string, weekNum: number): Promise<string | null> {
  try {
    const res = await fetch(`/api/assignments?lesson_plan_id=${planId}`);
    if (!res.ok) return null;
    const { data } = await res.json();
    return (data ?? []).find((a: any) =>
      a.metadata?.week === weekNum && a.assignment_type !== 'project'
    )?.id ?? null;
  } catch { return null; }
}

async function checkExistingProject(planId: string, weekNum: number): Promise<string | null> {
  try {
    const res = await fetch(`/api/assignments?lesson_plan_id=${planId}`);
    if (!res.ok) return null;
    const { data } = await res.json();
    return (data ?? []).find((a: any) =>
      a.metadata?.week === weekNum && a.assignment_type === 'project'
    )?.id ?? null;
  } catch { return null; }
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function WeekAIGenerator({
  week, planId, courseId, existing, onDone, onClose,
}: Props) {
  const [status, setStatus] = useState<StepStatus>({ lesson: 'pending', flashcard: 'pending', assignment: 'pending', project: 'pending' });
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
    setStatus({ lesson: 'pending', flashcard: 'pending', assignment: 'pending', project: 'pending' });

    const res: Result = { skipped: [] };
    // Content blocks from lesson generation — shared across steps
    let contentLayout: any[] = [];
    const lessonId = existing?.lessonId;
    let assignmentId = existing?.assignmentId;

    try {
      // ─────────────────────────────────────────────────────────────────────
      // STEP 1 — LESSON (grounded plan generator, single week)
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
        addLog('🤖 Generating lesson from the official curriculum…');

        try {
          // The route grounds the prompt in this week's syllabus from the
          // plan's protected edition and writes the lesson server-side.
          await runPlanGenerator(planId, 'generate-lessons', week.week, (s) =>
            addLog(`   ↳ ${s}`),
          );

          const saved = await fetchLesson(planId, week.week);
          if (!saved?.id) throw new Error('Lesson was not created for this week');

          contentLayout = Array.isArray(saved.content_layout) ? saved.content_layout : [];

          res.lessonId = saved.id;
          res.lessonTitle = saved.title;
          addLog(`✅ Lesson saved: "${saved.title}"`);
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
                lesson_id: res.lessonId,
                assignment_type: 'project',
                max_points: 100,
                is_active: false,
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

          // The API returns deduped:true when this deck already existed (deck create is
          // now idempotent). Mirror the lesson step: SKIP — don't pile more AI cards onto
          // an existing deck. This is the fix for "lesson skips but flashcard doesn't".
          if (dj.deduped) {
            setStep('flashcard', 'skipped');
            res.skipped.push('flashcards');
            addLog('⏭  Flashcard deck already exists — skipped');
          } else {
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
          }
        } catch (e: any) {
          setStep('flashcard', 'error');
          addLog(`⚠️  Flashcards: ${e.message}`);
        }
      }

      // ─────────────────────────────────────────────────────────────────────
      // STEP 3 — ASSIGNMENT (from lesson block, else plan generator)
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
        // No assignment block came out of the lesson, so generate one from the
        // official curriculum rather than from the week topic alone.
        addLog('🤖 Generating assignment from the official curriculum…');
        try {
          await runPlanGenerator(planId, 'generate-assignments', week.week, (s) =>
            addLog(`   ↳ ${s}`),
          );
          const saved = await checkExistingAssignment(planId, week.week);
          if (!saved) throw new Error('Assignment was not created for this week');
          res.assignmentId = saved;
          addLog('✅ Assignment saved');
          setStep('assignment', 'done');
        } catch (e: any) {
          setStep('assignment', 'error');
          addLog(`⚠️  Assignment: ${e.message}`);
        }
      }

      // ─────────────────────────────────────────────────────────────────────
      // STEP 4 — CAPSTONE PROJECT (plan generator)
      // ─────────────────────────────────────────────────────────────────────
      setStep('project', 'active');
      addLog('🔍 Checking for existing project…');

      const existingProjId = existing?.projectId ?? await checkExistingProject(planId, week.week);

      if (existingProjId) {
        res.projectId = existingProjId;
        setStep('project', 'skipped');
        res.skipped.push('project');
        addLog('⏭  Project already exists — skipped');
      } else {
        addLog('🤖 Generating Capstone Project from the official curriculum…');
        try {
          await runPlanGenerator(planId, 'generate-projects', week.week, (s) =>
            addLog(`   ↳ ${s}`),
          );
          const saved = await checkExistingProject(planId, week.week);
          if (!saved) throw new Error('Project was not created for this week');
          res.projectId = saved;
          addLog('✅ Capstone Project saved');
          setStep('project', 'done');
        } catch (e: any) {
          setStep('project', 'error');
          addLog(`⚠️  Project: ${e.message}`);
        }
      }

      setResult(res);
      setDone(true);
      onDone?.({ lessonId: res.lessonId, deckId: res.deckId, assignmentId: res.assignmentId, projectId: res.projectId });
    } catch (e: any) {
      setError(e.message);
      addLog(`❌ Fatal: ${e.message}`);
    } finally {
      setRunning(false);
    }
  }

  const hasResult = !!(result.lessonId || result.deckId || result.assignmentId || result.projectId);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-foreground/35 dark:bg-black/70 backdrop-blur-md" onClick={!running ? onClose : undefined} />

      <div className="relative w-full sm:max-w-md bg-card text-card-foreground border border-border backdrop-blur-2xl shadow-2xl rounded-t-[2.5rem] sm:rounded-3xl overflow-hidden transition-all duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 via-primary to-fuchsia-500 flex items-center justify-center shadow-lg shadow-primary/25">
              <SparklesIcon className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-primary/80">AI Lesson Package</p>
              <p className="text-sm font-black text-foreground truncate max-w-[220px]">Week {week.week}: {week.topic}</p>
            </div>
          </div>
          {!running && (
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-200">
              <XMarkIcon className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {!running && !done && !error && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              Generates a <strong className="text-foreground font-bold">full lesson</strong> (customized visualizer, Blockly logic & Monaco code sync), a <strong className="text-foreground font-bold">15-card flashcard deck</strong>, an <strong className="text-foreground font-bold">assignment</strong>, and a <strong className="text-foreground font-bold">capstone project</strong>. Existing elements are skipped automatically.
            </p>
          )}

          <div className="space-y-3">
            <StepRow icon={BookOpenIcon} label="Full Lesson" sub="Streaming AI · CS visualizer · 12+ blocks + notes" state={status.lesson} color="bg-primary" />
            <StepRow icon={BoltIcon} label="Flashcard Deck" sub="15 AI cards · saved to Flashcards module" state={status.flashcard} color="bg-amber-500" />
            <StepRow icon={ClipboardDocumentListIcon} label="Assignment" sub="From lesson block, else official curriculum" state={status.assignment} color="bg-emerald-600" />
            <StepRow icon={PresentationChartLineIcon} label="Capstone Project" sub="Creative STEM project handbook & rubric" state={status.project} color="bg-purple-600" />
          </div>

          {log.length > 0 && (
            <div className="bg-muted/40 border border-border rounded-2xl p-4 max-h-36 overflow-y-auto space-y-1 font-mono text-[10px] text-primary/80 custom-scrollbar shadow-inner">
              {log.map((l, i) => (
                <p key={i} className="leading-relaxed border-l-2 border-primary/20 pl-2">{l}</p>
              ))}
            </div>
          )}

          {done && hasResult && (
            <div className="space-y-2 pt-2 border-t border-border">
              {result.skipped.length > 0 && (
                <p className="text-[10px] text-muted-foreground italic">Skipped (already existed): {result.skipped.join(', ')}</p>
              )}
              {result.lessonId && (
                <a href={`/dashboard/lessons/${result.lessonId}`} target="_blank" rel="noreferrer"
                  className="flex items-center justify-between px-4 py-3 rounded-2xl bg-primary/10 border border-primary/20 hover:border-primary/40 text-xs text-primary font-black uppercase tracking-widest hover:bg-primary/20 transition-all duration-300 shadow-md">
                  <span className="flex items-center gap-2">
                    <BookOpenIcon className="w-4 h-4" /> Open Lesson
                  </span>
                  <span>→</span>
                </a>
              )}
              {result.deckId && (
                <a href={`/dashboard/flashcards?deckId=${result.deckId}`} target="_blank" rel="noreferrer"
                  className="flex items-center justify-between px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 hover:border-amber-500/40 text-xs text-amber-600 dark:text-amber-400 font-black uppercase tracking-widest hover:bg-amber-500/20 transition-all duration-300 shadow-md">
                  <span className="flex items-center gap-2">
                    <BoltIcon className="w-4 h-4 animate-pulse" /> Open Flashcards
                  </span>
                  <span>→</span>
                </a>
              )}
              {result.assignmentId && (
                <a href={`/dashboard/assignments/${result.assignmentId}`} target="_blank" rel="noreferrer"
                  className="flex items-center justify-between px-4 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 hover:border-emerald-500/40 text-xs text-emerald-600 dark:text-emerald-400 font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all duration-300 shadow-md">
                  <span className="flex items-center gap-2">
                    <ClipboardDocumentListIcon className="w-4 h-4" /> Open Assignment
                  </span>
                  <span>→</span>
                </a>
              )}
              {result.projectId && (
                <a href={`/dashboard/projects/${result.projectId}`} target="_blank" rel="noreferrer"
                  className="flex items-center justify-between px-4 py-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 hover:border-purple-500/40 text-xs text-purple-600 dark:text-purple-400 font-black uppercase tracking-widest hover:bg-purple-500/20 transition-all duration-300 shadow-md">
                  <span className="flex items-center gap-2">
                    <PresentationChartLineIcon className="w-4 h-4" /> Open Project
                  </span>
                  <span>→</span>
                </a>
              )}
            </div>
          )}

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl px-4 py-3.5 shadow-[0_0_15px_rgba(244,63,94,0.05)]">
              <p className="text-xs text-rose-600 dark:text-rose-400 font-black tracking-wide">{error}</p>
            </div>
          )}
        </div>

        <div className="px-6 pb-6 pt-4 border-t border-border flex gap-3">
          {!running && !done && (
            <button onClick={run}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-violet-500 via-primary to-fuchsia-600 hover:opacity-95 text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-primary/25 hover:shadow-primary/35 transition-all duration-300 transform active:scale-95">
              <SparklesIcon className="w-4 h-4" /> Generate Lesson Package
            </button>
          )}
          {running && (
            <div className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-primary/10 border border-primary/20 text-primary text-xs font-black uppercase tracking-widest rounded-2xl cursor-not-allowed select-none shadow-md">
              <ArrowPathIcon className="w-4 h-4 animate-spin" /> AI packaging details…
            </div>
          )}
          {(done || error) && (
            <>
              {error && (
                <button onClick={run} className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-muted/40 hover:bg-muted border border-border text-muted-foreground hover:text-foreground text-xs font-black uppercase tracking-widest rounded-2xl transition-all duration-200">
                  <ArrowPathIcon className="w-4 h-4" /> Retry
                </button>
              )}
              <button onClick={onClose} className="flex-1 py-3.5 bg-muted/40 hover:bg-muted border border-border text-muted-foreground hover:text-foreground text-xs font-black uppercase tracking-widest rounded-2xl transition-all duration-200">
                {done ? 'Done' : 'Close'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
