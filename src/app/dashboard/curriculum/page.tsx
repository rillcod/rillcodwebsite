'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useAcademicYear } from '@/contexts/academic-year-context';
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
  Squares2X2Icon, PlusIcon, CalendarDaysIcon, TrashIcon, PresentationChartLineIcon,
  BuildingOfficeIcon, LockClosedIcon, ArrowDownTrayIcon, ShieldCheckIcon, DocumentDuplicateIcon,
  BellIcon,
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { buildAddLessonQueryFromCurriculum } from '@/lib/curriculum/add-lesson-from-curriculum';
import {
  SyllabusPreview,
  type SyllabusContent,
  type SyllabusPreviewRole,
} from '@/components/curriculum/SyllabusPreview';
import { CurriculumPrintDoc } from '@/components/curriculum/CurriculumPrintDoc';
import { CurriculumOverviewPrintDoc, DEFAULT_PRINT_OPTIONS, type PrintSectionOptions } from '@/components/curriculum/CurriculumOverviewPrintDoc';
import PlanningBreadcrumb from '@/components/pipeline/PlanningBreadcrumb';
import { extractLessonPlanOperationWeeks } from '@/lib/progression/lessonPlanOperation';

// Nigerian term labels
const TERM_LABEL: Record<number, string> = {
  1: 'First Term',
  2: 'Second Term',
  3: 'Third Term',
};

function getLessonPlanOperationStats(planData: unknown): { totalWeeks: number; completedWeeks: number; progressPct: number } {
  const weeks = extractLessonPlanOperationWeeks(planData);
  const completedWeeks = weeks.filter((week) => week.completed === true).length;
  const totalWeeks = weeks.length;
  return {
    totalWeeks,
    completedWeeks,
    progressPct: totalWeeks > 0 ? Math.round((completedWeeks / totalWeeks) * 100) : 0,
  };
}

function academicYearOptions(): string[] {
  const y = new Date().getFullYear();
  return [`${y - 1}/${y}`, `${y}/${y + 1}`, `${y + 1}/${y + 2}`];
}

function currentAcademicYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}

function getCurrentTerm(): number {
  const m = new Date().getMonth() + 1;
  if (m >= 9) return 1;  // Sept–Dec → First Term
  if (m >= 5) return 3;  // May–Aug → Third Term
  return 2;               // Jan–Apr → Second Term
}

function termDatesNg(term: string, academicYear: string): { start: string; end: string } | null {
  const [startY, endY] = academicYear.split('/').map(Number);
  if (!startY || !endY) return null;
  if (term === '1') return { start: `${startY}-09-01`, end: `${startY}-12-15` };
  if (term === '2') return { start: `${endY}-01-10`, end: `${endY}-04-10` };
  if (term === '3') return { start: `${endY}-05-01`, end: `${endY}-07-25` };
  return null;
}

// Returns the Mon–Fri date range for a given week number within a term
function weekDateRange(
  termNum: string | number,
  weekNum: number,
  academicYear: string,
  termStartDate?: string,
): { start: string; end: string } | null {
  const termDates = termStartDate
    ? { start: termStartDate, end: '' }
    : termDatesNg(String(termNum), academicYear);
  if (!termDates) return null;
  const termStart = new Date(termDates.start);
  // Find first Monday on or after term start
  const day = termStart.getDay();
  const toMon = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  const week1Mon = new Date(termStart);
  week1Mon.setDate(week1Mon.getDate() + toMon);
  const weekMon = new Date(week1Mon);
  weekMon.setDate(weekMon.getDate() + (weekNum - 1) * 7);
  const weekFri = new Date(weekMon);
  weekFri.setDate(weekFri.getDate() + 4);
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return { start: fmt(weekMon), end: fmt(weekFri) };
}


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
  start_date?: string;
}

interface NotificationSettings {
  mode: 'all' | 'every_n' | 'specific' | 'none';
  channels: ('whatsapp' | 'email')[];
  every_n?: number;
  specific_weeks?: number[];
}

interface CurriculumContent {
  course_title: string;
  overview: string;
  learning_outcomes: string[];
  terms: CurriculumTerm[];
  assessment_strategy: string;
  materials_required: string[];
  recommended_tools: string[];
  notification_settings?: NotificationSettings;
  description?: string | null;
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
  /** High-level summary of this implementation (e.g. "2026 Innovation Track"). */
  description?: string | null;
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
  lesson: { label: 'Lesson', color: 'text-primary bg-primary/10 border-primary/30', icon: BookOpenIcon },
  assessment: { label: 'Assessment', color: 'text-amber-400  bg-amber-500/10  border-amber-500/30', icon: ClipboardDocumentListIcon },
  examination: { label: 'Examination', color: 'text-rose-400   bg-rose-500/10   border-rose-500/30', icon: DocumentTextIcon },
};

const TRACK_META: Record<TrackStatus, { label: string; color: string; icon: any }> = {
  pending: { label: 'Pending', color: 'text-muted-foreground', icon: ClockIcon },
  in_progress: { label: 'In Progress', color: 'text-primary', icon: ArrowPathIcon },
  completed: { label: 'Completed', color: 'text-emerald-400', icon: CheckCircleIcon },
  skipped: { label: 'Skipped', color: 'text-muted-foreground', icon: ExclamationTriangleIcon },
};

const INPUT_CLS = 'select-premium w-full px-3 py-2.5 text-sm focus:border-primary';
const SELECT_CLS = 'select-premium w-full px-3 py-2.5 text-sm focus:border-primary';
const GRADE_LEVEL_OPTIONS = [
  'Nursery',
  'Basic 1', 'Basic 2', 'Basic 3', 'Basic 1–Basic 3',
  'Basic 4', 'Basic 5', 'Basic 6', 'Basic 4–Basic 6',
  'JSS1', 'JSS2', 'JSS3', 'JSS1–JSS3',
  'SS1', 'SS2', 'SS1–SS2', 'SS3',
];
const GRADE_SCOPE_STORAGE_KEY = 'curriculum.gradeByScope.v1';

