'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import {
  SparklesIcon, BookOpenIcon, ClipboardDocumentListIcon,
  AcademicCapIcon, RocketLaunchIcon, CheckCircleIcon,
  ExclamationTriangleIcon, ArrowRightIcon,
} from '@/lib/icons';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Course { id: string; title: string }
interface Program { id: string; title: string; delivery_type?: 'compulsory' | 'optional'; courses: Course[] }
interface CurriculumWeek {
  week: number; topic: string; subtopics?: string[]; type: string;
  lesson_plan?: {
    duration_minutes?: number; objectives?: string[]; teacher_activities?: string[];
    student_activities?: string[]; classwork?: any; resources?: string[];
    engagement_tips?: string[]; assignment?: { title: string; instructions: string };
    project?: { title: string; description: string; deliverables?: string[] };
  };
  termNumber?: number;
}
interface CurriculumTerm { term: number; title: string; weeks: CurriculumWeek[] }
interface Curriculum { id: string; content: { terms: CurriculumTerm[] } }

// ── Content type definitions ──────────────────────────────────────────────────
const CONTENT_TYPES = [
  {
    key: 'lesson' as const,
    label: 'Lesson Plan',
    icon: BookOpenIcon,
    active: 'text-violet-400 border-violet-500/40 bg-violet-500/10 ring-1 ring-violet-500/40',
    idle:   'border-border bg-muted/10 hover:bg-muted/30 text-muted-foreground',
    desc: 'Full lesson plan with objectives, activities & classwork — saved to Lesson Plans',
  },
  {
    key: 'assignment' as const,
    label: 'Assignment',
    icon: ClipboardDocumentListIcon,
    active: 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10 ring-1 ring-cyan-500/40',
    idle:   'border-border bg-muted/10 hover:bg-muted/30 text-muted-foreground',
    desc: 'Homework task for students to complete — saved to Assignments',
  },
  {
    key: 'project' as const,
    label: 'Project',
    icon: RocketLaunchIcon,
    active: 'text-orange-400 border-orange-500/40 bg-orange-500/10 ring-1 ring-orange-500/40',
    idle:   'border-border bg-muted/10 hover:bg-muted/30 text-muted-foreground',
    desc: 'Hands-on project with deliverables — saved to Assignments as project type',
  },
  {
    key: 'cbt' as const,
    label: 'CBT Exam',
    icon: AcademicCapIcon,
    active: 'text-rose-400 border-rose-500/40 bg-rose-500/10 ring-1 ring-rose-500/40',
    idle:   'border-border bg-muted/10 hover:bg-muted/30 text-muted-foreground',
    desc: 'Computer-based quiz or exam — opens CBT builder pre-filled with week topic',
  },
] as const;

