'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { createClient } from '@/lib/supabase/client';
import { engagementTables } from '@/types/engagement';
import {
  BookOpenIcon, SparklesIcon, XMarkIcon, ChevronDownIcon, ChevronRightIcon,
  ClipboardDocumentListIcon, DocumentTextIcon, CheckCircleIcon, ClockIcon,
  AcademicCapIcon, UserGroupIcon, ExclamationTriangleIcon, ArrowPathIcon,
  PrinterIcon, PencilIcon, ChartBarIcon, BoltIcon, InformationCircleIcon,
  RocketLaunchIcon, ArrowRightIcon, StarIcon, EyeIcon, MagnifyingGlassIcon,
  Squares2X2Icon, PlusIcon, CalendarDaysIcon, TrashIcon,
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { buildAddLessonQueryFromCurriculum } from '@/lib/curriculum/add-lesson-from-curriculum';
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

function academicYearOptions(): string[] {
  const y = new Date().getFullYear();
  return [`${y - 1}/${y}`, `${y}/${y + 1}`, `${y + 1}/${y + 2}`];
}

function currentAcademicYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}

function termDatesNg(term: string, academicYear: string): { start: string; end: string } | null {
  const [startY, endY] = academicYear.split('/').map(Number);
  if (!startY || !endY) return null;
  if (term === '1') return { start: `${startY}-09-01`, end: `${startY}-12-15` };
  if (term === '2') return { start: `${endY}-01-10`, end: `${endY}-04-10` };
  if (term === '3') return { start: `${endY}-05-01`, end: `${endY}-07-25` };
  return null;
}

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
    active: 'text-primary border-primary/40 bg-primary/10 ring-1 ring-primary/40',
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
  /** Joined from schools — which partner this row belongs to (null = platform template). */
  schools?: { id: string; name: string } | null;
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
  lesson: { label: 'Lesson', color: 'text-violet-400 bg-violet-500/10 border-violet-500/30', icon: BookOpenIcon },
  assessment: { label: 'Assessment', color: 'text-amber-400  bg-amber-500/10  border-amber-500/30', icon: ClipboardDocumentListIcon },
  examination: { label: 'Examination', color: 'text-rose-400   bg-rose-500/10   border-rose-500/30', icon: DocumentTextIcon },
};

const TRACK_META: Record<TrackStatus, { label: string; color: string; icon: any }> = {
  pending: { label: 'Pending', color: 'text-muted-foreground', icon: ClockIcon },
  in_progress: { label: 'In Progress', color: 'text-blue-400', icon: ArrowPathIcon },
  completed: { label: 'Completed', color: 'text-emerald-400', icon: CheckCircleIcon },
  skipped: { label: 'Skipped', color: 'text-muted-foreground', icon: ExclamationTriangleIcon },
};

const INPUT_CLS = 'select-premium w-full px-3 py-2.5 text-sm focus:border-primary';
const SELECT_CLS = 'select-premium w-full px-3 py-2.5 text-sm focus:border-primary';
const GRADE_LEVEL_OPTIONS = ['Nursery', 'Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6', 'JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'];
const GRADE_SCOPE_STORAGE_KEY = 'curriculum.gradeByScope.v1';

