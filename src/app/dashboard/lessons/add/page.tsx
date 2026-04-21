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
  GraduationCap, Hammer, Zap
} from 'lucide-react';
import CanvaEditor from '@/features/lessons/components/CanvaEditor';

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

      if (curriculumSource && savedLessonPlanId) {
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

  return (
    <div className={`space-y-8 pb-20`}>
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
            <Link href="/dashboard/lessons" className="flex min-h-[44px] items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors touch-manipulation sm:order-first py-1">
              <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden /> Back to lessons
            </Link>
          ) : <div />}
        </div>

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

        {/* AI Generated — Preview Banner */}
        {!aiOpen && !aiGenerating && form.title && (
          <div className="flex items-center gap-3 bg-violet-500/10 border border-violet-500/30 rounded-none px-4 py-3">
            <Sparkles className="w-4 h-4 text-violet-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-violet-400 uppercase tracking-widest">Lesson Generated — "{form.title}"</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Review the generated content below or preview how it looks to students before saving.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowLessonPreview(true)}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-black rounded-none transition-all">
              👁 Preview Lesson
            </button>
            <button type="button" onClick={() => { setAiOpen(true); setShowLessonPreview(false); }}
              className="flex-shrink-0 text-[10px] font-black text-muted-foreground hover:text-foreground uppercase tracking-widest transition-colors">
              Regenerate
            </button>
          </div>
        )}

        {/* Lesson Preview Modal */}
        {showLessonPreview && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto" onClick={e => { if (e.target === e.currentTarget) setShowLessonPreview(false); }}>
            <div className="bg-background border border-border rounded-none w-full max-w-3xl my-4 overflow-hidden shadow-2xl">
              {/* Preview header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card shadow-sm">
                <div>
                  <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest">Lesson Preview</p>
                  <p className="font-bold text-foreground text-sm mt-0.5 truncate">{form.title}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setAiOpen(true); setShowLessonPreview(false); }}
                    className="px-3 py-1.5 text-[10px] font-black text-muted-foreground border border-border hover:bg-muted rounded-none uppercase tracking-wider transition-all">
                    ✕ Regenerate
                  </button>
                  <button onClick={() => setShowLessonPreview(false)}
                    className="px-4 py-1.5 text-[10px] font-black bg-violet-600 hover:bg-violet-500 text-white rounded-none uppercase tracking-wider transition-all">
                    ✓ Accept & Edit
                  </button>
                </div>
              </div>

              {/* Preview body */}
              <div className="p-5 space-y-5 overflow-y-auto max-h-[75vh]">
                {/* Meta */}
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {form.lesson_type && <span className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-full capitalize">{form.lesson_type}</span>}
                  {form.duration_minutes && <span className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-full">⏱ {form.duration_minutes} min</span>}
                  {aiGrade && <span className="px-2.5 py-1 bg-violet-500/10 border border-violet-500/20 text-violet-400 rounded-full">{aiGrade}</span>}
                  {lastModel && <span className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-full text-[10px]">🤖 {lastModel}</span>}
                </div>

                {/* Description */}
                {form.description && (
                  <div className="bg-white/5 border border-white/10 rounded-none p-4">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Description</p>
                    <p className="text-sm text-foreground leading-relaxed">{form.description}</p>
                  </div>
                )}

                {/* Objectives */}
                {aiObjectives.length > 0 && (
                  <div className="bg-white/5 border border-white/10 rounded-none p-4">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3">Learning Objectives</p>
                    <ul className="space-y-1.5">
                      {aiObjectives.map((obj, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                          <span className="text-violet-400 font-black flex-shrink-0">{i + 1}.</span>
                          <span>{obj}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Content blocks summary */}
                {form.content_layout && form.content_layout.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3">Content Blocks ({form.content_layout.length})</p>
                    <div className="space-y-2">
                      {(form.content_layout as any[]).map((block: any, i: number) => (
                        <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-none px-4 py-3">
                          <span className="text-[10px] font-black text-muted-foreground w-5 flex-shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{block.title || block.type}</p>
                            {block.content && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{typeof block.content === 'string' ? block.content.slice(0, 120) : ''}</p>}
                          </div>
                          <span className="text-[10px] font-black text-muted-foreground bg-white/5 px-2 py-0.5 rounded-full flex-shrink-0 capitalize">{block.type?.replace('-', ' ')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Lesson notes excerpt */}
                {form.lesson_notes && (
                  <div className="bg-white/5 border border-white/10 rounded-none p-4">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Study Notes (excerpt)</p>
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-line line-clamp-10">{form.lesson_notes.slice(0, 800)}{form.lesson_notes.length > 800 ? '…' : ''}</p>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                  <button onClick={() => { setAiOpen(true); setShowLessonPreview(false); }}
                    className="px-4 py-2 text-xs font-black text-muted-foreground border border-border hover:bg-muted rounded-none uppercase tracking-wider transition-all">
                    Discard & Regenerate
                  </button>
                  <button onClick={() => setShowLessonPreview(false)}
                    className="px-5 py-2 text-xs font-black bg-violet-600 hover:bg-violet-500 text-white rounded-none uppercase tracking-wider transition-all">
                    ✓ Accept — Continue Editing
                  </button>
                </div>
              </div>
            </div>
          </div>
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
