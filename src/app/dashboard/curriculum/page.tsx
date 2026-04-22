'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  BookOpenIcon, SparklesIcon, XMarkIcon, ChevronDownIcon, ChevronRightIcon,
  ClipboardDocumentListIcon, DocumentTextIcon, CheckCircleIcon, ClockIcon,
  AcademicCapIcon, UserGroupIcon, ExclamationTriangleIcon, ArrowPathIcon,
  PrinterIcon, PencilIcon, ChartBarIcon, BoltIcon, InformationCircleIcon,
  RocketLaunchIcon, ArrowRightIcon, StarIcon, EyeIcon,
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { buildAddLessonQueryFromCurriculum } from '@/lib/curriculum/add-lesson-from-curriculum';
import PipelineStepper from '@/components/pipeline/PipelineStepper';
import {
  SyllabusPreview,
  type SyllabusContent,
  type SyllabusPreviewRole,
} from '@/components/curriculum/SyllabusPreview';

// Nigerian term labels
const TERM_LABEL: Record<number, string> = {
  1: 'First Term',
  2: 'Second Term',
  3: 'Third Term',
};

// ── Content generation types ─────────────────────────────────────────────────
const CONTENT_TYPES = [
  {
    key: 'lesson' as const,
    label: 'Lesson Plan',
    icon: BookOpenIcon,
    active: 'text-violet-400 border-violet-500/40 bg-violet-500/10 ring-1 ring-violet-500/40',
    idle: 'border-border bg-muted/10 hover:bg-muted/30 text-muted-foreground',
    desc: 'Full lesson plan with objectives, activities & classwork — saved to Lesson Plans',
  },
  {
    key: 'assignment' as const,
    label: 'Assignment',
    icon: ClipboardDocumentListIcon,
    active: 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10 ring-1 ring-cyan-500/40',
    idle: 'border-border bg-muted/10 hover:bg-muted/30 text-muted-foreground',
    desc: 'Homework task for students to complete — saved to Assignments',
  },
  {
    key: 'project' as const,
    label: 'Project',
    icon: RocketLaunchIcon,
    active: 'text-orange-400 border-orange-500/40 bg-orange-500/10 ring-1 ring-orange-500/40',
    idle: 'border-border bg-muted/10 hover:bg-muted/30 text-muted-foreground',
    desc: 'Hands-on project with deliverables — saved to Assignments as project type',
  },
  {
    key: 'cbt' as const,
    label: 'CBT Exam',
    icon: AcademicCapIcon,
    active: 'text-rose-400 border-rose-500/40 bg-rose-500/10 ring-1 ring-rose-500/40',
    idle: 'border-border bg-muted/10 hover:bg-muted/30 text-muted-foreground',
    desc: 'Computer-based quiz or exam — opens CBT builder pre-filled with week topic',
  },
  {
    key: 'flashcard' as const,
    label: 'Flashcards',
    icon: StarIcon,
    active: 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10 ring-1 ring-yellow-500/40',
    idle: 'border-border bg-muted/10 hover:bg-muted/30 text-muted-foreground',
    desc: 'Interactive study cards with AI generated Q&A — opens Flashcard Studio',
  },
] as const;
type ContentKey = typeof CONTENT_TYPES[number]['key'];

// ── Types ────────────────────────────────────────────────────────────────────
type WeekType = 'lesson' | 'assessment' | 'examination';
type TrackStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

interface LessonPlan {
  duration_minutes: number;
  objectives: string[];
  teacher_activities: string[];
  student_activities: string[];
  classwork: { title: string; instructions: string; materials: string[] };
  assignment: { title: string; instructions: string; due: string };
  project: { title: string; description: string; deliverables: string[] } | null;
  resources: string[];
  engagement_tips: string[];
}

interface AssessmentPlan {
  type: string;
  title: string;
  coverage: string[];
  format: string;
  duration_minutes: number;
  scoring_guide: string;
  teacher_prep: string[];
  sample_questions?: string[];
}

interface CurriculumWeek {
  week: number;
  type: WeekType;
  topic: string;
  subtopics?: string[];
  lesson_plan?: LessonPlan;
  assessment_plan?: AssessmentPlan;
  termNumber?: number;
}

interface CurriculumTerm {
  term: number;
  title: string;
  objectives: string[];
  weeks: CurriculumWeek[];
}

interface CurriculumContent {
  course_title: string;
  overview: string;
  learning_outcomes: string[];
  terms: CurriculumTerm[];
  assessment_strategy: string;
  materials_required: string[];
  recommended_tools: string[];
}

interface CurriculumDoc {
  id: string;
  course_id: string;
  content: CurriculumContent;
  version: number;
  created_at: string;
  /**
   * Teacher-controlled publish flag. When true, the curriculum is
   * visible to the assigned school, its students and their parents.
   * Default at creation is false so the teacher can review & preview
   * before sharing.
   */
  is_visible_to_school?: boolean;
  school_id?: string | null;
}

interface WeekTracking {
  id: string;
  term_number: number;
  week_number: number;
  status: TrackStatus;
  teacher_notes?: string;
  actual_date?: string;
  completed_at?: string;
}

interface Course { id: string; title: string; is_active: boolean; program_id?: string | null }
interface Program { id: string; name: string; courses: Course[] }

// ── Constants ────────────────────────────────────────────────────────────────
const WEEK_META: Record<WeekType, { label: string; color: string; icon: any }> = {
  lesson:      { label: 'Lesson',      color: 'text-violet-400 bg-violet-500/10 border-violet-500/30', icon: BookOpenIcon },
  assessment:  { label: 'Assessment',  color: 'text-amber-400  bg-amber-500/10  border-amber-500/30',  icon: ClipboardDocumentListIcon },
  examination: { label: 'Examination', color: 'text-rose-400   bg-rose-500/10   border-rose-500/30',   icon: DocumentTextIcon },
};

const TRACK_META: Record<TrackStatus, { label: string; color: string; icon: any }> = {
  pending:     { label: 'Pending',     color: 'text-muted-foreground', icon: ClockIcon },
  in_progress: { label: 'In Progress', color: 'text-blue-400',         icon: ArrowPathIcon },
  completed:   { label: 'Completed',   color: 'text-emerald-400',      icon: CheckCircleIcon },
  skipped:     { label: 'Skipped',     color: 'text-zinc-500',         icon: ExclamationTriangleIcon },
};

const INPUT_CLS = 'select-premium w-full px-3 py-2.5 text-sm focus:border-orange-500';
const SELECT_CLS = 'select-premium w-full px-3 py-2.5 text-sm focus:border-orange-500';