// ── Main Page ────────────────────────────────────────────────────────────────
export default function CurriculumPage() {
  const { profile, isLoading: authLoading, profileLoading } = useAuth();
  const { academicYear, yearOptions, setAcademicYear: setGlobalAcademicYear } = useAcademicYear();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [expandedPrograms, setExpandedPrograms] = useState<Set<string>>(new Set());
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [curriculum, setCurriculum] = useState<CurriculumDoc | null>(null);
  const [tracking, setTracking] = useState<WeekTracking[]>([]);
  const [activeTerm, setActiveTerm] = useState(getCurrentTerm);
  const [activeWeek, setActiveWeek] = useState<CurriculumWeek | null>(null);
  const [loadingCurr, setLoadingCurr] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [savingTrack, setSavingTrack] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [expandedTerms, setExpandedTerms] = useState<Set<number>>(new Set([1]));
  const [resettingTerm, setResettingTerm] = useState<number | null>(null);
  const [resettingAll, setResettingAll] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignResult, setAssignResult] = useState<{ assignment?: boolean; project?: boolean } | null>(null);
  const [showcaseCount, setShowcaseCount] = useState<number | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

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
  const [creatingAssignment, setCreatingAssignment] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'syllabus' | 'delivery' | 'implementations'>('syllabus');
  const [syllabusViewMode, setSyllabusViewMode] = useState<'serial' | 'explorer'>('serial');
  // Teacher-controlled "show to school" gate + cross-role preview modal
  const [publishing, setPublishing] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [previewRole, setPreviewRole] = useState<SyllabusPreviewRole | null>(null);
  const [loadError, setLoadError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [showCloneModal, setShowCloneModal] = useState<{ curriculumId: string } | null>(null);
  const [cloneTargetSchool, setCloneTargetSchool] = useState('');
  const [bulkMarkingTerm, setBulkMarkingTerm] = useState<number | null>(null);

  // Term start date state
  const [termStartDates, setTermStartDates] = useState<Record<number, string>>({});
  const [editingTermDate, setEditingTermDate] = useState<number | null>(null);
  const [termDateDraft, setTermDateDraft] = useState('');
  const [savingTermDate, setSavingTermDate] = useState(false);

  // Notification settings state
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [savingNotifSettings, setSavingNotifSettings] = useState(false);
  const [notifSettingsDraft, setNotifSettingsDraft] = useState<NotificationSettings>({ mode: 'all', channels: ['whatsapp'] });

  /** Filter sidebar programs / courses (builder mode). */
  const [catalogQuery, setCatalogQuery] = useState('');
  /** All syllabus rows for the selected course (global vs school-scoped, versions). */
  const [curriculumList, setCurriculumList] = useState<CurriculumDoc[]>([]);
  /** Last visited course — restored from localStorage so teachers don't lose their place. */
  const [lastVisited, setLastVisited] = useState<{ progId: string; progName: string; courseId: string; courseTitle: string } | null>(null);
  /** Courses that have at least one saved curriculum — tracked per session as courses are loaded. */
  const [coursesWithCurricula, setCoursesWithCurricula] = useState<Set<string>>(new Set());
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
    weeks_per_term: '8',
    notes: '',
  });
  const [selectedTerms, setSelectedTerms] = useState<number[]>([1]);
  const [curriculumFormat, setCurriculumFormat] = useState<'school' | 'bootcamp' | 'online' | 'selfpaced'>('school');
  const [bootcampDurationWeeks, setBootcampDurationWeeks] = useState('4');
  const [bootcampSchedule, setBootcampSchedule] = useState<'fulltime' | 'parttime' | 'weekend' | 'evening'>('fulltime');
  const [onlineDurationWeeks, setOnlineDurationWeeks] = useState('8');
  const [onlineSessionsPerWeek, setOnlineSessionsPerWeek] = useState('2');
  const [selfpacedModules, setSelfpacedModules] = useState('6');
  const [selfpacedHoursPerModule, setSelfpacedHoursPerModule] = useState('2');

  function toggleTerm(t: number) {
    setSelectedTerms((prev) =>
      prev.includes(t)
        ? prev.length > 1 ? prev.filter((x) => x !== t) : prev  // keep at least one
        : [...prev, t].sort((a, b) => a - b),
    );
  }

  // Optional QA week spine: show DB template + class rotation preview before apply
  const [qaSpineOpen, setQaSpineOpen] = useState(false);
  const [showImplement, setShowImplement] = useState(false);
  const [implementing, setImplementing] = useState(false);
  const [implForm, setImplForm] = useState({
    school_id: '',
    class_id: '',
    term: '1',
    academic_year: academicYear,
    term_start: new Date().toISOString().split('T')[0],
    term_end: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    sessions_per_week: '5',
  });
  const [implClasses, setImplClasses] = useState<{ id: string; name: string; school_id: string }[]>([]);
  const [implError, setImplError] = useState('');
  const [implementationList, setImplementationList] = useState<any[]>([]);
  const [globalImplementationList, setGlobalImplementationList] = useState<any[]>([]);
  const [printMode, setPrintMode] = useState<'week' | 'overview'>('week');
  const [showPrintOptions, setShowPrintOptions] = useState(false);
  const [printOptions, setPrintOptions] = useState<PrintSectionOptions>(DEFAULT_PRINT_OPTIONS);
  // For teachers with multiple classes using this syllabus — which class context to track against
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
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
  const [editingWeekContent, setEditingWeekContent] = useState(false);
  const [weekPlanDraft, setWeekPlanDraft] = useState<LessonPlan | null>(null);
  const [weekAssessmentDraft, setWeekAssessmentDraft] = useState<AssessmentPlan | null>(null);
  const [savingWeekContent, setSavingWeekContent] = useState(false);
  // Stable ref so the programs useEffect can call loadCurriculum before it's declared.
  const loadCurriculumRef = useRef<((courseId: string) => Promise<void>) | null>(null);

  const isAdmin = profile?.role === 'admin';
  const isTeacher = profile?.role === 'teacher';
  const isStudent = profile?.role === 'student';
  const isParent = profile?.role === 'parent';
  const isSchool = profile?.role === 'school';
  // Admin: full access. Teacher: generate/delete school-specific only (not platform template).
  const canGenerate = isAdmin || isTeacher;
  const canModifyCurriculum = isAdmin || isTeacher;
  const canTrack = isAdmin || isTeacher;
  const canPublish = isAdmin;
  // Students & parents get a clean read-only syllabus (no builder chrome).
  const learnerMode = isStudent || isParent;

  // Reset week content editor when switching weeks
  useEffect(() => {
    setEditingWeekContent(false);
    setWeekPlanDraft(null);
    setWeekAssessmentDraft(null);
  }, [activeWeek?.week, activeTerm]);
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
        // No URL param, no localStorage — auto-select first available course
        for (const p of progs) {
          const c = (p.courses ?? []).find((x) => x.is_active !== false);
          if (c) {
            setExpandedPrograms(new Set([p.id]));
            setSelectedProgram(p);
            setSelectedCourse(c);
            setMobileSidebarOpen(false);
            loadCurriculumRef.current?.(c.id);
            return;
          }
        }
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
      .then((j) => {
        const schools = (j.data ?? []) as { id: string; name: string }[];
        setAssignedSchools(schools);
        // Single-school teacher → auto-select their school.
        // Multi-school teachers and admins must pick explicitly (placeholder shown).
        if (!isAdmin && schools.length === 1) {
          setGenerateScope(schools[0].id);
        } else if (!isAdmin && schools.length > 1) {
          setGenerateScope('platform'); // will show as placeholder until user picks
        }
      })
      .catch(() => setAssignedSchools([]));
  }, [canTrack, isAdmin]);

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

  // Auto-load implementations when delivery OR implementations tab active, or course changes
  useEffect(() => {
    if (selectedCourse) {
      const params = new URLSearchParams({ course_id: selectedCourse.id });
      if (curriculum?.id) params.set('curriculum_version_id', curriculum.id);
      fetch(`/api/lesson-plans?${params.toString()}`)
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
  }, [selectedCourse, activeTab, curriculum?.id]);

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
      const url = isTeacher
        ? `/api/classes?mine=true`
        : `/api/classes?school_id=${implForm.school_id}`;
      fetch(url)
        .then(r => r.json())
        .then(j => {
          const list = j.data || [];
          // Extra safety: scope to the selected school
          setImplClasses(list.filter((c: any) => !implForm.school_id || c.school_id === implForm.school_id));
        })
        .catch(() => setImplClasses([]));
    }
  }, [showImplement, implForm.school_id, isTeacher]);

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
        if (res.status === 409 && j.existing_id) {
          toast.success('Lesson plan already exists for this class and term');
          setShowImplement(false);
          router.push(`/dashboard/lesson-plans/${j.existing_id}`);
          return;
        }
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
      const termNums = (doc.content?.terms ?? []).map((t: any) => t.term as number);
      if (termNums.length > 0) {
        setActiveTerm((prev) => termNums.includes(prev) ? prev : termNums[0]);
      }
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
    // Only show loading if it takes longer than 150ms
    let timer: any;
    timer = setTimeout(() => setLoadingCurr(true), 150);
    setLoadError('');
    // We DON'T clear curriculum immediately to avoid flashing white space
    // setCurriculum(null); 
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

          setCurriculum(curr);

          // Snap activeTerm to a valid term in this curriculum
          const termNums = (curr.content?.terms ?? []).map((t: any) => t.term as number);
          if (termNums.length > 0) {
            const desired = getCurrentTerm();
            setActiveTerm(termNums.includes(desired) ? desired : termNums[0]);
          }

          // Mark this course as having a curriculum (for sidebar badge)
          setCoursesWithCurricula(prev => { const n = new Set(prev); n.add(courseId); return n; });

          // Tracking is a staff-only feature
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
      clearTimeout(timer);
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

  const saveWeekContent = useCallback(async () => {
    if (!curriculum || !activeWeek) return;
    setSavingWeekContent(true);
    try {
      const updatedContent: CurriculumContent = JSON.parse(JSON.stringify(curriculum.content));
      const termObj = updatedContent.terms.find((t) => t.term === activeTerm);
      if (!termObj) return;
      const weekObj = termObj.weeks.find((w) => w.week === activeWeek.week);
      if (!weekObj) return;
      if (activeWeek.type === 'lesson' && weekPlanDraft) {
        weekObj.lesson_plan = weekPlanDraft;
      } else if (weekAssessmentDraft) {
        weekObj.assessment_plan = weekAssessmentDraft;
      }
      const res = await fetch(`/api/curricula/${curriculum.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: updatedContent }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      setCurriculum(prev => prev ? { ...prev, content: updatedContent, version: json.data?.version ?? prev.version } : prev);
      setActiveWeek(prev => prev ? {
        ...prev,
        lesson_plan: activeWeek.type === 'lesson' ? (weekPlanDraft ?? prev.lesson_plan) : prev.lesson_plan,
        assessment_plan: activeWeek.type !== 'lesson' ? (weekAssessmentDraft ?? prev.assessment_plan) : prev.assessment_plan,
      } : prev);
      setEditingWeekContent(false);
      toast.success('Week content saved');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSavingWeekContent(false);
    }
  }, [curriculum, activeWeek, activeTerm, weekPlanDraft, weekAssessmentDraft]);

  function selectCourse(prog: Program, course: Course) {
    const visited = { progId: prog.id, progName: prog.name, courseId: course.id, courseTitle: course.title };
    try { window.localStorage.setItem('curriculum.lastCourse.v1', JSON.stringify(visited)); } catch { /* ignore */ }
    setLastVisited(visited);
    setSelectedProgram(prog);
    setSelectedCourse(course);
    setActiveTerm(1);
    setActiveWeek(null);
    setLoadError('');
    setMobileSidebarOpen(false);
    try { window.history.pushState(null, '', `/dashboard/curriculum?program=${prog.id}&course=${course.id}`); } catch { /* ignore */ }
    loadCurriculum(course.id);
  }

  // ── Generate curriculum ──────────────────────────────────────────────────
  async function generate() {
    if (!selectedCourse) return;
    // Teachers can't save to platform — auto-redirect to their first school
    let effectiveScope = generateScope;
    if (!isAdmin && effectiveScope === 'platform') {
      if (assignedSchools.length === 0) {
        setGenError('No school assigned to your account. Contact an admin.');
        return;
      }
      effectiveScope = assignedSchools[0].id;
      setGenerateScope(effectiveScope);
    }
    setGenerating(true);
    setGenError('');
    try {
      const res = await fetch('/api/curricula', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_id: selectedCourse.id,
          course_name: selectedCourse.title,
          school_id: effectiveScope === 'platform' ? null : effectiveScope,
          grade_level: form.grade_level,
          subject_area: form.subject_area,
          notes: form.notes,
          format: curriculumFormat,
          // School
          ...(curriculumFormat === 'school' ? {
            selected_terms: selectedTerms,
            weeks_per_term: Number(form.weeks_per_term),
          } : {}),
          // Bootcamp
          ...(curriculumFormat === 'bootcamp' ? {
            bootcamp_duration_weeks: Number(bootcampDurationWeeks),
            bootcamp_schedule: bootcampSchedule,
          } : {}),
          // Online
          ...(curriculumFormat === 'online' ? {
            online_duration_weeks: Number(onlineDurationWeeks),
            online_sessions_per_week: Number(onlineSessionsPerWeek),
          } : {}),
          // Self-paced
          ...(curriculumFormat === 'selfpaced' ? {
            selfpaced_modules: Number(selfpacedModules),
            selfpaced_hours_per_module: Number(selfpacedHoursPerModule),
          } : {}),
          // Term start dates (school format only)
          ...(curriculumFormat === 'school' && Object.keys(termStartDates).length > 0 ? {
            term_start_dates: termStartDates,
          } : {}),
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
        week_topic: week.topic ?? null,
        course_name: selectedCourse?.title ?? null,
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

  async function resetTermProgress(termNum: number) {
    if (!curriculum || !canTrack) return;
    if (!confirm(`Reset all delivery progress for Term ${termNum}? This cannot be undone.`)) return;
    setResettingTerm(termNum);
    await fetch(`/api/curricula/${curriculum.id}/track?term=${termNum}`, { method: 'DELETE' });
    setTracking(prev => prev.filter(t => t.term_number !== termNum));
    setResettingTerm(null);
  }

  async function resetAllProgress() {
    if (!curriculum || !canTrack) return;
    if (!confirm('Reset ALL delivery progress for this entire syllabus? This cannot be undone.')) return;
    setResettingAll(true);
    await fetch(`/api/curricula/${curriculum.id}/track`, { method: 'DELETE' });
    setTracking([]);
    setResettingAll(false);
  }

  // ── Bulk mark all weeks in a term ────────────────────────────────────────
  async function bulkMarkTerm(termNum: number, status: TrackStatus) {
    if (!curriculum || !canTrack) return;
    const termData = curriculum.content.terms?.find(t => t.term === termNum);
    if (!termData?.weeks?.length) return;
    const label = status === 'completed' ? 'complete' : status;
    if (!confirm(`Mark all ${termData.weeks.length} weeks in Term ${termNum} as ${label}?`)) return;
    setBulkMarkingTerm(termNum);
    try {
      const weeks = (termData.weeks ?? []).map((w: CurriculumWeek) => ({
        term_number: termNum,
        week_number: w.week,
        status,
      }));
      const res = await fetch(`/api/curricula/${curriculum.id}/track/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeks }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Bulk update failed');
      // Merge returned records into tracking state
      setTracking(prev => {
        const updated = prev.filter(t => t.term_number !== termNum);
        return [...updated, ...(json.data ?? [])];
      });
      toast.success(`All Term ${termNum} weeks marked as ${label}`);
    } catch (e: any) {
      toast.error(e.message || 'Bulk update failed');
    } finally {
      setBulkMarkingTerm(null);
    }
  }

  // ── Save term start date ─────────────────────────────────────────────────
  async function saveTermDate(termNum: number, dateStr: string) {
    if (!curriculum) return;
    setSavingTermDate(true);
    try {
      const res = await fetch(`/api/curricula/${curriculum.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term_start_dates: { [termNum]: dateStr } }),
      });
      if (!res.ok) throw new Error('Failed to save date');
      setCurriculum(prev => {
        if (!prev) return prev;
        const terms = (prev.content.terms ?? []).map(t =>
          t.term === termNum ? { ...t, start_date: dateStr } : t
        );
        return { ...prev, content: { ...prev.content, terms } };
      });
      setEditingTermDate(null);
      toast.success('Term date updated');
    } catch {
      toast.error('Failed to save term date');
    } finally {
      setSavingTermDate(false);
    }
  }

  // ── Save notification settings ───────────────────────────────────────────
  async function saveNotifSettings(settings: NotificationSettings) {
    if (!curriculum) return;
    setSavingNotifSettings(true);
    try {
      const res = await fetch(`/api/curricula/${curriculum.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_settings: settings }),
      });
      if (!res.ok) throw new Error('Save failed');
      setCurriculum(prev => prev ? { ...prev, content: { ...prev.content, notification_settings: settings } } : prev);
      setShowNotifSettings(false);
      toast.success('Notification settings saved');
    } catch {
      toast.error('Failed to save notification settings');
    } finally {
      setSavingNotifSettings(false);
    }
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

  // ── Create Assignment from curriculum week ───────────────────────────────
  async function createAssignmentFromWeek(week: CurriculumWeek) {
    if (!selectedCourse) return;
    setCreatingAssignment(true);
    try {
      const plan = week.lesson_plan;
      const weekTag = `Week ${week.week}: ${week.topic}`;
      const dueDate = new Date(Date.now() + 7 * 864e5).toISOString().split('T')[0];
      const res = await fetch('/api/assignments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: plan?.assignment?.title || `${weekTag} — Assignment`,
          instructions: plan?.assignment?.instructions || (week.subtopics ?? []).join('\n'),
          assignment_type: 'homework',
          due_date: dueDate,
          max_points: 100,
          is_active: true,
          course_id: selectedCourse.id,
          metadata: { source: 'curriculum', curriculum_id: curriculum?.id, term: activeTerm, week: week.week },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create assignment');
      router.push(`/dashboard/assignments/${json.data.id}`);
    } catch (e: any) {
      toast.error(e.message || 'Could not create assignment');
    } finally {
      setCreatingAssignment(false);
    }
  }

  // ── Create Project from curriculum week ──────────────────────────────────
  async function createProjectFromWeek(week: CurriculumWeek) {
    if (!selectedCourse) return;
    setCreatingProject(true);
    try {
      const plan = week.lesson_plan;
      const proj = plan?.project;
      const weekTag = `Week ${week.week}: ${week.topic}`;
      const dueDate = new Date(Date.now() + 14 * 864e5).toISOString().split('T')[0];
      const res = await fetch('/api/assignments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: proj?.title || `${weekTag} — Project`,
          instructions: proj?.description || (week.subtopics ?? []).join('\n'),
          assignment_type: 'project',
          due_date: dueDate,
          max_points: 100,
          is_active: true,
          course_id: selectedCourse.id,
          metadata: { source: 'curriculum', curriculum_id: curriculum?.id, term: activeTerm, week: week.week },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create project');
      router.push(`/dashboard/assignments/${json.data.id}`);
    } catch (e: any) {
      toast.error(e.message || 'Could not create project');
    } finally {
      setCreatingProject(false);
    }
  }

  // ── Print functions ────────────────────────────────────────────────────────
  function printWeek() {
    setPrintMode('week');
    setTimeout(() => window.print(), 50);
  }

  function printOverview() {
    setPrintMode('overview');
    setTimeout(() => window.print(), 50);
  }

  function openPrintOptions() {
    // Pre-populate the term list from available terms in the curriculum
    const availableTerms = (curriculum?.content?.terms ?? []).map(t => t.term);
    setPrintOptions(o => ({ ...o, terms: availableTerms.length ? availableTerms : [1, 2, 3] }));
    setShowPrintOptions(true);
  }

  function pdfFileName(title: string): string {
    const stem = `${title || 'curriculum'}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${stem || 'curriculum'}.pdf`;
  }

  async function exportCurriculumPdf(mode: 'overview' | 'week' = 'overview') {
    if (!curriculum) {
      toast.error('Select a curriculum before exporting.');
      return;
    }
    if (mode === 'week' && !activeWeek) {
      toast.error('Select a week before exporting.');
      return;
    }

    setExportingPdf(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const margin = 15;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      let y = margin;

      // Theme-aware PDF colors
      const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
      const primaryRgb: [number, number, number] = isDark ? [26, 58, 143] : [59, 111, 232];
      const bodyBg: [number, number, number] = isDark ? [10, 10, 20] : [255, 255, 255];
      const bodyText: [number, number, number] = isDark ? [229, 231, 235] : [17, 24, 39];
      const mutedText: [number, number, number] = isDark ? [107, 114, 128] : [75, 85, 99];

      if (isDark) {
        doc.setFillColor(...bodyBg);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
      }

      const addPageIfNeeded = (needed = 12) => {
        if (y + needed > pageHeight - margin) {
          doc.addPage();
          if (isDark) {
            doc.setFillColor(...bodyBg);
            doc.rect(0, 0, pageWidth, pageHeight, 'F');
          }
          y = margin;
        }
      };
      const text = (value: string, size = 10, style: 'normal' | 'bold' = 'normal', color: [number, number, number] = bodyText) => {
        addPageIfNeeded(size * 0.8);
        doc.setFont('helvetica', style);
        doc.setFontSize(size);
        doc.setTextColor(...color);
        const lines = doc.splitTextToSize(value || '-', pageWidth - margin * 2);
        doc.text(lines, margin, y);
        y += lines.length * (size * 0.45) + 3;
      };
      const heading = (value: string) => {
        addPageIfNeeded(16);
        doc.setFillColor(...primaryRgb);
        doc.rect(margin, y, pageWidth - margin * 2, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(value.toUpperCase(), margin + 3, y + 5.5);
        y += 12;
      };
      const bullets = (items?: string[]) => {
        if (!items?.length) {
          text('-', 9);
          return;
        }
        items.forEach((item) => text(`- ${item}`, 9));
      };

      const content = curriculum.content;
      const course = content?.course_title || selectedCourse?.title || 'Curriculum';
      const school = curriculum.schools?.name || 'Rillcod Managed Academy';

      doc.setTextColor(...bodyText);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('RILLCOD TECHNOLOGIES', margin, y);
      y += 7;
      doc.setFontSize(9);
      doc.setTextColor(...mutedText);
      doc.text('Official Curriculum Export', margin, y);
      y += 8;
      doc.setDrawColor(...primaryRgb);
      doc.line(margin, y, pageWidth - margin, y);
      y += 10;

      text(mode === 'week' && activeWeek ? `Week ${activeWeek.week}: ${activeWeek.topic}` : course, 15, 'bold');
      text(`Programme: ${selectedProgram?.name || 'Rillcod STEM Path'}`, 9);
      text(`School: ${school}`, 9);
      text(`Version: ${curriculum.version ?? 1} | Exported: ${new Date().toLocaleDateString('en-GB')}`, 9);

      if (mode === 'week' && activeWeek) {
        heading('Week Plan');
        text(`Term: ${TERM_LABEL[activeTerm] ?? `Term ${activeTerm}`}`, 10, 'bold');
        text(`Type: ${WEEK_META[activeWeek.type]?.label ?? activeWeek.type}`, 9);
        text(`Topic: ${activeWeek.topic}`, 10, 'bold');
        if (activeWeek.subtopics?.length) {
          text('Subtopics', 10, 'bold');
          bullets(activeWeek.subtopics);
        }
        const plan = activeWeek.lesson_plan;
        const assessment = activeWeek.assessment_plan;
        if (plan) {
          heading('Lesson Details');
          text(`Duration: ${plan.duration_minutes ?? '-'} minutes`, 9);
          text('Objectives', 10, 'bold');
          bullets(plan.objectives);
          text('Teacher Activities', 10, 'bold');
          bullets(plan.teacher_activities);
          text('Student Activities', 10, 'bold');
          bullets(plan.student_activities);
          if (plan.classwork) text(`Classwork: ${plan.classwork.title || ''}\n${plan.classwork.instructions || ''}`, 9);
          if (plan.assignment) text(`Assignment: ${plan.assignment.title || ''}\n${plan.assignment.instructions || ''}`, 9);
          if (plan.project) text(`Project: ${plan.project.title || ''}\n${plan.project.description || ''}`, 9);
        }
        if (assessment) {
          heading('Assessment Details');
          text(`Title: ${assessment.title || '-'}`, 10, 'bold');
          text(`Format: ${assessment.format || '-'}`, 9);
          text(`Scoring Guide: ${assessment.scoring_guide || '-'}`, 9);
          text('Coverage', 10, 'bold');
          bullets(assessment.coverage);
        }
      } else {
        if (printOptions.showOverview && content?.overview) {
          heading('Overview');
          text(content.overview, 9);
        }
        if (printOptions.showLearningOutcomes && content?.learning_outcomes?.length) {
          heading('Learning Outcomes');
          bullets(content.learning_outcomes);
        }
        (content?.terms ?? []).filter(term => printOptions.terms.includes(term.term)).forEach((term) => {
          heading(`${TERM_LABEL[term.term] ?? `Term ${term.term}`}: ${term.title}`);
          if (term.objectives?.length) {
            text('Term Objectives', 10, 'bold');
            bullets(term.objectives);
          }
          (term.weeks ?? []).forEach((week) => {
            addPageIfNeeded(18);
            text(`Week ${week.week}: ${week.topic}`, 10, 'bold');
            text(`Type: ${WEEK_META[week.type]?.label ?? week.type}`, 8);
            if (week.subtopics?.length) text(`Coverage: ${week.subtopics.join(', ')}`, 8);
          });
        });
        if (printOptions.showAssessmentStrategy && content?.assessment_strategy) {
          heading('Assessment Strategy');
          text(content.assessment_strategy, 9);
        }
        if (printOptions.showMaterials && content?.materials_required?.length) {
          heading('Materials Required');
          bullets(content.materials_required);
        }
        if (printOptions.showTools && content?.recommended_tools?.length) {
          heading('Recommended Tools');
          bullets(content.recommended_tools);
        }
      }

      const name = pdfFileName(mode === 'week' && activeWeek ? `${course}-week-${activeWeek.week}` : `${course}-syllabus`);
      doc.save(name);
      toast.success('PDF exported');
    } catch (e: any) {
      toast.error(e.message || 'Could not export PDF');
    } finally {
      setExportingPdf(false);
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

  // ── Delete this curriculum version ──────────────────────────────────────
  async function handleDeleteCurriculum() {
    if (!curriculum) return;
    if (!window.confirm('Are you sure you want to delete this curriculum version? This will also remove linked tracking and lesson plans. This action cannot be undone.')) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/curricula/${curriculum.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to delete curriculum');
      }
      toast.success('Curriculum version deleted');

      // Update local lists
      const newList = curriculumList.filter(c => c.id !== curriculum.id);
      setCurriculumList(newList);

      if (newList.length > 0) {
        // Switch to the first available version
        setCurriculum(newList[0]);
      } else {
        // No versions left, close the syllabus view
        setCurriculum(null);
      }
    } catch (e: any) {
      toast.error(e.message || 'Deletion failed');
    } finally {
      setDeleting(false);
    }
  }

  // ── Clone curriculum ─────────────────────────────────────────────────────
  async function handleClone(curriculumId: string, schoolId?: string) {
    // If teacher has multiple schools and no target chosen yet, show the modal
    const targetSchool = schoolId ?? (assignedSchools.length === 1 ? assignedSchools[0].id : '');
    if (!targetSchool) {
      setCloneTargetSchool('');
      setShowCloneModal({ curriculumId });
      return;
    }
    setCloning(true);
    try {
      const res = await fetch(`/api/curricula/${curriculumId}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: targetSchool }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Clone failed');
      toast.success(`Cloned to ${json.data?.schools?.name ?? 'your school'} — v${json.data?.version}`);
      // Add to list and open the new curriculum
      const newCurr = json.data as CurriculumDoc;
      setCurriculumList(prev => [newCurr, ...prev]);
      setCurriculum(newCurr);
      setTracking([]);
      setShowCloneModal(null);
    } catch (e: any) {
      toast.error(e.message || 'Clone failed');
    } finally {
      setCloning(false);
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
  const scopeLabel = generateScope === 'platform'
    ? 'Shared (all schools)'
    : assignedSchools.find((s) => s.id === generateScope)?.name ?? 'Selected school';

  const expandAllPrograms = useCallback(() => {
    setExpandedPrograms(new Set(programs.map((p) => p.id)));
  }, [programs]);


  // ── Auth loading guard — prevents role-based flash ──────────────────────
  if (authLoading || (profileLoading && !profile)) {
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
        <div className="shrink-0 border-b border-border bg-card px-4 py-3 space-y-2">
          <PlanningBreadcrumb current="syllabus" />
          <p className="text-xs text-muted-foreground">
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
    <>
    {/* Official print documents — hidden in UI, revealed only by window.print() */}
    <div style={{ display: printMode === 'week' ? 'block' : 'none' }}>
      <CurriculumPrintDoc
        curriculum={curriculum as any}
        activeWeek={activeWeek}
        activeTerm={activeTerm}
        courseTitle={selectedCourse?.title}
        programName={selectedProgram?.name}
        teacherName={profile?.full_name ?? undefined}
      />
    </div>
    <div style={{ display: printMode === 'overview' ? 'block' : 'none' }}>
      <CurriculumOverviewPrintDoc
        curriculum={curriculum as any}
        programName={selectedProgram?.name}
        isActive={printMode === 'overview'}
        options={printOptions}
      />
    </div>
    {/* Print Options Modal */}
    {showPrintOptions && curriculum && (
      <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm print:hidden">
        <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 w-full sm:max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-start justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest">Print / Export</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Choose sections to include.</p>
            </div>
            <button onClick={() => setShowPrintOptions(false)} className="text-muted-foreground hover:text-foreground p-1 -mt-1 -mr-1">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Terms */}
          <div className="space-y-2 mb-4">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Terms to include</p>
            <div className="flex flex-wrap gap-3">
              {(curriculum.content?.terms ?? []).sort((a, b) => a.term - b.term).map(t => (
                <label key={t.term} className="flex items-center gap-2 text-xs font-bold cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="rounded w-4 h-4 accent-primary"
                    checked={printOptions.terms.includes(t.term)}
                    onChange={e => setPrintOptions(o => ({
                      ...o,
                      terms: e.target.checked ? [...o.terms, t.term] : o.terms.filter(x => x !== t.term)
                    }))}
                  />
                  {TERM_LABEL[t.term] ?? `Term ${t.term}`}
                </label>
              ))}
            </div>
          </div>

          {/* Sections */}
          <div className="space-y-2 mb-6">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Sections</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-4">
              {([
                { key: 'showOverview', label: 'Overview' },
                { key: 'showLearningOutcomes', label: 'Learning Outcomes' },
                { key: 'showAssessmentStrategy', label: 'Assessment Strategy' },
                { key: 'showMaterials', label: 'Materials Required' },
                { key: 'showTools', label: 'Recommended Tools' },
                { key: 'showApprovalSection', label: 'Approval Signatures' },
              ] as { key: keyof PrintSectionOptions; label: string }[]).map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-xs font-bold cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="rounded w-4 h-4 accent-primary"
                    checked={!!printOptions[key]}
                    onChange={e => setPrintOptions(o => ({ ...o, [key]: e.target.checked }))}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { setShowPrintOptions(false); printOverview(); }}
              className="py-3 bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest rounded-xl"
            >
              Print
            </button>
            <button
              onClick={() => { setShowPrintOptions(false); exportCurriculumPdf('overview'); }}
              className="py-3 border border-border text-xs font-black uppercase tracking-widest rounded-xl hover:bg-muted transition-colors"
            >
              Export PDF
            </button>
          </div>
        </div>
      </div>
    )}

    <div className="flex flex-col min-h-screen bg-background text-foreground print:hidden">
      {/* Header — wraps gracefully on mobile */}
      <div className="shrink-0 border-b border-border bg-card z-20">
        <div className="px-4 py-2 md:py-0 md:min-h-12 max-w-[1800px] mx-auto flex flex-wrap md:flex-nowrap items-center gap-2 md:gap-3">
          <PlanningBreadcrumb current="syllabus" />
          <div className="flex-1 hidden md:block" />
          <button
            type="button"
            onClick={() => setShowHelp(h => !h)}
            title={showHelp ? 'Hide guide' : 'How it works'}
            className={`ml-auto md:ml-0 p-2 rounded-lg transition-colors shrink-0 ${showHelp ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'}`}
          >
            <InformationCircleIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* How it works guide */}
      {showHelp && (
        <div className="shrink-0 border-b border-primary/20 bg-primary/5 px-4 py-4">
          <div className="max-w-[1800px] mx-auto space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-brand-red-600">How to use this page</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-card border border-border p-3 space-y-1">
                <p className="font-black text-primary">Step 1 — Build the syllabus</p>
                <p className="text-muted-foreground">Pick a course on the left. Generate or edit the week-by-week syllabus. This is your teaching plan for the term.</p>
              </div>
              <div className="bg-card border border-border p-3 space-y-1">
                <p className="font-black text-primary">Step 2 — Deploy to a class</p>
                <p className="text-muted-foreground">Click "Deploy to Class" to assign this syllabus to a specific class. This creates a Lesson Plan you can track week by week.</p>
              </div>
              <div className="bg-card border border-border p-3 space-y-1">
                <p className="font-black text-primary">Step 3 — Track delivery</p>
                <p className="text-muted-foreground">As you teach each week, mark it done. Progress updates automatically for school reports and parents.</p>
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
                <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground truncate">
                  {selectedProgram.name}
                  {selectedCourse && (
                    <>
                      <span className="text-muted-foreground/40 mx-1">›</span>
                      <span className="text-primary">{selectedCourse.title}</span>
                    </>
                  )}
                </p>
              ) : (
                <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                  Course & Syllabus
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setMobileSidebarOpen(v => !v)}
                className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-brand-red-600 border border-primary/30 px-2 py-1.5"
              >
                <BookOpenIcon className="w-3.5 h-3.5" />
                {mobileSidebarOpen ? 'Close' : 'Courses'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Left Sidebar — Programs & Courses ── */}
        <aside className={`
        ${mobileSidebarOpen ? 'flex' : 'hidden'} md:flex
        flex-col w-full md:w-64 lg:w-72 shrink-0
        border-b md:border-b-0 md:border-r border-border
        bg-card overflow-y-auto md:h-screen
      `}>
          <div className="px-4 pt-4 pb-3 border-b border-border space-y-3">
            <div className="flex items-center gap-2">
              <SparklesIcon className="w-4 h-4 text-primary" />
              <h2 className="text-xs font-black uppercase tracking-widest text-foreground flex-1">Catalog</h2>
            </div>
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                value={catalogQuery}
                onChange={(e) => setCatalogQuery(e.target.value)}
                placeholder="Search…"
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/30 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 rounded-md"
                aria-label="Filter programmes and courses"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {programs.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="w-8 h-8 border-2 border-dashed border-border flex items-center justify-center mx-auto mb-4">
                  <AcademicCapIcon className="w-4 h-4 text-muted-foreground/30" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-4">No programmes found</p>
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
                              className={`w-full flex items-center gap-3 pl-10 pr-4 py-3.5 text-left transition-all relative group ${isSelected
                                ? 'text-primary bg-primary/10'
                                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                                }`}
                            >
                              {isSelected && (
                                <motion.div
                                  layoutId="course-active-pill"
                                  className="absolute left-0 top-2 bottom-2 w-1 bg-primary rounded-r-full shadow-[0_0_10px_rgba(255,107,0,0.4)]"
                                />
                              )}
                              <span className={`text-[13px] ${isSelected ? 'font-black' : 'font-medium'} truncate tracking-tight flex-1`}>
                                {course.title}
                              </span>
                              {!isSelected && coursesWithCurricula.has(course.id) && (
                                <span className="ml-auto flex-shrink-0 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-emerald-400/20" title="Syllabus exists" />
                              )}
                              {!isSelected && !coursesWithCurricula.has(course.id) && (
                                <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                  <ArrowRightIcon className="w-3 h-3 text-muted-foreground" />
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


          {/* Syllabus (always shown) */}
          {(
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="flex-1"
            >
              {!selectedCourse ? (
                /* Empty state */
                <div className="h-full min-h-[60vh] px-4 py-8">
                  <div className="max-w-5xl mx-auto space-y-5">
                    {/* Resume Planning — High-impact Hero Card */}
                    {lastVisited && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-primary">
                          <RocketLaunchIcon className="w-5 h-5 animate-pulse" />
                          <span className="text-[11px] font-black uppercase tracking-[0.3em]">Continue Session</span>
                        </div>
                        <div className="group relative overflow-hidden bg-card border border-white/10 p-8 flex flex-col sm:flex-row sm:items-center gap-8 shadow-2xl transition-all hover:border-primary/40 duration-500 rounded-2xl">
                          <div className="absolute -top-12 -right-12 w-48 h-48 bg-primary/10 rounded-full blur-[80px] pointer-events-none group-hover:bg-primary/20 transition-all" />
                          <div className="flex-1 min-w-0 relative z-10">
                            <div className="flex items-center gap-3 mb-4">
                              <span className="px-3 py-1 bg-primary/10 border border-primary/20 rounded-full text-[10px] font-black uppercase tracking-widest text-primary">
                                Last Visited
                              </span>
                              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-60">{lastVisited.progName}</span>
                            </div>
                            <h3 className="text-3xl font-black text-foreground tracking-tighter mb-2 group-hover:text-primary transition-colors">{lastVisited.courseTitle}</h3>
                            <p className="text-sm text-muted-foreground font-medium max-w-md">Pick up exactly where you left off in your syllabus.</p>
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
                            className="relative z-10 shrink-0 flex items-center justify-center gap-3 px-8 py-4 bg-primary hover:bg-primary text-white text-[12px] font-black uppercase tracking-[0.2em] transition-all shadow-xl shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-1 active:translate-y-0 rounded-xl"
                          >
                            <ArrowRightIcon className="w-4 h-4" /> Open Blueprint
                          </button>
                        </div>
                      </div>
                    )}
                    {!lastVisited && (
                      <div className="py-12 px-6">
                        <div className="max-w-3xl mx-auto text-center space-y-8">
                          <div className="space-y-3">
                            <h2 className="text-2xl font-black text-foreground tracking-tight">Course Syllabus Builder</h2>
                            <p className="text-muted-foreground text-sm max-w-lg mx-auto leading-relaxed">
                              Pick a course from the left panel to get started. Here is the order of how it works:
                            </p>
                          </div>

                          {/* Steps — correct execution order */}
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-left">
                            {[
                              {
                                step: '1',
                                title: 'Pick a course',
                                desc: 'Select any course from the left panel.',
                                icon: BookOpenIcon,
                                color: 'text-primary',
                                bg: 'bg-primary/10 border-primary/20',
                              },
                              {
                                step: '2',
                                title: 'Build the syllabus',
                                desc: 'Generate or write the week-by-week topics for the term.',
                                icon: SparklesIcon,
                                color: 'text-primary',
                                bg: 'bg-primary/10 border-primary/20',
                              },
                              {
                                step: '3',
                                title: 'Deploy to a class',
                                desc: 'Assign the syllabus to a specific class and term.',
                                icon: RocketLaunchIcon,
                                color: 'text-primary',
                                bg: 'bg-primary/10 border-primary/20',
                              },
                              {
                                step: '4',
                                title: 'Track delivery',
                                desc: 'Mark weeks as taught. Progress updates for school and parents.',
                                icon: PresentationChartLineIcon,
                                color: 'text-emerald-400',
                                bg: 'bg-emerald-500/10 border-emerald-500/20',
                              },
                            ].map((s, i) => (
                              <div key={i} className={`bg-card border ${s.bg} p-4 space-y-3`}>
                                <div className={`w-9 h-9 rounded-lg border ${s.bg} flex items-center justify-center`}>
                                  <s.icon className={`w-4 h-4 ${s.color}`} />
                                </div>
                                <div>
                                  <p className={`text-[10px] font-black uppercase tracking-widest ${s.color} mb-1`}>Step {s.step}</p>
                                  <h3 className="text-sm font-black text-foreground">{s.title}</h3>
                                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{s.desc}</p>
                                </div>
                              </div>
                            ))}
                          </div>

                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                            ← Select a course on the left to begin
                          </p>
                        </div>
                      </div>
                    )}
                    {globalImplementationList.length > 0 && !lastVisited && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-primary">
                          <PresentationChartLineIcon className="w-4 h-4" />
                          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Active Class Plans</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {globalImplementationList.map(plan => {
                            const { totalWeeks, completedWeeks, progressPct } = getLessonPlanOperationStats(plan.plan_data);
                            
                            return (
                            <Link
                              key={plan.id}
                              href={`/dashboard/lesson-plans/${plan.id}`}
                              className="group bg-card border border-white/5 hover:border-primary/40 p-5 space-y-4 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-1 rounded-xl flex flex-col justify-between min-h-[160px]"
                            >
                              <div>
                                <div className="flex items-start justify-between gap-3 mb-3">
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">
                                      {plan.classes?.name || 'Unnamed Class'}
                                    </p>
                                    <h5 className="text-sm font-black text-white group-hover:text-primary transition-colors truncate">
                                      {plan.courses?.title || 'Unknown Course'}
                                    </h5>
                                  </div>
                                  <span className="bg-primary/10 border border-primary/20 text-primary text-[10px] font-black px-2 py-1 rounded shrink-0">
                                    {plan.term || 'Term 1'}
                                  </span>
                                </div>
                                <div className="space-y-1.5">
                                  <div className="flex justify-between items-center text-[10px] font-bold text-muted-foreground">
                                    <span className="uppercase tracking-widest">Progress</span>
                                    <span>{completedWeeks} / {totalWeeks} Weeks</span>
                                  </div>
                                  <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden border border-white/5">
                                    <div className="h-full bg-gradient-to-r from-primary to-fuchsia-500 rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
                                  </div>
                                </div>
                              </div>
                              <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase tracking-widest text-primary opacity-80 group-hover:opacity-100 transition-opacity">Open Lesson Plan →</span>
                                <span className="text-[9px] font-medium text-muted-foreground flex items-center gap-1"><CheckCircleIcon className="w-3 h-3 text-emerald-500" /> Active Plan</span>
                              </div>
                            </Link>
                          )})}
                        </div>
                      </div>
                    )}
                    <div className="space-y-6">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-primary">
                          <Squares2X2Icon className="w-4 h-4" />
                          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Course Catalog</span>
                        </div>
                        {(isTeacher || isSchool) && (
                          <p className="text-[11px] text-muted-foreground font-medium">
                            Showing courses linked to your assigned school classes.
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {quickChooserCourses.map(({ prog, course }) => (
                          <button
                            key={course.id}
                            type="button"
                            onClick={() => selectCourse(prog, course)}
                            className="group text-left bg-card border border-white/5 hover:border-primary/40 p-5 space-y-4 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-1 rounded-xl"
                          >
                            <div className="space-y-1">
                              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60">
                                {prog.name}
                              </p>
                              <h3 className="text-sm font-black text-white group-hover:text-primary transition-colors line-clamp-2 min-h-[2.5em]">
                                {course.title}
                              </h3>
                            </div>
                            <div className="pt-2 flex items-center justify-between border-t border-white/5">
                              <span className="text-[10px] font-black uppercase tracking-widest text-primary opacity-0 group-hover:opacity-100 transition-opacity">Select Course →</span>
                              <div className="p-1 rounded bg-white/5">
                                <ChevronRightIcon className="w-3 h-3 text-muted-foreground" />
                              </div>
                            </div>
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
              ) : (loadingCurr || !programs.length) ? (
                <div className="flex-1 px-4 md:px-6 py-8 space-y-12 animate-pulse">
                  {/* Skeleton Header mirroring the real one */}
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 pb-8 border-b border-white/5 relative">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-6 bg-white/5 rounded-lg" />
                        <div className="w-16 h-6 bg-white/5 rounded-lg opacity-50" />
                      </div>
                      <div className="space-y-2">
                        <div className="h-10 w-64 bg-white/5 rounded-xl" />
                        <div className="h-4 w-96 bg-white/5 rounded-lg opacity-60" />
                      </div>
                    </div>
                    <div className="w-32 h-12 bg-white/5 rounded-xl" />
                  </div>
                  {/* Skeleton Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="h-48 bg-white/5 rounded-2xl" />
                    <div className="h-48 bg-white/5 rounded-2xl" />
                  </div>
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
                /* No curriculum yet — staff empty state unified with premium aesthetics */
                <div className="px-4 md:px-6 py-8 space-y-12 max-w-5xl">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 pb-8 border-b border-white/5 relative">
                    <div className="absolute -top-6 -left-6 w-32 h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
                    <div className="space-y-4 relative z-10">
                      <div className="flex flex-wrap items-center gap-2 text-primary">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-[10px] font-black uppercase tracking-[0.2em]">
                          <InformationCircleIcon className="w-3 h-3" /> System Status
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60">
                          Draft Mode
                        </span>
                      </div>

                      <div className="space-y-1">
                        <h1 className="text-2xl sm:text-4xl font-black leading-tight tracking-tighter text-foreground">
                          {selectedCourse.title}
                        </h1>
                        <p className="text-sm text-muted-foreground font-medium max-w-xl">
                          No syllabus yet for this course. Click <strong className="text-foreground">Generate Syllabus</strong> to let AI build a full term-by-term plan — with lesson topics, assessments, and activities.
                        </p>
                      </div>
                    </div>

                    {canGenerate && (
                      <button
                        onClick={openGenerateModal}
                    className="relative z-10 flex items-center gap-3 px-6 py-3.5 bg-primary hover:bg-primary text-primary-foreground text-[11px] font-black uppercase tracking-[0.2em] transition-all rounded-lg shrink-0"
                      >
                        <SparklesIcon className="w-4 h-4" /> Generate Syllabus
                      </button>
                    )}
                  </div>
                  {curriculumList.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-primary">
                          <ClockIcon className="w-4 h-4" />
                          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Syllabus History</span>
                        </div>
                        {isAdmin && curriculumList.length > 1 && (
                          <button
                            onClick={async () => {
                              if (!confirm(`Delete ALL ${curriculumList.length} syllabus versions for "${selectedCourse?.title}"?\n\nThis will also delete all linked lesson plans and week tracking. This cannot be undone.`)) return;
                              for (const c of curriculumList) {
                                await fetch(`/api/curricula/${c.id}`, { method: 'DELETE' });
                              }
                              setCurriculumList([]);
                              setCurriculum(null);
                              setTracking([]);
                              toast.success('All syllabus versions deleted');
                            }}
                            className="text-[10px] font-black uppercase tracking-widest text-rose-400 border border-rose-500/30 px-3 py-1.5 hover:bg-rose-500/10 transition-colors"
                          >
                            Delete All
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {curriculumList.map((c) => {
                          const schoolName = c.school_id ? (c.schools?.name ?? 'School') : 'Rillcod shared template';
                          const terms = c.content?.terms?.length ?? 0;
                          const weeks = (c.content?.terms ?? []).reduce((sum: number, t: any) => sum + ((t?.weeks ?? []).length), 0);
                          return (
                            <div key={c.id} className="group relative bg-card border border-white/5 hover:border-primary/40 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/5">
                              <button
                                onClick={() => { void selectCurriculumVersion(c.id); }}
                                className="w-full text-left p-5 space-y-4"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">
                                      {schoolName}
                                    </p>
                                    <h3 className="text-sm font-black text-foreground group-hover:text-primary transition-colors">
                                      {c.content?.description || `Version ${c.version}`}
                                    </h3>
                                  </div>
                                  <span className="bg-primary/10 border border-primary/20 text-primary text-[10px] font-black px-2 py-1">
                                    v{c.version}
                                  </span>
                                </div>
                                <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-black uppercase tracking-widest opacity-60">
                                  <span className="flex items-center gap-1.5"><CalendarDaysIcon className="w-3.5 h-3.5" /> {new Date(c.created_at).toLocaleDateString()}</span>
                                  <span className="flex items-center gap-1.5"><BookOpenIcon className="w-3.5 h-3.5" /> {terms} Terms · {weeks} Weeks</span>
                                </div>
                                <div className="pt-1 flex items-center justify-between">
                                  <span className="text-[10px] font-black uppercase tracking-widest text-primary opacity-0 group-hover:opacity-100 transition-opacity">Open Syllabus →</span>
                                </div>
                              </button>
                              {/* Bottom action row: clone (platform only, teachers) + delete */}
                              <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
                                {/* Clone to My School — platform cards only, teachers */}
                                {isTeacher && !c.school_id && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleClone(c.id); }}
                                    disabled={cloning}
                                    className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-emerald-400/70 hover:text-emerald-400 border border-emerald-500/0 hover:border-emerald-500/30 px-2 py-1 transition-all hover:bg-emerald-500/10 disabled:opacity-50"
                                    title="Clone to my school"
                                  >
                                    {cloning ? <ArrowPathIcon className="w-3 h-3 animate-spin" /> : <DocumentDuplicateIcon className="w-3 h-3" />}
                                    Clone
                                  </button>
                                )}
                                {/* Delete — school curricula only (admin always, teacher only their own) */}
                                {(isAdmin || (isTeacher && !!c.school_id)) && (
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      if (!confirm(`Delete "${c.content?.description || `Version ${c.version}`}"?\n\nThis will also delete all linked lesson plans and week tracking. This cannot be undone.`)) return;
                                      const res = await fetch(`/api/curricula/${c.id}`, { method: 'DELETE' });
                                      if (res.ok) {
                                        const updated = curriculumList.filter(x => x.id !== c.id);
                                        setCurriculumList(updated);
                                        toast.success('Syllabus version deleted');
                                      } else {
                                        const j = await res.json().catch(() => ({}));
                                        toast.error(j.error ?? 'Delete failed');
                                      }
                                    }}
                                    className="text-[9px] font-black uppercase tracking-widest text-rose-400/60 hover:text-rose-400 border border-rose-500/0 hover:border-rose-500/30 px-2 py-1 transition-all hover:bg-rose-500/10"
                                    title="Delete this syllabus version"
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Curriculum content */
                <div className="px-4 md:px-6 py-6 space-y-6 max-w-5xl">
                  {/* ── Curriculum header — mobile-first ── */}
                  <div className="pb-6 border-b border-white/5 space-y-4 relative">
                    <div className="absolute -top-6 -left-6 w-32 h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

                    {/* Row 1: unified Year → Curriculum → Term control bar */}
                    <div className="flex flex-wrap items-center gap-2 relative z-10">
                      {/* Academic Year */}
                      <div className="inline-flex items-center h-8 rounded-xl border border-border bg-card/60 backdrop-blur-sm overflow-hidden">
                        <div className="flex items-center gap-1.5 px-2.5 border-r border-border h-full">
                          <CalendarDaysIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Year</span>
                        </div>
                        {canModifyCurriculum ? (
                          <select
                            value={academicYear}
                            onChange={e => setGlobalAcademicYear(e.target.value, profile?.school_id ?? undefined)}
                            className="bg-transparent border-none text-[10px] font-black tracking-widest text-primary focus:ring-0 px-2.5 h-full cursor-pointer"
                            title="Academic Year"
                          >
                            {yearOptions.map(y => (
                              <option key={y} value={y} className="bg-[#0a0a0a] text-foreground">{y}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="px-2.5 text-[10px] font-black text-primary">{academicYear}</span>
                        )}
                      </div>

                      <ChevronRightIcon className="w-3 h-3 text-muted-foreground/40 shrink-0" />

                      {/* Curriculum */}
                      <div className="inline-flex items-center h-8 rounded-xl border border-border bg-card/60 backdrop-blur-sm overflow-hidden">
                        <div className={`flex items-center gap-1.5 px-2.5 border-r border-border h-full ${curriculum.school_id ? 'text-emerald-400' : 'text-primary'}`}>
                          {curriculum.school_id
                            ? <BuildingOfficeIcon className="w-3 h-3 shrink-0" />
                            : <ShieldCheckIcon className="w-3 h-3 shrink-0" />}
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Curriculum</span>
                        </div>
                        {curriculumList.length > 1 ? (
                          <select
                            value={curriculum.id}
                            onChange={(e) => selectCurriculumVersion(e.target.value)}
                            className="bg-transparent border-none text-[10px] font-black tracking-widest text-primary focus:ring-0 px-2.5 h-full cursor-pointer"
                          >
                            {curriculumList.filter(c => !c.school_id).length > 0 && (
                              <optgroup label="── Platform template">
                                {curriculumList.filter(c => !c.school_id).map((c) => (
                                  <option key={c.id} value={c.id} className="bg-[#0a0a0a] text-foreground">
                                    Platform{curriculumList.filter(cx => !cx.school_id).length > 1 ? ` v${c.version}` : ''}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {curriculumList.filter(c => !!c.school_id).length > 0 && (
                              <optgroup label="── School versions">
                                {curriculumList.filter(c => !!c.school_id).map((c) => (
                                  <option key={c.id} value={c.id} className="bg-[#0a0a0a] text-foreground">
                                    {c.schools?.name ?? 'School'}{curriculumList.filter(cx => cx.school_id === c.school_id).length > 1 ? ` v${c.version}` : ''}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                        ) : (
                          <span className="px-2.5 text-[10px] font-black text-primary">
                            {curriculum.school_id ? (curriculum.schools?.name ?? 'School') : 'Platform'}
                          </span>
                        )}
                      </div>

                      {termCount > 0 && (
                        <>
                          <ChevronRightIcon className="w-3 h-3 text-muted-foreground/40 shrink-0" />

                          {/* Term */}
                          <div className="inline-flex items-center h-8 rounded-xl border border-border bg-card/60 backdrop-blur-sm overflow-hidden">
                            <div className="flex items-center gap-1.5 px-2.5 border-r border-border h-full">
                              <BookOpenIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Term</span>
                            </div>
                            <select
                              value={activeTerm}
                              onChange={e => { setActiveTerm(Number(e.target.value)); setActiveWeek(null); }}
                              className="bg-transparent border-none text-[10px] font-black tracking-widest text-primary focus:ring-0 px-2.5 h-full cursor-pointer"
                            >
                              {[...(curriculum.content.terms ?? [])].sort((a, b) => a.term - b.term).map(term => {
                                const tw = tracking.filter(t => t.term_number === term.term);
                                const termWeeks = term.weeks?.length ?? 0;
                                const termDone = tw.filter(t => t.status === 'completed').length;
                                const isNow = term.term === getCurrentTerm();
                                const baseLabel = TERM_LABEL[term.term] ?? `Term ${term.term}`;
                                return (
                                  <option key={term.term} value={term.term} className="bg-[#0a0a0a] text-foreground">
                                    {isNow ? '▶ ' : ''}{baseLabel} ({termDone}/{termWeeks})
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Row 2: title + meta */}
                    <div className="space-y-1 relative z-10">
                      <h1 className="text-xl sm:text-3xl font-black leading-tight tracking-tighter text-foreground">
                        {curriculum.content.course_title}
                      </h1>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground font-medium">
                        <span className="flex items-center gap-1"><BookOpenIcon className="w-3 h-3" /> {termCount} Terms</span>
                        <span className="w-1 h-1 rounded-full bg-white/20" />
                        <span className="flex items-center gap-1"><CalendarDaysIcon className="w-3 h-3" /> {new Date(curriculum.created_at).toLocaleDateString()}</span>
                        {allWeeks.length > 0 && completedCount > 0 && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-white/20" />
                            <span className="text-emerald-400 font-black">{completedCount}/{allWeeks.length} taught</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Row 3: action buttons — primary then secondary, all wrap */}
                    <div className="flex flex-wrap gap-2 relative z-10">
                      {canModifyCurriculum && (
                        <button
                          onClick={openGenerateModal}
                          className="flex items-center gap-2 px-4 py-2 text-[11px] font-black uppercase tracking-widest bg-primary hover:bg-primary/90 text-primary-foreground transition-all rounded-lg shadow-lg shadow-primary/20"
                        >
                          <SparklesIcon className="w-3.5 h-3.5" /> Generate
                        </button>
                      )}
                      {canPublish && (
                        curriculum.is_visible_to_school ? (
                          <button
                            onClick={() => togglePublish(false)}
                            disabled={publishing}
                            className="flex items-center gap-2 px-3 py-2 text-[11px] font-black uppercase tracking-widest bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-all rounded-lg"
                            title="Make private"
                          >
                            {publishing ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <PencilIcon className="w-3.5 h-3.5" />}
                            <span className="hidden xs:inline">Make Private</span>
                            <span className="xs:hidden">Private</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => togglePublish(true)}
                            disabled={publishing}
                            className="flex items-center gap-2 px-3 py-2 text-[11px] font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-500 text-white transition-all rounded-lg"
                            title="Share with school"
                          >
                            {publishing ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <CheckCircleIcon className="w-3.5 h-3.5" />}
                            <span className="hidden sm:inline">Share with School</span>
                            <span className="sm:hidden">Share</span>
                          </button>
                        )
                      )}
                      {/* Clone to school — only on platform curricula, for teachers */}
                      {isTeacher && !curriculum.school_id && (
                        <button
                          onClick={() => handleClone(curriculum.id)}
                          disabled={cloning}
                          className="flex items-center gap-2 px-4 py-2 text-[11px] font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-500 text-white transition-all rounded-lg shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                          title="Copy this platform template to your school so you can customise it"
                        >
                          {cloning ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <DocumentDuplicateIcon className="w-3.5 h-3.5" />}
                          <span className="hidden sm:inline">Clone to My School</span>
                          <span className="sm:hidden">Clone</span>
                        </button>
                      )}
                      <button
                        onClick={openPrintOptions}
                        className="flex items-center gap-2 px-3 py-2 text-[11px] font-black uppercase tracking-widest border border-border text-foreground hover:bg-muted/50 transition-colors rounded-lg"
                      >
                        <PrinterIcon className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Print / Export</span>
                        <span className="sm:hidden">Export</span>
                      </button>
                      {canModifyCurriculum && (
                        <button
                          onClick={() => {
                            setNotifSettingsDraft(curriculum.content.notification_settings ?? { mode: 'all', channels: ['whatsapp'] });
                            setShowNotifSettings(true);
                          }}
                          className="flex items-center gap-2 px-3 py-2 text-[11px] font-black uppercase tracking-widest border border-border text-foreground hover:bg-muted/50 transition-colors rounded-lg"
                        >
                          <BellIcon className="w-3.5 h-3.5" /> Notifications
                        </button>
                      )}
                      <Link
                        href="/dashboard/curriculum/progress"
                        className="flex items-center gap-2 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground border border-border hover:bg-muted/50 transition-colors rounded-lg"
                      >
                        <ChartBarIcon className="w-3.5 h-3.5" /> Reports
                      </Link>
                      {(isAdmin || (isTeacher && !!curriculum.school_id)) && (
                        <button
                          onClick={handleDeleteCurriculum}
                          disabled={deleting}
                          className="flex items-center gap-2 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-rose-400 border border-rose-500/30 hover:bg-rose-500/10 transition-all rounded-lg disabled:opacity-50"
                        >
                          {deleting ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <TrashIcon className="w-3.5 h-3.5" />}
                          Delete
                        </button>
                      )}
                    </div>

                    {/* Description — below buttons on all sizes */}
                    {curriculum.content.description && (
                      <div className="relative max-w-2xl">
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/30 rounded-full" />
                        <p className="text-sm text-muted-foreground/90 leading-relaxed pl-4 italic font-medium">
                          &ldquo;{curriculum.content.description}&rdquo;
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Term content */}
                  {currentTermData && (
                    <div className="space-y-2">
                      {/* Term title + date + actions */}
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h2 className="text-lg font-black">{currentTermData.title || (TERM_LABEL[currentTermData.term] ?? `Term ${currentTermData.term}`)}</h2>
                          {(() => {
                            const customStart = currentTermData.start_date;
                            const td = customStart
                              ? { start: customStart, end: termDatesNg(String(activeTerm), academicYear)?.end ?? '' }
                              : termDatesNg(String(activeTerm), academicYear);
                            if (!td) return null;
                            return (
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {editingTermDate === activeTerm ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="date"
                                      defaultValue={currentTermData.start_date ?? termDatesNg(String(activeTerm), academicYear)?.start ?? ''}
                                      onBlur={e => { if (e.target.value) saveTermDate(activeTerm, e.target.value); else setEditingTermDate(null); }}
                                      autoFocus
                                      className="text-xs bg-background border border-primary rounded px-2 py-1 text-foreground"
                                    />
                                    {savingTermDate && <ArrowPathIcon className="w-3 h-3 animate-spin text-muted-foreground" />}
                                  </div>
                                ) : (
                                  <>
                                    <p className="text-[11px] text-muted-foreground font-bold">
                                      {new Date(td.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                      {td.end ? (
                                        <>{' – '}{new Date(td.end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</>
                                      ) : null}
                                    </p>
                                    {canModifyCurriculum && (
                                      <button
                                        onClick={() => {
                                          setEditingTermDate(activeTerm);
                                          setTermDateDraft(currentTermData.start_date ?? termDatesNg(String(activeTerm), academicYear)?.start ?? '');
                                        }}
                                        className="p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                                        title="Edit term start date"
                                      >
                                        <PencilIcon className="w-3 h-3" />
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                        {canTrack && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => bulkMarkTerm(activeTerm, 'completed')}
                              disabled={bulkMarkingTerm === activeTerm}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-all disabled:opacity-50"
                              title="Mark every week in this term as completed"
                            >
                              {bulkMarkingTerm === activeTerm
                                ? <ArrowPathIcon className="w-3 h-3 animate-spin" />
                                : <CheckCircleIcon className="w-3 h-3" />}
                              Mark term complete
                            </button>
                          </div>
                        )}
                      </div>
                      {currentTermData.objectives?.length > 0 && (
                        <ul className="flex flex-wrap gap-2">
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
                        const dateRange = weekDateRange(activeTerm, week.week, academicYear, currentTermData?.start_date);

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
                                  <div>
                                    <span className="text-[11px] font-black text-muted-foreground uppercase tracking-[0.2em] opacity-60">
                                      Week {week.week}
                                    </span>
                                    {dateRange && (
                                      <p className="text-[9px] text-muted-foreground/50 font-bold mt-0.5 leading-none">
                                        {dateRange.start} – {dateRange.end}
                                      </p>
                                    )}
                                  </div>
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

                  {/* ── Course overview + learning outcomes (from syllabus content) ── */}
                  {(curriculum.content.overview || (curriculum.content.learning_outcomes?.length > 0)) && (
                    <div className="space-y-4 mt-2">
                      {curriculum.content.overview && (
                        <div className="bg-card border border-border p-5">
                          <h3 className="text-[10px] font-black uppercase tracking-widest text-primary mb-3">About this course</h3>
                          <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">{curriculum.content.overview}</p>
                        </div>
                      )}
                      {curriculum.content.learning_outcomes?.length > 0 && (
                        <div className="bg-card border border-border p-5">
                          <h3 className="text-[10px] font-black uppercase tracking-widest text-primary mb-3">What students will learn</h3>
                          <ul className="space-y-2">
                            {curriculum.content.learning_outcomes.map((o: string, i: number) => (
                              <li key={i} className="flex gap-3 text-sm text-foreground/80">
                                <span className="text-emerald-400 font-black shrink-0 text-xs mt-0.5">✓</span>
                                <span>{o}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Apply a Lesson Template (QA Spine) ── */}
                  {canGenerate && (
                    <div className="bg-card border border-border">
                      <button
                        type="button"
                        onClick={() => { setQaSpineOpen((o) => !o); setQaApplyErr(''); setQaPreviewErr(''); }}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-muted/20 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <BoltIcon className="w-4 h-4 text-cyan-400 shrink-0" />
                          <div>
                            <p className="text-xs font-black text-foreground">Apply a Lesson Template</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">Instantly fill your week topics using a ready-made teaching sequence — saves time and follows a proven structure</p>
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
                                <p className="text-[11px] text-amber-400">This course isn't linked to a programme yet — link it in the course catalog first before using a template.</p>
                              ) : (
                                <>
                                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    Select your class and student year, then preview the suggested week order. If it looks right, apply it — your week topics will be filled in automatically.
                                  </p>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                      <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block">Which class?</label>
                                      <select
                                        className={SELECT_CLS}
                                        value={qaClassId}
                                        onChange={(e) => { setQaClassId(e.target.value); setQaPreviewData(null); setQaPreviewStamp(''); }}
                                      >
                                        <option value="">— Pick a class —</option>
                                        {[...qaClassOptions]
                                          .sort((a, b) => {
                                            const ap = a.program_id === programIdForQa ? 0 : 1;
                                            const bp = b.program_id === programIdForQa ? 0 : 1;
                                            if (ap !== bp) return ap - bp;
                                            return (a.name || '').localeCompare(b.name || '');
                                          })
                                          .map((c) => (
                                            <option key={c.id} value={c.id}>
                                              {c.name || c.id}{c.program_id && c.program_id !== programIdForQa ? ' (different programme)' : ''}
                                            </option>
                                          ))}
                                      </select>
                                    </div>

                                    <div className="space-y-1.5">
                                      <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block">Student year</label>
                                      <select
                                        className={SELECT_CLS}
                                        value={qaYear}
                                        onChange={(e) => { setQaYear(Number(e.target.value)); setQaPreviewStamp(''); }}
                                      >
                                        <option value={1}>Year 1 — beginners</option>
                                        <option value={2}>Year 2 — intermediate</option>
                                        <option value={3}>Year 3 — advanced</option>
                                      </select>
                                    </div>
                                  </div>

                                  {qaClassId && (
                                    <div className="space-y-1.5">
                                      <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block">How strictly should the template be followed?</label>
                                      <div className="flex gap-2 flex-wrap">
                                        <button
                                          type="button"
                                          disabled={qaClassGradeMode === 'optional' || qaClassModeSaving}
                                          onClick={() => void saveQaClassGradeMode('optional')}
                                          className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border transition-colors ${qaClassGradeMode === 'optional' ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' : 'border-border text-muted-foreground hover:bg-muted/30'} disabled:opacity-60`}
                                        >Flexible — AI adapts it to this class</button>
                                        <button
                                          type="button"
                                          disabled={qaClassGradeMode === 'compulsory' || qaClassModeSaving}
                                          onClick={() => void saveQaClassGradeMode('compulsory')}
                                          className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border transition-colors ${qaClassGradeMode === 'compulsory' ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted/30'} disabled:opacity-60`}
                                        >Fixed — use the template exactly as-is</button>
                                        {qaClassModeErr && <p className="text-[10px] text-rose-400 font-bold w-full">{qaClassModeErr}</p>}
                                      </div>
                                    </div>
                                  )}

                                  <label className="flex items-start gap-2 cursor-pointer">
                                    <input type="checkbox" className="mt-0.5" checked={qaOverwrite} onChange={(e) => setQaOverwrite(e.target.checked)} />
                                    <span className="text-[11px] text-muted-foreground">Replace my existing week topics if any already exist</span>
                                  </label>

                                  <div className="flex gap-2 flex-wrap">
                                    <button
                                      type="button"
                                      onClick={() => void runQaSpinePreview()}
                                      disabled={!qaClassId || qaPreviewLoading}
                                      className="inline-flex items-center gap-1.5 px-4 py-2 text-[10px] font-black uppercase tracking-widest border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-50 transition-colors"
                                    >
                                      {qaPreviewLoading ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <EyeIcon className="w-3.5 h-3.5" />}
                                      Preview first
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void applyQaSpine()}
                                      disabled={qaApplyLoading || !programIdForQa || qaNeedsFreshPreview}
                                      className="inline-flex items-center gap-1.5 px-4 py-2 text-[10px] font-black uppercase tracking-widest border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
                                    >
                                      {qaApplyLoading ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <BoltIcon className="w-3.5 h-3.5" />}
                                      Apply template
                                    </button>
                                  </div>

                                  {qaNeedsFreshPreview && <p className="text-amber-400 text-[10px]">Click "Preview first" before applying.</p>}
                                  {qaPreviewErr && <p className="text-rose-400 text-[11px] font-bold">{qaPreviewErr}</p>}
                                  {qaApplyErr && <p className="text-rose-400 text-[11px] font-bold">{qaApplyErr}</p>}

                                  {qaPreviewData && (
                                    <div className="p-3 bg-muted/20 border border-border space-y-3">
                                      <p className="text-[10px] font-black uppercase text-cyan-300">Suggested week-by-week plan</p>
                                      {qaPreviewData.terms.map((t) => (
                                        <div key={t.term}>
                                          <p className="text-[9px] font-black text-muted-foreground mb-1">Term {t.term}</p>
                                          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-0.5 text-[10px] text-muted-foreground max-h-40 overflow-y-auto">
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
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* ── Assign to a class CTA ── */}
                  {canTrack && (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 px-4 py-4 bg-primary/10 border border-primary/20">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-foreground">Ready to teach this to a class?</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">Assign this syllabus to a class and it becomes a week-by-week lesson plan for your students.</p>
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
                            if (sid) fetch(isTeacher ? '/api/classes?mine=true' : `/api/classes?school_id=${sid}`).then(r => r.json()).then(j => setImplClasses((j.data || []).filter((c: any) => !sid || c.school_id === sid)));
                            else setImplClasses([]);
                            setShowImplement(true);
                          }}
                          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary text-white text-[11px] font-black uppercase tracking-widest transition-all"
                        >
                          <RocketLaunchIcon className="w-4 h-4 shrink-0" />
                          Assign to a Class
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
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
          <div className="relative w-full md:max-w-2xl bg-background md:border-l border-t md:border-t-0 border-border flex flex-col max-h-[92vh] md:h-full overflow-hidden shadow-2xl rounded-t-2xl md:rounded-xl">
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
                {(() => {
                  const dr = weekDateRange(activeTerm, activeWeek.week, academicYear, curriculum?.content?.terms?.find(t => t.term === activeTerm)?.start_date);
                  return dr ? (
                    <p className="text-[10px] text-muted-foreground/60 font-bold mt-1">
                      {dr.start} – {dr.end}
                    </p>
                  ) : null;
                })()}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {canGenerate && (activeWeek.lesson_plan || activeWeek.assessment_plan) && (
                  <button
                    onClick={() => {
                      if (editingWeekContent) {
                        setEditingWeekContent(false);
                      } else {
                        setWeekPlanDraft(activeWeek.lesson_plan ? JSON.parse(JSON.stringify(activeWeek.lesson_plan)) : null);
                        setWeekAssessmentDraft(activeWeek.assessment_plan ? JSON.parse(JSON.stringify(activeWeek.assessment_plan)) : null);
                        setEditingWeekContent(true);
                      }
                    }}
                    className={`min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors ${editingWeekContent ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                    title={editingWeekContent ? 'Cancel editing' : 'Edit week content'}
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => setActiveWeek(null)} className="text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Panel body — overflow-x-hidden prevents horizontal panning */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5 space-y-6">

              {/* LESSON WEEK */}
              {activeWeek.type === 'lesson' && activeWeek.lesson_plan && (
                editingWeekContent && weekPlanDraft ? (
                  <EditableLessonPlan
                    plan={weekPlanDraft}
                    onChange={setWeekPlanDraft}
                    onSave={saveWeekContent}
                    onCancel={() => setEditingWeekContent(false)}
                    saving={savingWeekContent}
                  />
                ) : (
                  <LessonPlanView plan={activeWeek.lesson_plan} />
                )
              )}

              {/* ASSESSMENT / EXAMINATION WEEK */}
              {(activeWeek.type === 'assessment' || activeWeek.type === 'examination') && activeWeek.assessment_plan && (
                editingWeekContent && weekAssessmentDraft ? (
                  <EditableAssessmentPlan
                    plan={weekAssessmentDraft}
                    onChange={setWeekAssessmentDraft}
                    onSave={saveWeekContent}
                    onCancel={() => setEditingWeekContent(false)}
                    saving={savingWeekContent}
                  />
                ) : (
                  <AssessmentPlanView plan={activeWeek.assessment_plan} type={activeWeek.type} />
                )
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

                {/* ── Class not assigned: gate ── */}
                {isTeacher && implementationList.filter((p: any) => p.curriculum_version_id === curriculum?.id).length === 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 p-3 border border-amber-500/30 bg-amber-500/10">
                      <LockClosedIcon className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-black text-amber-300">No class assigned yet</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">Push this syllabus to one of your classes to unlock week tracking and content creation.</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setActiveWeek(null);
                        const sid = curriculum?.school_id || assignedSchools[0]?.id || '';
                        setImplError('');
                        setImplForm(f => ({ ...f, school_id: sid, class_id: '' }));
                        if (sid) fetch(isTeacher ? '/api/classes?mine=true' : `/api/classes?school_id=${sid}`).then(r => r.json()).then(j => setImplClasses((j.data || []).filter((c: any) => !sid || c.school_id === sid)));
                        else setImplClasses([]);
                        setShowImplement(true);
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-black uppercase tracking-widest transition-all"
                    >
                      <RocketLaunchIcon className="w-4 h-4" /> Push to a Class
                    </button>
                  </div>
                ) : (
                  <>
                {/* ── Multi-class context picker ── */}
                {isTeacher && implementationList.filter((p: any) => p.curriculum_version_id === curriculum?.id).length > 1 && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground font-bold shrink-0">Class:</span>
                    <select
                      value={selectedPlanId}
                      onChange={e => setSelectedPlanId(e.target.value)}
                      className="flex-1 px-2 py-1.5 bg-background border border-border font-bold text-xs"
                    >
                      {implementationList.filter((p: any) => p.curriculum_version_id === curriculum?.id).map((p: any) => (
                        <option key={p.id} value={p.id}>{p.classes?.name ?? 'Unknown class'} — {p.term ?? ''}</option>
                      ))}
                    </select>
                  </div>
                )}


                {/* Quick-create actions */}
                {canTrack && (
                  <div className="space-y-3 bg-white/[0.02] border border-white/10 rounded-2xl p-4">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest text-center">Actions for this week</p>

                    {/* Assessment / Exam quick-create — shown only for those week types */}
                    {(activeWeek.type === 'assessment' || activeWeek.type === 'examination') && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          onClick={() => {
                            const params = new URLSearchParams({
                              topic: activeWeek.topic,
                              week: String(activeWeek.week),
                              term: String(activeTerm),
                              course: selectedCourse?.title ?? '',
                              curriculum_id: curriculum?.id ?? '',
                              exam_type: activeWeek.type === 'examination' ? 'examination' : 'evaluation',
                            });
                            router.push(`/dashboard/cbt/new?${params.toString()}`);
                          }}
                          className="flex items-center justify-center gap-1.5 px-3 py-2.5 border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors rounded-xl"
                        >
                          <DocumentTextIcon className="w-4 h-4" />
                          <span className="text-xs font-bold">Create CBT Exam</span>
                        </button>
                        <button
                          onClick={async () => {
                            if (!curriculum) return;
                            const dr = weekDateRange(activeTerm, activeWeek.week, academicYear, curriculum?.content?.terms?.find(t => t.term === activeTerm)?.start_date);
                            const dueDate = dr
                              ? new Date(new Date().getFullYear(), new Date().getMonth(), parseInt(dr.end.split(' ')[0]) + 2).toISOString().split('T')[0]
                              : new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
                            const r = await fetch('/api/assignments', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                title: `${activeWeek.type === 'examination' ? 'Exam' : 'Assessment'}: ${activeWeek.topic}`,
                                description: `Term ${activeTerm} Week ${activeWeek.week} — ${activeWeek.topic}`,
                                assignment_type: activeWeek.type === 'examination' ? 'exam' : 'test',
                                due_date: dueDate,
                                max_points: 100,
                                is_active: true,
                                curriculum_week_type: activeWeek.type,
                              }),
                            });
                            const j = await r.json();
                            if (r.ok) {
                              toast.success('Assessment assignment created');
                              router.push(`/dashboard/assignments/${j.data.id}`);
                            } else {
                              toast.error(j.error ?? 'Failed to create assignment');
                            }
                          }}
                          className="flex items-center justify-center gap-1.5 px-3 py-2.5 border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors rounded-xl"
                        >
                          <ClipboardDocumentListIcon className="w-4 h-4" />
                          <span className="text-xs font-bold">Create Assignment</span>
                        </button>
                      </div>
                    )}

                    {activeWeek.type === 'lesson' && (
                      <p className="text-xs text-muted-foreground text-center">
                        Head to <Link href="/dashboard/lesson-plans" className="text-primary hover:underline">Lesson Plans</Link> to create and manage lessons, projects, and assignments for your classes.
                      </p>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={printWeek}
                        className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-center border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors rounded-xl bg-white/5"
                      >
                        <PrinterIcon className="w-4 h-4" />
                        <span className="text-xs font-bold">Print Week</span>
                      </button>
                      <button
                        onClick={() => exportCurriculumPdf('week')}
                        disabled={exportingPdf}
                        className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-center border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors rounded-xl bg-white/5 disabled:opacity-50"
                      >
                        {exportingPdf ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <ArrowDownTrayIcon className="w-4 h-4" />}
                        <span className="text-xs font-bold">Export Week PDF</span>
                      </button>
                      <button
                        onClick={openPrintOptions}
                        className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-center border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors rounded-xl bg-white/5 col-span-full sm:col-span-1"
                      >
                        <PrinterIcon className="w-4 h-4" />
                        <span className="text-xs font-bold">Print / Export Syllabus</span>
                      </button>
                    </div>
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
              </>
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

              {(isAdmin || (isTeacher && assignedSchools.length > 1)) && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Syllabus scope</label>
                  <select
                    value={generateScope}
                    onChange={(e) => { if (e.target.value) syncScopeToCurriculum(e.target.value === 'platform' ? 'platform' : e.target.value); }}
                    className={SELECT_CLS}
                  >
                    <option value="" disabled>— Select an option —</option>
                    {isAdmin && <option value="platform">1. Rillcod platform (shared template)</option>}
                    {assignedSchools.map((s, i) => (
                      <option key={s.id} value={s.id}>{isAdmin ? i + 2 : i + 1}. {s.name}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-muted-foreground">
                    {generateScope === 'platform'
                      ? isAdmin
                        ? 'Shared Rillcod template — visible to all schools.'
                        : 'Viewing platform template. Select a school below to generate a private copy for that school.'
                      : `Syllabus will be saved privately for ${scopeLabel} only.`}
                  </p>
                </div>
              )}

              {/* ── Delivery format ── */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-2">Delivery format</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {([
                    { key: 'school',    label: 'School',     sub: 'Nigerian term calendar' },
                    { key: 'bootcamp',  label: 'Bootcamp',   sub: 'Intensive short course' },
                    { key: 'online',    label: 'Online',     sub: 'Virtual / cohort-based' },
                    { key: 'selfpaced', label: 'Self-paced', sub: 'Learner-driven modules' },
                  ] as const).map(({ key, label, sub }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setCurriculumFormat(key)}
                      className={`px-3 py-2.5 border text-left transition-all ${
                        curriculumFormat === key
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
                      }`}
                    >
                      <div className="text-xs font-black">{label}</div>
                      <div className="text-[9px] mt-0.5 opacity-75 leading-snug">{sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Common: grade + topic ── */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">
                    {curriculumFormat === 'bootcamp' || curriculumFormat === 'online' || curriculumFormat === 'selfpaced' ? 'Audience / Level' : 'Grade Level'}
                  </label>
                  <select value={form.grade_level} onChange={e => setGradeForCurrentScope(e.target.value)} className={SELECT_CLS}>
                    <option value="General">General audience</option>
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                    {GRADE_LEVEL_OPTIONS.map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Topic Focus <span className="font-normal normal-case">(optional)</span></label>
                  <input
                    value={form.subject_area}
                    onChange={e => setForm(p => ({ ...p, subject_area: e.target.value }))}
                    placeholder="e.g. Python, Robotics, Web dev, AI basics"
                    className={INPUT_CLS}
                  />
                </div>
              </div>

              {/* ── Format-specific options ── */}
              {curriculumFormat === 'school' && (
                <div className="space-y-3 p-3 bg-muted/30 border border-border">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Weeks / Term</label>
                      <select value={form.weeks_per_term} onChange={e => setForm(p => ({ ...p, weeks_per_term: e.target.value }))} className={SELECT_CLS}>
                        {['8', '10', '12'].map(w => <option key={w}>{w}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col justify-end">
                      <p className="text-[10px] text-muted-foreground">Assessment: week 3, 6, {form.weeks_per_term}</p>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Which terms to generate</label>
                      <span className="text-[9px] font-black uppercase tracking-widest text-primary/70">
                        Now: {TERM_LABEL[getCurrentTerm()]}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {([1, 2, 3] as const).map((t) => {
                        const isCurrentCalendarTerm = t === getCurrentTerm();
                        const isSelected = selectedTerms.includes(t);
                        return (
                          <button key={t} type="button" onClick={() => toggleTerm(t)}
                            className={`relative flex-1 px-2 py-2 border text-center transition-all ${isSelected ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/40'}`}
                          >
                            {isCurrentCalendarTerm && (
                              <span className={`absolute -top-1.5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest rounded-full ${isSelected ? 'bg-white text-primary' : 'bg-primary text-white'}`}>
                                Now
                              </span>
                            )}
                            <div className="text-[10px] font-black mt-1">{TERM_LABEL[t]}</div>
                            <div className="text-[9px] opacity-70">{t === 1 ? 'Sept–Dec' : t === 2 ? 'Jan–Apr' : 'May–Aug'}</div>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {selectedTerms.length === 3 ? 'Full academic year.' : selectedTerms.map(t => TERM_LABEL[t]).join(' + ') + '.'}
                      {' '}{selectedTerms.length} term{selectedTerms.length > 1 ? 's' : ''} × {form.weeks_per_term} weeks = <strong className="text-foreground">{selectedTerms.length * Number(form.weeks_per_term)} total weeks</strong>.
                    </p>
                    {/* Term start dates */}
                    <div className="space-y-2 pt-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Term start dates <span className="font-normal normal-case opacity-60">(optional — defaults to Nigerian calendar)</span>
                      </label>
                      {[...selectedTerms].sort((a, b) => a - b).map(t => {
                        const fallback = termDatesNg(String(t), academicYear)?.start ?? '';
                        return (
                          <div key={t} className="flex items-center gap-3">
                            <span className="text-[10px] font-black text-muted-foreground w-24 shrink-0">{TERM_LABEL[t]}</span>
                            <input
                              type="date"
                              value={termStartDates[t] ?? ''}
                              placeholder={fallback}
                              onChange={e => setTermStartDates(prev => ({ ...prev, [t]: e.target.value }))}
                              className={INPUT_CLS + ' flex-1 text-xs'}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {curriculumFormat === 'bootcamp' && (
                <div className="space-y-3 p-3 bg-muted/30 border border-border">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Duration</label>
                      <select value={bootcampDurationWeeks} onChange={e => setBootcampDurationWeeks(e.target.value)} className={SELECT_CLS}>
                        {['1','2','3','4','6','8','10','12'].map(w => <option key={w} value={w}>{w} week{Number(w) > 1 ? 's' : ''}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Schedule</label>
                      <select value={bootcampSchedule} onChange={e => setBootcampSchedule(e.target.value as any)} className={SELECT_CLS}>
                        <option value="fulltime">Full-time (5 days/week)</option>
                        <option value="parttime">Part-time (3 days/week)</option>
                        <option value="weekend">Weekend only (Sat + Sun)</option>
                        <option value="evening">Evening (3 evenings/week)</option>
                      </select>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {bootcampDurationWeeks} week{Number(bootcampDurationWeeks) > 1 ? 's' : ''} ·{' '}
                    {bootcampSchedule === 'fulltime' ? '5 sessions/wk' : bootcampSchedule === 'parttime' ? '3 sessions/wk' : bootcampSchedule === 'weekend' ? '2 sessions/wk (Sat+Sun)' : '3 evenings/wk'} ·{' '}
                    <strong className="text-foreground">{Number(bootcampDurationWeeks) * (bootcampSchedule === 'fulltime' ? 5 : bootcampSchedule === 'parttime' || bootcampSchedule === 'evening' ? 3 : 2)} total sessions</strong>. Project-driven, hands-on every session.
                  </p>
                </div>
              )}

              {curriculumFormat === 'online' && (
                <div className="space-y-3 p-3 bg-muted/30 border border-border">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Duration</label>
                      <select value={onlineDurationWeeks} onChange={e => setOnlineDurationWeeks(e.target.value)} className={SELECT_CLS}>
                        {['4','6','8','10','12','16','20','24'].map(w => <option key={w} value={w}>{w} weeks</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Sessions / week</label>
                      <select value={onlineSessionsPerWeek} onChange={e => setOnlineSessionsPerWeek(e.target.value)} className={SELECT_CLS}>
                        {['1','2','3','4','5'].map(n => <option key={n} value={n}>{n} session{Number(n) > 1 ? 's' : ''}/week</option>)}
                      </select>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {onlineDurationWeeks} weeks × {onlineSessionsPerWeek} sessions = <strong className="text-foreground">{Number(onlineDurationWeeks) * Number(onlineSessionsPerWeek)} total sessions</strong>. Async-friendly, self-contained lessons with resources.
                  </p>
                </div>
              )}

              {curriculumFormat === 'selfpaced' && (
                <div className="space-y-3 p-3 bg-muted/30 border border-border">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Number of modules</label>
                      <select value={selfpacedModules} onChange={e => setSelfpacedModules(e.target.value)} className={SELECT_CLS}>
                        {['3','4','5','6','8','10','12'].map(n => <option key={n} value={n}>{n} modules</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Hours / module</label>
                      <select value={selfpacedHoursPerModule} onChange={e => setSelfpacedHoursPerModule(e.target.value)} className={SELECT_CLS}>
                        {['1','2','3','4','6','8'].map(h => <option key={h} value={h}>{h} hour{Number(h) > 1 ? 's' : ''}</option>)}
                      </select>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {selfpacedModules} modules × {selfpacedHoursPerModule} hr = <strong className="text-foreground">{Number(selfpacedModules) * Number(selfpacedHoursPerModule)} total hours</strong>. Learner sets their own pace. Each module is self-contained.
                  </p>
                </div>
              )}

              {/* ── Notes ── */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Extra context for AI <span className="font-normal normal-case">(optional)</span></label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder={
                    curriculumFormat === 'bootcamp' ? 'e.g. Participants have laptops, focus on hands-on projects, final day = demo day' :
                    curriculumFormat === 'online' ? 'e.g. Async-first, participants in different time zones, use Zoom for live sessions' :
                    curriculumFormat === 'selfpaced' ? 'e.g. Learners are working professionals, mobile-friendly content, include quizzes' :
                    'e.g. Students have laptops, follow WAEC syllabus, avoid week 5 (public holiday)'
                  }
                  rows={2}
                  className={INPUT_CLS + ' resize-none'}
                />
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
                  <p className="text-[10px] text-muted-foreground mt-0.5">Assign this syllabus to a class with a start date</p>
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
                        if (sid) fetch(isTeacher ? '/api/classes?mine=true' : `/api/classes?school_id=${sid}`).then(r => r.json()).then(j => setImplClasses((j.data || []).filter((c: any) => !sid || c.school_id === sid)));
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
                      {(() => {
                        const usedIds = new Set(implementationList.filter((p: any) => curriculum && p.curriculum_version_id === curriculum.id).map((p: any) => p.class_id).filter(Boolean));
                        return implClasses.map(c => (
                          <option key={c.id} value={c.id} disabled={usedIds.has(c.id)}>
                            {c.name}{usedIds.has(c.id) ? ' — already assigned' : ''}
                          </option>
                        ));
                      })()}
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
                      {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
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
                      Start Date <span className="text-primary normal-case font-normal">(auto-filled)</span>
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
                      End Date <span className="text-primary normal-case font-normal">(auto-filled)</span>
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
                      className="flex-1 accent-primary"
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
                  className="flex items-center gap-2 px-6 py-2 bg-primary hover:bg-primary text-white font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50"
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

      {/* ── Notification Settings Modal ── */}
      {showNotifSettings && curriculum && canModifyCurriculum && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
          <div className="bg-card border border-border w-full sm:max-w-md sm:rounded-xl rounded-t-2xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="font-black text-sm flex items-center gap-2">
                <BellIcon className="w-4 h-4 text-primary" /> Parent Notifications
              </h2>
              <button onClick={() => setShowNotifSettings(false)} className="p-2 hover:bg-muted/50 rounded-lg">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-5">
              {/* Channel selection */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-2">Channels</label>
                <div className="flex gap-2">
                  {(['whatsapp', 'email'] as const).map(ch => (
                    <button
                      key={ch}
                      onClick={() => setNotifSettingsDraft(prev => ({
                        ...prev,
                        channels: prev.channels.includes(ch)
                          ? prev.channels.filter(c => c !== ch)
                          : [...prev.channels, ch],
                      }))}
                      className={`flex-1 py-2 border text-xs font-black uppercase tracking-widest transition-all rounded-lg ${
                        notifSettingsDraft.channels.includes(ch)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground border-border hover:border-primary/40'
                      }`}
                    >
                      {ch === 'whatsapp' ? '📱 WhatsApp' : '📧 Email'}
                    </button>
                  ))}
                </div>
              </div>
              {/* When to notify */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-2">When to notify</label>
                <div className="space-y-1.5">
                  {([
                    { value: 'all',      label: 'Every completed week' },
                    { value: 'every_n',  label: 'Every N weeks' },
                    { value: 'specific', label: 'Specific weeks only' },
                    { value: 'none',     label: 'Never (off)' },
                  ] as const).map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setNotifSettingsDraft(prev => ({ ...prev, mode: value }))}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 border rounded-lg text-xs font-bold text-left transition-all ${
                        notifSettingsDraft.mode === value
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border text-muted-foreground hover:border-foreground/30'
                      }`}
                    >
                      <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${notifSettingsDraft.mode === value ? 'bg-primary border-primary' : 'border-muted-foreground'}`} />
                      {label}
                    </button>
                  ))}
                </div>
                {notifSettingsDraft.mode === 'every_n' && (
                  <div className="mt-3 flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">Notify every</span>
                    <input
                      type="number" min={1} max={12}
                      value={notifSettingsDraft.every_n ?? 4}
                      onChange={e => setNotifSettingsDraft(prev => ({ ...prev, every_n: Number(e.target.value) }))}
                      className="w-16 px-2 py-1.5 bg-background border border-border text-foreground text-xs rounded-lg text-center"
                    />
                    <span className="text-xs text-muted-foreground">weeks</span>
                  </div>
                )}
                {notifSettingsDraft.mode === 'specific' && (
                  <div className="mt-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-2">
                      Tap the week numbers to notify parents
                    </label>
                    <div className="grid grid-cols-6 gap-1.5">
                      {Array.from({ length: 13 }, (_, i) => i + 1).map(wk => {
                        const selected = (notifSettingsDraft.specific_weeks ?? []).includes(wk);
                        return (
                          <button
                            key={wk}
                            type="button"
                            onClick={() => setNotifSettingsDraft(prev => ({
                              ...prev,
                              specific_weeks: selected
                                ? (prev.specific_weeks ?? []).filter(w => w !== wk)
                                : [...(prev.specific_weeks ?? []), wk].sort((a, b) => a - b),
                            }))}
                            className={`py-2 rounded-lg text-xs font-black border transition-all ${
                              selected
                                ? 'bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/30'
                                : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
                            }`}
                          >
                            {wk}
                          </button>
                        );
                      })}
                    </div>
                    {(notifSettingsDraft.specific_weeks ?? []).length > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-2">
                        Notifying after week{(notifSettingsDraft.specific_weeks ?? []).length > 1 ? 's' : ''}: <span className="text-primary font-black">{(notifSettingsDraft.specific_weeks ?? []).join(', ')}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="p-5 border-t border-border flex gap-2">
              <button onClick={() => setShowNotifSettings(false)} className="flex-1 py-2.5 border border-border text-xs font-bold rounded-lg hover:bg-muted/50 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => saveNotifSettings(notifSettingsDraft)}
                disabled={savingNotifSettings || notifSettingsDraft.channels.length === 0}
                className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black rounded-lg transition-all disabled:opacity-50"
              >
                {savingNotifSettings ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Clone Modal — school picker for multi-school teachers ── */}
      {showCloneModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
          <div className="bg-card border border-border w-full sm:max-w-sm sm:rounded-xl rounded-t-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h2 className="font-black flex items-center gap-2 text-sm">
                  <DocumentDuplicateIcon className="w-4 h-4 text-emerald-400" />
                  Clone to My School
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Choose which school to copy this template to
                </p>
              </div>
              <button
                onClick={() => setShowCloneModal(null)}
                className="p-2 hover:bg-muted/50 rounded-lg transition-colors"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            {/* School list */}
            <div className="p-5 space-y-2">
              {assignedSchools.map(school => (
                <button
                  key={school.id}
                  onClick={() => handleClone(showCloneModal.curriculumId, school.id)}
                  disabled={cloning}
                  className="w-full flex items-center gap-3 p-4 bg-background border border-border hover:border-emerald-500/40 hover:bg-emerald-500/5 rounded-xl transition-all text-left group disabled:opacity-50"
                >
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <BuildingOfficeIcon className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black truncate group-hover:text-emerald-400 transition-colors">{school.name}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Click to clone here</p>
                  </div>
                  {cloning
                    ? <ArrowPathIcon className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />
                    : <DocumentDuplicateIcon className="w-4 h-4 text-muted-foreground group-hover:text-emerald-400 transition-colors shrink-0" />
                  }
                </button>
              ))}
            </div>

            {/* Info footer */}
            <div className="px-5 pb-5">
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                The cloned copy will be private to your school. You can edit, customise, and regenerate it without affecting the platform template.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
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
        <Section label="Learning Objectives" color="text-primary" icon={BoltIcon}>
          <ol className="space-y-2">
            {plan.objectives.map((o, i) => (
              <li key={i} className="flex gap-3 text-sm text-foreground/80">
                <span className="text-primary font-black shrink-0 w-5 flex items-center justify-center bg-primary/10 text-[10px] h-5 border border-primary/20">{i + 1}</span>
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
            <Section label="Student Interaction" color="text-primary" icon={AcademicCapIcon}>
              <ul className="space-y-2">
                {plan.student_activities.map((a, i) => (
                  <li key={i} className="flex gap-3 text-xs text-foreground/80 leading-relaxed">
                    <span className="text-primary shrink-0 select-none opacity-50">#</span>
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

// ── Editable Lesson Plan Component ───────────────────────────────────────────
function EditableLessonPlan({ plan, onChange, onSave, onCancel, saving }: {
  plan: LessonPlan;
  onChange: (p: LessonPlan) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const inp = 'w-full px-3 py-2 text-xs bg-muted/40 border border-border text-foreground focus:outline-none focus:border-primary/60 transition-colors';
  const ta = inp + ' resize-none';
  const lbl = 'text-[10px] font-black uppercase tracking-widest text-muted-foreground';
  const sec = 'space-y-1.5';

  return (
    <div className="space-y-5 text-sm">
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-border">
        <p className="text-[10px] font-black uppercase tracking-widest text-primary">Editing Week Content</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs font-bold border border-border text-muted-foreground hover:text-foreground transition-colors">
            Cancel
          </button>
          <button onClick={onSave} disabled={saving} className="px-3 py-1.5 text-xs font-black bg-primary text-white disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className={sec}>
        <label className={lbl}>Duration (minutes)</label>
        <input type="number" value={plan.duration_minutes} onChange={e => onChange({ ...plan, duration_minutes: Number(e.target.value) })} className={inp} />
      </div>

      <div className={sec}>
        <label className={lbl}>Learning Objectives — one per line</label>
        <textarea rows={5} value={(plan.objectives ?? []).join('\n')} onChange={e => onChange({ ...plan, objectives: e.target.value.split('\n') })} className={ta} />
      </div>

      <div className={sec}>
        <label className={lbl}>Teacher Protocol — one per line</label>
        <textarea rows={5} value={(plan.teacher_activities ?? []).join('\n')} onChange={e => onChange({ ...plan, teacher_activities: e.target.value.split('\n') })} className={ta} />
      </div>

      <div className={sec}>
        <label className={lbl}>Student Interaction — one per line</label>
        <textarea rows={5} value={(plan.student_activities ?? []).join('\n')} onChange={e => onChange({ ...plan, student_activities: e.target.value.split('\n') })} className={ta} />
      </div>

      <fieldset className="space-y-2 border border-border p-3">
        <legend className={lbl + ' px-1'}>In-Class Assessment</legend>
        <div className={sec}>
          <label className={lbl}>Title</label>
          <input value={plan.classwork?.title ?? ''} onChange={e => onChange({ ...plan, classwork: { ...(plan.classwork ?? { title: '', instructions: '', materials: [] }), title: e.target.value } })} placeholder="Classwork title" className={inp} />
        </div>
        <div className={sec}>
          <label className={lbl}>Instructions</label>
          <textarea rows={3} value={plan.classwork?.instructions ?? ''} onChange={e => onChange({ ...plan, classwork: { ...(plan.classwork ?? { title: '', instructions: '', materials: [] }), instructions: e.target.value } })} className={ta} />
        </div>
        <div className={sec}>
          <label className={lbl}>Materials — comma-separated</label>
          <input value={(plan.classwork?.materials ?? []).join(', ')} onChange={e => onChange({ ...plan, classwork: { ...(plan.classwork ?? { title: '', instructions: '', materials: [] }), materials: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })} className={inp} />
        </div>
      </fieldset>

      <fieldset className="space-y-2 border border-border p-3">
        <legend className={lbl + ' px-1'}>Post-Session Assignment</legend>
        <div className={sec}>
          <label className={lbl}>Title</label>
          <input value={plan.assignment?.title ?? ''} onChange={e => onChange({ ...plan, assignment: { ...(plan.assignment ?? { title: '', instructions: '', due: '' }), title: e.target.value } })} className={inp} />
        </div>
        <div className={sec}>
          <label className={lbl}>Instructions</label>
          <textarea rows={3} value={plan.assignment?.instructions ?? ''} onChange={e => onChange({ ...plan, assignment: { ...(plan.assignment ?? { title: '', instructions: '', due: '' }), instructions: e.target.value } })} className={ta} />
        </div>
        <div className={sec}>
          <label className={lbl}>Due / Timeframe</label>
          <input value={plan.assignment?.due ?? ''} onChange={e => onChange({ ...plan, assignment: { ...(plan.assignment ?? { title: '', instructions: '', due: '' }), due: e.target.value } })} className={inp} />
        </div>
      </fieldset>

      <div className={sec}>
        <label className={lbl}>Resources — one per line</label>
        <textarea rows={3} value={(plan.resources ?? []).join('\n')} onChange={e => onChange({ ...plan, resources: e.target.value.split('\n') })} className={ta} />
      </div>

      <div className={sec}>
        <label className={lbl}>Delivery Strategies — one per line</label>
        <textarea rows={3} value={(plan.engagement_tips ?? []).join('\n')} onChange={e => onChange({ ...plan, engagement_tips: e.target.value.split('\n') })} className={ta} />
      </div>

      <div className="flex gap-2 pt-2">
        <button onClick={onCancel} className="flex-1 py-2.5 text-xs font-bold border border-border text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
        <button onClick={onSave} disabled={saving} className="flex-1 py-2.5 text-xs font-black bg-primary text-white disabled:opacity-50 transition-colors">
          {saving ? 'Saving…' : 'Save Week Content'}
        </button>
      </div>
    </div>
  );
}

// ── Editable Assessment Plan Component ───────────────────────────────────────
function EditableAssessmentPlan({ plan, onChange, onSave, onCancel, saving }: {
  plan: AssessmentPlan;
  onChange: (p: AssessmentPlan) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const inp = 'w-full px-3 py-2 text-xs bg-muted/40 border border-border text-foreground focus:outline-none focus:border-primary/60 transition-colors';
  const ta = inp + ' resize-none';
  const lbl = 'text-[10px] font-black uppercase tracking-widest text-muted-foreground';
  const sec = 'space-y-1.5';

  return (
    <div className="space-y-5 text-sm">
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-border">
        <p className="text-[10px] font-black uppercase tracking-widest text-primary">Editing Assessment</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs font-bold border border-border text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
          <button onClick={onSave} disabled={saving} className="px-3 py-1.5 text-xs font-black bg-primary text-white disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      <div className={sec}><label className={lbl}>Title</label><input value={plan.title ?? ''} onChange={e => onChange({ ...plan, title: e.target.value })} className={inp} /></div>
      <div className={sec}><label className={lbl}>Format</label><input value={plan.format ?? ''} onChange={e => onChange({ ...plan, format: e.target.value })} className={inp} /></div>
      <div className={sec}><label className={lbl}>Duration (minutes)</label><input type="number" value={plan.duration_minutes ?? ''} onChange={e => onChange({ ...plan, duration_minutes: Number(e.target.value) })} className={inp} /></div>
      <div className={sec}><label className={lbl}>Coverage — one per line</label><textarea rows={4} value={(plan.coverage ?? []).join('\n')} onChange={e => onChange({ ...plan, coverage: e.target.value.split('\n') })} className={ta} /></div>
      <div className={sec}><label className={lbl}>Scoring Guide</label><textarea rows={3} value={plan.scoring_guide ?? ''} onChange={e => onChange({ ...plan, scoring_guide: e.target.value })} className={ta} /></div>
      <div className={sec}><label className={lbl}>Teacher Prep — one per line</label><textarea rows={4} value={(plan.teacher_prep ?? []).join('\n')} onChange={e => onChange({ ...plan, teacher_prep: e.target.value.split('\n') })} className={ta} /></div>
      {(plan.sample_questions?.length ?? 0) > 0 && (
        <div className={sec}><label className={lbl}>Sample Questions — one per line</label><textarea rows={5} value={(plan.sample_questions ?? []).join('\n')} onChange={e => onChange({ ...plan, sample_questions: e.target.value.split('\n') })} className={ta} /></div>
      )}
      <div className="flex gap-2 pt-2">
        <button onClick={onCancel} className="flex-1 py-2.5 text-xs font-bold border border-border text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
        <button onClick={onSave} disabled={saving} className="flex-1 py-2.5 text-xs font-black bg-primary text-white disabled:opacity-50 transition-colors">
          {saving ? 'Saving…' : 'Save Assessment Content'}
        </button>
      </div>
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
