// @refresh reset
'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { normalizeLessonType } from '@/lib/lessons/lesson-type';
import {
  peekStashedCurriculumLessonPlan,
  clearStashedCurriculumLessonPlan,
  type CurriculumWeekPlanSlice,
} from '@/lib/curriculum/add-lesson-from-curriculum';
import {
  ArrowLeft, BookOpen,
  Sparkles, Save, Layout, Settings2, Loader2, ChevronDown, ChevronUp,
  GraduationCap, Hammer, Zap,
  X, RefreshCw, Eye, Users, Clock,
  CheckCircle2, Code2, FileText, Image as ImageIcon, Lightbulb,
  ListChecks, Target, Video, PenLine,
} from 'lucide-react';
import CanvaEditor from '@/features/lessons/components/CanvaEditor';
import PipelineStepper from '@/components/pipeline/PipelineStepper';

function parseLessonPlanFromQuery(raw: string | null): CurriculumWeekPlanSlice | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CurriculumWeekPlanSlice;
  } catch {
    try {
      return JSON.parse(decodeURIComponent(raw)) as CurriculumWeekPlanSlice;
    } catch {
      return null;
    }
  }
}

const YOUNG_LEARNER_GRADES = ['KG', 'Basic 1', 'Basic 2', 'Basic 3', 'Basic 4', 'Basic 5', 'Basic 6', 'Basic 1–Basic 3', 'Basic 4–Basic 6', 'Basic 1–Basic 6', 'KG–Basic 3'];

function AddLessonPageContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const { profile, loading: authLoading, profileLoading } = useAuth();
  const preProgramId = sp.get('program_id');
  const preCourseId = sp.get('course_id');
  const isMinimal = sp.get('minimal') === 'true';

  // Curriculum context from query params
  const curriculumSource = sp.get('source') === 'curriculum';
  const curriculumId = sp.get('curriculum_id');
  const curriculumTerm = sp.get('term');
  const curriculumWeek = sp.get('week');
  const preTitle = sp.get('title');
  const preDescription = sp.get('description');
  const preDuration = sp.get('duration');
  const preLessonPlan = sp.get('lesson_plan');
  const lessonPlanKey = sp.get('lesson_plan_key');
  const flowOrigin = sp.get('flow_origin');
  const classIdFromUrl = sp.get('class_id');
  // Step 2 → Step 3 handoff: creating a lesson for an existing term plan's week.
  const termPlanId = sp.get('lesson_plan_id');
  const termPlanWeek = sp.get('week');

  const curriculumPlanAppliedRef = useRef<string | null>(null);

  const [programs, setPrograms] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI generation state
  const [aiOpen, setAiOpen] = useState(true);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGeneratingNotes, setAiGeneratingNotes] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiTopic, setAiTopic] = useState('');
  const [aiGrade, setAiGrade] = useState('JSS1–SS3');
  const [aiSubject, setAiSubject] = useState('');
  const [lastModel, setLastModel] = useState<string | null>(null);
  const [aiMode, setAiMode] = useState<'academic' | 'project' | 'interactive'>('academic');
  const [aiObjectives, setAiObjectives] = useState<string[]>([]);
  const [showLessonPreview, setShowLessonPreview] = useState(false);
  const [aiStatus, setAiStatus] = useState<string | null>(null);

  const isYoungLearner = YOUNG_LEARNER_GRADES.some(g => aiGrade === g || aiGrade.startsWith(g));

  const [form, setForm] = useState({
    title: '',
    description: '',
    lesson_notes: '',
    course_id: '',
    lesson_type: 'hands-on',
    duration_minutes: '60',
    session_date: '',
    video_url: '',
    status: 'draft',
    order_index: '',
    content_layout: [] as any[]
  });

  // Initialize form from curriculum / syllabus deep links (URL or sessionStorage for large plans)
  useEffect(() => {
    if (!curriculumSource || !preTitle) return;

    setForm(prev => ({
      ...prev,
      title: preTitle,
      description: preDescription || prev.description,
      duration_minutes: preDuration || prev.duration_minutes,
    }));

    const applyPlan = (planData: CurriculumWeekPlanSlice) => {
      if (planData.objectives?.length) setAiObjectives(planData.objectives);
      if (planData.teacher_activities || planData.student_activities || planData.classwork || planData.resources?.length) {
        const layoutBlocks: any[] = [];
        if (planData.objectives?.length) {
          layoutBlocks.push({
            type: 'objectives',
            title: 'Learning Objectives',
            items: planData.objectives,
          });
        }
        if (planData.teacher_activities?.length) {
          planData.teacher_activities.forEach((activity: string, i: number) => {
            layoutBlocks.push({
              type: 'activity',
              title: `Teacher Activity ${i + 1}`,
              instructions: activity,
            });
          });
        }
        if (planData.student_activities?.length) {
          planData.student_activities.forEach((activity: string, i: number) => {
            layoutBlocks.push({
              type: 'activity',
              title: `Student Activity ${i + 1}`,
              instructions: activity,
            });
          });
        }
        if (planData.classwork) {
          layoutBlocks.push({
            type: 'assignment-block',
            title: (planData.classwork as { title?: string }).title || 'Classwork',
            instructions: (planData.classwork as { instructions?: string }).instructions,
          });
        }
        if (planData.resources?.length) {
          layoutBlocks.push({
            type: 'resources',
            title: 'Resources',
            items: planData.resources,
          });
        }
        setForm(prev => ({ ...prev, content_layout: layoutBlocks }));
      }
    };

    if (lessonPlanKey && curriculumPlanAppliedRef.current !== lessonPlanKey) {
      const stashed = peekStashedCurriculumLessonPlan(lessonPlanKey);
      if (stashed) {
        applyPlan(stashed);
        curriculumPlanAppliedRef.current = lessonPlanKey;
        return;
      }
    }

    if (preLessonPlan) {
      const planData = parseLessonPlanFromQuery(preLessonPlan);
      if (planData) applyPlan(planData);
    }
  }, [curriculumSource, preTitle, preDescription, preDuration, preLessonPlan, lessonPlanKey]);

  useEffect(() => {
    if (authLoading || !profile) return;

    const fetchData = async () => {
      const db = createClient();

      // Fetch programs
      const { data: progData } = await db.from('programs').select('id, name').eq('is_active', true).order('name');
      setPrograms(progData ?? []);

      let query = db
        .from('courses')
        .select('id, title, program_id, school_id, programs(name)')
        .eq('is_active', true);

      if (profile?.school_id) {
        query = query.or(`school_id.eq.${profile.school_id},school_id.is.null`);
      }

      const { data } = await query.order('title');
      const courseList = data ?? [];
      setCourses(courseList);

      // Auto-select if IDs provided in URL
      if (preCourseId) {
        const c = courseList.find((x: any) => x.id === preCourseId);
        if (c?.program_id) setSelectedProgramId(c.program_id);
        setForm(prev => ({ ...prev, course_id: preCourseId }));
      } else if (preProgramId && courseList.length > 0) {
        setSelectedProgramId(preProgramId);
        const matching = courseList.find((c: any) => c.program_id === preProgramId);
        if (matching) setForm(prev => ({ ...prev, course_id: matching.id }));
      }
    };

    fetchData();
  }, [profile?.id, authLoading, preProgramId, preCourseId, profile?.school_id]);

  // Auto-fill subject from selected course
  const handleCourseChange = (courseId: string) => {
    setForm(prev => ({ ...prev, course_id: courseId }));
    if (courseId && !aiSubject) {
      const course = courses.find(c => c.id === courseId);
      if (course?.title) setAiSubject(course.title);
      if (course?.title && !aiTopic) setAiTopic(course.title);
    }
  };

  // Full lesson generation — uses SSE streaming for live status feedback
  const handleAiGenerate = async (topicOverride?: string) => {
    const topicToUse = topicOverride || aiTopic;
    if (!topicToUse.trim()) { setAiError('Enter a topic first.'); setAiOpen(true); return; }

    setAiGenerating(true);
    setAiError(null);
    setLastModel(null);
    setAiStatus('Connecting to AI...');
    try {
      const selectedCourse = courses.find(c => c.id === form.course_id);
      const body = JSON.stringify({
        type: 'lesson',
        topic: topicToUse,
        gradeLevel: aiGrade,
        subject: aiSubject || selectedCourse?.title || undefined,
        durationMinutes: form.duration_minutes ? parseInt(form.duration_minutes) : 60,
        contentType: form.lesson_type,
        lessonMode: aiMode,
        courseName: selectedCourse?.title || undefined,
        programName: (selectedCourse as any)?.programs?.name || undefined,
      });

      const res = await fetch('/api/ai/generate?stream=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Generation failed');
      }

      const contentType = res.headers.get('Content-Type') ?? '';

      if (contentType.includes('text/event-stream') && res.body) {
        // Read SSE stream
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
              if (event.status) {
                setAiStatus(event.status);
              } else if (event.error) {
                throw new Error(event.error);
              } else if (event.done && event.data) {
                const d = event.data;
                setLastModel(event.model ?? null);
                if (Array.isArray(d.objectives) && d.objectives.length > 0) setAiObjectives(d.objectives);
                setForm(prev => ({
                  ...prev,
                  title: d.title ?? (topicOverride || prev.title),
                  description: d.description ?? prev.description,
                  lesson_notes: d.lesson_notes ?? prev.lesson_notes,
                  content_layout: Array.isArray(d.content_layout) && d.content_layout.length > 0 ? d.content_layout : prev.content_layout,
                  video_url: d.video_url ?? prev.video_url,
                  duration_minutes: d.duration_minutes ? String(d.duration_minutes) : prev.duration_minutes,
                  lesson_type: normalizeLessonType(d.lesson_type, prev.lesson_type),
                }));
                setAiOpen(false);
                setShowLessonPreview(true);
              }
            } catch (parseErr: any) {
              if (parseErr.message !== 'Unexpected end of JSON input') throw parseErr;
            }
          }
        }
      } else {
        // Fallback: non-streaming response
        const payload = await res.json();
        const d = payload.data;
        setLastModel(payload.model ?? null);
        if (Array.isArray(d.objectives) && d.objectives.length > 0) setAiObjectives(d.objectives);
        setForm(prev => ({
          ...prev,
          title: d.title ?? (topicOverride || prev.title),
          description: d.description ?? prev.description,
          lesson_notes: d.lesson_notes ?? prev.lesson_notes,
          content_layout: Array.isArray(d.content_layout) && d.content_layout.length > 0 ? d.content_layout : prev.content_layout,
          video_url: d.video_url ?? prev.video_url,
          duration_minutes: d.duration_minutes ? String(d.duration_minutes) : prev.duration_minutes,
          lesson_type: normalizeLessonType(d.lesson_type, prev.lesson_type),
        }));
        setAiOpen(false);
        setShowLessonPreview(true);
      }
    } catch (e: any) {
      setAiError(e.message ?? 'Failed to generate lesson');
      setAiOpen(true);
    } finally {
      setAiGenerating(false);
      setAiStatus(null);
    }
  };

  // Notes-only generation — only overwrites lesson_notes
  const handleGenerateNotesOnly = async () => {
    const topicToUse = form.title || aiTopic;
    if (!topicToUse.trim()) { setAiError('Enter a lesson title or topic first.'); setAiOpen(true); return; }

    setAiGeneratingNotes(true);
    setAiError(null);
    try {
      const selectedCourse = courses.find(c => c.id === form.course_id);
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'lesson-notes',
          topic: topicToUse,
          gradeLevel: aiGrade,
          subject: aiSubject || selectedCourse?.title || undefined,
          durationMinutes: form.duration_minutes ? parseInt(form.duration_minutes) : 60,
          courseName: selectedCourse?.title || undefined,
          programName: (selectedCourse as any)?.programs?.name || undefined,
          lessonMode: aiMode,
          contentType: form.lesson_type,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? 'Generation failed');
      const notes = payload.data?.lesson_notes;
      if (notes) setForm(prev => ({ ...prev, lesson_notes: notes }));
    } catch (e: any) {
      setAiError(e.message ?? 'Failed to generate notes');
    } finally {
      setAiGeneratingNotes(false);
    }
  };

  const handleMagicTitle = () => {
    if (!form.course_id) { setError('Select a course first'); return; }
    const course = courses.find(c => c.id === form.course_id);
    if (course?.title) { setAiTopic(course.title); setAiSubject(course.title); }
    setAiOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.course_id) {
      setError('Title and course are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        lesson_notes: form.lesson_notes.trim() || null,
        course_id: form.course_id,
        lesson_type: normalizeLessonType(form.lesson_type, 'lesson'),
        status: form.status,
        video_url: form.video_url.trim() || null,
        content_layout: form.content_layout,
        created_by: profile?.id || '',
      };
      if (form.duration_minutes) payload.duration_minutes = parseInt(form.duration_minutes);
      if (form.order_index) payload.order_index = parseInt(form.order_index) || null;
      if (form.session_date) payload.session_date = new Date(form.session_date).toISOString();

      const aiMeta = {
        ai_lesson_mode: aiMode,
        ai_grade_level: aiGrade,
        ...(lastModel ? { last_ai_model: lastModel } : {}),
      };

      if (curriculumSource && curriculumId && curriculumWeek) {
        payload.metadata = {
          source: 'curriculum',
          curriculum_id: curriculumId,
          term: curriculumTerm ? parseInt(curriculumTerm, 10) : null,
          week: parseInt(curriculumWeek, 10),
          ...(flowOrigin ? { flow_origin: flowOrigin } : {}),
          ...(classIdFromUrl ? { class_id: classIdFromUrl } : {}),
          ...(termPlanId ? { lesson_plan_id: termPlanId } : {}),
          ...aiMeta,
        };
      } else if (termPlanId) {
        // Step 2 → Step 3 handoff: creating a lesson for a specific week of a term plan.
        payload.metadata = {
          lesson_plan_id: termPlanId,
          ...(termPlanWeek ? { week: parseInt(termPlanWeek, 10) } : {}),
          ...(flowOrigin ? { flow_origin: flowOrigin } : {}),
          ...(classIdFromUrl ? { class_id: classIdFromUrl } : {}),
          ...aiMeta,
        };
      } else if (classIdFromUrl) {
        payload.metadata = { class_id: classIdFromUrl, ...aiMeta };
      } else {
        payload.metadata = { ...aiMeta };
      }

      const res = await fetch('/api/lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to create lesson'); }
      const { data } = await res.json();

      // Auto-create real assignments from assignment-block content blocks
      if (data?.id && form.content_layout.length > 0) {
        const assignmentBlocks = form.content_layout.filter((b: any) => b.type === 'assignment-block' && b.title?.trim());
        for (const block of assignmentBlocks) {
          await fetch('/api/assignments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: block.title,
              instructions: [block.instructions, block.deliverables?.length ? `\n\nDeliverables:\n${block.deliverables.map((d: string, i: number) => `${i + 1}. ${d}`).join('\n')}` : ''].filter(Boolean).join(''),
              course_id: form.course_id,
              lesson_id: data.id,
              assignment_type: 'project',
              max_points: 100,
              is_active: true,
            }),
          });
        }
      }

      // Save plan row for Protocol tab — always when curriculum-sourced (even sparse weeks), or when AI/blocks exist
      const shouldUpsertLessonPlan =
        !!data?.id &&
        (
          (curriculumSource && curriculumId && curriculumWeek) ||
          aiObjectives.length > 0 ||
          form.content_layout.length > 0
        );

      let savedLessonPlanId: string | null = data?.lesson_plan_id ?? null;

      if (shouldUpsertLessonPlan) {
        const db = createClient();
        const activityText = form.content_layout
          .filter((b: any) => b.type === 'activity')
          .map((b: any) => [b.title ? `◆ ${b.title}` : null, b.instructions, b.steps?.map((s: string, si: number) => `  ${si + 1}. ${s}`).join('\n')].filter(Boolean).join('\n'))
          .join('\n\n');
        const assessmentText = form.content_layout
          .filter((b: any) => b.type === 'quiz' || b.type === 'assignment-block')
          .map((b: any) => b.type === 'quiz' ? `◈ Quiz: ${b.question}` : `◆ ${b.title || 'Assignment'}: ${b.instructions || ''}`)
          .join('\n\n');

        const lessonPlanData: any = {
          lesson_id: data.id,
          objectives: aiObjectives.length > 0 ? aiObjectives.join('\n') : null,
          activities: activityText || null,
          assessment_methods: assessmentText || null,
        };

        if (curriculumSource && curriculumId && curriculumWeek) {
          lessonPlanData.plan_data = {
            curriculum_id: curriculumId,
            term: curriculumTerm ? parseInt(curriculumTerm, 10) : null,
            week: parseInt(curriculumWeek, 10),
            source: 'curriculum',
            ...(flowOrigin ? { flow_origin: flowOrigin } : {}),
          };
        }

        const { data: planRow } = await db
          .from('lesson_plans')
          .upsert(lessonPlanData, { onConflict: 'lesson_id' })
          .select('id')
          .single();
        if (planRow?.id) savedLessonPlanId = planRow.id;
      }

      if (lessonPlanKey) clearStashedCurriculumLessonPlan(lessonPlanKey);

      // Return to the term lesson plan detail when this lesson was created for
      // a specific week of a term plan (Step 2 → Step 3 flow).
      if (termPlanId && !curriculumSource) {
        router.push(`/dashboard/lesson-plans/${termPlanId}`);
      } else if (curriculumSource && savedLessonPlanId) {
        router.push(`/dashboard/lesson-plans/${savedLessonPlanId}`);
      } else {
        router.push(`/dashboard/lessons/${data.id}`);
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to create lesson');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || profileLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const currentCourse = courses.find((c: any) => c.id === form.course_id);

  return (
    <div className={`space-y-8 pb-20`}>
      {/* Shared pipeline stepper — only when we're in the standard flow (hide for modal-embed via minimal) */}
      {!isMinimal && (
        <PipelineStepper
          current="lessons"
          courseId={form.course_id || preCourseId || null}
          programId={selectedProgramId || preProgramId || currentCourse?.program_id || null}
          courseTitle={currentCourse?.title ?? null}
          curriculumId={curriculumId}
          lessonPlanId={termPlanId}
        />
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="flex w-full sm:w-auto min-h-[48px] items-center justify-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white font-bold text-sm rounded-none shadow-lg shadow-orange-900/30 transition-all disabled:opacity-50 touch-manipulation"
          >
            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden /> : <Save className="w-4 h-4" aria-hidden />}
            {saving ? 'Creating…' : (isMinimal ? 'Create' : 'Create lesson')}
          </button>
          {!isMinimal ? (
            <Link
              href={termPlanId ? `/dashboard/lesson-plans/${termPlanId}` : '/dashboard/lessons'}
              className="flex min-h-[44px] items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors touch-manipulation sm:order-first py-1"
            >
              <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden />
              {termPlanId ? 'Back to term plan' : 'Back to lessons'}
            </Link>
          ) : <div />}
        </div>

        {/* Term-plan context banner */}
        {termPlanId && !curriculumSource && (
          <div className="p-4 bg-violet-500/10 border border-violet-500/20 rounded-none">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="w-10 h-10 bg-violet-500/20 flex items-center justify-center rounded-none border border-violet-500/30 shrink-0">
                <BookOpen className="w-5 h-5 text-violet-400" aria-hidden />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-violet-400 uppercase tracking-widest">
                  Creating lesson for Term Plan
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  This lesson will be linked back to the Term Lesson Plan{termPlanWeek ? ` · Week ${termPlanWeek}` : ''}.
                </p>
              </div>
              <Link
                href={`/dashboard/lesson-plans/${termPlanId}`}
                className="self-start sm:self-center px-3 py-2 sm:py-1 bg-violet-500/20 text-violet-400 text-xs font-bold uppercase tracking-widest rounded-none border border-violet-500/30 whitespace-nowrap hover:bg-violet-500/30"
              >
                View plan →
              </Link>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-5 h-5 text-orange-400" />
            <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">New Lesson</span>
          </div>
          <h1 className="text-3xl font-extrabold text-foreground">Create Lesson</h1>
          <p className="text-muted-foreground text-sm mt-1">Fill in the details below or use the AI assistant to generate content.</p>
        </div>

        {error && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-none text-rose-400 text-sm font-medium">
            {error}
          </div>
        )}

        {/* Curriculum Context Banner */}
        {curriculumSource && curriculumId && curriculumWeek && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-none">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="w-10 h-10 bg-emerald-500/20 flex items-center justify-center rounded-none border border-emerald-500/30 shrink-0">
                <BookOpen className="w-5 h-5 text-emerald-400" aria-hidden />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-emerald-400 uppercase tracking-widest">
                  {flowOrigin === 'generate-tab' ? 'From Generate (syllabus)' : 'Creating from curriculum'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Week {curriculumWeek}
                  {curriculumTerm ? ` · Term ${curriculumTerm}` : ''}
                  {classIdFromUrl ? ' · Linked to a class' : ''}
                </p>
              </div>
              <span className="self-start sm:self-center px-3 py-2 sm:py-1 bg-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-widest rounded-none border border-emerald-500/30 whitespace-nowrap">
                Curriculum sync
              </span>
            </div>
          </div>
        )}

        {/* AI Generate Panel (OpenRouter Premium Engine) */}
        <div className="bg-gradient-to-br from-orange-500/10 to-orange-400/5 border border-orange-500/20 rounded-none overflow-hidden">
          <button
            type="button"
            onClick={() => setAiOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-4 text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-none bg-orange-500/20 flex items-center justify-center border border-orange-500/30">
                <Sparkles className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <p className="text-sm font-black text-foreground uppercase tracking-widest">Quick Lesson Assistant</p>
                <p className="text-[10px] text-muted-foreground uppercase font-black tracking-tight">
                  {lastModel
                    ? <span>Guide: <span className="text-orange-400">{lastModel.split('/').pop()}</span></span>
                    : 'Fun Projects, Moving Graphics, and Easy-to-Read Notes'}
                </p>
              </div>
            </div>
            {aiOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>

          {aiOpen && (
            <div className="px-5 pb-5 space-y-4 border-t border-orange-500/20">
              {aiError && (
                <div className="flex items-start gap-2 mt-4 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-none px-3 py-2">
                  <span className="flex-shrink-0">⚠</span> {aiError}
                </div>
              )}

              {/* Lesson Mode Selector */}
              <div className="pt-4 space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Lesson Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: 'academic', label: 'Academic', Icon: GraduationCap, desc: 'Deep theory, notes & curriculum', activeClass: 'border-violet-500 bg-violet-500/10', textClass: 'text-violet-400' },
                    { id: 'project', label: 'Project', Icon: Hammer, desc: 'Builds, labs & capstone missions', activeClass: 'border-emerald-500 bg-emerald-500/10', textClass: 'text-emerald-400' },
                    { id: 'interactive', label: 'Interactive', Icon: Zap, desc: 'Quizzes, visualizers & animations', activeClass: 'border-cyan-500 bg-cyan-500/10', textClass: 'text-cyan-400' },
                  ] as const).map(({ id, label, Icon, desc, activeClass, textClass }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setAiMode(id)}
                      className={`flex flex-col items-start gap-1.5 p-3 rounded-none border text-left transition-all ${aiMode === id ? activeClass : 'border-border bg-card shadow-sm hover:border-white/20'}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Icon className={`w-3.5 h-3.5 ${aiMode === id ? textClass : 'text-muted-foreground'}`} />
                        <span className={`text-[10px] font-black uppercase tracking-widest ${aiMode === id ? textClass : 'text-muted-foreground'}`}>{label}</span>
                      </div>
                      <span className="text-[9px] text-muted-foreground leading-tight">{desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1 md:col-span-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Lesson Topic *</label>
                  <input
                    value={aiTopic}
                    onChange={e => setAiTopic(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAiGenerate(); } }}
                    placeholder="e.g. Introduction to Python loops"
                    className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-orange-500"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Grade Level</label>
                    {YOUNG_LEARNER_GRADES.some(g => aiGrade.startsWith(g) || aiGrade === g) && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[9px] font-black uppercase tracking-widest rounded-none">
                        🧩 Block Visual Mode
                      </span>
                    )}
                  </div>
                  <select
                    value={aiGrade}
                    onChange={e => setAiGrade(e.target.value)}
                    className="w-full bg-card shadow-sm border border-border rounded-none px-3 py-2.5 text-sm text-foreground outline-none focus:border-orange-500"
                  >
                    <optgroup label="Early Years">
                      {['KG', 'KG–Basic 3'].map(g => <option key={g} value={g}>{g}</option>)}
                    </optgroup>
                    <optgroup label="Primary">
                      {['Basic 1', 'Basic 2', 'Basic 3', 'Basic 1–Basic 3', 'Basic 4', 'Basic 5', 'Basic 6', 'Basic 4–Basic 6', 'Basic 1–Basic 6'].map(g => <option key={g} value={g}>{g}</option>)}
                    </optgroup>
                    <optgroup label="Junior Secondary">
                      {['JSS1', 'JSS2', 'JSS3', 'JSS1–JSS3'].map(g => <option key={g} value={g}>{g}</option>)}
                    </optgroup>
                    <optgroup label="Senior Secondary">
                      {['SS1', 'SS2', 'SS3', 'SS1–SS3'].map(g => <option key={g} value={g}>{g}</option>)}
                    </optgroup>
                    <optgroup label="Mixed">
                      {['JSS1–SS3', 'Basic 1–SS3'].map(g => <option key={g} value={g}>{g}</option>)}
                    </optgroup>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Subject</label>
                  <input
                    value={aiSubject}
                    onChange={e => setAiSubject(e.target.value)}
                    placeholder="e.g. Python Programming"
                    className="w-full bg-card shadow-sm border border-border rounded-none px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-orange-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleAiGenerate()}
                  disabled={aiGenerating || aiGeneratingNotes}
                  className={`flex items-center justify-center gap-2 px-4 py-2.5 disabled:opacity-60 text-foreground font-black text-xs uppercase tracking-widest rounded-none transition-all self-end ${
                    aiMode === 'academic' ? 'bg-violet-600 hover:bg-violet-500' :
                    aiMode === 'project'  ? 'bg-emerald-600 hover:bg-emerald-500' :
                                           'bg-cyan-600 hover:bg-cyan-500'
                  }`}
                >
                  {aiGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {aiGenerating
                    ? (aiStatus ?? 'Generating...')
                    : `Build ${aiMode.charAt(0).toUpperCase() + aiMode.slice(1)} Lesson`}
                </button>
              </div>

              {/* Mode hint */}
              <div className={`p-3 rounded-none border text-[10px] leading-relaxed space-y-1.5 ${
                aiMode === 'academic' ? 'bg-violet-500/5 border-violet-500/15 text-violet-300/70' :
                aiMode === 'project'  ? 'bg-emerald-500/5 border-emerald-500/15 text-emerald-300/70' :
                                        'bg-cyan-500/5 border-cyan-500/15 text-cyan-300/70'
              }`}>
                <div>
                  {aiMode === 'academic' && <><span className="font-black uppercase">Academic Mode:</span> Generates Bloom's-aligned objectives, 2000+ word study notes, concept illustration cards, logic maps, and a comprehension quiz. Best for theory-heavy curriculum.</>}
                  {aiMode === 'project' && <><span className="font-black uppercase">Project Mode:</span> Generates a builder's blueprint, guided warm-up labs, step-by-step activity blocks, mini-task + capstone assignment-block, and Scratch blocks for younger learners.</>}
                  {aiMode === 'interactive' && <><span className="font-black uppercase">Interactive Mode:</span> Generates 3+ quiz checkpoints, algorithm visualizers, motion-graphic animations, D3 data charts, and gamified level-up sections. Best for engagement-first learning.</>}
                </div>
                {isYoungLearner && (
                  <div className="flex items-start gap-1.5 pt-1.5 border-t border-amber-500/20 text-amber-400/80">
                    <span className="text-amber-400 text-[11px] leading-none mt-px">🧩</span>
                    <span><span className="font-black text-amber-400">Young Learner Override active</span> — Scratch block steps, simple visual cards, emoji-friendly labels, and plain-language activity instructions will be prioritised. Technical code blocks and abstract charts are suppressed for KG–Basic 6.</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* AI Generated — Preview Banner (mobile-first, stacks on xs) */}
        {!aiOpen && !aiGenerating && form.title && (
          <div className="bg-gradient-to-br from-violet-500/15 to-fuchsia-500/10 border border-violet-500/30 rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="shrink-0 w-9 h-9 rounded-lg bg-violet-500/25 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-violet-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black text-violet-300 uppercase tracking-widest">Lesson Generated</p>
                <p className="text-sm font-bold text-foreground mt-0.5 truncate">{form.title}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  Preview how this looks to students. You can regenerate or continue editing below.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowLessonPreview(true)}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-black uppercase tracking-widest rounded-lg transition-all min-h-[44px]"
              >
                <Eye className="w-3.5 h-3.5" /> Preview
              </button>
              <button
                type="button"
                onClick={() => { setAiOpen(true); setShowLessonPreview(false); }}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2.5 border border-violet-500/30 hover:bg-violet-500/10 text-violet-300 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all min-h-[44px]"
              >
                <RefreshCw className="w-3 h-3" /> Regenerate
              </button>
            </div>
          </div>
        )}

        {/* Lesson Preview — mobile-first reader-style modal */}
        {showLessonPreview && (
          <LessonPreviewModal
            title={form.title}
            description={form.description}
            lessonType={form.lesson_type}
            durationMinutes={form.duration_minutes}
            grade={aiGrade}
            model={lastModel ?? undefined}
            objectives={aiObjectives}
            contentLayout={form.content_layout as any[]}
            lessonNotes={form.lesson_notes}
            onClose={() => setShowLessonPreview(false)}
            onRegenerate={() => { setAiOpen(true); setShowLessonPreview(false); }}
          />
        )}

        {/* Lesson Plan Section */}
        <div className="bg-card shadow-sm border border-border rounded-none p-4 sm:p-8 space-y-6">
          <div className="flex items-center gap-3 pb-3 border-b border-border">
            <Settings2 className="w-4 h-4 text-orange-400" />
            <h2 className="text-xs font-black uppercase tracking-widest text-foreground">Lesson Plan</h2>
            <span className="text-[10px] text-muted-foreground font-medium ml-2">— core settings &amp; study notes</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Lesson Title *</label>
                <button type="button" onClick={handleMagicTitle} className="text-[10px] font-black uppercase tracking-widest text-orange-400 hover:text-orange-300 flex items-center gap-1 transition-colors">
                  <Sparkles className="w-3 h-3" /> Magic Suggest
                </button>
              </div>
              <input
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Building your first App"
                className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-3 text-sm focus:border-orange-500 outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Programme *</label>
              <div className="relative">
                <select value={selectedProgramId}
                  onChange={e => {
                    const pid = e.target.value;
                    setSelectedProgramId(pid);
                    // Reset course if it doesn't belong to the new programme
                    const currentCourse = courses.find((c: any) => c.id === form.course_id);
                    if (currentCourse?.program_id !== pid) {
                      setForm(prev => ({ ...prev, course_id: '' }));
                    }
                  }}
                  className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-3 text-sm focus:border-orange-500 outline-none appearance-none cursor-pointer">
                  <option value="">Select Programme</option>
                  {programs.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Linked Course {selectedProgramId ? '*' : ''}
              </label>
              <div className="relative">
                <select value={form.course_id} onChange={e => handleCourseChange(e.target.value)}
                  disabled={!selectedProgramId}
                  className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-3 text-sm focus:border-orange-500 outline-none appearance-none cursor-pointer disabled:opacity-40">
                  <option value="">{selectedProgramId ? 'Select Course' : '— pick a programme first —'}</option>
                  {(selectedProgramId ? courses.filter((c: any) => c.program_id === selectedProgramId) : courses)
                    .map((c: any) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <SelectField label="Type" value={form.lesson_type} options={['lesson', 'hands-on', 'video', 'interactive', 'workshop', 'coding', 'reading', 'quiz', 'article', 'project', 'lab', 'live', 'practice', 'robotics', 'electronics', 'ai']} onChange={(v: string) => setForm({ ...form, lesson_type: v })} />
            <Field label="Duration (min)" value={form.duration_minutes} type="number" onChange={(v: string) => setForm({ ...form, duration_minutes: v })} />
            <SelectField label="Status" value={form.status} options={['draft', 'scheduled', 'active']} onChange={(v: string) => setForm({ ...form, status: v })} />
          </div>

          <Field label="Brief Description" value={form.description} textarea onChange={(v: string) => setForm({ ...form, description: v })} />
          <div className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Lesson Plan / Study Notes <span className="text-orange-400/60 normal-case font-medium text-[9px]">(intro & prerequisites shown to students before class)</span></label>
              <button type="button" onClick={handleGenerateNotesOnly}
                className="shrink-0 text-[9px] font-black text-orange-400 uppercase tracking-widest inline-flex items-center gap-1 hover:text-orange-500 transition-colors disabled:opacity-50 min-h-[44px] sm:min-h-0 px-1 -mx-1 touch-manipulation"
                disabled={aiGeneratingNotes || aiGenerating}>
                {aiGeneratingNotes
                  ? <><Loader2 className="w-3 h-3 animate-spin" /> Writing...</>
                  : <><Sparkles className="w-3 h-3" /> Notes only (lighter)</>}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Two-step option: use <strong className="text-foreground/90">Notes only</strong> when you do not want the full lesson builder yet — it fills this box only, using your current <strong className="text-foreground/90">{aiMode}</strong> mode and <strong className="text-foreground/90">{form.lesson_type.replace(/[-_]/g, ' ')}</strong> type. Build blocks later, or run the full assistant above when you are ready.
            </p>
            <textarea
              value={form.lesson_notes}
              onChange={e => setForm({ ...form, lesson_notes: e.target.value })}
              placeholder="Detailed study notes for the student..."
              className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-3 text-sm focus:border-orange-500 outline-none resize-none"
              rows={6}
            />
          </div>
          <Field label="Video URL (YouTube/Direct)" value={form.video_url} onChange={(v: string) => setForm({ ...form, video_url: v })} />
        </div>

        {/* Content Builder Section */}
        <div className="bg-card shadow-sm border border-border rounded-none p-4 sm:p-8 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-border">
            <Layout className="w-4 h-4 text-violet-400" />
            <h2 className="text-xs font-black uppercase tracking-widest text-foreground">Content Builder</h2>
            <span className="text-[10px] text-muted-foreground font-medium ml-2">— visual blocks, quizzes &amp; activities</span>
          </div>
          <CanvaEditor layout={form.content_layout} onChange={l => setForm({ ...form, content_layout: l })} />
        </div>

        {/* Sticky Save Bar */}
        <div className="sticky bottom-0 z-30 -mx-4 sm:-mx-8 px-4 sm:px-8 py-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] bg-background/95 backdrop-blur-xl border-t border-border flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest text-center sm:text-left">
            {form.content_layout.length} block{form.content_layout.length !== 1 ? 's' : ''} · {form.title || 'Untitled'}
          </p>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="flex w-full sm:w-auto min-h-[48px] items-center justify-center gap-2 px-8 py-3 bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 shadow-lg shadow-orange-900/30 touch-manipulation"
          >
            {saving ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden /> Creating…</> : <><Save className="w-4 h-4" aria-hidden /> Create lesson</>}
          </button>
        </div>

    </div>
  );
}

export default function AddLessonPage() {
  return (
    <Suspense
      fallback={(
        <div className="min-h-screen bg-background flex items-center justify-center" role="status">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    >
      <AddLessonPageContent />
    </Suspense>
  );
}

function Field({ label, value, onChange, textarea, rows = 3, type = 'text' }: any) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</label>
      {textarea ? (
        <textarea value={value} rows={rows} onChange={e => onChange(e.target.value)}
          className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-3 text-sm focus:border-orange-500 outline-none resize-none" />
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)}
          className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-3 text-sm focus:border-orange-500 outline-none" />
      )}
    </div>
  );
}

function SelectField({ label, value, options, onChange }: any) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-3 text-sm focus:border-orange-500 outline-none cursor-pointer">
        {options.map((o: any) => <option key={o} value={o}>{o.replace(/[-_]/g, ' ').toUpperCase()}</option>)}
      </select>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * LessonPreviewModal
 *
 * Full-screen, mobile-first, reader-style preview of an AI-generated lesson.
 * Shows the lesson exactly (or as close as we can) the way a student will
 * experience it: hero, objectives checklist, content blocks, full study
 * notes, sticky header + sticky footer with large touch targets.
 *
 * Also exposes a "Student view" toggle that hides teacher-only meta (model,
 * block types) so the teacher can verify the learner experience before
 * hitting Create Lesson.
 * ──────────────────────────────────────────────────────────────────────── */

interface LessonPreviewModalProps {
  title: string;
  description?: string;
  lessonType?: string;
  durationMinutes?: string | number;
  grade?: string;
  model?: string;
  objectives: string[];
  contentLayout: any[];
  lessonNotes?: string;
  onClose: () => void;
  onRegenerate: () => void;
}

function LessonPreviewModal({
  title, description, lessonType, durationMinutes, grade, model,
  objectives, contentLayout, lessonNotes, onClose, onRegenerate,
}: LessonPreviewModalProps) {
  const [tab, setTab] = useState<'reader' | 'outline' | 'notes'>('reader');
  const [studentView, setStudentView] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const totalBlocks = contentLayout?.length ?? 0;
  const notesWords = lessonNotes ? lessonNotes.trim().split(/\s+/).filter(Boolean).length : 0;
  const totalCompletion = [
    title ? 1 : 0,
    description ? 1 : 0,
    objectives.length > 0 ? 1 : 0,
    totalBlocks > 0 ? 1 : 0,
    lessonNotes ? 1 : 0,
  ].reduce((a, b) => a + b, 0);
  const completionPct = Math.round((totalCompletion / 5) * 100);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-stretch sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Lesson preview"
    >
      <div className="bg-background border border-border w-full sm:max-w-3xl sm:rounded-2xl rounded-none shadow-2xl flex flex-col max-h-screen sm:max-h-[92vh] overflow-hidden pb-[env(safe-area-inset-bottom)]">

        {/* Sticky header */}
        <div className="shrink-0 bg-card/95 backdrop-blur-md border-b border-border">
          <div className="flex items-center gap-2 px-3 sm:px-5 py-3">
            <button
              onClick={onClose}
              className="shrink-0 w-10 h-10 inline-flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
              aria-label="Close preview"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] font-black text-violet-400 uppercase tracking-widest">
                <Sparkles className="w-3 h-3" /> Lesson Preview
                {!studentView && <span className="text-muted-foreground">· Teacher</span>}
              </div>
              <p className="text-sm sm:text-base font-bold text-foreground truncate">{title || 'Untitled lesson'}</p>
            </div>
            <button
              onClick={() => setStudentView(v => !v)}
              className={`shrink-0 hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-black uppercase tracking-widest border rounded-lg transition-all min-h-[40px] ${
                studentView
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted'
              }`}
              title="Toggle student-facing view"
            >
              <Users className="w-3.5 h-3.5" /> Student view
            </button>
          </div>

          {/* Completion meter */}
          <div className="px-3 sm:px-5 pb-2">
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
              <span>Completion</span>
              <span>{completionPct}%</span>
            </div>
            <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all"
                style={{ width: `${completionPct}%` }}
              />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 px-2 sm:px-3 pb-1.5 overflow-x-auto [-webkit-overflow-scrolling:touch]">
            {([
              { key: 'reader'  as const, label: 'Reader',  icon: BookOpen,   badge: undefined as string | undefined },
              { key: 'outline' as const, label: 'Outline', icon: ListChecks, badge: undefined as string | undefined },
              { key: 'notes'   as const, label: 'Notes',   icon: FileText,   badge: notesWords ? `${notesWords}w` : undefined },
            ]).map(t => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-black uppercase tracking-widest border-b-2 transition-colors min-h-[40px] ${
                    active
                      ? 'border-violet-500 text-violet-400'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {t.label}
                  {t.badge && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{t.badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6">
          {tab === 'reader' && (
            <article className="space-y-6 max-w-2xl mx-auto">
              {/* Hero */}
              <header className="space-y-3">
                <h1 className="text-2xl sm:text-3xl font-black text-foreground leading-tight">{title || 'Untitled lesson'}</h1>
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  {lessonType && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-300 font-bold uppercase tracking-widest">
                      <Layout className="w-3 h-3" /> {lessonType}
                    </span>
                  )}
                  {durationMinutes && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted border border-border text-muted-foreground font-bold">
                      <Clock className="w-3 h-3" /> {durationMinutes} min
                    </span>
                  )}
                  {grade && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 font-bold">
                      <GraduationCap className="w-3 h-3" /> {grade}
                    </span>
                  )}
                  {!studentView && model && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted border border-border text-muted-foreground font-medium text-[10px]">
                      {model}
                    </span>
                  )}
                </div>
                {description && (
                  <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">{description}</p>
                )}
              </header>

              {/* Objectives */}
              {objectives.length > 0 && (
                <section className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-4 sm:p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Target className="w-4 h-4 text-violet-400" />
                    <h2 className="text-[11px] font-black uppercase tracking-widest text-violet-300">Learning Objectives</h2>
                  </div>
                  <ul className="space-y-2.5">
                    {objectives.map((obj, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="shrink-0 w-6 h-6 rounded-full bg-violet-500/20 text-violet-300 text-[11px] font-black inline-flex items-center justify-center">
                          {i + 1}
                        </span>
                        <p className="text-sm text-foreground leading-relaxed flex-1">{obj}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Content blocks — reader style */}
              {totalBlocks > 0 && (
                <section className="space-y-5">
                  <div className="flex items-center gap-2">
                    <Layout className="w-4 h-4 text-orange-400" />
                    <h2 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Lesson Flow · {totalBlocks} section{totalBlocks === 1 ? '' : 's'}</h2>
                  </div>
                  {contentLayout.map((block: any, i: number) => (
                    <LessonPreviewBlock key={i} index={i} block={block} showType={!studentView} />
                  ))}
                </section>
              )}

              {/* Notes callout */}
              {lessonNotes && (
                <section className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 sm:p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="w-4 h-4 text-amber-400" />
                    <h2 className="text-[11px] font-black uppercase tracking-widest text-amber-300">Before the class</h2>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    Students see this as the lesson intro. Switch to the <button onClick={() => setTab('notes')} className="underline text-amber-300 hover:text-amber-200">Notes tab</button> for the full text.
                  </p>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                    {lessonNotes.slice(0, 400)}{lessonNotes.length > 400 ? '…' : ''}
                  </p>
                </section>
              )}

              {/* Empty state */}
              {totalBlocks === 0 && objectives.length === 0 && !lessonNotes && (
                <div className="text-center py-10">
                  <Sparkles className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                  <p className="text-sm text-muted-foreground">No AI content generated yet.</p>
                  <button onClick={onRegenerate} className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-black uppercase tracking-widest min-h-[44px]">
                    <Sparkles className="w-3.5 h-3.5" /> Generate with AI
                  </button>
                </div>
              )}
            </article>
          )}

          {tab === 'outline' && (
            <div className="space-y-2 max-w-2xl mx-auto">
              {totalBlocks === 0 && objectives.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">No outline yet — generate a lesson first.</p>
              ) : (
                <>
                  {objectives.length > 0 && (
                    <div className="rounded-xl border border-border bg-card p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-violet-300 mb-2">Objectives</p>
                      <ol className="space-y-1.5 list-decimal list-inside text-sm text-foreground">
                        {objectives.map((o, i) => <li key={i}>{o}</li>)}
                      </ol>
                    </div>
                  )}
                  {contentLayout.map((block: any, i: number) => {
                    const { icon: Icon, color } = blockTypeStyle(block.type);
                    return (
                      <div key={i} className="flex items-start gap-3 p-3 sm:p-4 rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors">
                        <span className="shrink-0 w-8 h-8 rounded-lg bg-muted inline-flex items-center justify-center text-[11px] font-black text-muted-foreground">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold text-foreground truncate">{block.title || cleanBlockType(block.type)}</p>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${color}`}>
                              <Icon className="w-2.5 h-2.5" /> {cleanBlockType(block.type)}
                            </span>
                          </div>
                          {blockExcerpt(block) && (
                            <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{blockExcerpt(block)}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {tab === 'notes' && (
            <div className="max-w-2xl mx-auto">
              {lessonNotes ? (
                <article className="prose prose-sm sm:prose-base max-w-none text-foreground">
                  <div className="flex items-center justify-between mb-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    <span>Lesson Notes</span>
                    <span>{notesWords} words · ~{Math.max(1, Math.round(notesWords / 200))} min read</span>
                  </div>
                  <div className="text-sm sm:text-base text-foreground leading-relaxed whitespace-pre-line">
                    {lessonNotes}
                  </div>
                </article>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-10">No study notes generated yet.</p>
              )}
            </div>
          )}
        </div>

        {/* Sticky footer — large CTAs */}
        <div className="shrink-0 border-t border-border bg-card/95 backdrop-blur-md">
          {/* Mobile-only student-view toggle (header keeps it desktop-only) */}
          <div className="sm:hidden flex items-center justify-between px-4 py-2 border-b border-border">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">View as</span>
            <button
              onClick={() => setStudentView(v => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest border rounded-lg transition-all min-h-[36px] ${
                studentView
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-muted/40 border-border text-muted-foreground'
              }`}
            >
              <Users className="w-3 h-3" /> {studentView ? 'Student' : 'Teacher'}
            </button>
          </div>
          <div className="flex items-center gap-2 p-3 sm:p-4">
            <button
              onClick={onRegenerate}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-background border border-border hover:bg-muted text-xs font-black uppercase tracking-widest rounded-lg transition-all min-h-[48px]"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Regenerate
            </button>
            <button
              onClick={onClose}
              className="flex-[1.3] inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-xs font-black uppercase tracking-widest rounded-lg transition-all min-h-[48px] shadow-lg shadow-violet-900/20"
            >
              <CheckCircle2 className="w-4 h-4" /> Looks good — continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Render a single lesson block in reader-mode.  Falls back to a generic
 *  card for block types we don't explicitly style. */
function LessonPreviewBlock({ index, block, showType }: { index: number; block: any; showType: boolean }) {
  const { icon: Icon, color } = blockTypeStyle(block.type);
  const title = block.title?.trim();
  const content = typeof block.content === 'string' ? block.content : '';
  const code = block.code || (block.type === 'code' ? content : undefined);

  // Quiz-ish block
  if (['quiz', 'quiz-block', 'mcq', 'multiple-choice'].includes(block.type)) {
    const items: any[] = Array.isArray(block.items) ? block.items : Array.isArray(block.questions) ? block.questions : [];
    return (
      <section className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-black inline-flex items-center justify-center">{index + 1}</span>
            <h3 className="text-sm sm:text-base font-black text-foreground">{title || 'Quiz checkpoint'}</h3>
          </div>
          {showType && (
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${color}`}>
              <Icon className="w-2.5 h-2.5" /> Quiz
            </span>
          )}
        </div>
        {items.length ? (
          <ol className="space-y-3 list-decimal list-inside">
            {items.slice(0, 3).map((q: any, i: number) => (
              <li key={i} className="text-sm text-foreground">
                <span className="font-bold">{q.question || q.prompt || q.text || 'Question'}</span>
                {Array.isArray(q.options) && (
                  <ul className="ml-5 mt-1.5 space-y-1">
                    {q.options.slice(0, 4).map((opt: any, j: number) => (
                      <li key={j} className="text-[13px] text-muted-foreground">{String.fromCharCode(65 + j)}. {typeof opt === 'string' ? opt : opt.text}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
            {items.length > 3 && (
              <li className="text-[11px] text-muted-foreground list-none">+ {items.length - 3} more questions</li>
            )}
          </ol>
        ) : content ? (
          <p className="text-sm text-foreground whitespace-pre-line">{content}</p>
        ) : null}
      </section>
    );
  }

  // Code block
  if (code || block.type === 'code' || block.type === 'snippet') {
    return (
      <section className="rounded-xl border border-sky-500/25 bg-sky-500/5 overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 w-6 h-6 rounded-full bg-sky-500/20 text-sky-300 text-[11px] font-black inline-flex items-center justify-center">{index + 1}</span>
            <h3 className="text-sm sm:text-base font-black text-foreground truncate">{title || 'Code example'}</h3>
          </div>
          {showType && block.language && (
            <span className="shrink-0 text-[9px] font-mono font-bold text-sky-300 uppercase tracking-widest">{block.language}</span>
          )}
        </div>
        <pre className="text-[12px] sm:text-[13px] leading-relaxed font-mono text-foreground bg-black/40 p-4 overflow-x-auto whitespace-pre">
          <code>{code}</code>
        </pre>
      </section>
    );
  }

  // Assignment block
  if (block.type === 'assignment-block' || block.type === 'assignment') {
    return (
      <section className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-4 sm:p-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="shrink-0 w-6 h-6 rounded-full bg-rose-500/20 text-rose-300 text-[11px] font-black inline-flex items-center justify-center">{index + 1}</span>
            <h3 className="text-sm sm:text-base font-black text-foreground">{title || 'Assignment'}</h3>
          </div>
          {showType && (
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${color}`}>
              <PenLine className="w-2.5 h-2.5" /> Assignment
            </span>
          )}
        </div>
        {content && <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{content}</p>}
        {Array.isArray(block.tasks) && block.tasks.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {block.tasks.map((t: any, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <CheckCircle2 className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                <span>{typeof t === 'string' ? t : t.title || t.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  // Image block
  if (block.type === 'image' && block.src) {
    return (
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <img src={block.src} alt={block.alt || title || ''} className="w-full max-h-[60vh] object-contain bg-black/30" />
        {(title || block.caption) && (
          <div className="p-3 sm:p-4 text-[12px] text-muted-foreground">
            {title && <span className="font-bold text-foreground">{title}. </span>}
            {block.caption}
          </div>
        )}
      </section>
    );
  }

  // List block
  if ((block.type === 'list' || block.type === 'checklist') && Array.isArray(block.items)) {
    return (
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="shrink-0 w-6 h-6 rounded-full bg-muted text-muted-foreground text-[11px] font-black inline-flex items-center justify-center">{index + 1}</span>
          <h3 className="text-sm sm:text-base font-black text-foreground">{title || 'Key points'}</h3>
        </div>
        <ul className="space-y-2">
          {block.items.map((it: any, i: number) => (
            <li key={i} className="flex items-start gap-2 text-sm text-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-2 shrink-0" />
              <span>{typeof it === 'string' ? it : it.text || it.title}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  // Generic / paragraph / heading / callout — full content (no clamp)
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 w-6 h-6 rounded-full bg-muted text-muted-foreground text-[11px] font-black inline-flex items-center justify-center">{index + 1}</span>
          <h3 className="text-sm sm:text-base font-black text-foreground truncate">{title || cleanBlockType(block.type)}</h3>
        </div>
        {showType && (
          <span className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${color}`}>
            <Icon className="w-2.5 h-2.5" /> {cleanBlockType(block.type)}
          </span>
        )}
      </div>
      {content && (
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{content}</p>
      )}
    </section>
  );
}

function cleanBlockType(type?: string): string {
  if (!type) return 'Block';
  return type.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function blockExcerpt(block: any): string {
  const c = typeof block.content === 'string' ? block.content : '';
  if (c) return c.slice(0, 180);
  if (Array.isArray(block.items) && block.items.length > 0) {
    return block.items.slice(0, 2).map((x: any) => typeof x === 'string' ? x : x.text || x.title).join(' · ');
  }
  return '';
}

function blockTypeStyle(type?: string): { icon: React.ComponentType<{ className?: string }>; color: string } {
  switch (type) {
    case 'code':
    case 'snippet':
      return { icon: Code2, color: 'bg-sky-500/10 border-sky-500/25 text-sky-300' };
    case 'quiz':
    case 'quiz-block':
    case 'mcq':
    case 'multiple-choice':
      return { icon: CheckCircle2, color: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300' };
    case 'assignment':
    case 'assignment-block':
      return { icon: PenLine, color: 'bg-rose-500/10 border-rose-500/25 text-rose-300' };
    case 'image':
      return { icon: ImageIcon, color: 'bg-violet-500/10 border-violet-500/25 text-violet-300' };
    case 'video':
      return { icon: Video, color: 'bg-red-500/10 border-red-500/25 text-red-300' };
    case 'list':
    case 'checklist':
      return { icon: ListChecks, color: 'bg-amber-500/10 border-amber-500/25 text-amber-300' };
    case 'callout':
    case 'tip':
      return { icon: Lightbulb, color: 'bg-amber-500/10 border-amber-500/25 text-amber-300' };
    case 'heading':
      return { icon: Target, color: 'bg-fuchsia-500/10 border-fuchsia-500/25 text-fuchsia-300' };
    default:
      return { icon: FileText, color: 'bg-muted border-border text-muted-foreground' };
  }
}