// ── Main Page ────────────────────────────────────────────────────────────────
export default function CurriculumPage() {
  const { profile, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [expandedPrograms, setExpandedPrograms] = useState<Set<string>>(new Set());
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [curriculum, setCurriculum] = useState<CurriculumDoc | null>(null);
  const [tracking, setTracking] = useState<WeekTracking[]>([]);
  const [activeTerm, setActiveTerm] = useState(1);
  const [activeWeek, setActiveWeek] = useState<CurriculumWeek | null>(null);
  const [loadingCurr, setLoadingCurr] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [savingTrack, setSavingTrack] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignResult, setAssignResult] = useState<{ assignment?: boolean; project?: boolean } | null>(null);
  const [showcaseCount, setShowcaseCount] = useState<number | null>(null);

  useEffect(() => {
    if (selectedCourse) {
      void loadShowcaseCount();
    }
  }, [selectedCourse, curriculum?.id]);

  async function loadShowcaseCount() {
    try {
      const supabase = createClient();
      const { count } = await engagementTables.showcase(supabase)
        .select('*', { count: 'exact', head: true })
        .eq('course_name', selectedCourse?.title || '');
      setShowcaseCount(count);
    } catch {
      setShowcaseCount(0);
    }
  }
  const [creatingLesson, setCreatingLesson] = useState(false);
  const [creatingCbt, setCreatingCbt] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'syllabus' | 'generate' | 'delivery' | 'tools' | 'implementations'>(
    searchParams.get('tab') === 'generate' ? 'generate' : 'syllabus'
  );
  const [syllabusViewMode, setSyllabusViewMode] = useState<'serial' | 'explorer'>('serial');
  // Teacher-controlled "show to school" gate + cross-role preview modal
  const [publishing, setPublishing] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [previewRole, setPreviewRole] = useState<SyllabusPreviewRole | null>(null);
  // Generate Content tab state
  const [genWeek, setGenWeek] = useState<CurriculumWeek | null>(null);
  const [genContentType, setGenContentType] = useState<ContentKey | null>(null);
  const [genGenerating, setGenGenerating] = useState(false);
  const [genTabError, setGenTabError] = useState('');
  const [loadError, setLoadError] = useState('');
  /** Filter sidebar programs / courses (builder mode). */
  const [catalogQuery, setCatalogQuery] = useState('');
  /** All syllabus rows for the selected course (global vs school-scoped, versions). */
  const [curriculumList, setCurriculumList] = useState<CurriculumDoc[]>([]);
  /** Last visited course — restored from localStorage so teachers don't lose their place. */
  const [lastVisited, setLastVisited] = useState<{ progId: string; progName: string; courseId: string; courseTitle: string } | null>(null);
  /** Schools the teacher (or admin) can scope a new syllabus to — from GET /api/schools */
  const [assignedSchools, setAssignedSchools] = useState<{ id: string; name: string }[]>([]);
  const [schoolScopedProgramIds, setSchoolScopedProgramIds] = useState<string[]>([]);
  /**
   * POST /api/curricula body: `school_id: null` = platform, else UUID for that school.
   * One row per (course, school) in the database.
   */
  const [generateScope, setGenerateScope] = useState<'platform' | string>('platform');
  /** Remember preferred grade/class per scope (platform or school UUID). */
  const [gradeByScope, setGradeByScope] = useState<Record<string, string>>({ platform: 'JSS1' });
  // Form state for generation modal
  const [form, setForm] = useState({
    grade_level: 'JSS1',
    subject_area: '',
    term_count: '3',
    weeks_per_term: '8',
    notes: '',
  });

  // Optional QA week spine: show DB template + class rotation preview before apply
  const [qaSpineOpen, setQaSpineOpen] = useState(false);
  const [showImplement, setShowImplement] = useState(false);
  const [implementing, setImplementing] = useState(false);
  const [implForm, setImplForm] = useState({
    school_id: '',
    class_id: '',
    term: '1',
    academic_year: currentAcademicYear(),
    term_start: new Date().toISOString().split('T')[0],
    term_end: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    sessions_per_week: '5',
  });
  const [implClasses, setImplClasses] = useState<{ id: string; name: string; school_id: string }[]>([]);
  const [implError, setImplError] = useState('');
  const [implementationList, setImplementationList] = useState<any[]>([]);
  const [globalImplementationList, setGlobalImplementationList] = useState<any[]>([]);
  const [deletingImpl, setDeletingImpl] = useState<string | null>(null);
  const [qaTmplLoading, setQaTmplLoading] = useState(false);
  const [qaTmplErr, setQaTmplErr] = useState('');
  const [qaTmplMeta, setQaTmplMeta] = useState<{
    total: number;
    weeks_per_lane: Record<string, number>;
  } | null>(null);
  const [qaTmplRows, setQaTmplRows] = useState<
    Array<{
      week_index: number;
      lane_index: number;
      topic: string;
      year_number?: number;
      term_number?: number;
      week_number?: number;
    }>
  >([]);
  const [qaInspectLane, setQaInspectLane] = useState(1);
  const [qaClassOptions, setQaClassOptions] = useState<
    { id: string; name: string; program_id: string | null }[]
  >([]);
  const [qaClassId, setQaClassId] = useState('');
  const [qaClassGradeMode, setQaClassGradeMode] = useState<'optional' | 'compulsory'>('optional');
  const [qaClassModeSaving, setQaClassModeSaving] = useState(false);
  const [qaClassModeErr, setQaClassModeErr] = useState('');
  const [qaYear, setQaYear] = useState(1);
  const [qaLaneOverride, setQaLaneOverride] = useState(0);
  const [qaOverwrite, setQaOverwrite] = useState(false);
  const [qaPreviewLoading, setQaPreviewLoading] = useState(false);
  const [qaPreviewErr, setQaPreviewErr] = useState('');
  const [qaPreviewStamp, setQaPreviewStamp] = useState('');
  const [qaPreviewData, setQaPreviewData] = useState<{
    path_offset: number;
    lane_index: number;
    lane_source: string;
    terms: { term: number; weeks: { week: number; topic: string; spine_week: number }[] }[];
  } | null>(null);
  const [qaApplyLoading, setQaApplyLoading] = useState(false);
  const [qaApplyErr, setQaApplyErr] = useState('');
  const [editingWeekKey, setEditingWeekKey] = useState<string | null>(null); // "termN-weekN"
  const [editWeekTopic, setEditWeekTopic] = useState('');
  const [editWeekSubtopics, setEditWeekSubtopics] = useState('');
  const [savingWeek, setSavingWeek] = useState(false);
  // Stable ref so the programs useEffect can call loadCurriculum before it's declared.
  const loadCurriculumRef = useRef<((courseId: string) => Promise<void>) | null>(null);

  const isAdmin = profile?.role === 'admin';
  const isTeacher = profile?.role === 'teacher';
  const isStudent = profile?.role === 'student';
  const isParent = profile?.role === 'parent';
  const isSchool = profile?.role === 'school';
  const canGenerate = isAdmin || isTeacher;
  const canTrack = isAdmin || isTeacher;
  // Students & parents get a clean read-only syllabus (no builder chrome).
  const learnerMode = isStudent || isParent;

  // Reset to syllabus tab if role can't access delivery/tools/generate
  useEffect(() => {
    if (!canTrack && (activeTab === 'delivery' || activeTab === 'tools' || activeTab === 'generate')) {
      setActiveTab('syllabus');
    }
  }, [canTrack, activeTab]);
  const currentScopeKey = generateScope === 'platform' ? 'platform' : generateScope;

  const filteredPrograms = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase();
    if (!q) return programs;
    return programs
      .map((p) => {
        const pn = (p.name || '').toLowerCase();
        const courseMatch = (p.courses ?? []).filter((c) => {
          const t = (c.title || '').toLowerCase();
          return t.includes(q) || pn.includes(q) || t.split(/\s+/).some((w) => w.length > 1 && w.startsWith(q));
        });
        if (pn.includes(q)) return { ...p, courses: p.courses ?? [] };
        if (courseMatch.length) return { ...p, courses: courseMatch };
        return null;
      })
      .filter(Boolean) as Program[];
  }, [programs, catalogQuery]);

  const quickChooserCourses = useMemo(() => {
    const hasSchoolScopeFilter = schoolScopedProgramIds.length > 0;
    return programs
      .flatMap((prog) =>
        (prog.courses ?? [])
          .filter((c) => c.is_active !== false)
          .filter((c) => {
            if (!hasSchoolScopeFilter) return true;
            const pid = c.program_id ?? prog.id;
            return !!pid && schoolScopedProgramIds.includes(pid);
          })
          .map((course) => ({ prog, course })),
      )
      .slice(0, 24);
  }, [programs, schoolScopedProgramIds]);

  // ── Restore last visited course from localStorage ─────────────────────
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('curriculum.lastCourse.v1');
      if (saved) setLastVisited(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

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
        // Open every programme by default so teachers can see all courses at a glance
        // (collapsing only programs is an easy way to scan a long list).
        setExpandedPrograms(new Set(progs.map((p) => p.id)));
        if (deepProgramId) {
          const p = progs.find((x) => x.id === deepProgramId);
          if (p) {
            setExpandedPrograms(new Set([p.id]));
            setSelectedProgram(p);
            if (deepCourseId) {
              const c = (p.courses ?? []).find((x) => x.id === deepCourseId);
              if (c) {
                setSelectedCourse(c);
                loadCurriculumRef.current?.(c.id);
              }
            }
            return;
          }
        }
        // Handle ?course=xxx without a program param — search all programs
        if (deepCourseId) {
          for (const p of progs) {
            const c = (p.courses ?? []).find((x) => x.id === deepCourseId);
            if (c) {
              setExpandedPrograms(new Set([p.id]));
              setSelectedProgram(p);
              setSelectedCourse(c);
              loadCurriculumRef.current?.(c.id);
              return;
            }
          }
        }
        // No URL params — auto-restore last visited course from localStorage
        try {
          const saved = window.localStorage.getItem('curriculum.lastCourse.v1');
          if (saved) {
            const recent = JSON.parse(saved) as { progId: string; courseId: string };
            for (const p of progs) {
              const c = (p.courses ?? []).find((x) => x.id === recent.courseId);
              if (c) {
                setExpandedPrograms(new Set([p.id]));
                setSelectedProgram(p);
                setSelectedCourse(c);
                loadCurriculumRef.current?.(c.id);
                return;
              }
            }
          }
        } catch { /* ignore */ }
        if (progs.length === 1) {
          setExpandedPrograms(new Set([progs[0].id]));
        }
      })
      .catch(() => setLoadError('Failed to load programs — please refresh the page.'));
  }, [searchParams]);

  // Load schools for “syllabus scope” when building / regenerating (admin: all; teacher: assigned)
  useEffect(() => {
    if (!canTrack) return;
    fetch('/api/schools', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setAssignedSchools((j.data ?? []) as { id: string; name: string }[]))
      .catch(() => setAssignedSchools([]));
  }, [canTrack]);

  // Build school-based program scope for the quick chooser grid.
  // Runs for all roles so learners (students/parents) also see only their
  // school's courses rather than the full global catalogue.
  useEffect(() => {
    fetch('/api/classes', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        const classes = (j.data ?? []) as { program_id?: string | null }[];
        const ids = Array.from(
          new Set(
            classes
              .map((c) => c.program_id)
              .filter((x): x is string => typeof x === 'string' && x.length > 0),
          ),
        );
        setSchoolScopedProgramIds(ids);
      })
      .catch(() => setSchoolScopedProgramIds([]));
  }, []);

  // Restore grade memory from localStorage on first load.
  useEffect(() => {
    if (!canGenerate) return;
    try {
      const raw = window.localStorage.getItem(GRADE_SCOPE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, string>;
      if (!parsed || typeof parsed !== 'object') return;
      const cleaned: Record<string, string> = {};
      for (const [scope, grade] of Object.entries(parsed)) {
        if (typeof grade === 'string' && GRADE_LEVEL_OPTIONS.includes(grade)) {
          cleaned[scope] = grade;
        }
      }
      if (!cleaned.platform) cleaned.platform = 'JSS1';
      setGradeByScope(cleaned);
      const currentRemembered = cleaned[currentScopeKey];
      if (currentRemembered) {
        setForm((prev) => ({ ...prev, grade_level: currentRemembered }));
      }
    } catch {
      // Ignore bad storage payloads and keep defaults.
    }
  }, [canGenerate]); // one-time restore

  // Persist grade memory across refresh/browser restart.
  useEffect(() => {
    if (!canGenerate) return;
    try {
      window.localStorage.setItem(GRADE_SCOPE_STORAGE_KEY, JSON.stringify(gradeByScope));
    } catch {
      // Ignore storage quota/security issues.
    }
  }, [gradeByScope, canGenerate]);

  const programIdForQa = selectedCourse?.program_id ?? selectedProgram?.id ?? '';

  const qaSpineSampleRows = useMemo(() => {
    const lane = Math.min(11, Math.max(1, qaInspectLane));
    return [...qaTmplRows]
      .filter((r) => r.lane_index === lane)
      .sort((a, b) => a.week_index - b.week_index)
      .slice(0, 14);
  }, [qaTmplRows, qaInspectLane]);

  const selectedQaClass = useMemo(
    () => qaClassOptions.find((c) => c.id === qaClassId) ?? null,
    [qaClassOptions, qaClassId],
  );
  const qaSelectionStamp = useMemo(
    () => `${qaClassId || 'none'}:${programIdForQa || 'none'}:${qaYear}:${qaLaneOverride || 0}`,
    [qaClassId, programIdForQa, qaYear, qaLaneOverride],
  );
  const qaNeedsFreshPreview = Boolean(qaClassId) && qaPreviewStamp !== qaSelectionStamp;

  const qaInlineSuggestions = useMemo(() => {
    const tips: string[] = [
      'Default mode: keep QA optional. Preview first, then apply only when it clearly matches class context.',
      'If preview does not fit your class reality, skip apply and continue traditional week-by-week syllabus.',
    ];
    if (!qaClassId) {
      tips.push('Select a class and run Preview class path before applying, so lane/offset are visible.');
    }
    if (qaClassId && qaClassGradeMode === 'compulsory') {
      tips.push('This class is set to compulsory QA mode. Keep using preview before each apply to avoid wrong lane/year injection.');
    }
    if (selectedQaClass?.program_id && programIdForQa && selectedQaClass.program_id !== programIdForQa) {
      tips.push('Selected class is from another programme. Prefer a same-programme class for trustworthy preview.');
    }
    if (qaOverwrite) {
      tips.push('Overwrite is ON. This will replace existing weeks in all terms of this syllabus copy.');
    }
    return tips;
  }, [qaClassId, qaClassGradeMode, qaOverwrite, selectedQaClass?.program_id, programIdForQa]);

  useEffect(() => {
    if (!selectedCourse?.id) {
      setQaClassId('');
      setQaPreviewData(null);
      setQaPreviewStamp('');
      setQaTmplMeta(null);
      setQaTmplRows([]);
      setQaTmplErr('');
    }
  }, [selectedCourse?.id]);

  useEffect(() => {
    if (!qaSpineOpen || !canGenerate || !programIdForQa) {
      if (qaSpineOpen && canGenerate && !programIdForQa) {
        setQaTmplErr('This course has no programme id — link it in the catalog first.');
      }
      return;
    }
    setQaTmplLoading(true);
    setQaTmplErr('');
    fetch(
      `/api/platform-syllabus-template?program_id=${encodeURIComponent(programIdForQa)}&catalog_version=qa_spine_v1`,
    )
      .then((r) => r.json())
      .then((j) => {
        if (j.error && !j.data) {
          setQaTmplErr(typeof j.error === 'string' ? j.error : 'Template load failed');
          setQaTmplMeta(null);
          setQaTmplRows([]);
          return;
        }
        const d = j.data;
        if (!d) {
          setQaTmplErr('Unexpected response');
          return;
        }
        setQaTmplMeta({ total: d.total ?? 0, weeks_per_lane: d.weeks_per_lane ?? {} });
        setQaTmplRows(
          (d.rows ?? []).map((r: { week_index: number; lane_index: number; topic: string; year_number?: number; term_number?: number; week_number?: number }) => ({
            week_index: r.week_index,
            lane_index: r.lane_index,
            topic: r.topic,
            year_number: r.year_number,
            term_number: r.term_number,
            week_number: r.week_number,
          })),
        );
      })
      .catch(() => {
        setQaTmplErr('Network error loading template');
        setQaTmplMeta(null);
        setQaTmplRows([]);
      })
      .finally(() => setQaTmplLoading(false));
  }, [qaSpineOpen, canGenerate, programIdForQa]);

  useEffect(() => {
    if (!qaSpineOpen || !canGenerate) return;
    fetch('/api/classes', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        const list = (j.data ?? []) as { id: string; name: string; program_id: string | null }[];
        setQaClassOptions(list);
      })
      .catch(() => setQaClassOptions([]));
  }, [qaSpineOpen, canGenerate]);

  useEffect(() => {
    if (!qaClassId) {
      setQaClassGradeMode('optional');
      setQaClassModeErr('');
      setQaPreviewStamp('');
      return;
    }
    fetch(`/api/classes/${encodeURIComponent(qaClassId)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        const mode = j?.data?.qa_grade_mode;
        setQaClassGradeMode(mode === 'compulsory' ? 'compulsory' : 'optional');
      })
      .catch(() => {
        setQaClassGradeMode('optional');
      });
  }, [qaClassId]);

  const saveQaClassGradeMode = useCallback(async (mode: 'optional' | 'compulsory') => {
    if (!qaClassId) return;
    setQaClassModeSaving(true);
    setQaClassModeErr('');
    try {
      const res = await fetch(`/api/classes/${encodeURIComponent(qaClassId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qa_grade_mode: mode }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setQaClassModeErr(j.error || 'Failed to update class policy');
        return;
      }
      setQaClassGradeMode(mode);
    } catch {
      setQaClassModeErr('Network error while updating class policy');
    } finally {
      setQaClassModeSaving(false);
    }
  }, [qaClassId]);

  const runQaSpinePreview = useCallback(async () => {
    if (!qaClassId) {
      setQaPreviewErr('Select a class to see how the spine rotates (school + class path).');
      setQaPreviewData(null);
      return;
    }
    if (!programIdForQa) {
      setQaPreviewErr('Missing programme id on this course.');
      return;
    }
    setQaPreviewLoading(true);
    setQaPreviewErr('');
    setQaPreviewData(null);
    try {
      const q = new URLSearchParams({
        program_id: programIdForQa,
        year: String(qaYear),
      });
      if (qaLaneOverride > 0) q.set('lane_index', String(qaLaneOverride));
      const res = await fetch(`/api/classes/${encodeURIComponent(qaClassId)}/qa-spine-preview?${q}`);
      const j = await res.json();
      if (!res.ok) {
        setQaPreviewErr(j.error || 'Preview failed');
        return;
      }
      setQaPreviewData(j.data);
      setQaPreviewStamp(qaSelectionStamp);
    } catch {
      setQaPreviewErr('Network error');
    } finally {
      setQaPreviewLoading(false);
    }
  }, [qaClassId, programIdForQa, qaYear, qaLaneOverride, qaSelectionStamp]);

  // Auto-load implementations when tab active or course changes
  useEffect(() => {
    if (activeTab === 'implementations' && selectedCourse) {
      fetch(`/api/lesson-plans?course_id=${selectedCourse.id}`)
        .then(r => r.json())
        .then(j => setImplementationList(j.data || []))
        .catch(() => setImplementationList([]));
    }
    // Also load global list for the landing page
    if (!selectedCourse) {
      fetch('/api/lesson-plans?limit=6')
        .then(r => r.json())
        .then(j => setGlobalImplementationList(j.data || []))
        .catch(() => setGlobalImplementationList([]));
    }
  }, [selectedCourse, activeTab]);

  const deleteImplementation = useCallback(async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this implementation? All associated teaching progress will be lost.')) return;
    setDeletingImpl(id);
    try {
      const res = await fetch(`/api/lesson-plans/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setImplementationList(prev => prev.filter(p => p.id !== id));
        setGlobalImplementationList(prev => prev.filter(p => p.id !== id));
        toast.success('Implementation deleted');
      } else {
        toast.error('Failed to delete implementation');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setDeletingImpl(null);
    }
  }, []);

  // Auto-fill term dates in implement modal when term or academic year changes
  useEffect(() => {
    if (!implForm.term || !implForm.academic_year) return;
    const dates = termDatesNg(implForm.term, implForm.academic_year);
    if (dates) setImplForm(f => ({ ...f, term_start: dates.start, term_end: dates.end }));
  }, [implForm.term, implForm.academic_year]);

  // Load classes when school in implementation modal changes
  useEffect(() => {
    if (showImplement && implForm.school_id) {
      fetch(`/api/classes?school_id=${implForm.school_id}`)
        .then(r => r.json())
        .then(j => setImplClasses(j.data || []))
        .catch(() => setImplClasses([]));
    }
  }, [showImplement, implForm.school_id]);

  const deployToClass = useCallback(async () => {
    if (!curriculum || !selectedCourse) return;
    if (!implForm.school_id) {
      setImplError('Please select a school first.');
      return;
    }
    if (!implForm.class_id) {
      setImplError('Please select a class to implement this syllabus.');
      return;
    }
    setImplementing(true);
    setImplError('');
    try {
      const termLabel = TERM_LABEL[Number(implForm.term)] ?? 'First Term';
      const res = await fetch('/api/lesson-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          curriculum_version_id: curriculum.id,
          course_id: selectedCourse.id,
          school_id: implForm.school_id || null,
          class_id: implForm.class_id,
          term: `${termLabel} ${implForm.academic_year}`,
          term_start: implForm.term_start,
          term_end: implForm.term_end,
          sessions_per_week: Number(implForm.sessions_per_week) || 5,
          status: 'draft',
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setImplError(j.error || 'Failed to implement syllabus');
        return;
      }
      toast.success(`Successfully implemented to ${implClasses.find(c => c.id === implForm.class_id)?.name || 'class'}`);
      setShowImplement(false);
      // Redirect to the newly created lesson plan
      router.push(`/dashboard/lesson-plans/${j.data.id}`);
    } catch {
      setImplError('Network error while implementing');
    } finally {
      setImplementing(false);
    }
  }, [curriculum, selectedCourse, implForm, implClasses, router]);

  const applyQaSpine = useCallback(async () => {
    if (!curriculum || !selectedCourse) return;
    if (qaClassId && qaNeedsFreshPreview) {
      setQaApplyErr('Run Preview class path for current class/year/lane before apply.');
      return;
    }
    if (qaOverwrite) {
      const ok = window.confirm(
        'Overwrite is ON. This will replace existing week rows in all terms for this syllabus copy. Continue?',
      );
      if (!ok) return;
    }
    setQaApplyLoading(true);
    setQaApplyErr('');
    try {
      const res = await fetch('/api/curricula/apply-qa-spine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          curriculum_id: curriculum.id,
          class_id: qaClassId || undefined,
          year_number: qaYear,
          lane_index: qaLaneOverride > 0 ? qaLaneOverride : undefined,
          catalog_version: 'qa_spine_v1',
          overwrite_existing: qaOverwrite,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setQaApplyErr(j.error || j.hint || 'Apply failed');
        return;
      }
      const listRes = await fetch(`/api/curricula?course_id=${selectedCourse.id}`);
      const listJ = await listRes.json();
      const items: CurriculumDoc[] = listJ.data ?? [];
      const u = items.find((c) => c.id === curriculum.id);
      if (u) {
        setCurriculum(u);
        setCurriculumList(items);
        const tRes = await fetch(`/api/curricula/${u.id}/track`);
        const tJson = await tRes.json();
        setTracking(tJson.data ?? []);
      }
    } catch {
      setQaApplyErr('Network error');
    } finally {
      setQaApplyLoading(false);
    }
  }, [curriculum, selectedCourse, qaClassId, qaYear, qaLaneOverride, qaOverwrite, qaNeedsFreshPreview]);

  const openGenerateModal = useCallback(() => {
    let scope: 'platform' | string = 'platform';
    if (curriculum) {
      scope = curriculum.school_id ? curriculum.school_id : 'platform';
    } else if (assignedSchools.length === 0) {
      scope = 'platform';
    } else if (assignedSchools.length === 1) {
      scope = assignedSchools[0].id;
    } else if (isAdmin) {
      scope = 'platform';
    } else if (profile?.school_id && assignedSchools.some((s) => s.id === profile.school_id)) {
      scope = profile.school_id;
    } else {
      scope = assignedSchools[0].id;
    }
    setGenerateScope(scope);
    setForm((prev) => {
      const remembered = gradeByScope[scope];
      return {
        ...prev,
        grade_level: remembered ?? prev.grade_level,
        // Auto-fill subject area from the course title when the field is blank
        subject_area: prev.subject_area || selectedCourse?.title || '',
      };
    });
    setShowGenerate(true);
  }, [curriculum, assignedSchools, isAdmin, profile?.school_id, gradeByScope, selectedCourse?.title]);

  // When filtering, expand every programme that still has a visible course
  useEffect(() => {
    if (!catalogQuery.trim()) return;
    setExpandedPrograms(new Set(filteredPrograms.map((p) => p.id)));
  }, [catalogQuery, filteredPrograms]);

  function pickCurriculumForScope(items: CurriculumDoc[], schoolId: string | null | undefined) {
    if (items.length === 0) return null;
    if (items.length === 1) return items[0];
    if (schoolId) {
      const forSchool = items.find((c) => c.school_id === schoolId);
      if (forSchool) return forSchool;
    }
    const globalRow = items.find((c) => c.school_id == null);
    if (globalRow) return globalRow;
    return items[0];
  }

  const selectCurriculumVersion = useCallback(
    async (id: string) => {
      const doc = curriculumList.find((c) => c.id === id);
      if (!doc) return;
      setCurriculum(doc);
      setActiveWeek(null);
      setGenWeek(null);
      setGenContentType(null);
      try {
        const tRes = await fetch(`/api/curricula/${id}/track`);
        const tJson = await tRes.json();
        setTracking(tJson.data ?? []);
      } catch { /* keep prior tracking */ }
    },
    [curriculumList],
  );

  const restoreGradeForScope = useCallback((scope: 'platform' | string) => {
    const remembered = gradeByScope[scope];
    if (remembered) {
      setForm((prev) => (prev.grade_level === remembered ? prev : { ...prev, grade_level: remembered }));
    }
  }, [gradeByScope]);

  const setGradeForCurrentScope = useCallback((grade: string) => {
    setForm((prev) => ({ ...prev, grade_level: grade }));
    setGradeByScope((prev) => ({ ...prev, [currentScopeKey]: grade }));
  }, [currentScopeKey]);

  const syncScopeToCurriculum = useCallback(
    async (scope: 'platform' | string) => {
      setGenerateScope(scope);
      restoreGradeForScope(scope);
      if (!selectedCourse) return;
      const matching = scope === 'platform'
        ? curriculumList.find((c) => c.school_id == null)
        : curriculumList.find((c) => c.school_id === scope);
      if (matching && matching.id !== curriculum?.id) {
        await selectCurriculumVersion(matching.id);
      }
    },
    [selectedCourse, curriculumList, curriculum?.id, selectCurriculumVersion, restoreGradeForScope],
  );

  // ── Load curriculum for selected course ──────────────────────────────────
  const loadCurriculum = useCallback(async (courseId: string) => {
    setLoadingCurr(true);
    setLoadError('');
    setCurriculum(null);
    setCurriculumList([]);
    setTracking([]);
    setActiveWeek(null);
    const role = profile?.role;
    const isLearnerRole = role === 'student' || role === 'parent';
    try {
      const res = await fetch(`/api/curricula?course_id=${courseId}`);
      if (!res.ok) throw new Error('Failed to load syllabus');
      const json = await res.json();
      const items: CurriculumDoc[] = json.data ?? [];
      setCurriculumList(items);
      if (items.length > 0) {
        const curr = pickCurriculumForScope(items, profile?.school_id);
        if (curr) {
          const scope = curr.school_id ? curr.school_id : 'platform';
          setGenerateScope(scope);
          restoreGradeForScope(scope);
          // Auto-select the best curriculum so the pipeline stepper always
          // has a curriculumId to pass to Step 2. The teacher can still
          // switch versions using the syllabus copy chooser dropdown above.
          setCurriculum(curr);
          // Tracking is a staff-only feature — skip for learner roles to
          // avoid a 401 that can interfere with session cookie handling.
          if (!isLearnerRole) {
            try {
              const tRes = await fetch(`/api/curricula/${curr.id}/track`);
              const tJson = await tRes.json();
              setTracking(tJson.data ?? []);
            } catch { /* keep empty tracking */ }
          }
        }
      }
    } catch {
      setLoadError('Could not load the syllabus — please try again.');
    } finally {
      setLoadingCurr(false);
    }
  }, [profile?.school_id, profile?.role, restoreGradeForScope]);
  loadCurriculumRef.current = loadCurriculum;

  const saveWeekEdit = useCallback(async () => {
    if (!curriculum || !editingWeekKey) return;
    const [termPart, weekPart] = editingWeekKey.split('-');
    const termNum = parseInt(termPart.replace('term', ''), 10);
    const weekNum = parseInt(weekPart.replace('week', ''), 10);
    setSavingWeek(true);
    try {
      const updatedContent = JSON.parse(JSON.stringify(curriculum.content));
      const termObj = (updatedContent.terms ?? []).find((t: any) => t.term === termNum);
      if (!termObj) return;
      const weekObj = (termObj.weeks ?? []).find((w: any) => w.week === weekNum);
      if (!weekObj) return;
      weekObj.topic = editWeekTopic.trim() || weekObj.topic;
      weekObj.subtopics = editWeekSubtopics
        ? editWeekSubtopics.split(',').map((s: string) => s.trim()).filter(Boolean)
        : (weekObj.subtopics ?? []);
      const res = await fetch(`/api/curricula/${curriculum.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: updatedContent }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      setCurriculum(prev => prev ? { ...prev, content: updatedContent, version: json.data?.version ?? prev.version } : prev);
      setEditingWeekKey(null);
      toast.success('Week updated');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSavingWeek(false);
    }
  }, [curriculum, editingWeekKey, editWeekTopic, editWeekSubtopics]);

  function selectCourse(prog: Program, course: Course) {
    const visited = { progId: prog.id, progName: prog.name, courseId: course.id, courseTitle: course.title };
    try { window.localStorage.setItem('curriculum.lastCourse.v1', JSON.stringify(visited)); } catch { /* ignore */ }
    setLastVisited(visited);
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
          school_id: generateScope === 'platform' ? null : generateScope,
          ...form,
          term_count: Number(form.term_count),
          weeks_per_term: Number(form.weeks_per_term),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setGenError(json.error || 'Generation failed'); return; }
      const doc = json.data as CurriculumDoc;
      const scope = doc.school_id ? doc.school_id : 'platform';
      setCurriculum(doc);
      setGenerateScope(scope);
      restoreGradeForScope(scope);
      setCurriculumList((prev) => {
        const others = prev.filter((p) => p.id !== doc.id);
        return [doc, ...others];
      });
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
          instructions: `${proj.description}\n\nDeliverables:\n${(proj.deliverables ?? []).map((d, i) => `${i + 1}. ${d}`).join('\n')}`,
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
      exam_type: week.type === 'examination' ? 'examination' : 'evaluation',
      minimal: 'true'
    });
    router.push(`/dashboard/cbt/new?${params.toString()}`);
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
      const plan = genWeek.lesson_plan;
      const weekTag = `Week ${genWeek.week}: ${genWeek.topic}`;
      const dueDate = new Date(Date.now() + 7 * 864e5).toISOString().split('T')[0];
      const projDue = new Date(Date.now() + 14 * 864e5).toISOString().split('T')[0];

      if (genContentType === 'cbt') {
        const q = new URLSearchParams({
          course_id: selectedCourse.id,
          program_id: selectedProgram?.id || selectedCourse.program_id || '',
          topic: genWeek.topic,
          week: String(genWeek.week),
          curriculum_id: curriculum?.id ?? curriculumList[0]?.id ?? '',
        });
        router.push(`/dashboard/cbt/new?${q.toString()}`);
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
        const currId = curriculum?.id ?? curriculumList[0]?.id;
        const res = await fetch('/api/assignments', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: plan?.assignment?.title || `${weekTag} — Assignment`,
            description: weekTag,
            instructions: plan?.assignment?.instructions || (genWeek.subtopics ?? []).join('\n'),
            assignment_type: 'homework',
            due_date: dueDate,
            max_points: 100,
            is_active: true,
            course_id: selectedCourse.id,
            metadata: { source: 'generate-content', curriculum_id: currId, week: genWeek.week }
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to create assignment');
        router.push(`/dashboard/assignments/${json.data.id}`);
        return;
      }
      if (genContentType === 'project') {
        const currId = curriculum?.id ?? curriculumList[0]?.id;
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
            metadata: { source: 'generate-content', curriculum_id: currId, week: genWeek.week },
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to create project');
        router.push(`/dashboard/assignments/${json.data.id}`);
        return;
      }

      // @ts-ignore - TS thinks genContentType is narrowed away, but it's valid
      if (genContentType === 'flashcard') {
        const currId = curriculum?.id ?? curriculumList[0]?.id;
        const res = await fetch('/api/flashcards/decks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: weekTag,
            description: `Syllabus-aligned flashcards for ${selectedCourse.title}`,
            course_id: selectedCourse.id,
            tags: ['curriculum', genWeek.topic],
            metadata: {
              source: 'curriculum-gen',
              curriculum_id: currId,
              week: genWeek.week
            }
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to create flashcard deck');

        const q = new URLSearchParams({
          deckId: json.data.id,
          topic: genWeek.topic,
          autoGenerate: 'true',
          course_id: selectedCourse.id,
          curriculum_id: currId || '',
          week: String(genWeek.week)
        });
        router.push(`/dashboard/flashcards?${q.toString()}`);
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
      toast.success(next ? 'Syllabus published to school' : 'Syllabus unpublished');
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
  const weeks = curriculum?.content?.terms?.find(t => t.term === activeTerm)?.weeks ?? [];
  const linkedLessons: any[] = []; // Default empty array since it's not loaded
  // Generate tab
  const genSelectedTypeDef = CONTENT_TYPES.find(t => t.key === genContentType);
  const canGenerateContent = !!selectedCourse && !!genWeek && !!genContentType;
  const scopeLabel = generateScope === 'platform'
    ? 'Shared (all schools)'
    : assignedSchools.find((s) => s.id === generateScope)?.name ?? 'Selected school';

  const expandAllPrograms = useCallback(() => {
    setExpandedPrograms(new Set(programs.map((p) => p.id)));
  }, [programs]);


  // ── Auth loading guard — prevents role-based flash ──────────────────────
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Learner / School read-only layout ───────────────────────────────────
  if (learnerMode || isSchool) {
    return (
      <div className="flex flex-col min-h-screen bg-background text-foreground">
        <div className="shrink-0 border-b border-border bg-card px-4 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-red-600">Course Syllabus</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {selectedCourse ? selectedCourse.title : 'Select a course to view its syllabus'}
          </p>
        </div>

        <div className="flex-1 px-4 py-6 max-w-4xl mx-auto w-full">
          {!selectedCourse ? (
            <div className="space-y-4">
              {programs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                  <BookOpenIcon className="w-10 h-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No courses available for your school yet.</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {quickChooserCourses.length} course{quickChooserCourses.length !== 1 ? 's' : ''} available
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {quickChooserCourses.map(({ prog, course }) => (
                      <button
                        key={course.id}
                        type="button"
                        onClick={() => selectCourse(prog, course)}
                        className="text-left border border-border bg-card hover:border-primary/40 hover:bg-muted/20 p-4 space-y-1.5 transition-colors"
                      >
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-black truncate">{prog.name}</p>
                        <p className="text-sm font-bold text-foreground line-clamp-2">{course.title}</p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-brand-red-600">View syllabus →</p>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : loadingCurr ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
              <p className="text-sm text-rose-400">{loadError}</p>
              <button onClick={() => setSelectedCourse(null)} className="text-xs text-muted-foreground border border-border px-3 py-1.5 hover:bg-muted/30">← Back to courses</button>
            </div>
          ) : !curriculum ? (
            <div className="flex flex-col items-center justify-center h-64 text-center space-y-3">
              <BookOpenIcon className="w-12 h-12 text-muted-foreground/30" />
              <div>
                <p className="font-bold text-sm">{selectedCourse.title}</p>
                <p className="text-muted-foreground text-sm mt-1">Syllabus not published yet — check back soon.</p>
              </div>
              <button onClick={() => setSelectedCourse(null)} className="text-xs text-primary border border-primary/30 px-3 py-1.5 hover:bg-primary/10">← Back to courses</button>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <button onClick={() => { setSelectedCourse(null); setCurriculum(null); }} className="text-xs text-muted-foreground hover:text-foreground transition-colors">← Courses</button>
                <span className="text-muted-foreground/40">›</span>
                <span className="text-xs font-bold text-primary">{selectedCourse.title}</span>
              </div>
              <SyllabusPreview
                content={curriculum.content as unknown as SyllabusContent}
                courseTitle={selectedCourse.title}
                audienceIsLearner
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Render (staff: teacher / admin) ─────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {/* Header — search + course context */}
      <div className="shrink-0 border-b border-border bg-card z-20">
        <div className="px-4 py-3 max-w-[1800px] mx-auto flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-red-600">
              {selectedCourse ? `${selectedProgram?.name ?? 'Program'} › ${selectedCourse.title}` : 'Course Syllabus Builder'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowHelp(h => !h)}
            className="shrink-0 px-3 py-2 text-[10px] font-black uppercase tracking-widest border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
          >
            {showHelp ? 'Hide guide' : '? How to use'}
          </button>
          <div className="flex flex-col sm:flex-row gap-2 w-full md:max-w-lg shrink-0">            <div className="relative flex-1 min-w-0">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
              placeholder="Filter programmes & courses…"
              className="w-full pl-9 pr-3 py-2.5 text-sm bg-muted/30 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              aria-label="Filter programmes and courses"
            />
          </div>
            {canTrack && programs.length > 0 && (
              <button
                type="button"
                onClick={expandAllPrograms}
                className="shrink-0 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest border border-border bg-card hover:bg-muted/30 text-foreground"
              >
                Expand all
              </button>
            )}
          </div>
        </div>
        {/* Removed "Syllabus copy" selector from header — version picker lives inside the Syllabus tab */}
      </div>

      {/* ── How to use guide ── */}
      {showHelp && (
        <div className="shrink-0 border-b border-primary/20 bg-primary/5 px-4 py-4">
          <div className="max-w-[1800px] mx-auto space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-brand-red-600">How to build a syllabus — step by step</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <div className="bg-card border border-border p-3 space-y-1">
                <p className="font-black text-primary">1. Planning Phase</p>
                <p className="text-muted-foreground">Build your Syllabus here. Once ready, use the <strong>"Deploy to Class"</strong> button to create an active Lesson Plan for your students.</p>
              </div>
              <div className="bg-card border border-border p-3 space-y-1">
                <p className="font-black text-primary">2. Teaching Phase</p>
                <p className="text-muted-foreground">Use the Lesson Engine and Activity Studio to build the actual content based on your approved syllabus.</p>
              </div>
              <div className="bg-card border border-border p-3 space-y-1">
                <p className="font-black text-primary">3. Delivery Phase</p>
                <p className="text-muted-foreground">Mark weeks as completed. This automatically updates reports for the School and Parents.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row flex-1 min-h-0 w-full min-h-screen">

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
                      <span className="text-primary">{selectedCourse.title}</span>
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
                className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-brand-red-600 border border-primary/30 px-2 py-1.5"
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
                    className={`snap-start shrink-0 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest transition ${active
                      ? 'bg-primary/15 border-primary/40 text-primary'
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
              <SparklesIcon className="w-4 h-4 text-primary" />
              <h2 className="text-xs font-black uppercase tracking-widest text-foreground">Catalog</h2>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Use the search bar above to filter. Click another course anytime — your work is per course.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {programs.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="w-8 h-8 border-2 border-dashed border-border flex items-center justify-center mx-auto mb-4">
                  <AcademicCapIcon className="w-4 h-4 text-muted-foreground/30" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-4">No tracks found</p>
              </div>
            ) : filteredPrograms.length === 0 ? (
              <div className="px-4 py-8 text-center space-y-2">
                <p className="text-xs text-muted-foreground">No programmes or courses match &ldquo;{catalogQuery.trim()}&rdquo;.</p>
                <button
                  type="button"
                  onClick={() => setCatalogQuery('')}
                  className="text-[10px] font-black uppercase tracking-widest text-brand-red-600 border border-primary/30 px-2 py-1"
                >
                  Clear search
                </button>
              </div>
            ) : filteredPrograms.map(prog => {
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
                      ? <ChevronDownIcon className="w-4 h-4 text-primary shrink-0" />
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
                          return (
                            <button
                              key={course.id}
                              onClick={() => selectCourse(prog, course)}
                              className={`w-full flex items-center gap-3 pl-10 pr-4 py-3 text-left transition-all relative group ${isSelected
                                ? 'text-primary bg-primary/5'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                                }`}
                            >
                              {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />}
                              <span className="text-[12px] font-bold truncate tracking-tight">{course.title}</span>
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
              className="sticky top-0 z-20 flex overflow-x-auto snap-x snap-mandatory border-b border-white/5 bg-background/80 backdrop-blur-xl px-2 sm:px-4 shrink-0 [-webkit-overflow-scrolling:touch]"
              role="tablist"
              aria-label="Curriculum views"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'syllabus'}
                onClick={() => setActiveTab('syllabus')}
                className={`snap-start shrink-0 flex items-center gap-2 min-h-[56px] px-5 py-3 text-[11px] font-black uppercase tracking-[0.2em] border-b-2 transition-all duration-300 touch-manipulation ${activeTab === 'syllabus'
                  ? 'border-primary text-primary bg-primary/5 shadow-[inset_0_-2px_0_0_rgba(255,107,0,0.5)]'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-white/5'
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
                  className={`snap-start shrink-0 flex items-center gap-2 min-h-[56px] px-5 py-3 text-[11px] font-black uppercase tracking-[0.2em] border-b-2 transition-all duration-300 touch-manipulation ${activeTab === 'generate'
                    ? 'border-primary text-primary bg-primary/5 shadow-[inset_0_-2px_0_0_rgba(255,107,0,0.5)]'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-white/5'
                    }`}
                >
                  <SparklesIcon className="w-4 h-4 shrink-0" aria-hidden />
                  <span className="whitespace-nowrap">Create Content</span>
                </button>
              )}
              {curriculum && canTrack && (
                <>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'implementations'}
                    onClick={() => setActiveTab('implementations')}
                    className={`snap-start shrink-0 flex items-center gap-2 min-h-[56px] px-5 py-3 text-[11px] font-black uppercase tracking-[0.2em] border-b-2 transition-all duration-300 touch-manipulation ${activeTab === 'implementations'
                      ? 'border-primary text-primary bg-primary/5 shadow-[inset_0_-2px_0_0_rgba(255,107,0,0.5)]'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-white/5'
                      }`}
                  >
                    <ClipboardDocumentListIcon className="w-4 h-4 shrink-0" aria-hidden />
                    <span className="whitespace-nowrap">Class Plans</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'delivery'}
                    onClick={() => setActiveTab('delivery')}
                    className={`snap-start shrink-0 flex items-center gap-2 min-h-[56px] px-5 py-3 text-[11px] font-black uppercase tracking-[0.2em] border-b-2 transition-all duration-300 touch-manipulation ${activeTab === 'delivery'
                      ? 'border-violet-500 text-violet-400 bg-violet-500/5 shadow-[inset_0_-2px_0_0_rgba(139,92,246,0.5)]'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-white/5'
                      }`}
                  >
                    <ChartBarIcon className="w-4 h-4 shrink-0" aria-hidden />
                    <span className="whitespace-nowrap">Progress</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'tools'}
                    onClick={() => setActiveTab('tools')}
                    className={`snap-start shrink-0 flex items-center gap-2 min-h-[56px] px-5 py-3 text-[11px] font-black uppercase tracking-[0.2em] border-b-2 transition-all duration-300 touch-manipulation ${activeTab === 'tools'
                      ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5 shadow-[inset_0_-2px_0_0_rgba(6,182,212,0.5)]'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-white/5'
                      }`}
                  >
                    <Squares2X2Icon className="w-4 h-4 shrink-0" aria-hidden />
                    <span className="whitespace-nowrap">Tools</span>
                  </button>
                </>
              )}
            </div>
          )}


          {/* Generate Content Tab */}
          {activeTab === 'generate' && selectedCourse && (
            <div className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-6 pb-10">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
                  <SparklesIcon className="w-5 h-5 text-primary" />
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
                <div className="px-5 py-3 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
                  <p className="text-[10px] font-black uppercase tracking-widest text-brand-red-600">Choose a Week</p>
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
                            (t.weeks ?? []).map(w => ({ ...w, termNumber: t.term }))
                          ).find(w => w.termNumber === tNum && w.week === wNum);
                          setGenWeek(found ?? null);
                          setGenContentType(null);
                        }}
                        className={SELECT_CLS}
                      >
                        <option value="">— Select Week —</option>
                        {[...(curriculum.content.terms ?? [])].sort((a, b) => a.term - b.term).map(term => (
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
                  <div className="px-5 py-3 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
                    <p className="text-[10px] font-black uppercase tracking-widest text-brand-red-600">What to Create</p>
                  </div>
                  <div className="p-5 space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
                      {CONTENT_TYPES.map(t => {
                        const Icon = t.icon;
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
                  className="w-full min-h-[52px] py-4 px-4 bg-primary hover:bg-primary active:bg-orange-700 disabled:opacity-50 text-white font-black text-sm flex items-center justify-center gap-2 transition-all touch-manipulation rounded-none"
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
                <div className="h-full min-h-[60vh] px-4 py-8">
                  <div className="max-w-5xl mx-auto space-y-5">
                    {/* Continue editing — shown while auto-restore is in flight or as manual fallback */}
                    {lastVisited && (
                      <div className="group relative overflow-hidden bg-card border border-primary/20 p-6 flex flex-col sm:flex-row sm:items-center gap-6 shadow-2xl transition-all hover:border-primary/40">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                          <RocketLaunchIcon className="w-24 h-24 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0 relative z-10">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Resume Planning</p>
                          </div>
                          <h3 className="text-xl font-black text-foreground truncate mb-1">{lastVisited.courseTitle}</h3>
                          <p className="text-xs text-muted-foreground truncate opacity-80">{lastVisited.progName}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const prog = programs.find(p => p.id === lastVisited.progId);
                            const course = prog?.courses?.find(c => c.id === lastVisited.courseId);
                            if (prog && course) { selectCourse(prog, course); return; }
                            setSelectedCourse({ id: lastVisited.courseId, title: lastVisited.courseTitle, is_active: true });
                            loadCurriculum(lastVisited.courseId);
                          }}
                          className="relative z-10 shrink-0 flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primary text-white text-[11px] font-black uppercase tracking-[0.2em] transition-all shadow-xl shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0"
                        >
                          <ArrowRightIcon className="w-4 h-4" /> Open Blueprint
                        </button>
                      </div>
                    )}
                    {!lastVisited && (
                      <div className="py-12 px-6 text-center border border-dashed border-white/10 bg-card/20 relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="relative z-10 max-w-lg mx-auto">
                          <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-6">
                            <BookOpenIcon className="w-8 h-8 text-primary" />
                          </div>
                          <h2 className="text-2xl font-black mb-3 text-white tracking-tight">Academic Planning Hub</h2>
                          <p className="text-muted-foreground text-sm leading-relaxed">
                            Start your planning cycle by selecting a course from the catalog.
                            Create blueprints, implement them to specific classes, and track your teaching journey.
                          </p>
                          <div className="mt-8 flex items-center justify-center gap-4 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                            <span className="flex items-center gap-1.5"><SparklesIcon className="w-3.5 h-3.5" /> 1. Strategy</span>
                            <span className="w-1 h-1 rounded-full bg-white/20" />
                            <span className="flex items-center gap-1.5"><RocketLaunchIcon className="w-3.5 h-3.5" /> 2. Execution</span>
                          </div>
                        </div>
                      </div>
                    )}
                    {globalImplementationList.length > 0 && !lastVisited && (
                      <div className="space-y-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-violet-400">Active Class Plans</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {globalImplementationList.map(plan => (
                            <Link
                              key={plan.id}
                              href={`/dashboard/lesson-plans/${plan.id}`}
                              className="group bg-card border border-border hover:border-violet-500/50 p-4 transition-all flex flex-col gap-3"
                            >
                              <div className="flex items-start justify-between min-w-0">
                                <div className="min-w-0">
                                  <h5 className="text-xs font-black group-hover:text-violet-400 transition-colors truncate">{plan.classes?.name}</h5>
                                  <p className="text-[10px] text-muted-foreground truncate font-bold uppercase tracking-widest">{plan.courses?.title}</p>
                                </div>
                                <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 border border-violet-500/30 text-violet-400 bg-violet-500/5 shrink-0">
                                  {plan.term}
                                </span>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="bg-card border border-border p-4 sm:p-5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-brand-red-600 mb-3">
                        {lastVisited ? 'Or pick a different course' : 'Quick course grid'}
                      </p>
                      {(isTeacher || isSchool) && (
                        <p className="text-[11px] text-muted-foreground mb-3">
                          School-based list: showing courses linked to classes in your school scope.
                        </p>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {quickChooserCourses.map(({ prog, course }) => (
                          <button
                            key={course.id}
                            type="button"
                            onClick={() => selectCourse(prog, course)}
                            className="text-left border border-border bg-background hover:border-primary/40 hover:bg-muted/30 transition-colors p-3 space-y-1"
                          >
                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-black truncate">
                              {prog.name}
                            </p>
                            <p className="text-sm font-bold text-foreground line-clamp-2">{course.title}</p>
                            <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                              Open syllabus
                            </p>
                          </button>
                        ))}
                      </div>
                      {quickChooserCourses.length === 0 && (
                        <p className="text-[11px] text-muted-foreground mt-3">
                          No courses found for current school scope yet. Add/assign classes first, or use the full sidebar catalog.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : loadingCurr ? (
                <div className="flex items-center justify-center h-64">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
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
                /* No curriculum yet — staff empty state */
                <div className="px-4 py-8 max-w-3xl mx-auto space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-black">{selectedCourse.title}</h2>
                      <p className="text-sm text-muted-foreground mt-0.5">No syllabus yet for this course.</p>
                    </div>
                    {canGenerate && (
                      <button
                        onClick={openGenerateModal}
                        className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary text-white font-bold text-sm transition-colors shrink-0"
                      >
                        <SparklesIcon className="w-4 h-4" /> Generate Syllabus
                      </button>
                    )}
                  </div>
                  {curriculumList.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {curriculumList.map((c) => {
                        const schoolName = c.schools?.name ?? (c.school_id ? 'School' : 'Platform');
                        const terms = c.content?.terms?.length ?? 0;
                        const weeks = (c.content?.terms ?? []).reduce((sum: number, t: any) => sum + ((t?.weeks ?? []).length), 0);
                        return (
                          <button
                            key={c.id}
                            onClick={() => { void selectCurriculumVersion(c.id); }}
                            className="text-left bg-card border border-border hover:border-primary/40 p-4 space-y-2 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-black text-foreground truncate">{schoolName}</p>
                              <span className="text-[10px] font-black uppercase tracking-wider text-primary">v{c.version}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              {terms} term{terms === 1 ? '' : 's'} · {weeks} week{weeks === 1 ? '' : 's'} · {new Date(c.created_at).toLocaleDateString()}
                            </p>
                            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Open this syllabus →</p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                /* Curriculum content */
                <div className="px-4 md:px-6 py-6 space-y-6 max-w-5xl">
                  {/* Header */}
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div>
                      <h1 className="text-xl font-black leading-tight">{curriculum.content.course_title}</h1>
                      <p className="text-xs text-muted-foreground mt-1">
                        v{curriculum.version} · {termCount} term{termCount !== 1 ? 's' : ''} · {allWeeks.length} weeks
                        {allWeeks.length > 0 && (
                          <span className="ml-2 text-emerald-400 font-bold">{progressPct}% delivered</span>
                        )}
                        {' · '}<span className="text-primary font-bold">{scopeLabel}</span>
                      </p>
                    </div>
                    <div className="flex flex-col gap-4">
                      {/* Top Row: View & Context */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Version switcher */}
                        {canGenerate && curriculumList.length > 1 && (
                          <div className="inline-flex items-center rounded-lg border border-white/10 bg-card/50 px-2.5 h-[36px] backdrop-blur-sm">
                            <span className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground mr-2 border-r border-white/10 pr-2.5 h-full flex items-center">v{curriculum.version}</span>
                            <select
                              value={curriculum.id}
                              onChange={(e) => selectCurriculumVersion(e.target.value)}
                              className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest text-primary focus:ring-0 p-0 pr-6 h-full cursor-pointer"
                            >
                              {curriculumList.map((c) => (
                                <option key={c.id} value={c.id} className="bg-[#0a0a0a] text-foreground">
                                  Version {c.version} — {c.school_id ? 'School' : 'Platform'}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Preview as role */}
                        {canGenerate && (
                          <div className="inline-flex rounded-lg border border-white/10 overflow-hidden bg-card/50 backdrop-blur-sm h-[36px]">
                            <span className="hidden sm:flex items-center text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground px-3 border-r border-white/10">
                              Preview
                            </span>
                            {(['student', 'parent', 'school'] as SyllabusPreviewRole[]).map((r) => (
                              <button
                                key={r}
                                onClick={() => setPreviewRole(r)}
                                className={`px-3 py-2 text-[9px] font-black uppercase tracking-widest transition-colors border-r border-white/10 last:border-0 ${previewRole === r ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}
                              >
                                {r}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Bottom Row: Actions */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {canGenerate && (
                          <div className="flex items-center gap-2">
                            {curriculum.is_visible_to_school ? (
                              <button
                                onClick={() => togglePublish(false)}
                                disabled={publishing}
                                className="flex items-center gap-2 px-4 py-2 text-[11px] font-black uppercase tracking-widest bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-all rounded-lg"
                              >
                                {publishing ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <PencilIcon className="w-3.5 h-3.5" />}
                                Edit Draft
                              </button>
                            ) : (
                              <button
                                onClick={() => togglePublish(true)}
                                disabled={publishing}
                                className="flex items-center gap-2 px-5 py-2 text-[11px] font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20 transition-all rounded-lg"
                              >
                                {publishing ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <CheckCircleIcon className="w-3.5 h-3.5" />}
                                Publish Blueprint
                              </button>
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-2 border-l border-white/10 pl-2 ml-1">
                          <Link
                            href="/dashboard/curriculum/progress"
                            className="flex items-center gap-2 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <ChartBarIcon className="w-3.5 h-3.5" /> Progress
                          </Link>
                          {canGenerate && (
                            <button
                              onClick={openGenerateModal}
                              className="flex items-center gap-2 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-primary hover:bg-primary/5 transition-all"
                            >
                              <ArrowPathIcon className="w-3.5 h-3.5" /> Regenerate
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Term tabs */}
                  {termCount > 0 && (
                    <div className="flex gap-2 bg-white/5 border border-white/10 p-1.5 w-fit rounded-xl backdrop-blur-sm">
                      {[...(curriculum.content.terms ?? [])].sort((a, b) => a.term - b.term).map(term => {
                        const termTracking = tracking.filter(t => t.term_number === term.term);
                        const termWeeks = term.weeks?.length ?? 0;
                        const termDone = termTracking.filter(t => t.status === 'completed').length;
                        const active = activeTerm === term.term;
                        return (
                          <button
                            key={term.term}
                            onClick={() => { setActiveTerm(term.term); setActiveWeek(null); }}
                            className={`relative flex flex-col items-center px-6 py-2.5 rounded-lg transition-all duration-300 ${active
                              ? 'bg-primary text-white shadow-lg shadow-primary/20'
                              : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                              }`}
                          >
                            <span className="text-xs font-black uppercase tracking-[0.1em]">Term {term.term}</span>
                            <span className={`text-[9px] font-black uppercase tracking-widest mt-0.5 opacity-60`}>
                              {termDone}/{termWeeks} Ready
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
                          <div
                            key={week.week}
                            className={`group relative border transition-all duration-500 ${isActive ? 'border-primary/50 bg-primary/5 shadow-[0_0_30px_rgba(255,107,0,0.1)]' : 'border-white/5 bg-card/40 hover:border-white/10 hover:bg-card/60 hover:shadow-xl'}`}
                          >
                            <div className={`absolute top-0 left-0 w-1 h-full transition-colors ${isActive ? 'bg-primary' : 'bg-transparent group-hover:bg-primary/20'}`} />
                            {editingWeekKey === `term${activeTerm}-week${week.week}` ? (
                              <div className="p-3 space-y-2" onClick={e => e.stopPropagation()}>
                                <p className="text-[10px] font-black uppercase tracking-widest text-brand-red-600">Week {week.week} · Edit</p>
                                <input
                                  autoFocus
                                  value={editWeekTopic}
                                  onChange={e => setEditWeekTopic(e.target.value)}
                                  placeholder="Week topic"
                                  className="w-full px-2 py-1.5 text-sm bg-muted/30 border border-border text-foreground rounded focus:outline-none focus:border-primary/50"
                                />
                                <input
                                  value={editWeekSubtopics}
                                  onChange={e => setEditWeekSubtopics(e.target.value)}
                                  placeholder="Subtopics, comma-separated"
                                  className="w-full px-2 py-1.5 text-xs bg-muted/30 border border-border text-foreground rounded focus:outline-none focus:border-primary/50"
                                />
                                <div className="flex gap-2 pt-1">
                                  <button
                                    onClick={saveWeekEdit}
                                    disabled={savingWeek}
                                    className="flex-1 py-1.5 text-xs font-black bg-primary hover:bg-primary text-white rounded transition-colors disabled:opacity-50"
                                  >
                                    {savingWeek ? '…' : 'Save'}
                                  </button>
                                  <button
                                    onClick={() => setEditingWeekKey(null)}
                                    className="px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground border border-border rounded transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                className="text-left p-5 w-full space-y-3"
                                onClick={() => { setActiveWeek(week); setNotesDraft(''); setAssignResult(null); }}
                              >
                                {/* Week number + type badge */}
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-[11px] font-black text-muted-foreground uppercase tracking-[0.2em] opacity-60">
                                    Week {week.week}
                                  </span>
                                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 border ${meta.color}`}>
                                    {meta.label}
                                  </span>
                                </div>

                                <div className="flex items-start gap-3">
                                  <div className={`p-2 rounded-lg bg-white/5 border border-white/5 group-hover:border-white/10 transition-colors`}>
                                    <WeekIcon className={`w-4 h-4 ${meta.color.split(' ')[0]}`} />
                                  </div>
                                  <h3 className="text-[13px] font-black text-foreground leading-tight group-hover:text-primary transition-colors line-clamp-2 min-h-[2.5em]">{week.topic}</h3>
                                </div>

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
                            )}
                            {canGenerate && editingWeekKey !== `term${activeTerm}-week${week.week}` && (
                              <button
                                onClick={() => {
                                  setEditingWeekKey(`term${activeTerm}-week${week.week}`);
                                  setEditWeekTopic(week.topic);
                                  setEditWeekSubtopics((week.subtopics ?? []).join(', '));
                                  setActiveWeek(null);
                                }}
                                className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] font-bold text-muted-foreground/50 hover:text-primary hover:bg-primary/5 transition-colors border-t border-border"
                                title="Edit week topic"
                              >
                                <PencilIcon className="w-3 h-3" /> Edit topic
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Materials + tools */}
                  {(curriculum.content.materials_required?.length > 0 || curriculum.content.recommended_tools?.length > 0) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {curriculum.content.materials_required?.length > 0 && (
                        <div className="bg-card border border-border p-4">
                          <h3 className="text-[11px] font-black uppercase tracking-widest text-primary mb-3">Materials Required</h3>
                          <ul className="space-y-1">
                            {curriculum.content.materials_required.map((m, i) => (
                              <li key={i} className="flex gap-2 text-xs text-foreground/70">
                                <span className="text-primary">•</span>{m}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {curriculum.content.recommended_tools?.length > 0 && (
                        <div className="bg-card border border-border p-4">
                          <h3 className="text-[11px] font-black uppercase tracking-widest text-primary mb-3">Recommended Tools</h3>
                          <ul className="space-y-1">
                            {curriculum.content.recommended_tools.map((t, i) => (
                              <li key={i} className="flex gap-2 text-xs text-foreground/70">
                                <span className="text-primary">•</span>{t}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Push to Class CTA — bottom of Syllabus tab ── */}
                  {canTrack && (
                    <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 px-4 py-4 bg-violet-600/10 border border-violet-500/20">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-foreground">Ready to teach this syllabus?</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">Push it to a class to create a live Lesson Plan your students can follow.</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setActiveTab('implementations')}
                          className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground border border-border px-3 py-2 transition-colors"
                        >
                          View Classes
                        </button>
                        <button
                          onClick={() => {
                            const sid = curriculum?.school_id || assignedSchools[0]?.id || '';
                            setImplError('');
                            setImplForm(f => ({ ...f, school_id: sid, class_id: '' }));
                            if (sid) fetch(`/api/classes?school_id=${sid}`).then(r => r.json()).then(j => setImplClasses(j.data || []));
                            else setImplClasses([]);
                            setShowImplement(true);
                          }}
                          className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-black uppercase tracking-widest transition-all"
                        >
                          <RocketLaunchIcon className="w-4 h-4 shrink-0" />
                          Push to Class
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Implementations Tab ── */}
          {activeTab === 'implementations' && selectedCourse && (
            <div className="mx-4 sm:mx-6 mb-6 space-y-6">
              {/* Explanation banner */}
              <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-4 flex items-start gap-3">
                <ClipboardDocumentListIcon className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-black text-violet-400 uppercase tracking-widest mb-1">What are Class Plans?</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Each entry below is a <strong className="text-foreground">Lesson Plan</strong> — this syllabus deployed to a specific class for a specific term.
                    Click any card to open the week-by-week planner. You can also manage all plans from the{' '}
                    <Link href="/dashboard/lesson-plans" className="text-violet-400 hover:underline font-bold">Lesson Plans page</Link>.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest text-foreground">Classes Using This Syllabus</h4>
                  <p className="text-[10px] text-muted-foreground">Each card is a lesson plan for one class — click to plan week by week</p>
                </div>
                <button
                  onClick={() => {
                    const sid = curriculum?.school_id || assignedSchools[0]?.id || '';
                    setImplError('');
                    setImplForm(f => ({ ...f, school_id: sid, class_id: '' }));
                    if (sid) fetch(`/api/classes?school_id=${sid}`).then(r => r.json()).then(j => setImplClasses(j.data || []));
                    else setImplClasses([]);
                    setShowImplement(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  <PlusIcon className="w-3 h-3" />
                  Deploy to Another Class
                </button>
              </div>

              {implementationList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-border rounded-2xl gap-3">
                  <ClipboardDocumentListIcon className="w-12 h-12 text-muted-foreground/20" />
                  <p className="text-xs font-bold text-muted-foreground">No classes are using this syllabus yet.</p>
                  <p className="text-[10px] text-muted-foreground max-w-xs text-center">Deploy this syllabus to a class to start planning lessons week by week.</p>
                  <button
                    onClick={() => setShowImplement(true)}
                    className="text-violet-400 text-xs font-black uppercase tracking-widest hover:underline"
                  >
                    Deploy to a Class →
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {implementationList.map((plan: any) => (
                    <Link
                      key={plan.id}
                      href={`/dashboard/lesson-plans/${plan.id}`}
                      className="group relative bg-card border border-white/5 hover:border-primary/40 p-6 transition-all duration-300 flex flex-col gap-5 overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1"
                    >
                      <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ArrowRightIcon className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex items-start justify-between relative z-10">
                        <div className="min-w-0">
                          <h5 className="text-[15px] font-black group-hover:text-primary transition-colors truncate mb-1">{plan.classes?.name || 'Unnamed Class'}</h5>
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-[0.1em]">{plan.term || 'No Term'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`text-[9px] font-black uppercase tracking-[0.15em] px-2.5 py-1 rounded-md border ${plan.status === 'published' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5 shadow-[0_0_10px_rgba(16,185,129,0.1)]' : 'border-white/10 text-muted-foreground bg-white/5'
                            }`}>
                            {plan.status || 'draft'}
                          </span>
                          <button
                            onClick={(e) => deleteImplementation(plan.id, e)}
                            disabled={deletingImpl === plan.id}
                            className="p-1.5 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 rounded-md transition-all disabled:opacity-30"
                            title="Delete this implementation"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-auto flex items-center gap-6 text-[10px] text-muted-foreground font-black uppercase tracking-[0.15em] opacity-70">
                        <span className="flex items-center gap-2"><CalendarDaysIcon className="w-3.5 h-3.5" /> {new Date(plan.term_start).toLocaleDateString()}</span>
                        <span className="flex items-center gap-2"><RocketLaunchIcon className="w-3.5 h-3.5" /> {plan.sessions_per_week || 0} sessions</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {/* Next Step hint: prompt to implement when no class uses this syllabus yet */}
              {curriculum && canTrack && implementationList.length === 0 && (
                <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 bg-violet-500/5 border border-violet-500/20 rounded-xl">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <RocketLaunchIcon className="w-5 h-5 text-violet-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-black text-violet-300">Syllabus ready — next step is to push it to a class</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Pick a school, a class, and a term to create a lesson plan from this syllabus.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const sid = curriculum.school_id || assignedSchools[0]?.id || '';
                      setImplError('');
                      setImplForm(f => ({ ...f, school_id: sid, class_id: '' }));
                      if (sid) fetch(`/api/classes?school_id=${sid}`).then(r => r.json()).then(j => setImplClasses(j.data || []));
                      else setImplClasses([]);
                      setShowImplement(true);
                    }}
                    className="shrink-0 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-widest bg-violet-600 hover:bg-violet-500 text-white transition-all"
                  >
                    <RocketLaunchIcon className="w-4 h-4" />
                    Push to Class
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Progress Tab ── */}
          {activeTab === 'delivery' && curriculum && (
            <div className="mx-4 sm:mx-6 mb-6 space-y-6">
              <div className="bg-violet-600/5 border border-violet-500/20 p-4 rounded-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-violet-500/10 flex items-center justify-center border border-violet-500/20">
                      <ChartBarIcon className="w-5 h-5 text-violet-400" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-widest text-violet-300">Curriculum Progress</h4>
                      <p className="text-[10px] text-muted-foreground">Status of this syllabus across your assigned classes</p>
                    </div>
                  </div>

                  {(() => {
                    const terms = curriculum.content?.terms ?? [];
                    const allWeeks = terms.flatMap((t: any) => t.weeks ?? []);
                    const totalWeeks = allWeeks.length;
                    const completed = tracking.filter(t => t.status === 'completed').length;
                    const inProgress = tracking.filter(t => t.status === 'in_progress').length;
                    const pct = totalWeeks > 0 ? Math.round((completed / totalWeeks) * 100) : 0;

                    return (
                      <div className="flex-1 max-w-md space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider">
                          <span className="text-violet-300">{completed} / {totalWeeks} Weeks Taught</span>
                          <span className="text-violet-400">{pct}%</span>
                        </div>
                        <div className="h-2 bg-violet-500/10 rounded-full overflow-hidden border border-violet-500/20">
                          <div
                            className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 transition-all duration-1000 ease-out"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex items-center gap-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                          <span className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {completed} Taught
                          </span>
                          <span className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> {inProgress} In Progress
                          </span>
                          <span className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" /> {totalWeeks - completed - inProgress} Pending
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(curriculum.content.terms ?? []).map((term: any) => {
                  const termWeeks = term.weeks ?? [];
                  const termCompleted = tracking.filter(t => t.term_number === term.term && t.status === 'completed').length;
                  const termPct = termWeeks.length > 0 ? Math.round((termCompleted / termWeeks.length) * 100) : 0;
                  return (
                    <div key={term.term} className="bg-card border border-border p-4 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Term {term.term}</p>
                        <span className="text-xs font-black text-violet-400">{termPct}%</span>
                      </div>
                      <div className="h-1 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500" style={{ width: `${termPct}%` }} />
                      </div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase">{termCompleted} / {termWeeks.length} Completed</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Tools Tab ── */}
          {activeTab === 'tools' && curriculum && (
            <div className="mx-4 sm:mx-6 space-y-6 pb-10">
              {/* Course Overview */}
              {curriculum.content.overview && (
                <div className="bg-card border border-border p-6 relative overflow-hidden group rounded-xl">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl pointer-events-none" />
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-brand-red-600 mb-4 flex items-center gap-2">
                    <InformationCircleIcon className="w-3 h-3" />
                    Course Overview
                  </h3>
                  <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line relative z-10">{curriculum.content.overview}</p>
                </div>
              )}

              {/* Learning outcomes */}
              {curriculum.content.learning_outcomes?.length > 0 && (
                <div className="bg-card border border-border p-6 rounded-xl">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-primary mb-4">Learning Outcomes</h3>
                  <ul className="space-y-2">
                    {curriculum.content.learning_outcomes.map((o, i) => (
                      <li key={i} className="flex gap-3 text-sm text-foreground/80">
                        <span className="text-primary font-black shrink-0 text-xs mt-0.5">{i + 1}.</span>
                        <span>{o}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Standard Teaching Path (QA Spine) — optional, action-focused */}
              {canGenerate && (
                <div className="bg-card border border-border space-y-0">
                  <button
                    type="button"
                    onClick={() => { setQaSpineOpen((o) => !o); setQaApplyErr(''); setQaPreviewErr(''); }}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ChartBarIcon className="w-4 h-4 text-cyan-400 shrink-0" />
                      <div>
                        <p className="text-xs font-black text-foreground">Standard Teaching Path</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Optional — align this syllabus to a pre-built curriculum sequence</p>
                      </div>
                    </div>
                    {qaSpineOpen
                      ? <ChevronDownIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                      : <ChevronRightIcon className="w-4 h-4 text-muted-foreground shrink-0" />}
                  </button>

                  <AnimatePresence>
                    {qaSpineOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-border"
                      >
                        <div className="p-4 space-y-4">
                          {!programIdForQa ? (
                            <p className="text-[11px] text-amber-400">This course has no programme linked — fix the course catalog first before applying a teaching path.</p>
                          ) : (
                            <>
                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Pick your class, preview the week-by-week sequence, then apply it to this syllabus (v{curriculum.version}).
                                Skip this step entirely if you prefer to build your own week order from scratch.
                              </p>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                  <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block">Class</label>
                                  <select
                                    className={SELECT_CLS}
                                    value={qaClassId}
                                    onChange={(e) => { setQaClassId(e.target.value); setQaPreviewData(null); setQaPreviewStamp(''); }}
                                  >
                                    <option value="">— Select class —</option>
                                    {[...qaClassOptions]
                                      .sort((a, b) => {
                                        const ap = a.program_id === programIdForQa ? 0 : 1;
                                        const bp = b.program_id === programIdForQa ? 0 : 1;
                                        if (ap !== bp) return ap - bp;
                                        return (a.name || '').localeCompare(b.name || '');
                                      })
                                      .map((c) => (
                                        <option key={c.id} value={c.id}>
                                          {c.name || c.id}{c.program_id && c.program_id !== programIdForQa ? ' · other programme' : ''}
                                        </option>
                                      ))}
                                  </select>
                                </div>

                                <div className="space-y-1.5">
                                  <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block">Teaching year</label>
                                  <select
                                    className={SELECT_CLS}
                                    value={qaYear}
                                    onChange={(e) => { setQaYear(Number(e.target.value)); setQaPreviewStamp(''); }}
                                  >
                                    <option value={1}>Year 1</option>
                                    <option value={2}>Year 2</option>
                                    <option value={3}>Year 3</option>
                                  </select>
                                </div>
                              </div>

                              {qaClassId && (
                                <div className="flex gap-2 flex-wrap">
                                  <button
                                    type="button"
                                    disabled={qaClassGradeMode === 'optional' || qaClassModeSaving}
                                    onClick={() => void saveQaClassGradeMode('optional')}
                                    className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border transition-colors ${qaClassGradeMode === 'optional' ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' : 'border-border text-muted-foreground hover:bg-muted/30'} disabled:opacity-60`}
                                  >Flexible (recommended)</button>
                                  <button
                                    type="button"
                                    disabled={qaClassGradeMode === 'compulsory' || qaClassModeSaving}
                                    onClick={() => void saveQaClassGradeMode('compulsory')}
                                    className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border transition-colors ${qaClassGradeMode === 'compulsory' ? 'border-primary/40 bg-primary/10 text-orange-200' : 'border-border text-muted-foreground hover:bg-muted/30'} disabled:opacity-60`}
                                  >Compulsory</button>
                                  {qaClassModeErr && <p className="text-[10px] text-rose-400 font-bold w-full">{qaClassModeErr}</p>}
                                </div>
                              )}

                              <label className="flex items-start gap-2 cursor-pointer">
                                <input type="checkbox" className="mt-0.5" checked={qaOverwrite} onChange={(e) => setQaOverwrite(e.target.checked)} />
                                <span className="text-[11px] text-muted-foreground">Replace existing weeks (if unchecked, only empty terms are filled)</span>
                              </label>

                              <div className="flex gap-2 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => void runQaSpinePreview()}
                                  disabled={!qaClassId || qaPreviewLoading}
                                  className="inline-flex items-center gap-1.5 px-4 py-2 text-[10px] font-black uppercase tracking-widest border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-50 transition-colors"
                                >
                                  {qaPreviewLoading ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <EyeIcon className="w-3.5 h-3.5" />}
                                  Preview sequence
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void applyQaSpine()}
                                  disabled={qaApplyLoading || !programIdForQa || qaNeedsFreshPreview}
                                  className="inline-flex items-center gap-1.5 px-4 py-2 text-[10px] font-black uppercase tracking-widest border border-primary/40 bg-primary/10 text-orange-200 hover:bg-primary/20 disabled:opacity-50 transition-colors"
                                >
                                  {qaApplyLoading ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <BoltIcon className="w-3.5 h-3.5" />}
                                  Apply to syllabus
                                </button>
                              </div>

                              {qaNeedsFreshPreview && <p className="text-amber-400 text-[10px]">Run Preview first before applying.</p>}
                              {qaPreviewErr && <p className="text-rose-400 text-[11px] font-bold">{qaPreviewErr}</p>}
                              {qaApplyErr && <p className="text-rose-400 text-[11px] font-bold">{qaApplyErr}</p>}

                              {qaPreviewData && (
                                <div className="p-3 bg-muted/20 border border-border space-y-3">
                                  <p className="text-[10px] font-black uppercase text-cyan-300">
                                    Preview — path {qaPreviewData.lane_index} · {qaPreviewData.lane_source} · offset {qaPreviewData.path_offset}
                                  </p>
                                  {qaPreviewData.terms.map((t) => (
                                    <div key={t.term}>
                                      <p className="text-[9px] font-black text-muted-foreground mb-1">Term {t.term}</p>
                                      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-0.5 text-[10px] text-muted-foreground max-h-32 overflow-y-auto">
                                        {t.weeks.map((w) => (
                                          <li key={w.week} className="flex gap-1.5 truncate">
                                            <span className="shrink-0 text-foreground/60 font-bold">W{w.week}</span>
                                            <span className="truncate">{w.topic}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}

                          <div className="pt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                            <Link href="/dashboard/progression/qa-spine-catalog" className="text-cyan-400 hover:underline font-bold">
                              View catalog details →
                            </Link>
                            <span>·</span>
                            <Link href="/dashboard/curriculum/learning-system" className="text-muted-foreground hover:text-foreground">
                              How this works
                            </Link>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ── Week Detail Panel ── */}
      {activeWeek && (
        /* Mobile: bottom sheet (slide up, max 92vh)
           Desktop md+: right side panel (max-w-2xl) */
        <div className="fixed inset-0 z-50 flex flex-col justify-end md:flex-row md:justify-end">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setActiveWeek(null)}
          />
          <div className="relative w-full md:max-w-2xl bg-background md:border-l border-t md:border-t-0 border-border flex flex-col max-h-[92vh] md:h-full overflow-hidden shadow-2xl rounded-t-2xl md:rounded-none">
            {/* Drag handle on mobile */}
            <div className="md:hidden flex justify-center pt-2.5 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            {/* Panel header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-border bg-card shrink-0">
              <div className="flex-1 min-w-0 mr-3">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 border ${WEEK_META[activeWeek.type]?.color}`}>
                    Week {activeWeek.week} · {WEEK_META[activeWeek.type]?.label}
                  </span>
                  {getTracking(activeTerm, activeWeek.week) && (
                    <span className={`text-[9px] font-bold ${TRACK_META[getTracking(activeTerm, activeWeek.week)!.status].color}`}>
                      {TRACK_META[getTracking(activeTerm, activeWeek.week)!.status].label}
                    </span>
                  )}
                </div>
                <h2 className="text-base font-black leading-tight">{activeWeek.topic}</h2>
                {(activeWeek.subtopics ?? []).length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{(activeWeek.subtopics ?? []).join(' · ')}</p>
                )}
              </div>
              <button onClick={() => setActiveWeek(null)} className="text-muted-foreground hover:text-foreground transition-colors shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Panel body — overflow-x-hidden prevents horizontal panning */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5 space-y-6">

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
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40 min-h-[40px]"
                    >
                      <PencilIcon className="w-3.5 h-3.5" />
                      {creatingLesson ? 'Creating…' : 'Create Lesson'}
                    </button>
                    <button
                      onClick={() => createCbtFromWeek(activeWeek)}
                      disabled={creatingCbt}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-40 min-h-[40px]"
                    >
                      <BoltIcon className="w-3.5 h-3.5" />
                      Create CBT Quiz
                    </button>
                    <button
                      onClick={() => createFlashcardsFromWeek(activeWeek)}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/10 transition-colors min-h-[40px]"
                    >
                      <StarIcon className="w-3.5 h-3.5" />
                      Create Flashcards
                    </button>
                    <button
                      onClick={printWeek}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors min-h-[40px]"
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
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-colors min-h-[40px]"
                    >
                      <BoltIcon className="w-3.5 h-3.5" />
                      {activeWeek.type === 'examination' ? 'Create Exam CBT' : 'Create Assessment CBT'}
                    </button>
                    <button
                      onClick={printWeek}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-border text-muted-foreground hover:text-foreground transition-colors min-h-[40px]"
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
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border transition-all ${isCurrent
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
                  <p className="text-[11px] text-muted-foreground italic border-l-2 border-primary/40 pl-2">
                    "{getTracking(activeTerm, activeWeek.week)?.teacher_notes}"
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Generate Modal — bottom-sheet on mobile, centered on sm+ ── */}
      {showGenerate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
          <div className="bg-card border border-border w-full sm:max-w-lg sm:rounded-xl rounded-t-2xl flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
              <div>
                <h2 className="font-black flex items-center gap-2">
                  <SparklesIcon className="w-4 h-4 text-primary" />
                  {curriculum ? 'Regenerate' : 'Generate'} Syllabus
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">{selectedCourse?.title}</p>
              </div>
              <button onClick={() => setShowGenerate(false)} disabled={generating} className="p-1.5 hover:bg-white/5 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center">
                <XMarkIcon className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            {/* Scrollable body */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {curriculum && (
                <div className="bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-400 flex gap-2">
                  <ExclamationTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>This will create a new version (v{(curriculum.version ?? 0) + 1}). Existing tracking progress will be preserved.</span>
                </div>
              )}

              {canTrack && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Syllabus scope (unique per school)
                  </label>
                  <select
                    value={generateScope}
                    onChange={(e) => {
                      const scope = e.target.value === 'platform' ? 'platform' : e.target.value;
                      void syncScopeToCurriculum(scope);
                    }}
                    className={SELECT_CLS}
                  >
                    <option value="platform">Platform — shared Rillcod template (optional; use per-school rows for partners)</option>
                    {assignedSchools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — custom syllabus &amp; flow only for this school
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    The database keeps <span className="text-foreground font-bold">one syllabus per course per school</span>. Current target: <span className="text-foreground font-bold">{scopeLabel}</span>.
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Grade Level</label>
                    <select value={form.grade_level} onChange={e => setGradeForCurrentScope(e.target.value)} className={SELECT_CLS}>
                      {GRADE_LEVEL_OPTIONS.map(g => <option key={g}>{g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Terms</label>
                    <select value={form.term_count} onChange={e => setForm(p => ({ ...p, term_count: e.target.value }))} className={SELECT_CLS}>
                      {['1', '2', '3'].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Weeks/Term</label>
                    <select value={form.weeks_per_term} onChange={e => setForm(p => ({ ...p, weeks_per_term: e.target.value }))} className={SELECT_CLS}>
                      {['8', '10', '12'].map(w => <option key={w}>{w}</option>)}
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
            </div>

            {/* Sticky footer */}
            <div className="flex gap-3 p-4 sm:p-5 border-t border-border shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button
                onClick={() => setShowGenerate(false)}
                disabled={generating}
                className="flex-1 py-2.5 bg-background border border-border text-muted-foreground font-bold text-sm hover:bg-muted transition-colors disabled:opacity-40 min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={generate}
                disabled={generating}
                className="flex-1 py-2.5 bg-primary hover:bg-primary disabled:opacity-40 text-white font-bold text-sm transition-colors min-h-[44px]"
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
                      className={`px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest rounded border ${previewRole === r
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
                  className={`px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded border transition disabled:opacity-60 ${curriculum.is_visible_to_school
                    ? 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10'
                    : 'border-primary/50 text-primary hover:bg-primary/10'
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

      {/* Implementation Modal — The Bridge */}
      <AnimatePresence>
        {showImplement && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !implementing && setShowImplement(false)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-card border border-border shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-foreground">Deploy to Class</h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Push this blueprint to a specific class & schedule</p>
                </div>
                <button
                  onClick={() => setShowImplement(false)}
                  disabled={implementing}
                  className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {/* School → Class (class disabled until school is chosen) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">School <span className="text-rose-400">*</span></label>
                    <select
                      value={implForm.school_id}
                      onChange={e => {
                        const sid = e.target.value;
                        setImplForm(f => ({ ...f, school_id: sid, class_id: '' }));
                        if (sid) fetch(`/api/classes?school_id=${sid}`).then(r => r.json()).then(j => setImplClasses(j.data || []));
                        else setImplClasses([]);
                      }}
                      className={SELECT_CLS}
                    >
                      <option value="">— Select School —</option>
                      {assignedSchools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    {!implForm.school_id && <p className="text-[10px] text-amber-400 mt-1">Pick a school first to load its classes.</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Class / Group <span className="text-rose-400">*</span></label>
                    <select
                      value={implForm.class_id}
                      onChange={e => setImplForm(f => ({ ...f, class_id: e.target.value }))}
                      disabled={!implForm.school_id}
                      className={`${SELECT_CLS} disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <option value="">{!implForm.school_id ? 'Select school first…' : implClasses.length === 0 ? 'No classes found' : '— Select Class —'}</option>
                      {implClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>

                {/* Term + Academic Year (auto-fills dates) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Academic Year</label>
                    <select
                      value={implForm.academic_year}
                      onChange={e => setImplForm(f => ({ ...f, academic_year: e.target.value }))}
                      className={SELECT_CLS}
                    >
                      {academicYearOptions().map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Term</label>
                    <select
                      value={implForm.term}
                      onChange={e => setImplForm(f => ({ ...f, term: e.target.value }))}
                      className={SELECT_CLS}
                    >
                      <option value="1">First Term</option>
                      <option value="2">Second Term</option>
                      <option value="3">Third Term</option>
                    </select>
                  </div>
                </div>

                {/* Dates — auto-filled when term+year change, still editable */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Start Date <span className="text-violet-400 normal-case font-normal">(auto-filled)</span>
                    </label>
                    <input
                      type="date"
                      value={implForm.term_start}
                      onChange={e => setImplForm(f => ({ ...f, term_start: e.target.value }))}
                      className={INPUT_CLS}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      End Date <span className="text-violet-400 normal-case font-normal">(auto-filled)</span>
                    </label>
                    <input
                      type="date"
                      value={implForm.term_end}
                      onChange={e => setImplForm(f => ({ ...f, term_end: e.target.value }))}
                      className={INPUT_CLS}
                    />
                  </div>
                </div>

                {/* Sessions per week */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sessions Per Week</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={implForm.sessions_per_week}
                      onChange={e => setImplForm(f => ({ ...f, sessions_per_week: e.target.value }))}
                      className="flex-1 accent-violet-500"
                    />
                    <span className="w-8 text-center font-black text-foreground text-sm">{implForm.sessions_per_week}</span>
                  </div>
                </div>

                {implError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-start gap-2">
                    <ExclamationTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{implError}</span>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-border bg-muted/30 flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowImplement(false)}
                  disabled={implementing}
                  className="px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={deployToClass}
                  disabled={implementing}
                  className="flex items-center gap-2 px-6 py-2 bg-violet-600 hover:bg-violet-700 text-white font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50"
                >
                  {implementing ? (
                    <>
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                      Implementing…
                    </>
                  ) : (
                    <>
                      <RocketLaunchIcon className="w-4 h-4" />
                      Push to Class
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
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
    <div className="space-y-6 text-sm min-w-0">
      {/* Duration badge */}
      <div className="inline-flex items-center gap-3 px-4 py-2 bg-muted/30 border border-border max-w-full">
        <ClockIcon className="w-4 h-4 text-primary shrink-0" />
        <span className="text-[10px] text-muted-foreground font-black uppercase tracking-widest truncate">{plan.duration_minutes} Minute Session</span>
      </div>

      {/* Objectives */}
      {plan.objectives?.length > 0 && (
        <Section label="Learning Objectives" color="text-violet-400" icon={BoltIcon}>
          <ol className="space-y-2">
            {plan.objectives.map((o, i) => (
              <li key={i} className="flex gap-3 text-sm text-foreground/80">
                <span className="text-violet-400 font-black shrink-0 w-5 flex items-center justify-center bg-violet-400/10 text-[10px] h-5 border border-violet-400/20">{i + 1}</span>
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
            <Section label="Teacher Protocol" color="text-primary" icon={UserGroupIcon}>
              <ol className="space-y-3">
                {plan.teacher_activities.map((a, i) => (
                  <li key={i} className="flex gap-3 text-xs text-foreground/80 leading-relaxed">
                    <span className="text-primary font-black shrink-0 w-4">{i + 1}.</span>
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
            <div className="inline-flex items-center gap-2 text-[10px] text-amber-400 font-black uppercase tracking-widest bg-amber-400/5 max-w-full px-2 py-1 border border-amber-400/10 overflow-hidden">
              <ClockIcon className="w-3 h-3 shrink-0" />
              <span className="truncate">Deadline: {plan.assignment.due}</span>
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
    <div className="space-y-6 text-sm min-w-0">
      <div className={`inline-flex items-center gap-3 px-4 py-2 ${isExam ? 'bg-rose-500/10 border-rose-500/20' : 'bg-amber-500/10 border-amber-500/20'} border max-w-full overflow-hidden`}>
        <MainIcon className={`w-4 h-4 ${color} shrink-0`} />
        <span className={`text-[10px] ${color} font-black uppercase tracking-widest truncate`}>
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
                <span className={`${color} font-black shrink-0 w-4`}>{i + 1}.</span>
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
                <span className={`${color} font-black mr-3 text-[10px] uppercase tracking-tighter`}>Question {i + 1}</span>
                <p className="mt-2 leading-relaxed">{q}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