// ── Main Page ────────────────────────────────────────────────────────────────
export default function CurriculumPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [programs, setPrograms]       = useState<Program[]>([]);
  const [expandedPrograms, setExpandedPrograms] = useState<Set<string>>(new Set());
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [selectedCourse, setSelectedCourse]   = useState<Course | null>(null);
  const [curriculum, setCurriculum]   = useState<CurriculumDoc | null>(null);
  const [tracking, setTracking]       = useState<WeekTracking[]>([]);
  const [activeTerm, setActiveTerm]   = useState(1);
  const [activeWeek, setActiveWeek]   = useState<CurriculumWeek | null>(null);
  const [loadingCurr, setLoadingCurr] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [generating, setGenerating]   = useState(false);
  const [genError, setGenError]       = useState('');
  const [savingTrack, setSavingTrack]   = useState(false);
  const [notesDraft, setNotesDraft]     = useState('');
  const [assigning, setAssigning]         = useState(false);
  const [assignResult, setAssignResult]   = useState<{ assignment?: boolean; project?: boolean } | null>(null);
  const [creatingLesson, setCreatingLesson] = useState(false);
  const [creatingCbt, setCreatingCbt]     = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'syllabus' | 'generate'>(
    searchParams.get('tab') === 'generate' ? 'generate' : 'syllabus'
  );
  // Teacher-controlled "show to school" gate + cross-role preview modal
  const [publishing, setPublishing] = useState(false);
  const [previewRole, setPreviewRole] = useState<SyllabusPreviewRole | null>(null);
  // Generate Content tab state
  const [genWeek, setGenWeek] = useState<CurriculumWeek | null>(null);
  const [genContentType, setGenContentType] = useState<ContentKey | null>(null);
  const [genGenerating, setGenGenerating] = useState(false);
  const [genTabError, setGenTabError] = useState('');
  const [loadError, setLoadError] = useState('');

  const isAdmin   = profile?.role === 'admin';
  const isTeacher = profile?.role === 'teacher';
  const isSchool  = profile?.role === 'school';
  const isStudent = profile?.role === 'student';
  const isParent  = profile?.role === 'parent';
  const canGenerate = isAdmin || isTeacher;
  const canTrack    = isAdmin || isTeacher;
  // Students & parents get a clean read-only syllabus (no builder chrome).
  const learnerMode = isStudent || isParent;

  // Form state for generation modal
  const [form, setForm] = useState({
    grade_level: 'JSS1',
    subject_area: '',
    term_count: '3',
    weeks_per_term: '8',
    notes: '',
  });

  // ── Load programs ────────────────────────────────────────────────────────
  // Honors `?program=<id>` and `?course=<id>` for deep-linking from the
  // student learning hub or the syllabus link in any other view.
  useEffect(() => {
    const deepProgramId = searchParams.get('program');
    const deepCourseId = searchParams.get('course');
    fetch('/api/programs?is_active=true')
      .then((r) => r.json())
      .then((j) => {
        const progs: Program[] = j.data ?? [];
        setPrograms(progs);
        if (deepProgramId) {
          const p = progs.find((x) => x.id === deepProgramId);
          if (p) {
            setExpandedPrograms(new Set([p.id]));
            setSelectedProgram(p);
            if (deepCourseId) {
              const c = (p.courses ?? []).find((x) => x.id === deepCourseId);
              if (c) setSelectedCourse(c);
            }
            return;
          }
        }
        if (progs.length === 1) {
          setExpandedPrograms(new Set([progs[0].id]));
        }
      })
      .catch(() => setLoadError('Failed to load programs — please refresh the page.'));
  }, [searchParams]);

  // ── Load curriculum for selected course ──────────────────────────────────
  const loadCurriculum = useCallback(async (courseId: string) => {
    setLoadingCurr(true);
    setLoadError('');
    setCurriculum(null);
    setTracking([]);
    setActiveWeek(null);
    try {
      const res = await fetch(`/api/curricula?course_id=${courseId}`);
      if (!res.ok) throw new Error('Failed to load syllabus');
      const json = await res.json();
      const items: CurriculumDoc[] = json.data ?? [];
      if (items.length > 0) {
        const curr = items[0];
        setCurriculum(curr);
        const tRes = await fetch(`/api/curricula/${curr.id}/track`);
        const tJson = await tRes.json();
        setTracking(tJson.data ?? []);
      }
    } catch {
      setLoadError('Could not load the syllabus — please try again.');
    } finally {
      setLoadingCurr(false);
    }
  }, []);

  function selectCourse(prog: Program, course: Course) {
    setSelectedProgram(prog);
    setSelectedCourse(course);
    setActiveTerm(1);
    setActiveWeek(null);
    setGenWeek(null);
    setGenContentType(null);
    setGenTabError('');
    setLoadError('');
    setMobileSidebarOpen(false);
    loadCurriculum(course.id);
  }

  // ── Generate curriculum ──────────────────────────────────────────────────
  async function generate() {
    if (!selectedCourse) return;
    setGenerating(true);
    setGenError('');
    try {
      const res = await fetch('/api/curricula', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_id: selectedCourse.id,
          course_name: selectedCourse.title,
          ...form,
          term_count: Number(form.term_count),
          weeks_per_term: Number(form.weeks_per_term),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setGenError(json.error || 'Generation failed'); return; }
      setCurriculum(json.data);
      setTracking([]);
      setShowGenerate(false);
    } catch {
      setGenError('Network error — please try again');
    } finally {
      setGenerating(false);
    }
  }

  // ── Track week ───────────────────────────────────────────────────────────
  async function trackWeek(week: CurriculumWeek, status: TrackStatus, notes?: string) {
    if (!curriculum || !canTrack) return;
    setSavingTrack(true);
    const term = activeTerm;
    const res = await fetch(`/api/curricula/${curriculum.id}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        term_number: term,
        week_number: week.week,
        status,
        teacher_notes: notes || notesDraft || null,
        actual_date: new Date().toISOString().split('T')[0],
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setTracking(prev => {
        const filtered = prev.filter(t => !(t.term_number === term && t.week_number === week.week));
        return [...filtered, json.data];
      });
      setNotesDraft('');
    }
    setSavingTrack(false);
  }

  function getTracking(termNum: number, weekNum: number): WeekTracking | undefined {
    return tracking.find(t => t.term_number === termNum && t.week_number === weekNum);
  }

  // ── Assign week content to students ──────────────────────────────────────
  async function assignWeek(week: CurriculumWeek) {
    if (!canTrack || !week.lesson_plan) return;
    setAssigning(true);
    setAssignResult(null);
    const result: { assignment?: boolean; project?: boolean } = {};
    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Create assignment
    const asn = week.lesson_plan.assignment;
    if (asn?.title) {
      const r = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: asn.title,
          description: `Week ${week.week}: ${week.topic}`,
          instructions: asn.instructions,
          assignment_type: 'homework',
          due_date: dueDate,
          max_points: 100,
          is_active: true,
          course_id: selectedCourse?.id || null,
          metadata: {
            source: 'curriculum',
            curriculum_id: curriculum?.id,
            term: activeTerm,
            week: week.week,
            curriculum_week_type: week.type,
          },
        }),
      });
      result.assignment = r.ok;
    }

    // Create project if present
    const proj = week.lesson_plan.project;
    if (proj?.title) {
      const r = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: proj.title,
          description: proj.description,
          instructions: `${proj.description}\n\nDeliverables:\n${(proj.deliverables ?? []).map((d, i) => `${i+1}. ${d}`).join('\n')}`,
          assignment_type: 'project',
          due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          max_points: 100,
          is_active: true,
          course_id: selectedCourse?.id || null,
          metadata: {
            deliverables: proj.deliverables ?? [],
            source: 'curriculum',
            curriculum_id: curriculum?.id,
            term: activeTerm,
            week: week.week,
          },
        }),
      });
      result.project = r.ok;
    }

    setAssignResult(result);
    setAssigning(false);

    // Auto-mark as in_progress if currently pending
    const currentTrack = getTracking(activeTerm, week.week);
    if (!currentTrack || currentTrack.status === 'pending') {
      await trackWeek(week, 'in_progress', 'Automatically marked in_progress via content assignment.');
    }
  }

  // ── Create lesson from curriculum week ───────────────────────────────────
  // Redirects to Add Lesson page with pre-populated curriculum context
  async function createLessonFromWeek(week: CurriculumWeek) {
    if (!canTrack || !selectedCourse || !curriculum) return;
    setCreatingLesson(true);
    const plan = week.lesson_plan;
    const params = buildAddLessonQueryFromCurriculum({
      curriculumId: curriculum.id,
      term: activeTerm,
      weekNumber: week.week,
      courseId: selectedCourse.id,
      programId: selectedProgram?.id ?? selectedCourse.program_id,
      title: `Week ${week.week}: ${week.topic}`,
      description: (week.subtopics ?? []).join(', '),
      durationMinutes: plan?.duration_minutes ?? 60,
      plan: plan
        ? {
            objectives: plan.objectives,
            teacher_activities: plan.teacher_activities,
            student_activities: plan.student_activities,
            classwork: plan.classwork,
            resources: plan.resources,
            engagement_tips: plan.engagement_tips,
            assignment: plan.assignment,
            project: plan.project,
          }
        : null,
    });
    router.push(`/dashboard/lessons/add?${params.toString()}`);
    setCreatingLesson(false);
  }

  // ── Create Flashcards from curriculum week ───────────────────────────────
  async function createFlashcardsFromWeek(week: CurriculumWeek) {
    if (!canTrack || !selectedCourse || !curriculum) return;
    setCreatingLesson(true); // Reusing creatingLesson state or add new one
    try {
      const weekTag = `W${week.week}: ${week.topic}`;
      const res = await fetch('/api/flashcards/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: weekTag,
          description: `Syllabus-aligned flashcards for ${selectedCourse.title}`,
          course_id: selectedCourse.id,
          tags: ['curriculum', week.topic]
        }),
      });
      const json = await res.json();
      if (res.ok) {
        router.push(`/dashboard/flashcards?deckId=${json.data.id}&topic=${encodeURIComponent(week.topic)}&autoGenerate=true`);
      } else {
        throw new Error(json.error || 'Failed to create deck');
      }
    } catch (e: any) {
      setLoadError(e.message || 'Failed to create flashcards deck');
    } finally {
      setCreatingLesson(false);
    }
  }

  // ── Create CBT quiz from curriculum week ─────────────────────────────────
  function createCbtFromWeek(week: CurriculumWeek) {
    if (!curriculum || !selectedCourse) return;
    const params = new URLSearchParams({
      topic: week.topic,
      course_id: selectedCourse.id,
      curriculum_id: curriculum.id,
      term: String(activeTerm),
      week: String(week.week),
      type: week.type === 'examination' ? 'exam' : 'quiz',
    });
    router.push(`/dashboard/cbt?${params.toString()}`);
  }

  // ── Print lesson plan ─────────────────────────────────────────────────────
  function printWeek() {
    window.print();
  }

  // ── Generate content from tab ──────────────────────────────────────────────
  async function handleGenerate() {
    if (!selectedCourse || !genWeek || !genContentType) return;
    setGenGenerating(true);
    setGenTabError('');
    try {
      const plan    = genWeek.lesson_plan;
      const weekTag = `Week ${genWeek.week}: ${genWeek.topic}`;
      const dueDate = new Date(Date.now() + 7  * 864e5).toISOString().split('T')[0];
      const projDue = new Date(Date.now() + 14 * 864e5).toISOString().split('T')[0];

      if (genContentType === 'cbt') {
        const p = new URLSearchParams({
          program_id: selectedProgram?.id ?? '',
          course_id:  selectedCourse.id,
          topic:      genWeek.topic,
          week:       String(genWeek.week),
          type:       genWeek.type === 'examination' ? 'examination' : 'evaluation',
        });
        router.push(`/dashboard/cbt/new?${p.toString()}`);
        return;
      }
      if (genContentType === 'lesson') {
        if (!curriculum) {
          setGenTabError('No syllabus loaded — open Course Syllabus first or pick a course with a curriculum.');
          return;
        }
        const termForWeek = genWeek.termNumber ?? activeTerm;
        const params = buildAddLessonQueryFromCurriculum({
          curriculumId: curriculum.id,
          term: termForWeek,
          weekNumber: genWeek.week,
          courseId: selectedCourse.id,
          programId: selectedProgram?.id ?? selectedCourse.program_id,
          title: weekTag,
          description: (genWeek.subtopics ?? []).join(', '),
          durationMinutes: plan?.duration_minutes ?? 60,
          plan: plan
            ? {
                objectives: plan.objectives,
                teacher_activities: plan.teacher_activities,
                student_activities: plan.student_activities,
                classwork: plan.classwork,
                resources: plan.resources,
                engagement_tips: plan.engagement_tips,
                assignment: plan.assignment,
                project: plan.project,
              }
            : null,
        });
        params.set('flow_origin', 'generate-tab');
        router.push(`/dashboard/lessons/add?${params.toString()}`);
        return;
      }
      if (genContentType === 'assignment') {
        const res = await fetch('/api/assignments', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: plan?.assignment?.title || `${weekTag} — Assignment`, description: weekTag, instructions: plan?.assignment?.instructions || (genWeek.subtopics ?? []).join('\n'), assignment_type: 'homework', due_date: dueDate, max_points: 100, is_active: true, course_id: selectedCourse.id, metadata: { source: 'generate-content', curriculum_id: curriculum?.id, week: genWeek.week } }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to create assignment');
        router.push(`/dashboard/assignments/${json.data.id}`);
        return;
      }
      if (genContentType === 'project') {
        const proj = plan?.project;
        const res = await fetch('/api/assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: proj?.title || `${weekTag} — Project`,
            description: weekTag,
            instructions: proj?.description || (genWeek.subtopics ?? []).join('\n'),
            assignment_type: 'project',
            due_date: projDue,
            max_points: 100,
            is_active: true,
            course_id: selectedCourse.id,
            metadata: { source: 'generate-content', curriculum_id: curriculum?.id, week: genWeek.week },
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to create project');
        router.push(`/dashboard/assignments/${json.data.id}`);
        return;
      }
      if (genContentType === 'flashcard') {
        const res = await fetch('/api/flashcards/decks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: weekTag,
            description: `Syllabus-aligned flashcards for ${selectedCourse.title}`,
            course_id: selectedCourse.id,
            tags: ['curriculum', genWeek.topic]
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to create flashcard deck');
        router.push(`/dashboard/flashcards?deckId=${json.data.id}&topic=${encodeURIComponent(genWeek.topic)}&autoGenerate=true`);
        return;
      }
    } catch (e: any) {
      setGenTabError(e.message || 'Something went wrong — please try again');
    } finally {
      setGenGenerating(false);
    }
  }

  // ── Teacher: publish / unpublish the syllabus to school, students & parents ──
  async function togglePublish(next: boolean) {
    if (!curriculum) return;
    setPublishing(true);
    try {
      const res = await fetch(`/api/curricula/${curriculum.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_visible_to_school: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Could not update visibility');
      }
      setCurriculum((prev) =>
        prev ? { ...prev, is_visible_to_school: next } : prev,
      );
    } catch (e: any) {
      setLoadError(e.message || 'Failed to update syllabus visibility');
    } finally {
      setPublishing(false);
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const currentTermData = curriculum?.content?.terms?.find(t => t.term === activeTerm);
  const termCount = curriculum?.content?.terms?.length ?? 0;
  const allWeeks = curriculum?.content?.terms?.flatMap(t => t.weeks) ?? [];
  const completedCount = tracking.filter(t => t.status === 'completed').length;
  const progressPct = allWeeks.length ? Math.round((completedCount / allWeeks.length) * 100) : 0;
  // Generate tab
  const genSelectedTypeDef = CONTENT_TYPES.find(t => t.key === genContentType);
  const canGenerateContent = !!selectedCourse && !!genWeek && !!genContentType;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col md:flex-row h-full min-h-screen bg-background text-foreground">

      {/* ── Mobile scope bar — sticky, shows current Program › Course and
             gives one-tap access to Browse, Preview-as-role, Publish toggle.
             The intent is that the teacher never loses context of what they
             are editing even as the syllabus scrolls past the viewport on
             a small screen. ── */}
      <div className="md:hidden sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            {selectedProgram ? (
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground truncate">
                {selectedProgram.name}
                {selectedCourse && (
                  <>
                    <span className="text-muted-foreground/40 mx-1">›</span>
                    <span className="text-orange-400">{selectedCourse.title}</span>
                  </>
                )}
              </p>
            ) : (
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                Course & Syllabus
              </p>
            )}
            <p className="text-sm font-black truncate">
              {curriculum?.content?.course_title ?? selectedCourse?.title ?? 'Select a course'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {curriculum && canGenerate && (
              <button
                onClick={() => setPreviewRole('student')}
                className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-sky-300 border border-sky-500/30 px-2 py-1.5 hover:bg-sky-500/10"
                aria-label="Preview as student"
              >
                <EyeIcon className="w-3.5 h-3.5" />
                Preview
              </button>
            )}
            <button
              onClick={() => setMobileSidebarOpen(v => !v)}
              className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-orange-400 border border-orange-500/30 px-2 py-1.5"
            >
              <BookOpenIcon className="w-3.5 h-3.5" />
              {mobileSidebarOpen ? 'Close' : 'Browse'}
            </button>
          </div>
        </div>
        {/* Quick term jump on mobile — only when a syllabus is loaded */}
        {curriculum && curriculum.content.terms && curriculum.content.terms.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto px-4 pb-2 snap-x -mx-px">
            {curriculum.content.terms.map((t) => {
              const active = t.term === activeTerm;
              return (
                <button
                  key={t.term}
                  onClick={() => setActiveTerm(t.term)}
                  className={`snap-start shrink-0 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest transition ${
                    active
                      ? 'bg-orange-500/15 border-orange-500/40 text-orange-300'
                      : 'bg-muted/20 border-border text-muted-foreground'
                  }`}
                >
                  T{t.term} {TERM_LABEL[t.term] ? `· ${TERM_LABEL[t.term].split(' ')[0]}` : ''}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Left Sidebar — Programs & Courses ── */}
      <aside className={`
        ${mobileSidebarOpen ? 'flex' : 'hidden'} md:flex
        flex-col w-full md:w-64 lg:w-72 shrink-0
        border-b md:border-b-0 md:border-r border-border
        bg-card overflow-y-auto md:h-screen
      `}>
        <div className="px-4 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <SparklesIcon className="w-4 h-4 text-orange-400" />
            <h2 className="text-xs font-black uppercase tracking-widest text-foreground">Course & Syllabus</h2>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Program → Course → Syllabus</p>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {programs.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="w-8 h-8 border-2 border-dashed border-border flex items-center justify-center mx-auto mb-4">
                 <AcademicCapIcon className="w-4 h-4 text-muted-foreground/30" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-4">No tracks found</p>
            </div>
          ) : programs.map(prog => {
            const isExpanded = expandedPrograms.has(prog.id);
            const activeCourses = prog.courses?.filter(c => c.is_active !== false) ?? [];
            return (
              <div key={prog.id} className="border-b border-border/50 last:border-0">
                <button
                  onClick={() => setExpandedPrograms(prev => {
                    const next = new Set(prev);
                    if (next.has(prog.id)) next.delete(prog.id); else next.add(prog.id);
                    return next;
                  })}
                  className={`w-full flex items-center gap-2 px-4 py-4 text-left transition-all ${isExpanded ? 'bg-muted/30' : 'hover:bg-muted/20'}`}
                >
                  {isExpanded
                    ? <ChevronDownIcon className="w-4 h-4 text-orange-500 shrink-0" />
                    : <ChevronRightIcon className="w-4 h-4 text-muted-foreground shrink-0" />}
                  <span className="text-[10px] font-black uppercase tracking-[0.15em] text-foreground truncate">{prog.name || (prog as any).title}</span>
                  <span className="ml-auto bg-muted px-1.5 py-0.5 text-[9px] font-black text-muted-foreground shrink-0">{activeCourses.length}</span>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden bg-muted/10"
                    >
                      {activeCourses.map(course => {
                        const isSelected = selectedCourse?.id === course.id;
                        const hasCurr = isSelected && !!curriculum;
                        return (
                          <button
                            key={course.id}
                            onClick={() => selectCourse(prog, course)}
                            className={`w-full flex items-center gap-3 pl-10 pr-4 py-3 text-left transition-all relative group ${
                              isSelected
                                ? 'text-orange-500 bg-orange-500/5'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                            }`}
                          >
                            {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-600" />}
                            <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-orange-500' : 'bg-muted-foreground/30'}`} />
                            <span className="text-[12px] font-bold truncate tracking-tight">{course.title}</span>
                            {hasCurr && (
                              <div className="ml-auto w-4 h-4 flex items-center justify-center bg-orange-600/10 border border-orange-500/20">
                                 <SparklesIcon className="w-2.5 h-2.5 text-orange-400" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 overflow-y-auto flex flex-col">
        {/* Tab bar — shown when course selected */}
        {selectedCourse && (
          <div
            className="flex overflow-x-auto snap-x snap-mandatory border-b border-border bg-card px-2 sm:px-4 shrink-0 [-webkit-overflow-scrolling:touch]"
            role="tablist"
            aria-label="Curriculum views"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'syllabus'}
              onClick={() => setActiveTab('syllabus')}
              className={`snap-start shrink-0 flex items-center gap-2 min-h-[48px] px-4 sm:px-5 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-colors touch-manipulation ${
                activeTab === 'syllabus'
                  ? 'border-orange-500 text-orange-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground active:bg-muted/30'
              }`}
            >
              <BookOpenIcon className="w-4 h-4 shrink-0" aria-hidden />
              <span className="whitespace-nowrap">Syllabus</span>
            </button>
            {canTrack && (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'generate'}
                onClick={() => setActiveTab('generate')}
                className={`snap-start shrink-0 flex items-center gap-2 min-h-[48px] px-4 sm:px-5 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-colors touch-manipulation ${
                  activeTab === 'generate'
                    ? 'border-orange-500 text-orange-400'
                    : 'border-transparent text-muted-foreground hover:text-foreground active:bg-muted/30'
                }`}
              >
                <SparklesIcon className="w-4 h-4 shrink-0" aria-hidden />
                <span className="whitespace-nowrap">Generate</span>
              </button>
            )}
          </div>
        )}

        {/* Pipeline — shared 5-step stepper with course context preserved across steps */}
        {selectedCourse && (
          <div className="px-4 py-3 border-b border-border bg-card/50 shrink-0">
            <PipelineStepper
              current="syllabus"
              courseId={selectedCourse.id}
              programId={selectedCourse.program_id ?? selectedProgram?.id ?? null}
              curriculumId={curriculum?.id ?? null}
              courseTitle={selectedCourse.title}
            />
          </div>
        )}

        {/* Generate Content Tab */}
        {activeTab === 'generate' && selectedCourse && (
          <div className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-6 pb-10">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-500/10 border border-orange-500/30 flex items-center justify-center shrink-0">
                <SparklesIcon className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <h1 className="text-xl font-black text-foreground">Generate Content</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Pick a week from the syllabus, choose content type, then create it.
                </p>
              </div>
            </div>

            {/* Week selector */}
            <div className="bg-card border border-border">
              <div className="px-5 py-3 border-b border-border bg-gradient-to-r from-orange-500/5 to-transparent">
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">Step 1 — Choose a Week</p>
              </div>
              <div className="p-5 space-y-3">
                {loadingCurr ? (
                  <p className="text-xs text-muted-foreground animate-pulse">Loading syllabus…</p>
                ) : !curriculum ? (
                  <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-500/5 border border-amber-500/20 text-amber-400 text-xs">
                    <ExclamationTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>No syllabus yet for <strong>{selectedCourse.title}</strong>. Switch to the <button className="underline font-bold" onClick={() => setActiveTab('syllabus')}>Course Syllabus</button> tab and generate one first.</span>
                  </div>
                ) : (
                  <>
                    <select
                      value={genWeek ? `${genWeek.termNumber ?? 1}-${genWeek.week}` : ''}
                      onChange={e => {
                        if (!e.target.value) { setGenWeek(null); setGenContentType(null); return; }
                        const [tNum, wNum] = e.target.value.split('-').map(Number);
                        const found = (curriculum.content.terms ?? []).flatMap(t =>
                          t.weeks.map(w => ({ ...w, termNumber: t.term }))
                        ).find(w => w.termNumber === tNum && w.week === wNum);
                        setGenWeek(found ?? null);
                        setGenContentType(null);
                      }}
                      className={SELECT_CLS}
                    >
                      <option value="">— Select Week —</option>
                      {[...curriculum.content.terms].sort((a, b) => a.term - b.term).map(term => (
                        <optgroup key={term.term} label={term.title}>
                          {[...(term.weeks ?? [])].sort((a, b) => a.week - b.week).map(w => (
                            <option key={`${term.term}-${w.week}`} value={`${term.term}-${w.week}`}>
                              Week {w.week} — {w.topic}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    {genWeek && (
                      <div className="px-4 py-3 bg-muted/20 border border-border space-y-1">
                        <p className="text-sm font-black text-foreground">{genWeek.topic}</p>
                        {(genWeek.subtopics ?? []).length > 0 && (
                          <p className="text-xs text-muted-foreground">{genWeek.subtopics!.join(' · ')}</p>
                        )}
                        <p className={`text-[10px] font-bold mt-1 ${genWeek.lesson_plan ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                          {genWeek.lesson_plan ? '✓ Lesson plan available — content will be curriculum-aware' : 'No detailed lesson plan — content generated from topic & subtopics'}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Content type */}
            {genWeek && curriculum && (
              <div className="bg-card border border-border">
                <div className="px-5 py-3 border-b border-border bg-gradient-to-r from-orange-500/5 to-transparent">
                  <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">Step 2 — What to Create</p>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
                    {CONTENT_TYPES.map(t => {
                      const Icon   = t.icon;
                      const active = genContentType === t.key;
                      return (
                        <button
                          type="button"
                          key={t.key}
                          onClick={() => setGenContentType(t.key)}
                          className={`flex flex-col items-center justify-center gap-2 min-h-[88px] sm:min-h-[96px] p-3 sm:p-4 border text-center transition-all touch-manipulation ${active ? t.active : t.idle}`}
                        >
                          <Icon className="w-5 h-5 shrink-0" aria-hidden />
                          <span className="text-[11px] sm:text-xs font-black leading-tight">{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {genSelectedTypeDef && (
                    <p className="text-xs text-muted-foreground">{genSelectedTypeDef.desc}</p>
                  )}
                </div>
              </div>
            )}

            {/* Error */}
            {genTabError && (
              <div className="flex items-start gap-2 px-4 py-3 bg-rose-500/5 border border-rose-500/20 text-rose-400 text-xs">
                <ExclamationTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />
                {genTabError}
              </div>
            )}

            {/* Generate button */}
            {canGenerateContent && (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={genGenerating}
                className="w-full min-h-[52px] py-4 px-4 bg-orange-600 hover:bg-orange-500 active:bg-orange-700 disabled:opacity-50 text-white font-black text-sm flex items-center justify-center gap-2 transition-all touch-manipulation rounded-none"
              >
                {genGenerating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    <SparklesIcon className="w-4 h-4" />
                    Create {genSelectedTypeDef?.label} for Week {genWeek?.week}
                    <ArrowRightIcon className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Syllabus Tab (or no course selected) */}
        {(activeTab === 'syllabus' || !selectedCourse) && (
        <div className="flex-1">
        {!selectedCourse ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center px-4">
            <BookOpenIcon className="w-14 h-14 text-muted-foreground mb-4" />
            <h2 className="text-xl font-black mb-2">Select a Course</h2>
            <p className="text-muted-foreground text-sm max-w-xs">
              Choose a program and course from the sidebar to view or generate its curriculum.
            </p>
          </div>
        ) : loadingCurr ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4 px-4 text-center">
            <ExclamationTriangleIcon className="w-10 h-10 text-rose-400" />
            <p className="text-sm text-rose-400 font-bold">{loadError}</p>
            <button
              onClick={() => selectedCourse && loadCurriculum(selectedCourse.id)}
              className="px-4 py-2 text-xs font-bold border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : !curriculum ? (
          /* No curriculum (or not yet published for learners) */
          <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center px-4 space-y-4">
            <SparklesIcon className="w-14 h-14 text-orange-400 mb-2" />
            <h2 className="text-xl font-black">{selectedCourse.title}</h2>
            {learnerMode || isSchool ? (
              <p className="text-muted-foreground text-sm max-w-sm">
                Your teacher is still preparing the syllabus for this course. It will
                appear here as soon as it&rsquo;s published.
              </p>
            ) : (
              <p className="text-muted-foreground text-sm max-w-sm">
                No curriculum exists for this course yet. Generate a complete AI
                curriculum with lesson plans, assessments, and examinations.
              </p>
            )}
            {canGenerate ? (
              <button
                onClick={() => setShowGenerate(true)}
                className="flex items-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold text-sm transition-colors"
              >
                <SparklesIcon className="w-4 h-4" /> Generate Syllabus
              </button>
            ) : !learnerMode && !isSchool ? (
              <p className="text-xs text-muted-foreground">Contact your administrator to generate a course syllabus.</p>
            ) : null}
          </div>
        ) : learnerMode ? (
          /* Learner (student / parent) — clean read-only syllabus */
          <div className="px-4 md:px-6 py-6 max-w-3xl mx-auto">
            <div className="mb-4 flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {selectedProgram?.name}
              </span>
              <span className="text-muted-foreground/40">›</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-orange-400">
                {selectedCourse.title}
              </span>
            </div>
            <SyllabusPreview
              content={curriculum.content as unknown as SyllabusContent}
              courseTitle={selectedCourse.title}
              audienceIsLearner
            />
          </div>
        ) : (
          /* Curriculum content */
          <div className="px-4 md:px-6 py-6 space-y-6 max-w-5xl">

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{selectedProgram?.name}</span>
                  <span className="text-muted-foreground/40">›</span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-orange-400">{selectedCourse.title}</span>
                </div>
                <h1 className="text-2xl font-black leading-tight">{curriculum.content.course_title}</h1>
                <p className="text-xs text-muted-foreground mt-1">
                  v{curriculum.version} · {termCount} term{termCount !== 1 ? 's' : ''} · {allWeeks.length} weeks total
                  {allWeeks.length > 0 && (
                    <span className="ml-2 text-emerald-400 font-bold">{progressPct}% delivered</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Preview as role — lets the teacher see the exact student/parent/school view */}
                {canGenerate && (
                  <div className="inline-flex rounded-md border border-border overflow-hidden bg-card">
                    <span className="hidden sm:inline text-[10px] font-black uppercase tracking-widest text-muted-foreground self-center px-2.5">
                      Preview as
                    </span>
                    {(['student', 'parent', 'school'] as SyllabusPreviewRole[]).map((r) => (
                      <button
                        key={r}
                        onClick={() => setPreviewRole(r)}
                        className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/30 border-l border-border first:border-l-0"
                        title={`See this syllabus as a ${r}`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                )}

                {/* Teacher publish toggle */}
                {canGenerate && (
                  <button
                    onClick={() => togglePublish(!curriculum.is_visible_to_school)}
                    disabled={publishing}
                    className={`flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-widest transition-all shrink-0 disabled:opacity-60 ${
                      curriculum.is_visible_to_school
                        ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                        : 'bg-card border border-amber-500/40 text-amber-300 hover:bg-amber-500/10'
                    }`}
                    title={
                      curriculum.is_visible_to_school
                        ? 'Visible to the school, students and parents. Click to unpublish.'
                        : 'Hidden from school, students and parents. Click to publish.'
                    }
                  >
                    {publishing ? (
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    ) : curriculum.is_visible_to_school ? (
                      <CheckCircleIcon className="w-4 h-4" />
                    ) : (
                      <ExclamationTriangleIcon className="w-4 h-4" />
                    )}
                    {curriculum.is_visible_to_school ? 'Published' : 'Draft — publish to school'}
                  </button>
                )}

                <Link
                  href="/dashboard/curriculum/progress"
                  className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border hover:border-orange-500/50 text-xs font-bold transition-all text-muted-foreground hover:text-foreground"
                >
                  <ChartBarIcon className="w-3.5 h-3.5 text-orange-400" /> Progress Dashboard
                </Link>
                {canGenerate && (
                  <button
                    onClick={() => setShowGenerate(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-card border border-border hover:border-orange-500/50 text-sm font-bold transition-all shrink-0"
                  >
                    <ArrowPathIcon className="w-4 h-4 text-orange-400" /> Regenerate
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar */}
            {allWeeks.length > 0 && (
              <div className="bg-card border border-border p-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-muted-foreground uppercase tracking-wider">Delivery Progress</span>
                  <span className="text-foreground">{completedCount} / {allWeeks.length} weeks completed</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="flex gap-4 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-500 rounded-full inline-block" />Completed: {tracking.filter(t=>t.status==='completed').length}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-500 rounded-full inline-block" />In Progress: {tracking.filter(t=>t.status==='in_progress').length}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-zinc-500 rounded-full inline-block" />Skipped: {tracking.filter(t=>t.status==='skipped').length}</span>
                </div>
              </div>
            )}

            {/* Overview */}
            {curriculum.content.overview && (
              <div className="bg-card border border-border p-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 blur-3xl pointer-events-none" />
                <h3 className="text-[10px] font-black uppercase tracking-widest text-orange-400 mb-4 flex items-center gap-2">
                  <InformationCircleIcon className="w-3 h-3" />
                  Course Overview
                </h3>
                <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line relative z-10">{curriculum.content.overview}</p>
              </div>
            )}

            {/* Learning outcomes */}
            {curriculum.content.learning_outcomes?.length > 0 && (
              <div className="bg-card border border-border p-5">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-orange-400 mb-3">Learning Outcomes</h3>
                <ul className="space-y-1.5">
                  {curriculum.content.learning_outcomes.map((o, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-foreground/80">
                      <span className="text-orange-500 font-black shrink-0 text-xs mt-0.5">{i+1}.</span>
                      <span>{o}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Term tabs */}
            {termCount > 0 && (
              <div className="flex gap-1 bg-card border border-border p-1 w-fit">
                {[...curriculum.content.terms].sort((a, b) => a.term - b.term).map(term => {
                  const termTracking = tracking.filter(t => t.term_number === term.term);
                  const termWeeks = term.weeks?.length ?? 0;
                  const termDone = termTracking.filter(t => t.status === 'completed').length;
                  return (
                    <button
                      key={term.term}
                      onClick={() => { setActiveTerm(term.term); setActiveWeek(null); }}
                      className={`flex flex-col items-center px-4 py-2 text-sm font-bold transition-colors ${
                        activeTerm === term.term
                          ? 'bg-orange-600 text-white'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      }`}
                    >
                      <span>Term {term.term}</span>
                      <span className={`text-[9px] font-black ${activeTerm === term.term ? 'text-white/70' : 'text-muted-foreground'}`}>
                        {termDone}/{termWeeks} done
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Term title & objectives */}
            {currentTermData && (
              <div className="space-y-1">
                <h2 className="text-lg font-black">Term {currentTermData.term}: {currentTermData.title}</h2>
                {currentTermData.objectives?.length > 0 && (
                  <ul className="flex flex-wrap gap-2 mt-2">
                    {currentTermData.objectives.map((o, i) => (
                      <li key={i} className="text-[11px] bg-muted text-muted-foreground px-2.5 py-1 border border-border font-bold">
                        {o}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Week grid */}
            {currentTermData?.weeks && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[...currentTermData.weeks].sort((a, b) => a.week - b.week).map(week => {
                  const meta = WEEK_META[week.type] ?? WEEK_META.lesson;
                  const trackRec = getTracking(activeTerm, week.week);
                  const trackMeta = TRACK_META[trackRec?.status ?? 'pending'];
                  const TrackIcon = trackMeta.icon;
                  const WeekIcon = meta.icon;
                  const isActive = activeWeek?.week === week.week;

                  return (
                    <button
                      key={week.week}
                      onClick={() => { setActiveWeek(week); setNotesDraft(''); setAssignResult(null); }}
                      className={`text-left p-4 border transition-all space-y-2 ${
                        isActive
                          ? 'border-orange-500 bg-orange-500/5'
                          : 'border-border bg-card hover:border-orange-500/40'
                      }`}
                    >
                      {/* Week number + type badge */}
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                          Week {week.week}
                        </span>
                        <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 border ${meta.color}`}>
                          {meta.label}
                        </span>
                      </div>

                      {/* Topic */}
                      <WeekIcon className={`w-5 h-5 ${meta.color.split(' ')[0]}`} />
                      <p className="text-sm font-bold leading-snug line-clamp-2">{week.topic}</p>

                      {/* Subtopics preview */}
                      {(week.subtopics ?? []).length > 0 && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          {(week.subtopics ?? []).slice(0, 2).join(' · ')}
                        </p>
                      )}

                      {/* Status */}
                      <div className={`flex items-center gap-1 text-[10px] font-bold ${trackMeta.color}`}>
                        <TrackIcon className="w-3 h-3" />
                        <span>{trackMeta.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Materials + tools */}
            {(curriculum.content.materials_required?.length > 0 || curriculum.content.recommended_tools?.length > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {curriculum.content.materials_required?.length > 0 && (
                  <div className="bg-card border border-border p-4">
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-orange-400 mb-3">Materials Required</h3>
                    <ul className="space-y-1">
                      {curriculum.content.materials_required.map((m, i) => (
                        <li key={i} className="flex gap-2 text-xs text-foreground/70">
                          <span className="text-orange-500">•</span>{m}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {curriculum.content.recommended_tools?.length > 0 && (
                  <div className="bg-card border border-border p-4">
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-orange-400 mb-3">Recommended Tools</h3>
                    <ul className="space-y-1">
                      {curriculum.content.recommended_tools.map((t, i) => (
                        <li key={i} className="flex gap-2 text-xs text-foreground/70">
                          <span className="text-orange-500">•</span>{t}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        </div>
        )}
      </main>

      {/* ── Week Detail Panel ── */}
      {activeWeek && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setActiveWeek(null)}
          />
          <div className="relative w-full max-w-2xl bg-background border-l border-border flex flex-col h-full overflow-hidden shadow-2xl">
            {/* Panel header */}
            <div className="flex items-start justify-between p-5 border-b border-border bg-card shrink-0">
              <div className="flex-1 min-w-0 mr-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 border ${WEEK_META[activeWeek.type]?.color}`}>
                    Week {activeWeek.week} · {WEEK_META[activeWeek.type]?.label}
                  </span>
                  {getTracking(activeTerm, activeWeek.week) && (
                    <span className={`text-[9px] font-bold ${TRACK_META[getTracking(activeTerm, activeWeek.week)!.status].color}`}>
                      {TRACK_META[getTracking(activeTerm, activeWeek.week)!.status].label}
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-black leading-tight">{activeWeek.topic}</h2>
                {(activeWeek.subtopics ?? []).length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">{(activeWeek.subtopics ?? []).join(' · ')}</p>
                )}
              </div>
              <button onClick={() => setActiveWeek(null)} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">

              {/* LESSON WEEK */}
              {activeWeek.type === 'lesson' && activeWeek.lesson_plan && (
                <LessonPlanView plan={activeWeek.lesson_plan} />
              )}

              {/* ASSESSMENT / EXAMINATION WEEK */}
              {(activeWeek.type === 'assessment' || activeWeek.type === 'examination') && activeWeek.assessment_plan && (
                <AssessmentPlanView plan={activeWeek.assessment_plan} type={activeWeek.type} />
              )}

              {/* No plan generated */}
              {activeWeek.type === 'lesson' && !activeWeek.lesson_plan && (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  <p>No lesson plan data found for this week.</p>
                  <p className="text-xs mt-1">Try regenerating the curriculum to get full lesson plans.</p>
                </div>
              )}
            </div>

            {/* Panel footer — assign + tracking */}
            {canTrack && (
              <div className="border-t border-border p-4 bg-card shrink-0 space-y-3">

                {/* Assign this week */}
                {activeWeek.type === 'lesson' && activeWeek.lesson_plan && (
                  <div className="bg-violet-500/5 border border-violet-500/20 p-3 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-violet-400">Publish to Students</p>
                    <div className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                      {activeWeek.lesson_plan.assignment?.title && (
                        <span className="bg-muted border border-border px-2 py-0.5 font-bold">
                          📝 Assignment: {activeWeek.lesson_plan.assignment.title}
                        </span>
                      )}
                      {activeWeek.lesson_plan.project?.title && (
                        <span className="bg-muted border border-border px-2 py-0.5 font-bold">
                          🚀 Project: {activeWeek.lesson_plan.project.title}
                        </span>
                      )}
                    </div>
                    {assignResult && (
                      <p className="text-[10px] text-emerald-400 font-bold">
                        ✓ Published:{assignResult.assignment ? ' Assignment' : ''}{assignResult.project ? ' + Project' : ''} — visible in student dashboards
                      </p>
                    )}
                    <button
                      onClick={() => assignWeek(activeWeek)}
                      disabled={assigning || (!activeWeek.lesson_plan?.assignment?.title && !activeWeek.lesson_plan?.project?.title)}
                      className="w-full py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs font-bold transition-colors"
                    >
                      {assigning ? 'Publishing…' : '⚡ Assign This Week'}
                    </button>
                  </div>
                )}

                {/* Quick-create actions */}
                {activeWeek.type === 'lesson' && canTrack && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => createLessonFromWeek(activeWeek)}
                      disabled={creatingLesson}
                      title="Opens Step 3 · Lessons with this week's plan prefilled"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
                    >
                      <PencilIcon className="w-3.5 h-3.5" />
                      {creatingLesson ? 'Creating…' : 'Create Lesson'}
                    </button>
                    <button
                      onClick={() => createCbtFromWeek(activeWeek)}
                      disabled={creatingCbt}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-40"
                    >
                      <BoltIcon className="w-3.5 h-3.5" />
                      Create CBT Quiz
                    </button>
                    <button
                      onClick={() => createFlashcardsFromWeek(activeWeek)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/10 transition-colors"
                    >
                      <StarIcon className="w-3.5 h-3.5" />
                      Create Flashcards
                    </button>
                    <button
                      onClick={printWeek}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                    >
                      <PrinterIcon className="w-3.5 h-3.5" />
                      Print Plan
                    </button>
                  </div>
                )}
                {(activeWeek.type === 'assessment' || activeWeek.type === 'examination') && canTrack && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => createCbtFromWeek(activeWeek)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                      <BoltIcon className="w-3.5 h-3.5" />
                      {activeWeek.type === 'examination' ? 'Create Exam CBT' : 'Create Assessment CBT'}
                    </button>
                    <button
                      onClick={printWeek}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-border text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <PrinterIcon className="w-3.5 h-3.5" />
                      Print
                    </button>
                  </div>
                )}

                <textarea
                  value={notesDraft}
                  onChange={e => setNotesDraft(e.target.value)}
                  placeholder="Teacher notes for this week (optional)…"
                  rows={2}
                  className={INPUT_CLS + ' resize-none text-xs'}
                />
                <div className="flex gap-2 flex-wrap">
                  {(['in_progress', 'completed', 'skipped'] as TrackStatus[]).map(s => {
                    const m = TRACK_META[s];
                    const Icon = m.icon;
                    const isCurrent = getTracking(activeTerm, activeWeek.week)?.status === s;
                    return (
                      <button
                        key={s}
                        disabled={savingTrack}
                        onClick={() => trackWeek(activeWeek, s)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border transition-all ${
                          isCurrent
                            ? `${m.color} border-current bg-current/10`
                            : 'text-muted-foreground border-border hover:border-foreground/30'
                        } disabled:opacity-40`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {m.label}
                      </button>
                    );
                  })}
                  {getTracking(activeTerm, activeWeek.week) && (
                    <button
                      disabled={savingTrack}
                      onClick={() => trackWeek(activeWeek, 'pending')}
                      className="px-3 py-1.5 text-xs font-bold border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                    >
                      Reset
                    </button>
                  )}
                </div>
                {getTracking(activeTerm, activeWeek.week)?.teacher_notes && (
                  <p className="text-[11px] text-muted-foreground italic border-l-2 border-orange-500/40 pl-2">
                    "{getTracking(activeTerm, activeWeek.week)?.teacher_notes}"
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Generate Modal ── */}
      {showGenerate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border border-border w-full max-w-lg p-6 space-y-4 overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-black flex items-center gap-2">
                  <SparklesIcon className="w-4 h-4 text-orange-400" />
                  {curriculum ? 'Regenerate' : 'Generate'} Syllabus
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">{selectedCourse?.title}</p>
              </div>
              <button onClick={() => setShowGenerate(false)} disabled={generating}>
                <XMarkIcon className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {curriculum && (
              <div className="bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-400 flex gap-2">
                <ExclamationTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />
                <span>This will create a new version (v{(curriculum.version ?? 0) + 1}). Existing tracking progress will be preserved.</span>
              </div>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Grade Level</label>
                  <select value={form.grade_level} onChange={e => setForm(p => ({ ...p, grade_level: e.target.value }))} className={SELECT_CLS}>
                    {['KG','Basic 1','Basic 2','Basic 3','Basic 4','Basic 5','Basic 6',
                      'JSS1','JSS2','JSS3','SS1','SS2','SS3'].map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Terms</label>
                  <select value={form.term_count} onChange={e => setForm(p => ({ ...p, term_count: e.target.value }))} className={SELECT_CLS}>
                    {['1','2','3'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Weeks/Term</label>
                  <select value={form.weeks_per_term} onChange={e => setForm(p => ({ ...p, weeks_per_term: e.target.value }))} className={SELECT_CLS}>
                    {['8','10','12'].map(w => <option key={w}>{w}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Subject Area</label>
                <input
                  value={form.subject_area}
                  onChange={e => setForm(p => ({ ...p, subject_area: e.target.value }))}
                  placeholder="e.g. Computer Science, Robotics, AI & Machine Learning"
                  className={INPUT_CLS}
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Special Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Any specific topics, teaching constraints, available equipment, school context…"
                  rows={3}
                  className={INPUT_CLS + ' resize-none'}
                />
              </div>
            </div>

            <div className="bg-muted/50 border border-border p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-bold text-foreground/80">Standard Assessment Schedule (applied automatically):</p>
              <p>Week 3 → First Assessment · Week 6 → Second Assessment · Week {form.weeks_per_term} → Examination</p>
              <p>Each lesson week includes a full teacher-ready lesson plan with activities, classwork, and assignments.</p>
            </div>

            {genError && <p className="text-rose-400 text-xs">{genError}</p>}
            {generating && (
              <div className="flex items-center gap-2 text-amber-400 text-xs">
                <SparklesIcon className="w-3.5 h-3.5 animate-spin" />
                <span>Generating complete curriculum with all lesson plans… this takes 60–90 seconds</span>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowGenerate(false)}
                disabled={generating}
                className="flex-1 py-2.5 bg-background border border-border text-muted-foreground font-bold text-sm hover:bg-muted transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={generate}
                disabled={generating}
                className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white font-bold text-sm transition-colors"
              >
                {generating ? 'Generating…' : curriculum ? 'Regenerate' : 'Generate Syllabus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview-as-role modal — shows the teacher exactly what the
          selected audience will see, without leaving the builder. */}
      <AnimatePresence>
        {previewRole && curriculum && (
          <motion.div
            key="syllabus-preview-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[75] bg-black/70 backdrop-blur-sm p-0 sm:p-4 flex items-stretch sm:items-center justify-center"
            onClick={() => setPreviewRole(null)}
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              className="w-full sm:max-w-3xl bg-background sm:rounded-lg sm:border sm:border-border flex flex-col max-h-screen sm:max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-card/70">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-sky-300">
                    Learner Preview
                  </p>
                  <p className="text-sm font-black truncate">
                    {curriculum.content.course_title}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {(['student', 'parent', 'school'] as SyllabusPreviewRole[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => setPreviewRole(r)}
                      className={`px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest rounded border ${
                        previewRole === r
                          ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                  <button
                    onClick={() => setPreviewRole(null)}
                    className="ml-1 p-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30"
                    aria-label="Close preview"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-4">
                <SyllabusPreview
                  content={curriculum.content as unknown as SyllabusContent}
                  courseTitle={selectedCourse?.title}
                  previewRole={previewRole}
                  audienceIsLearner={previewRole !== 'school'}
                  topBanner={
                    !curriculum.is_visible_to_school ? (
                      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs flex items-center gap-2">
                        <ExclamationTriangleIcon className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="text-amber-200">
                          This syllabus is currently a draft. The {previewRole} won&rsquo;t see it
                          until you click <strong>Publish to school</strong>.
                        </span>
                      </div>
                    ) : null
                  }
                />
              </div>
              <div className="border-t border-border bg-card/70 px-4 py-3 flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Preview only — no data is visible to learners in draft mode.
                </p>
                <button
                  onClick={() => togglePublish(!curriculum.is_visible_to_school)}
                  disabled={publishing}
                  className={`px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded border transition disabled:opacity-60 ${
                    curriculum.is_visible_to_school
                      ? 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10'
                      : 'border-orange-500/50 text-orange-300 hover:bg-orange-500/10'
                  }`}
                >
                  {publishing
                    ? 'Saving…'
                    : curriculum.is_visible_to_school
                    ? 'Unpublish'
                    : 'Publish to school'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Section({ label, color, children, icon: Icon }: { label: string; color: string; children: React.ReactNode, icon?: any }) {
  return (
    <div className="bg-card/50 border border-border p-5 space-y-4 hover:border-border/80 transition-colors relative group overflow-hidden">
      <div className={`absolute top-0 left-0 w-1 h-full ${color.replace('text-', 'bg-')}`} />
      <div className="flex items-center justify-between">
        <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] ${color} flex items-center gap-2`}>
          {Icon && <Icon className="w-3 h-3" />}
          {label}
        </h3>
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

// ── Lesson Plan View Component ───────────────────────────────────────────────
function LessonPlanView({ plan }: { plan: LessonPlan }) {
  return (
    <div className="space-y-6 text-sm">
      {/* Duration badge */}
      <div className="flex items-center gap-3 px-4 py-2 bg-muted/30 border border-border w-fit">
        <ClockIcon className="w-4 h-4 text-orange-400" />
        <span className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">{plan.duration_minutes} Minute Session</span>
      </div>

      {/* Objectives */}
      {plan.objectives?.length > 0 && (
        <Section label="Learning Objectives" color="text-violet-400" icon={BoltIcon}>
          <ol className="space-y-2">
            {plan.objectives.map((o, i) => (
              <li key={i} className="flex gap-3 text-sm text-foreground/80">
                <span className="text-violet-400 font-black shrink-0 w-5 flex items-center justify-center bg-violet-400/10 text-[10px] h-5 border border-violet-400/20">{i+1}</span>
                <span className="leading-snug">{o}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* Teacher + Student Activities side by side */}
      {(plan.teacher_activities?.length > 0 || plan.student_activities?.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plan.teacher_activities?.length > 0 && (
            <Section label="Teacher Protocol" color="text-orange-400" icon={UserGroupIcon}>
              <ol className="space-y-3">
                {plan.teacher_activities.map((a, i) => (
                  <li key={i} className="flex gap-3 text-xs text-foreground/80 leading-relaxed">
                    <span className="text-orange-400 font-black shrink-0 w-4">{i+1}.</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ol>
            </Section>
          )}
          {plan.student_activities?.length > 0 && (
            <Section label="Student Interaction" color="text-blue-400" icon={AcademicCapIcon}>
              <ul className="space-y-2">
                {plan.student_activities.map((a, i) => (
                  <li key={i} className="flex gap-3 text-xs text-foreground/80 leading-relaxed">
                    <span className="text-blue-400 shrink-0 select-none opacity-50">#</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}

      {/* Classwork */}
      {plan.classwork?.title && (
        <Section label="In-Class Assessment" color="text-emerald-400" icon={ClipboardDocumentListIcon}>
          <div className="space-y-3">
            <p className="font-black uppercase tracking-tight text-foreground/90 italic">{plan.classwork.title}</p>
            <p className="text-xs text-foreground/70 leading-relaxed border-l-2 border-emerald-500/20 pl-3 py-1">{plan.classwork.instructions}</p>
            {plan.classwork.materials?.length > 0 && (
              <div className="pt-2">
                <ul className="flex flex-wrap gap-2">
                  {plan.classwork.materials.map((m, i) => (
                    <li key={i} className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 font-black uppercase tracking-widest">{m}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Assignment */}
      {plan.assignment?.title && (
        <Section label="Post-Session Mission" color="text-amber-400" icon={DocumentTextIcon}>
          <div className="space-y-2">
            <p className="font-black uppercase tracking-tight text-foreground/90 italic">{plan.assignment.title}</p>
            <p className="text-xs text-foreground/70 leading-relaxed">{plan.assignment.instructions}</p>
            <div className="flex items-center gap-2 text-[10px] text-amber-400 font-black uppercase tracking-widest bg-amber-400/5 w-fit px-2 py-1 border border-amber-400/10">
              <ClockIcon className="w-3 h-3" />
              Deadline: {plan.assignment.due}
            </div>
          </div>
        </Section>
      )}

      {/* Project */}
      {plan.project && (
        <Section label="Neural Project: Milestone" color="text-rose-400" icon={RocketLaunchIcon}>
          <div className="space-y-4">
            <p className="font-black uppercase tracking-tight text-foreground/90 italic">{plan.project.title}</p>
            <p className="text-xs text-foreground/70 leading-relaxed border-l-2 border-rose-500/20 pl-3">{plan.project.description}</p>
            {plan.project.deliverables?.length > 0 && (
              <div className="bg-muted/30 p-3 border border-border">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-3">Target Deliverables</p>
                <ul className="space-y-2">
                  {plan.project.deliverables.map((d, i) => (
                    <li key={i} className="flex gap-2 text-xs text-foreground/70">
                      <span className="text-rose-400 font-black">›</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Resources */}
      {plan.resources?.length > 0 && (
        <Section label="Archives & Tools" color="text-cyan-400" icon={DocumentTextIcon}>
          <ul className="flex flex-wrap gap-2">
            {plan.resources.map((r, i) => (
              <li key={i} className="text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-3 py-1 font-black uppercase tracking-widest">{r}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Engagement tips */}
      {plan.engagement_tips?.length > 0 && (
        <Section label="Delivery Strategies" color="text-pink-400" icon={SparklesIcon}>
          <ul className="space-y-3">
            {plan.engagement_tips.map((t, i) => (
              <li key={i} className="flex gap-3 text-xs text-foreground/80 leading-relaxed">
                <span className="text-pink-400 shrink-0 select-none">💡</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

// ── Assessment Plan View Component ───────────────────────────────────────────
function AssessmentPlanView({ plan, type }: { plan: AssessmentPlan; type: WeekType }) {
  const isExam = type === 'examination';
  const color = isExam ? 'text-rose-400' : 'text-amber-400';
  const MainIcon = isExam ? DocumentTextIcon : ClipboardDocumentListIcon;

  return (
    <div className="space-y-6 text-sm">
      <div className={`flex items-center gap-3 px-4 py-2 ${isExam ? 'bg-rose-500/10 border-rose-500/20' : 'bg-amber-500/10 border-amber-500/20'} border w-fit`}>
        <MainIcon className={`w-4 h-4 ${color}`} />
        <span className={`text-[10px] ${color} font-black uppercase tracking-widest`}>
          {isExam ? 'Final Examination' : 'Term Assessment'} · {plan.duration_minutes} Minutes
        </span>
      </div>

      {plan.coverage?.length > 0 && (
        <Section label="Academic Coverage" color={color} icon={InformationCircleIcon}>
          <ul className="space-y-2">
            {plan.coverage.map((c, i) => (
              <li key={i} className="flex gap-3 text-xs text-foreground/80 leading-relaxed">
                <span className={`${color} shrink-0 opacity-50`}>•</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plan.format && (
          <Section label="Assessment Format" color={color} icon={ClipboardDocumentListIcon}>
            <p className="text-xs text-foreground/80 leading-relaxed">{plan.format}</p>
          </Section>
        )}

        {plan.scoring_guide && (
          <Section label="Scoring Methodology" color={color} icon={ChartBarIcon}>
            <p className="text-xs text-foreground/80 leading-relaxed">{plan.scoring_guide}</p>
          </Section>
        )}
      </div>

      {plan.teacher_prep?.length > 0 && (
        <Section label="Invigilation Checklist" color={color} icon={CheckCircleIcon}>
          <ol className="space-y-3">
            {plan.teacher_prep.map((p, i) => (
              <li key={i} className="flex gap-3 text-xs text-foreground/80 leading-relaxed">
                <span className={`${color} font-black shrink-0 w-4`}>{i+1}.</span>
                <span>{p}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {(plan.sample_questions ?? []).length > 0 && (
        <Section label="Reference Questions" color={color} icon={PencilIcon}>
          <ul className="space-y-4">
            {(plan.sample_questions ?? []).map((q, i) => (
              <li key={i} className="text-xs text-foreground/80 p-5 bg-muted/30 border border-border/50 relative overflow-hidden group">
                 <div className={`absolute top-0 left-0 w-1 h-full ${color.replace('text-', 'bg-')} opacity-20`} />
                 <span className={`${color} font-black mr-3 text-[10px] uppercase tracking-tighter`}>Question {i+1}</span>
                 <p className="mt-2 leading-relaxed">{q}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