type ContentKey = typeof CONTENT_TYPES[number]['key'];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function GenerateContentPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();

  const [programs, setPrograms]           = useState<Program[]>([]);
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [selectedCourse, setSelectedCourse]   = useState<Course | null>(null);
  const [curriculum, setCurriculum]       = useState<Curriculum | null>(null);
  const [selectedWeek, setSelectedWeek]   = useState<CurriculumWeek | null>(null);
  const [contentType, setContentType]     = useState<ContentKey | null>(null);
  const [loadingCurr, setLoadingCurr]     = useState(false);
  const [generating, setGenerating]       = useState(false);
  const [error, setError]                 = useState('');

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

  // Load programs + courses
  useEffect(() => {
    if (!profile || !isStaff) return;
    fetch('/api/programs?is_active=true')
      .then(r => r.json())
      .then(j => setPrograms(j.data ?? []));
  }, [profile?.id]); // eslint-disable-line

  // Load curriculum when course selected
  async function handleCourseSelect(prog: Program, course: Course) {
    setSelectedProgram(prog);
    setSelectedCourse(course);
    setSelectedWeek(null);
    setCurriculum(null);
    setError('');
    setLoadingCurr(true);
    const res  = await fetch(`/api/curricula?course_id=${course.id}`);
    const json = await res.json();
    const items: Curriculum[] = json.data ?? [];
    setCurriculum(items.length > 0 ? items[0] : null);
    setLoadingCurr(false);
  }

  // Flatten weeks from all terms, carrying termNumber
  const allWeeks: CurriculumWeek[] = (curriculum?.content?.terms ?? []).flatMap(t =>
    t.weeks.map(w => ({ ...w, termNumber: t.term }))
  );

  // ── Generate / route ────────────────────────────────────────────────────────
  async function handleGenerate() {
    if (!selectedCourse || !selectedWeek || !contentType) return;
    setGenerating(true);
    setError('');

    try {
      const plan    = selectedWeek.lesson_plan;
      const weekTag = `Week ${selectedWeek.week}: ${selectedWeek.topic}`;
      const dueDate = new Date(Date.now() + 7  * 864e5).toISOString().split('T')[0];
      const projDue = new Date(Date.now() + 14 * 864e5).toISOString().split('T')[0];

      // ── CBT: redirect to existing CBT new page (already reads URL params) ──
      if (contentType === 'cbt') {
        const p = new URLSearchParams({
          program_id: selectedProgram?.id ?? '',
          course_id:  selectedCourse.id,
          topic:      selectedWeek.topic,
          week:       String(selectedWeek.week),
          type:       selectedWeek.type === 'examination' ? 'examination' : 'evaluation',
        });
        router.push(`/dashboard/cbt/new?${p.toString()}`);
        return;
      }

      // ── Lesson Plan ────────────────────────────────────────────────────────
      if (contentType === 'lesson') {
        const res  = await fetch('/api/lessons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title:            weekTag,
            description:      (selectedWeek.subtopics ?? []).join(', '),
            lesson_type:      'lesson',
            status:           'draft',
            duration_minutes: plan?.duration_minutes ?? 60,
            is_active:        true,
            course_id:        selectedCourse.id,
            content: plan ? JSON.stringify({
              objectives:        plan.objectives,
              teacher_activities: plan.teacher_activities,
              student_activities: plan.student_activities,
              classwork:         plan.classwork,
              resources:         plan.resources,
            }) : null,
            lesson_plan: plan ? {
              objectives: plan.objectives,
              activities: plan.teacher_activities,
              assessment_methods: [
                plan.assignment?.title ? `Assignment: ${plan.assignment.title}` : '',
                plan.project?.title    ? `Project: ${plan.project.title}` : '',
              ].filter(Boolean),
              staff_notes: (plan.engagement_tips ?? []).join('\n'),
              plan_data: {
                curriculum_id: curriculum?.id,
                week:          selectedWeek.week,
                classwork:     plan.classwork,
                assignment:    plan.assignment,
                project:       plan.project,
              },
            } : null,
            metadata: {
              source:        'generate-content',
              curriculum_id: curriculum?.id,
              week:          selectedWeek.week,
            },
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to create lesson plan');
        // Navigate to the lesson_plan record (not the lesson record)
        const planId = json.data?.lesson_plan_id ?? json.data?.id;
        router.push(`/dashboard/lesson-plans/${planId}`);
        return;
      }

      // ── Assignment ─────────────────────────────────────────────────────────
      if (contentType === 'assignment') {
        const asn = plan?.assignment;
        const res = await fetch('/api/assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title:           asn?.title || `${weekTag} — Assignment`,
            description:     weekTag,
            instructions:    asn?.instructions || (selectedWeek.subtopics ?? []).join('\n'),
            assignment_type: 'homework',
            due_date:        dueDate,
            max_points:      100,
            is_active:       true,
            course_id:       selectedCourse.id,
            metadata: {
              source:        'generate-content',
              curriculum_id: curriculum?.id,
              week:          selectedWeek.week,
            },
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to create assignment');
        router.push(`/dashboard/assignments/${json.data.id}`);
        return;
      }

      // ── Project ────────────────────────────────────────────────────────────
      if (contentType === 'project') {
        const proj = plan?.project;
        const res  = await fetch('/api/assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title:           proj?.title || `${weekTag} — Project`,
            description:     proj?.description || selectedWeek.topic,
            instructions:    proj
              ? `${proj.description}\n\nDeliverables:\n${(proj.deliverables ?? []).map((d, i) => `${i + 1}. ${d}`).join('\n')}`
              : selectedWeek.topic,
            assignment_type: 'project',
            due_date:        projDue,
            max_points:      100,
            is_active:       true,
            course_id:       selectedCourse.id,
            metadata: {
              source:        'generate-content',
              curriculum_id: curriculum?.id,
              week:          selectedWeek.week,
              deliverables:  proj?.deliverables ?? [],
            },
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to create project');
        router.push(`/dashboard/assignments/${json.data.id}`);
        return;
      }
    } catch (e: any) {
      setError(e.message || 'Something went wrong — please try again');
    } finally {
      setGenerating(false);
    }
  }

  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (authLoading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!isStaff) { router.replace('/dashboard'); return null; }

  const isOptional = selectedProgram?.delivery_type === 'optional';
  const availableContentTypes = CONTENT_TYPES.filter(t =>
    isOptional ? t.key === 'project' || t.key === 'assignment' : true
  );

  const selectedTypeDef = CONTENT_TYPES.find(t => t.key === contentType);
  const canGenerate     = !!selectedCourse && !!selectedWeek && !!contentType;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-orange-500/10 border border-orange-500/30 flex items-center justify-center shrink-0">
          <SparklesIcon className="w-5 h-5 text-orange-400" />
        </div>
        <div>
          <h1 className="text-xl font-black text-foreground">Generate Content</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Pick a course from your syllabus, choose a week, then create the content for it.
          </p>
        </div>
      </div>

      {/* Step 1 — Course */}
      <div className="bg-card border border-border">
        <div className="px-5 py-3 border-b border-border bg-gradient-to-r from-orange-500/5 to-transparent">
          <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">Step 1 — Course</p>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Program */}
            <div>
              <label className="text-xs text-muted-foreground font-bold mb-1 block">Program</label>
              <select
                value={selectedProgram?.id ?? ''}
                onChange={e => {
                  const prog = programs.find(p => p.id === e.target.value) ?? null;
                  setSelectedProgram(prog);
                  setSelectedCourse(null);
                  setCurriculum(null);
                  setSelectedWeek(null);
                  setContentType(null);
                }}
                className="w-full bg-background border border-border text-foreground px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
              >
                <option value="">— Select Program —</option>
                {programs.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.title}{p.delivery_type === 'optional' ? ' (Elective)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Course */}
            <div>
              <label className="text-xs text-muted-foreground font-bold mb-1 block">Course</label>
              <select
                value={selectedCourse?.id ?? ''}
                onChange={e => {
                  if (!selectedProgram) return;
                  const course = selectedProgram.courses.find(c => c.id === e.target.value);
                  if (course) handleCourseSelect(selectedProgram, course);
                }}
                disabled={!selectedProgram}
                className="w-full bg-background border border-border text-foreground px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors disabled:opacity-40"
              >
                <option value="">— Select Course —</option>
                {(selectedProgram?.courses ?? []).filter((c: any) => c.is_active !== false).map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Syllabus status */}
          {loadingCurr && (
            <p className="text-xs text-muted-foreground animate-pulse">Checking syllabus…</p>
          )}
          {selectedCourse && !loadingCurr && !curriculum && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-500/5 border border-amber-500/20 text-amber-400 text-xs">
              <ExclamationTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                No syllabus yet for <strong>{selectedCourse.title}</strong>.{' '}
                <a href="/dashboard/curriculum" className="underline font-bold">Go to Course &amp; Syllabus</a> to generate one first, then come back.
              </span>
            </div>
          )}
          {curriculum && (
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <CheckCircleIcon className="w-4 h-4" />
              <span>
                Syllabus loaded — <strong>{allWeeks.length}</strong> weeks across{' '}
                <strong>{curriculum.content.terms.length}</strong> term{curriculum.content.terms.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Step 2 — Week */}
      {curriculum && allWeeks.length > 0 && (
        <div className="bg-card border border-border">
          <div className="px-5 py-3 border-b border-border bg-gradient-to-r from-orange-500/5 to-transparent">
            <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">Step 2 — Week</p>
          </div>
          <div className="p-5 space-y-3">
            <select
              value={selectedWeek ? `${selectedWeek.termNumber}-${selectedWeek.week}` : ''}
              onChange={e => {
                if (!e.target.value) { setSelectedWeek(null); return; }
                const [tNum, wNum] = e.target.value.split('-').map(Number);
                const found = allWeeks.find(w => w.termNumber === tNum && w.week === wNum);
                setSelectedWeek(found ?? null);
                setContentType(null);
              }}
              className="w-full bg-background border border-border text-foreground px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
            >
              <option value="">— Select Week —</option>
              {curriculum.content.terms.map(term => (
                <optgroup key={term.term} label={term.title}>
                  {term.weeks.map(w => (
                    <option key={`${term.term}-${w.week}`} value={`${term.term}-${w.week}`}>
                      Week {w.week} — {w.topic}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {/* Week preview */}
            {selectedWeek && (
              <div className="px-4 py-3 bg-muted/20 border border-border space-y-1">
                <p className="text-sm font-black text-foreground">{selectedWeek.topic}</p>
                {(selectedWeek.subtopics ?? []).length > 0 && (
                  <p className="text-xs text-muted-foreground">{selectedWeek.subtopics!.join(' · ')}</p>
                )}
                {selectedWeek.lesson_plan ? (
                  <p className="text-[10px] text-emerald-400 font-bold mt-1">
                    ✓ Lesson plan available — content will be curriculum-aware
                  </p>
                ) : (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    No detailed lesson plan yet — basic content will be generated from topic &amp; subtopics
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 3 — Content Type */}
      {selectedWeek && (
        <div className="bg-card border border-border">
          <div className="px-5 py-3 border-b border-border bg-gradient-to-r from-orange-500/5 to-transparent">
            <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">Step 3 — What to Create</p>
          </div>
          <div className="p-5 space-y-4">
            {isOptional && (
              <p className="text-[10px] font-black uppercase tracking-wider text-violet-400 border border-violet-500/20 bg-violet-500/5 px-3 py-1.5">
                Elective program — create a project or assignment module for students to self-direct
              </p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {availableContentTypes.map(t => {
                const Icon   = t.icon;
                const active = contentType === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setContentType(t.key)}
                    className={`flex flex-col items-center gap-2 p-4 border text-center transition-all ${
                      active ? t.active : t.idle
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-xs font-black leading-tight">{t.label}</span>
                  </button>
                );
              })}
            </div>

            {selectedTypeDef && (
              <p className="text-xs text-muted-foreground">{selectedTypeDef.desc}</p>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-rose-500/5 border border-rose-500/20 text-rose-400 text-xs">
          <ExclamationTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Generate button */}
      {canGenerate && (
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="w-full py-4 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-foreground font-black text-sm flex items-center justify-center gap-2 transition-all"
        >
          {generating ? (
            <>
              <div className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />
              Creating…
            </>
          ) : (
            <>
              <SparklesIcon className="w-4 h-4" />
              Create {selectedTypeDef?.label} for Week {selectedWeek?.week}
              <ArrowRightIcon className="w-4 h-4" />
            </>
          )}
        </button>
      )}
    </div>
  );
}
