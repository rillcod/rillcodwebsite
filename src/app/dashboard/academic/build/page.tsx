"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useAcademicYear } from "@/contexts/academic-year-context";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { engagementTables } from "@/types/engagement";
import {
  BookOpenIcon,
  SparklesIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardDocumentListIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  ClockIcon,
  AcademicCapIcon,
  UserGroupIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  PrinterIcon,
  PencilIcon,
  ChartBarIcon,
  BoltIcon,
  InformationCircleIcon,
  RocketLaunchIcon,
  ArrowRightIcon,
  StarIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  Squares2X2Icon,
  PlusIcon,
  CalendarDaysIcon,
  TrashIcon,
  PresentationChartLineIcon,
  BuildingOfficeIcon,
  LockClosedIcon,
  ArrowDownTrayIcon,
  ShieldCheckIcon,
  DocumentDuplicateIcon,
  BellIcon,
  RectangleStackIcon,
} from "@/lib/icons";
import { motion, AnimatePresence } from "framer-motion";
import { buildAddLessonQueryFromCurriculum } from "@/lib/curriculum/add-lesson-from-curriculum";
import {
  buildCertifyHref,
  buildClassTeachingHref,
  buildCurriculumHref,
} from "@/lib/curriculum/href";
import {
  SyllabusPreview,
  type SyllabusContent,
  type SyllabusPreviewRole,
} from "@/components/curriculum/SyllabusPreview";
import { MasterCurriculumRoster } from "@/components/curriculum/MasterCurriculumRoster";
import { CurriculumBuildingBlockInspector } from "@/components/curriculum/CurriculumBuildingBlockInspector";
import { CurriculumPrintDoc } from "@/components/curriculum/CurriculumPrintDoc";
import {
  CurriculumOverviewPrintDoc,
  DEFAULT_PRINT_OPTIONS,
  type PrintSectionOptions,
} from "@/components/curriculum/CurriculumOverviewPrintDoc";
import {
  OfficialDirectionStatus,
  type OfficialRelease,
  type OfficialAdoption,
} from "@/components/curriculum/OfficialDirectionStatus";
import PlanningBreadcrumb from "@/components/pipeline/PlanningBreadcrumb";
import { extractLessonPlanOperationWeeks } from "@/lib/progression/lessonPlanOperation";
import { extractPdfText } from "@/lib/pdf/extract-text";
import {
  liveAcademicSession,
  termNumberFromLabel,
} from "@/lib/reports/academic-period";
import { getCurriculumGenerationDefaults } from "@/lib/curriculum/generationDefaults";

// Nigerian term labels
const TERM_LABEL: Record<number, string> = {
  1: "First Term",
  2: "Second Term",
  3: "Third Term",
};

// Returns the programme-internal term number given the national term and the term when the programme started.
// e.g. programStartTerm=3, nationalTerm=3 → Programme Term 1 (Foundations)
function getProgrammeTerm(
  nationalTerm: number,
  programStartTerm: number
): number {
  return ((nationalTerm - programStartTerm + 3) % 3) + 1;
}

const PROGRAMME_TERM_THEME: Record<number, string> = {
  1: "Foundations",
  2: "Application",
  3: "Innovation",
};

function getLessonPlanOperationStats(planData: unknown): {
  totalWeeks: number;
  completedWeeks: number;
  progressPct: number;
} {
  const weeks = extractLessonPlanOperationWeeks(planData);
  const completedWeeks = weeks.filter((week) => week.completed === true).length;
  const totalWeeks = weeks.length;
  return {
    totalWeeks,
    completedWeeks,
    progressPct:
      totalWeeks > 0 ? Math.round((completedWeeks / totalWeeks) * 100) : 0,
  };
}

function getCurrentTerm(): number {
  return parseInt(termNumberFromLabel(liveAcademicSession().termLabel), 10);
}

function termDatesNg(
  term: string,
  academicYear: string
): { start: string; end: string } | null {
  const [startY, endY] = academicYear.split("/").map(Number);
  if (!startY || !endY) return null;
  if (term === "1") return { start: `${startY}-09-01`, end: `${startY}-12-15` };
  if (term === "2") return { start: `${endY}-01-10`, end: `${endY}-04-10` };
  if (term === "3") return { start: `${endY}-05-01`, end: `${endY}-07-25` };
  return null;
}

// Merges saved term calendar (from settings) with Nigerian defaults.
// Saved dates take precedence; missing fields fall back to defaults.
function resolveTermDates(
  term: string | number,
  academicYear: string,
  calendar: Record<string, { start?: string; end?: string }> | null | undefined
): { start: string; end: string } | null {
  const ng = termDatesNg(String(term), academicYear);
  if (!calendar) return ng;
  const saved = calendar[String(term)];
  if (!saved) return ng;
  return {
    start: saved.start || ng?.start || "",
    end: saved.end || ng?.end || "",
  };
}

// When a programme starts mid-year (e.g. T3/May), national terms that come
// before the start term in the calendar (T1, T2) actually fall in the NEXT
// school year. This returns the correct academic year string for a national term.
function effectiveAcademicYearForTerm(
  nationalTerm: number,
  programStartTerm: number,
  academicYear: string
): string {
  if (programStartTerm <= 1 || nationalTerm >= programStartTerm)
    return academicYear;
  const [sy, ey] = academicYear.split("/").map(Number);
  return `${sy + 1}/${ey + 1}`;
}

// Returns the Mon–Fri date range for a given week number within a term
function weekDateRange(
  termNum: string | number,
  weekNum: number,
  academicYear: string,
  termStartDate?: string
): { start: string; end: string } | null {
  const termDates = termStartDate
    ? { start: termStartDate, end: "" }
    : termDatesNg(String(termNum), academicYear); // weekDateRange uses raw NG dates for week offset calc
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
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return { start: fmt(weekMon), end: fmt(weekFri) };
}

// ── Types ────────────────────────────────────────────────────────────────────
type WeekType = "lesson" | "assessment" | "examination";
type TrackStatus = "pending" | "in_progress" | "completed" | "skipped";

interface LessonPlan {
  duration_minutes: number;
  objectives: string[];
  teacher_activities: string[];
  student_activities: string[];
  classwork: { title: string; instructions: string; materials: string[] };
  assignment: { title: string; instructions: string; due: string };
  project: {
    title: string;
    description: string;
    deliverables: string[];
  } | null;
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
  year?: number;
  term: number;
  title: string;
  objectives: string[];
  weeks: CurriculumWeek[];
  start_date?: string;
}

interface NotificationSettings {
  mode: "all" | "every_n" | "specific" | "none";
  channels: ("whatsapp" | "email")[];
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
  metadata?: { program_start_term?: number; [key: string]: unknown };
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

interface Course {
  id: string;
  title: string;
  is_active: boolean;
  program_id?: string | null;
}
interface Program {
  id: string;
  name: string;
  courses: Course[];
  progression_policy?: Record<string, unknown> | null;
}

// ── Constants ────────────────────────────────────────────────────────────────
const WEEK_META: Record<WeekType, { label: string; color: string; icon: any }> =
  {
    lesson: {
      label: "Lesson",
      color: "text-primary bg-primary/10 border-primary/30",
      icon: BookOpenIcon,
    },
    assessment: {
      label: "Assessment",
      color: "text-amber-600 dark:text-amber-400  bg-amber-500/10  border-amber-500/30",
      icon: ClipboardDocumentListIcon,
    },
    examination: {
      label: "Examination",
      color: "text-rose-600 dark:text-rose-400   bg-rose-500/10   border-rose-500/30",
      icon: DocumentTextIcon,
    },
  };

const TRACK_META: Record<
  TrackStatus,
  { label: string; color: string; icon: any }
> = {
  pending: {
    label: "Pending",
    color: "text-muted-foreground",
    icon: ClockIcon,
  },
  in_progress: {
    label: "In Progress",
    color: "text-primary",
    icon: ArrowPathIcon,
  },
  completed: {
    label: "Completed",
    color: "text-emerald-600 dark:text-emerald-400",
    icon: CheckCircleIcon,
  },
  skipped: {
    label: "Skipped",
    color: "text-muted-foreground",
    icon: ExclamationTriangleIcon,
  },
};

const INPUT_CLS =
  "w-full px-3 py-2.5 text-sm border border-border bg-background text-foreground rounded focus:outline-none focus:border-primary transition-colors placeholder:text-muted-foreground";
const SELECT_CLS =
  "select-premium w-full px-3 py-2.5 text-sm focus:border-primary";
const GRADE_LEVEL_OPTIONS = [
  "Nursery",
  "Basic 1",
  "Basic 2",
  "Basic 3",
  "Basic 1–Basic 3",
  "Basic 4",
  "Basic 5",
  "Basic 6",
  "Basic 4–Basic 6",
  "JSS1",
  "JSS2",
  "JSS3",
  "JSS1–JSS3",
  "SS1",
  "SS2",
  "SS1–SS2",
  "SS3",
];
const GRADE_SCOPE_STORAGE_KEY = "curriculum.gradeByScope.v1";

// ── Main Page ────────────────────────────────────────────────────────────────
export default function CurriculumPage() {
  const { profile, isLoading: authLoading, profileLoading } = useAuth();
  const {
    academicYear,
    yearOptions,
    setAcademicYear: setGlobalAcademicYear,
    termCalendar,
  } = useAcademicYear();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [programs, setPrograms] = useState<Program[]>([]);
  // Which courses already have a curriculum / official edition, so the catalogue can
  // show where the gaps are instead of making you open each course to find out.
  const [coverage, setCoverage] = useState<Record<string, { drafts: number; official: boolean; retiredOnly: boolean }>>({});
  // Narrow the catalogue to what is actually being worked on right now.
  const [coverageFilter, setCoverageFilter] = useState<"all" | "written" | "missing">("all");
  const [expandedPrograms, setExpandedPrograms] = useState<Set<string>>(
    new Set()
  );
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [curriculum, setCurriculum] = useState<CurriculumDoc | null>(null);
  const [tracking, setTracking] = useState<WeekTracking[]>([]);
  const [activeTerm, setActiveTerm] = useState(getCurrentTerm);
  const [activeYear, setActiveYear] = useState<number>(1);
  const [activeWeek, setActiveWeek] = useState<CurriculumWeek | null>(null);
  const [loadingCurr, setLoadingCurr] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [showSchoolScopeException, setShowSchoolScopeException] =
    useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [genProgress, setGenProgress] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [extractMsg, setExtractMsg] = useState("");
  const [expandedTerms, setExpandedTerms] = useState<Set<number>>(new Set([1]));
  const [resettingTerm, setResettingTerm] = useState<number | null>(null);
  const [resettingAll, setResettingAll] = useState(false);
  const [showcaseCount, setShowcaseCount] = useState<number | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [currentCourseId, setCurrentCourseId] = useState<string | null>(null);

  // ── Master Roster & Building Block Inspector state ──
  const [allCurricula, setAllCurricula] = useState<any[]>([]);
  const [curriculumViewMode, setCurriculumViewMode] = useState<
    'roster' | 'inspector' | 'builder'
  >('roster');

  const loadAllCurricula = useCallback(async () => {
    try {
      const res = await fetch('/api/curricula', { cache: 'no-store' });
      const json = await res.json();
      if (res.ok && Array.isArray(json.data)) {
        setAllCurricula(json.data);
      }
    } catch (e) {
      console.error('Failed to load master curricula roster:', e);
    }
  }, []);

  useEffect(() => {
    if (profile) {
      void loadAllCurricula();
    }
  }, [profile, loadAllCurricula]);

  useEffect(() => {
    if (profile?.role === "student" && profile?.class_id) {
      const supabase = createClient();
      supabase
        .from("classes")
        .select("current_course_id")
        .eq("id", profile.class_id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.current_course_id) {
            setCurrentCourseId(data.current_course_id);
          }
        });
    }
  }, [profile]);

  useEffect(() => {
    if (selectedCourse) {
      void loadShowcaseCount();
    }
  }, [selectedCourse, curriculum?.id]);

  async function loadShowcaseCount() {
    try {
      const supabase = createClient();
      const { count } = await engagementTables
        .showcase(supabase)
        .select("*", { count: "exact", head: true })
        .eq("course_name", selectedCourse?.title || "");
      setShowcaseCount(count);
    } catch {
      setShowcaseCount(0);
    }
  }
  const [creatingCbt, setCreatingCbt] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Official curriculum engine status (release + school adoption) for the
  // selected course — powers the OfficialDirectionStatus banner.
  const [officialStatus, setOfficialStatus] = useState<{
    loading: boolean;
    release: OfficialRelease | null;
    adoption: OfficialAdoption | null;
    isSchoolScoped: boolean;
  }>({ loading: false, release: null, adoption: null, isSchoolScoped: false });
  // Teacher-controlled "show to school" gate + cross-role preview modal
  const [publishing, setPublishing] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showAdvancedCurriculumControls, setShowAdvancedCurriculumControls] =
    useState(false);
  const [previewRole, setPreviewRole] = useState<SyllabusPreviewRole | null>(
    null
  );
  const [loadError, setLoadError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  // What is actually holding this copy — itemised, so the blockers can be seen and
  // opened rather than described as a count in an error string.
  const [blockers, setBlockers] = useState<{
    dependents: Array<{
      kind:
        | "official_edition"
        | "teaching_plan"
        | "delivery_record"
        | "delivery_schedule"
        | "school_adoption"
        | "offering_direction";
      id: string;
      label: string;
      detail: string;
      onCleanup: "unlinked" | "deleted" | "detached";
      safe: boolean;
      href?: string;
    }>;
    summary: {
      total: number;
      official_editions: number;
      teaching_plans: number;
      live_plans: number;
      delivery_weeks: number;
      fully_safe: boolean;
      delivery_schedules?: number;
      school_adoptions?: number;
      offering_directions?: number;
    };
  } | null>(null);
  const [blockersLoading, setBlockersLoading] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [showCloneModal, setShowCloneModal] = useState<{
    curriculumId: string;
  } | null>(null);
  const [cloneTargetSchool, setCloneTargetSchool] = useState("");

  // Term start date state
  const [termStartDates, setTermStartDates] = useState<Record<number, string>>(
    {}
  );
  const [editingTermDate, setEditingTermDate] = useState<number | null>(null);
  const [termDateDraft, setTermDateDraft] = useState("");
  const [savingTermDate, setSavingTermDate] = useState(false);

  // Notification settings state
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [savingNotifSettings, setSavingNotifSettings] = useState(false);
  const [notifSettingsDraft, setNotifSettingsDraft] =
    useState<NotificationSettings>({ mode: "all", channels: ["whatsapp"] });

  // Version edit states
  const [showEditVersionModal, setShowEditVersionModal] = useState(false);
  const [editVersionNumber, setEditVersionNumber] = useState<number | string>(
    ""
  );
  const [editVersionDesc, setEditVersionDesc] = useState("");
  const [savingVersionDetails, setSavingVersionDetails] = useState(false);

  // Term title edit states
  const [editingTermTitle, setEditingTermTitle] = useState(false);
  const [editTermTitleVal, setEditTermTitleVal] = useState("");
  const [savingTermTitle, setSavingTermTitle] = useState(false);

  /** Filter sidebar programs / courses (builder mode). */
  const [catalogQuery, setCatalogQuery] = useState("");
  /** All syllabus rows for the selected course (global vs school-scoped, versions). */
  const [curriculumList, setCurriculumList] = useState<CurriculumDoc[]>([]);
  /** Last visited course — restored from localStorage so teachers don't lose their place. */
  const [lastVisited, setLastVisited] = useState<{
    progId: string;
    progName: string;
    courseId: string;
    courseTitle: string;
  } | null>(null);
  /** Courses that have at least one saved curriculum — tracked per session as courses are loaded. */
  const [coursesWithCurricula, setCoursesWithCurricula] = useState<Set<string>>(
    new Set()
  );
  /** Schools the teacher (or admin) can scope a new syllabus to — from GET /api/schools */
  const [assignedSchools, setAssignedSchools] = useState<
    { id: string; name: string }[]
  >([]);
  const [schoolScopedProgramIds, setSchoolScopedProgramIds] = useState<
    string[]
  >([]);
  /**
   * POST /api/curricula body: `school_id: null` = platform, else UUID for that school.
   * One row per (course, school) in the database.
   */
  const [generateScope, setGenerateScope] = useState<"platform" | string>(
    "platform"
  );
  /** Remember preferred grade/class per scope (platform or school UUID). */
  const [gradeByScope, setGradeByScope] = useState<Record<string, string>>({
    platform: "JSS1",
  });
  // Form state for generation modal
  const [form, setForm] = useState({
    grade_level: "JSS1",
    subject_area: "",
    weeks_per_term: "8",
    notes: "",
  });
  const [selectedTerms, setSelectedTerms] = useState<number[]>([1]);
  const [programStartTerm, setProgramStartTerm] = useState<number>(1);
  const [programmeYear, setProgrammeYear] = useState<1 | 2 | 3>(1);
  const [curriculumFormat, setCurriculumFormat] = useState<
    "school" | "bootcamp" | "online" | "selfpaced"
  >("school");
  const [bootcampDurationWeeks, setBootcampDurationWeeks] = useState("4");
  const [bootcampSchedule, setBootcampSchedule] = useState<
    "fulltime" | "parttime" | "weekend" | "evening"
  >("fulltime");
  const [onlineDurationWeeks, setOnlineDurationWeeks] = useState("8");
  const [onlineSessionsPerWeek, setOnlineSessionsPerWeek] = useState("2");
  const [selfpacedModules, setSelfpacedModules] = useState("6");
  const [selfpacedHoursPerModule, setSelfpacedHoursPerModule] = useState("2");

  function toggleTerm(t: number) {
    setSelectedTerms((prev) =>
      prev.includes(t)
        ? prev.length > 1
          ? prev.filter((x) => x !== t)
          : prev // keep at least one
        : [...prev, t].sort((a, b) => a - b)
    );
  }

  // Content footprint: all existing content for this class/course — passed to AI to prevent repetition
  const [qaContentFootprint, setQaContentFootprint] = useState<{
    weekCoverage: {
      progTerm: number;
      week: number;
      topic: string;
      objectives: string[];
      assignmentTitle?: string;
      projectTitle?: string;
    }[];
    assignmentTitles: string[];
    flashcardDeckTitles: string[];
    lessonTitles: string[];
  } | null>(null);

  // Optional QA week spine: show DB template + class rotation preview before apply
  const [qaSpineOpen, setQaSpineOpen] = useState(false);
  const [implementationList, setImplementationList] = useState<any[]>([]);
  const [globalImplementationList, setGlobalImplementationList] = useState<
    any[]
  >([]);
  const [printMode, setPrintMode] = useState<"week" | "overview">("week");
  const [showPrintOptions, setShowPrintOptions] = useState(false);
  const [printOptions, setPrintOptions] = useState<PrintSectionOptions>(
    DEFAULT_PRINT_OPTIONS
  );
  // For teachers with multiple classes using this syllabus — which class context to track against
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [deletingImpl, setDeletingImpl] = useState<string | null>(null);
  const [qaTmplLoading, setQaTmplLoading] = useState(false);
  const [qaTmplErr, setQaTmplErr] = useState("");
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
    {
      id: string;
      name: string;
      program_id: string | null;
      qa_grade_key?: string | null;
      qa_track_hint?: string | null;
      qa_spine_lane?: number | null;
    }[]
  >([]);
  const [qaClassId, setQaClassId] = useState("");
  const [qaClassGradeMode, setQaClassGradeMode] = useState<
    "optional" | "compulsory"
  >("optional");
  const [qaClassModeSaving, setQaClassModeSaving] = useState(false);
  const [qaClassModeErr, setQaClassModeErr] = useState("");
  const [qaYear, setQaYear] = useState(1);
  const [qaLaneOverride, setQaLaneOverride] = useState(0);
  const [qaOverwrite, setQaOverwrite] = useState(false);
  const [qaPreviewLoading, setQaPreviewLoading] = useState(false);
  const [qaPreviewErr, setQaPreviewErr] = useState("");
  const [qaPreviewStamp, setQaPreviewStamp] = useState("");
  const [qaPreviewData, setQaPreviewData] = useState<{
    path_offset: number;
    lane_index: number;
    lane_source: string;
    program_start_term: number;
    fallback_used: boolean;
    used_program_id: string | null;
    terms: {
      term: number;
      national_term: number;
      weeks: { week: number; topic: string; spine_week: number }[];
    }[];
  } | null>(null);
  const [qaApplyLoading, setQaApplyLoading] = useState(false);
  const [qaApplyErr, setQaApplyErr] = useState("");
  // Lane Intelligence: performance-based lane suggestion
  const [qaLaneSuggestion, setQaLaneSuggestion] = useState<{
    current_lane: number;
    current_label: string;
    suggested_lane: number;
    suggested_label: string;
    avg_score: number | null;
    submission_count: number;
    assignment_avg: number | null;
    cbt_avg: number | null;
    direction: "up" | "down" | "stay";
    narrative: string;
    weak_topics: Array<{ title: string; avg_score: number; count: number }>;
    score_distribution: {
      excelling: number;
      developing: number;
      struggling: number;
    };
  } | null>(null);
  const [qaLaneSuggestLoading, setQaLaneSuggestLoading] = useState(false);
  // Inline topic edits made in preview before applying
  const [qaPreviewEdits, setQaPreviewEdits] = useState<Record<string, string>>(
    {}
  );
  // Per-week and full-term AI regeneration
  const [qaWeekRegenLoading, setQaWeekRegenLoading] = useState<string | null>(
    null
  );
  const [qaSpineRegenLoading, setQaSpineRegenLoading] = useState(false);
  const [qaSpineRegenNote, setQaSpineRegenNote] = useState("");
  const [qaSpineRegenProgress, setQaSpineRegenProgress] = useState<
    string | null
  >(null);
  // Missed-topic recovery
  const [qaRecoveryChecked, setQaRecoveryChecked] = useState<Set<string>>(
    new Set()
  );
  const [qaRecoveryEditTopics, setQaRecoveryEditTopics] = useState<
    Record<string, string>
  >({});
  const [qaRecoveryTargetTerm, setQaRecoveryTargetTerm] = useState(1);
  const [qaRecoveryInjecting, setQaRecoveryInjecting] = useState(false);
  const [editingProgramStartTerm, setEditingProgramStartTerm] = useState(false);
  const [programStartTermDraft, setProgramStartTermDraft] = useState<number>(1);
  const [savingProgramStartTerm, setSavingProgramStartTerm] = useState(false);
  const [editingWeekKey, setEditingWeekKey] = useState<string | null>(null); // "termN-weekN"
  const [editWeekTopic, setEditWeekTopic] = useState("");
  const [editWeekSubtopics, setEditWeekSubtopics] = useState("");
  const [savingWeek, setSavingWeek] = useState(false);
  const [editingWeekContent, setEditingWeekContent] = useState(false);
  const [weekPlanDraft, setWeekPlanDraft] = useState<LessonPlan | null>(null);
  const [weekAssessmentDraft, setWeekAssessmentDraft] =
    useState<AssessmentPlan | null>(null);
  const [savingWeekContent, setSavingWeekContent] = useState(false);
  // Stable ref so the programs useEffect can call loadCurriculum before it's declared.
  const loadCurriculumRef = useRef<
    ((courseId: string, hintPst?: number) => Promise<void>) | null
  >(null);

  // Programme start term: curriculum metadata ONLY — never read programme policy here.
  // Programme policy PST is per-programme and breaks multi-school setups where each school
  // has its own start term stored in their school-specific curriculum metadata.
  const effectiveProgramStartTerm = useMemo(() => {
    const contentPst = curriculum?.content?.metadata?.program_start_term;
    return ([1, 2, 3].includes(Number(contentPst)) ? Number(contentPst) : 1) as
      | 1
      | 2
      | 3;
  }, [curriculum?.content?.metadata?.program_start_term]);

  const isAdmin = profile?.role === "admin";
  const isTeacher = profile?.role === "teacher";
  const isStudent = profile?.role === "student";
  const isParent = profile?.role === "parent";
  const isSchool = profile?.role === "school";
  // Admin: full access. Teacher: generate/delete school-specific only (not platform template).
  const canGenerate = isAdmin;
  // Authoring the curriculum source became admin-only when the official
  // curriculum was enforced; the teacher branch predates that and only showed
  // controls whose API call came back 403. Teachers adapt delivery on the
  // class plan instead.
  const canModifyCurriculum = isAdmin;
  const canTrack = isAdmin || isTeacher;
  const canPublish = isAdmin;
  // Students & parents get a clean read-only syllabus (no builder chrome).
  const learnerMode = isStudent || isParent;

  useEffect(() => {
    if (!selectedCourse || learnerMode || isSchool) return;
    let cancelled = false;
    setOfficialStatus((s) => ({ ...s, loading: true }));
    fetch(`/api/curricula/official-status?course_id=${selectedCourse.id}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setOfficialStatus({
          loading: false,
          release: j.release ?? null,
          adoption: j.adoption ?? null,
          isSchoolScoped: !!j.is_school_scoped,
        });
      })
      .catch(() => {
        if (!cancelled) setOfficialStatus((s) => ({ ...s, loading: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCourse, learnerMode, isSchool]);

  // Reset week content editor when switching weeks
  useEffect(() => {
    setEditingWeekContent(false);
    setWeekPlanDraft(null);
    setWeekAssessmentDraft(null);
  }, [activeWeek?.week, activeTerm]);
  const currentScopeKey =
    generateScope === "platform" ? "platform" : generateScope;

  // Coverage narrowing runs before the text search: with 70+ courses the useful view is
  // "the handful I am building right now", not the whole catalogue.
  const coverageScoped = useMemo(() => {
    if (coverageFilter === "all") return programs;
    return programs
      .map((p) => {
        const courses = (p.courses ?? []).filter((c) => {
          const has = (coverage[c.id]?.drafts ?? 0) > 0;
          return coverageFilter === "written" ? has : !has;
        });
        return courses.length ? { ...p, courses } : null;
      })
      .filter(Boolean) as Program[];
  }, [programs, coverage, coverageFilter]);

  const filteredPrograms = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase();
    const programs = coverageScoped;
    if (!q) return programs;
    return programs
      .map((p) => {
        const pn = (p.name || "").toLowerCase();
        const courseMatch = (p.courses ?? []).filter((c) => {
          const t = (c.title || "").toLowerCase();
          return (
            t.includes(q) ||
            pn.includes(q) ||
            t.split(/\s+/).some((w) => w.length > 1 && w.startsWith(q))
          );
        });
        if (pn.includes(q)) return { ...p, courses: p.courses ?? [] };
        if (courseMatch.length) return { ...p, courses: courseMatch };
        return null;
      })
      .filter(Boolean) as Program[];
  }, [coverageScoped, catalogQuery]);

  const quickChooserCourses = useMemo(() => {
    const hasSchoolScopeFilter = schoolScopedProgramIds.length > 0;
    return programs
      .flatMap((prog) =>
        (prog.courses ?? [])
          .filter((c) => c.is_active !== false)
          .filter((c) => {
            if (
              profile?.role === "student" &&
              currentCourseId &&
              c.id !== currentCourseId
            ) {
              return false;
            }
            if (!hasSchoolScopeFilter) return true;
            const pid = c.program_id ?? prog.id;
            return !!pid && schoolScopedProgramIds.includes(pid);
          })
          .map((course) => ({ prog, course }))
      )
      .slice(0, 24);
  }, [programs, schoolScopedProgramIds, profile?.role, currentCourseId]);

  // ── Restore last visited course from localStorage ─────────────────────
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("curriculum.lastCourse.v1");
      if (saved) setLastVisited(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  }, []);

  // ── Load programs ────────────────────────────────────────────────────────
  // Honors both legacy and current deep-link params from other dashboards:
  // `?program=<id>|program_id=<id>` and `?course=<id>|course_id=<id>`.
  useEffect(() => {
    const deepProgramId =
      searchParams.get("program") || searchParams.get("program_id");
    const deepCourseId =
      searchParams.get("course") || searchParams.get("course_id");
    fetch("/api/programs?is_active=true")
      .then((r) => r.json())
      .then((j) => {
        const progs: Program[] = j.data ?? [];
        setPrograms(progs);
        // Open every programme by default so teachers can see all courses at a glance
        // (collapsing only programs is an easy way to scan a long list).
        setExpandedPrograms(new Set(progs.map((p) => p.id)));
        // Snap activeTerm to 1 while curriculum loads — loadCurriculum will correct it from
        // curriculum metadata. Never read programme policy here: PST is per-school-curriculum.
        function snapPstFromProgram(_p: Program): number {
          setActiveTerm(1);
          return 1;
        }
        if (deepProgramId) {
          const p = progs.find((x) => x.id === deepProgramId);
          if (p) {
            setExpandedPrograms(new Set([p.id]));
            setSelectedProgram(p);
            const hintPst = snapPstFromProgram(p);
            if (deepCourseId) {
              const c = (p.courses ?? []).find((x) => x.id === deepCourseId);
              if (c) {
                setSelectedCourse(c);
                loadCurriculumRef.current?.(c.id, hintPst);
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
              const hintPst = snapPstFromProgram(p);
              loadCurriculumRef.current?.(c.id, hintPst);
              return;
            }
          }
          setLoadError(
            "Requested curriculum link could not be resolved to a current course. Choose a course from the catalog."
          );
        }
        // No URL params — auto-restore last visited course from localStorage
        try {
          const saved = window.localStorage.getItem("curriculum.lastCourse.v1");
          if (saved) {
            const recent = JSON.parse(saved) as {
              progId: string;
              courseId: string;
            };
            for (const p of progs) {
              const c = (p.courses ?? []).find((x) => x.id === recent.courseId);
              if (c) {
                setExpandedPrograms(new Set([p.id]));
                setSelectedProgram(p);
                setSelectedCourse(c);
                const hintPst = snapPstFromProgram(p);
                loadCurriculumRef.current?.(c.id, hintPst);
                return;
              }
            }
          }
        } catch {
          /* ignore */
        }
        // No URL param, no localStorage — auto-select first available course
        for (const p of progs) {
          const c = (p.courses ?? []).find((x) => x.is_active !== false);
          if (c) {
            setExpandedPrograms(new Set([p.id]));
            setSelectedProgram(p);
            setSelectedCourse(c);
            setMobileSidebarOpen(false);
            const hintPst = snapPstFromProgram(p);
            loadCurriculumRef.current?.(c.id, hintPst);
            return;
          }
        }
        if (progs.length === 1) {
          setExpandedPrograms(new Set([progs[0].id]));
        }
      })
      .catch(() =>
        setLoadError("Failed to load programs — please refresh the page.")
      );
  }, [searchParams]);

  // Load schools for “syllabus scope” when building / regenerating (admin: all; teacher: assigned)
  useEffect(() => {
    if (!canTrack) return;
    fetch("/api/schools", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const schools = (j.data ?? []) as { id: string; name: string }[];
        setAssignedSchools(schools);
        // Single-school teacher → auto-select their school.
        // Multi-school teachers and admins must pick explicitly (placeholder shown).
        if (!isAdmin && schools.length === 1) {
          setGenerateScope(schools[0].id);
        } else if (!isAdmin && schools.length > 1) {
          setGenerateScope("platform"); // will show as placeholder until user picks
        }
      })
      .catch(() => setAssignedSchools([]));
  }, [canTrack, isAdmin]);

  // Build school-based program scope for the quick chooser grid.
  // Runs for all roles so learners (students/parents) also see only their
  // school's courses rather than the full global catalogue.
  useEffect(() => {
    fetch("/api/classes", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const classes = (j.data ?? []) as { program_id?: string | null }[];
        const ids = Array.from(
          new Set(
            classes
              .map((c) => c.program_id)
              .filter((x): x is string => typeof x === "string" && x.length > 0)
          )
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
      if (!parsed || typeof parsed !== "object") return;
      const cleaned: Record<string, string> = {};
      for (const [scope, grade] of Object.entries(parsed)) {
        if (typeof grade === "string" && GRADE_LEVEL_OPTIONS.includes(grade)) {
          cleaned[scope] = grade;
        }
      }
      if (!cleaned.platform) cleaned.platform = "JSS1";
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
      window.localStorage.setItem(
        GRADE_SCOPE_STORAGE_KEY,
        JSON.stringify(gradeByScope)
      );
    } catch {
      // Ignore storage quota/security issues.
    }
  }, [gradeByScope, canGenerate]);

  const programIdForQa =
    selectedCourse?.program_id ?? selectedProgram?.id ?? "";

  const qaSpineSampleRows = useMemo(() => {
    const lane = Math.min(11, Math.max(1, qaInspectLane));
    return [...qaTmplRows]
      .filter((r) => r.lane_index === lane)
      .sort((a, b) => a.week_index - b.week_index)
      .slice(0, 14);
  }, [qaTmplRows, qaInspectLane]);

  const selectedQaClass = useMemo(
    () => qaClassOptions.find((c) => c.id === qaClassId) ?? null,
    [qaClassOptions, qaClassId]
  );
  const qaSelectionStamp = useMemo(
    () =>
      `${qaClassId || "none"}:${programIdForQa || "none"}:${qaYear}:${
        qaLaneOverride || 0
      }`,
    [qaClassId, programIdForQa, qaYear, qaLaneOverride]
  );
  const qaNeedsFreshPreview =
    Boolean(qaClassId) && qaPreviewStamp !== qaSelectionStamp;

  // Client-side difficulty flags: match upcoming preview week topics against known weak areas
  const qaDifficultyFlags = useMemo(() => {
    if (!qaPreviewData || !qaLaneSuggestion?.weak_topics?.length)
      return {} as Record<string, string>;
    const weakEntries = qaLaneSuggestion.weak_topics.map((t) => ({
      words: t.title
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 4),
      label: `${t.title} (${t.avg_score}%)`,
    }));
    const flags: Record<string, string> = {};
    for (const term of qaPreviewData.terms) {
      for (const w of term.weeks) {
        const topic = (
          qaPreviewEdits[`t${term.term}-w${w.week}`] ?? w.topic
        ).toLowerCase();
        const hit = weakEntries.find((e) =>
          e.words.some((word) => topic.includes(word))
        );
        if (hit)
          flags[
            `t${term.term}-w${w.week}`
          ] = `May be hard — class previously scored low on "${hit.label}"`;
      }
    }
    return flags;
  }, [qaPreviewData, qaLaneSuggestion?.weak_topics, qaPreviewEdits]);

  const qaInlineSuggestions = useMemo(() => {
    const tips: string[] = [
      "Default mode: keep QA optional. Preview first, then apply only when it clearly matches class context.",
      "If preview does not fit your class reality, skip apply and continue traditional week-by-week syllabus.",
    ];
    if (!qaClassId) {
      tips.push(
        "Select a class and run Preview class path before applying, so lane/offset are visible."
      );
    }
    if (qaClassId && qaClassGradeMode === "compulsory") {
      tips.push(
        "This class is set to compulsory QA mode. Keep using preview before each apply to avoid wrong lane/year injection."
      );
    }
    if (
      selectedQaClass?.program_id &&
      programIdForQa &&
      selectedQaClass.program_id !== programIdForQa
    ) {
      tips.push(
        "Selected class is from another programme. Prefer a same-programme class for trustworthy preview."
      );
    }
    if (qaOverwrite) {
      tips.push(
        "Overwrite is ON. This will replace existing weeks in all terms of this syllabus copy."
      );
    }
    return tips;
  }, [
    qaClassId,
    qaClassGradeMode,
    qaOverwrite,
    selectedQaClass?.program_id,
    programIdForQa,
  ]);

  useEffect(() => {
    if (!selectedCourse?.id) {
      setQaClassId("");
      setQaPreviewData(null);
      setQaPreviewStamp("");
      setQaTmplMeta(null);
      setQaTmplRows([]);
      setQaTmplErr("");
    }
  }, [selectedCourse?.id]);

  useEffect(() => {
    if (!qaSpineOpen || !canGenerate) return;
    setQaTmplLoading(true);
    setQaTmplErr("");
    const tmplUrl = programIdForQa
      ? `/api/platform-syllabus-template?program_id=${encodeURIComponent(
          programIdForQa
        )}&catalog_version=qa_spine_v1`
      : `/api/platform-syllabus-template?catalog_version=qa_spine_v1`;
    fetch(tmplUrl)
      .then((r) => r.json())
      .then((j) => {
        if (j.error && !j.data) {
          setQaTmplErr(
            typeof j.error === "string" ? j.error : "Template load failed"
          );
          setQaTmplMeta(null);
          setQaTmplRows([]);
          return;
        }
        const d = j.data;
        if (!d) {
          setQaTmplErr("Unexpected response");
          return;
        }
        setQaTmplMeta({
          total: d.total ?? 0,
          weeks_per_lane: d.weeks_per_lane ?? {},
        });
        setQaTmplRows(
          (d.rows ?? []).map(
            (r: {
              week_index: number;
              lane_index: number;
              topic: string;
              year_number?: number;
              term_number?: number;
              week_number?: number;
            }) => ({
              week_index: r.week_index,
              lane_index: r.lane_index,
              topic: r.topic,
              year_number: r.year_number,
              term_number: r.term_number,
              week_number: r.week_number,
            })
          )
        );
      })
      .catch(() => {
        setQaTmplErr("Network error loading template");
        setQaTmplMeta(null);
        setQaTmplRows([]);
      })
      .finally(() => setQaTmplLoading(false));
  }, [qaSpineOpen, canGenerate, programIdForQa]);

  useEffect(() => {
    if (!qaSpineOpen || !canGenerate) return;
    fetch("/api/classes", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const list = (j.data ?? []) as {
          id: string;
          name: string;
          program_id: string | null;
          qa_grade_key?: string | null;
          qa_track_hint?: string | null;
          qa_spine_lane?: number | null;
        }[];
        setQaClassOptions(list);
      })
      .catch(() => setQaClassOptions([]));
  }, [qaSpineOpen, canGenerate]);

  // Build content footprint when spine opens — so AI knows everything already created
  useEffect(() => {
    if (!qaSpineOpen || !selectedCourse?.id) {
      setQaContentFootprint(null);
      return;
    }
    const pst = effectiveProgramStartTerm;

    Promise.all([
      // Lesson plans already in implementationList — no extra fetch needed
      Promise.resolve(
        implementationList.filter(
          (p) => !curriculum?.id || p.curriculum_version_id === curriculum.id
        )
      ),
      fetch(`/api/flashcards/decks?course_id=${selectedCourse.id}`)
        .then((r) => r.json())
        .catch(() => ({ data: [] })),
      fetch(`/api/lessons?course_id=${selectedCourse.id}`)
        .then((r) => r.json())
        .catch(() => ({ data: [] })),
      fetch(`/api/assignments?limit=80`)
        .then((r) => r.json())
        .catch(() => ({ data: [] })),
    ]).then(([plans, flashRes, lessonsRes, assignRes]) => {
      // Extract per-week coverage from lesson plans
      const weekCoverage: typeof qaContentFootprint extends null
        ? never
        : NonNullable<typeof qaContentFootprint>["weekCoverage"] = [];
      for (const plan of plans as any[]) {
        const natTerm = Number(plan.term ?? 0);
        const progTerm = natTerm ? ((natTerm - pst + 3) % 3) + 1 : 0;
        const weeks: any[] = plan.plan_data?.weeks ?? [];
        for (const w of weeks) {
          const wNum = Number(w.week_number ?? w.week ?? 0);
          if (!wNum) continue;
          weekCoverage.push({
            progTerm,
            week: wNum,
            topic: String(w.topic ?? w.title ?? "").trim(),
            objectives: Array.isArray(w.objectives)
              ? w.objectives.slice(0, 3)
              : [],
            assignmentTitle: w.assignment?.title ?? undefined,
            projectTitle: w.project?.title ?? undefined,
          });
        }
      }

      // Collect all assignment titles (from plan_data + from assignments API)
      const planAssignTitles = weekCoverage
        .map((w) => w.assignmentTitle)
        .filter((t): t is string => !!t);
      const apiAssignTitles = (assignRes.data ?? [])
        .map((a: any) => a.title)
        .filter(Boolean)
        .slice(0, 30) as string[];
      const assignmentTitles = [
        ...new Set([...planAssignTitles, ...apiAssignTitles]),
      ];

      const flashcardDeckTitles = (flashRes.data ?? [])
        .map((d: any) => d.title)
        .filter(Boolean)
        .slice(0, 20) as string[];
      const lessonTitles = (lessonsRes.data ?? [])
        .map((l: any) => l.title)
        .filter(Boolean)
        .slice(0, 30) as string[];

      setQaContentFootprint({
        weekCoverage,
        assignmentTitles,
        flashcardDeckTitles,
        lessonTitles,
      });
    });
  }, [
    qaSpineOpen,
    selectedCourse?.id,
    curriculum?.id,
    implementationList,
    effectiveProgramStartTerm,
  ]);

  useEffect(() => {
    if (!qaClassId) {
      setQaClassGradeMode("optional");
      setQaClassModeErr("");
      setQaPreviewStamp("");
      return;
    }
    fetch(`/api/classes/${encodeURIComponent(qaClassId)}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((j) => {
        const mode = j?.data?.qa_grade_mode;
        setQaClassGradeMode(mode === "compulsory" ? "compulsory" : "optional");
      })
      .catch(() => {
        setQaClassGradeMode("optional");
      });
  }, [qaClassId]);

  const saveQaClassGradeMode = useCallback(
    async (mode: "optional" | "compulsory") => {
      if (!qaClassId) return;
      setQaClassModeSaving(true);
      setQaClassModeErr("");
      try {
        const res = await fetch(
          `/api/classes/${encodeURIComponent(qaClassId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ qa_grade_mode: mode }),
          }
        );
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          setQaClassModeErr(j.error || "Failed to update class policy");
          return;
        }
        setQaClassGradeMode(mode);
      } catch {
        setQaClassModeErr("Network error while updating class policy");
      } finally {
        setQaClassModeSaving(false);
      }
    },
    [qaClassId]
  );

  const runLaneSuggest = useCallback(
    async (laneIndex: number) => {
      if (!qaClassId) return;
      setQaLaneSuggestLoading(true);
      setQaLaneSuggestion(null);
      try {
        const res = await fetch("/api/ai/lane-suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            class_id: qaClassId,
            lane_index: laneIndex,
            course_id: selectedCourse?.id,
            class_name: selectedQaClass?.name,
            year_number: qaYear,
          }),
        });
        const j = await res.json();
        if (res.ok) setQaLaneSuggestion(j);
      } catch {
        /* ignore */
      } finally {
        setQaLaneSuggestLoading(false);
      }
    },
    [qaClassId, selectedCourse?.id, selectedQaClass?.name, qaYear]
  );

  const runQaSpinePreview = useCallback(async () => {
    if (!qaClassId) {
      setQaPreviewErr(
        "Select a class to see how the spine rotates (school + class path)."
      );
      setQaPreviewData(null);
      return;
    }
    setQaPreviewLoading(true);
    setQaPreviewErr("");
    setQaPreviewData(null);
    try {
      const q = new URLSearchParams({ year: String(qaYear) });
      if (programIdForQa) q.set("program_id", programIdForQa);
      if (qaLaneOverride > 0) q.set("lane_index", String(qaLaneOverride));
      q.set("program_start_term", String(effectiveProgramStartTerm));
      const res = await fetch(
        `/api/classes/${encodeURIComponent(qaClassId)}/qa-spine-preview?${q}`
      );
      const j = await res.json();
      if (!res.ok) {
        setQaPreviewErr(j.error || "Preview failed");
        return;
      }
      setQaPreviewData(j.data);
      setQaPreviewStamp(qaSelectionStamp);
      // Auto-analyse performance and suggest lane based on resolved lane
      void runLaneSuggest(j.data.lane_index);
    } catch {
      setQaPreviewErr("Network error");
    } finally {
      setQaPreviewLoading(false);
    }
  }, [
    qaClassId,
    programIdForQa,
    qaYear,
    qaLaneOverride,
    qaSelectionStamp,
    runLaneSuggest,
    effectiveProgramStartTerm,
  ]);

  // Auto-load implementations when delivery OR implementations tab active, or course changes
  useEffect(() => {
    if (selectedCourse) {
      const params = new URLSearchParams({ course_id: selectedCourse.id });
      if (curriculum?.id) params.set("curriculum_version_id", curriculum.id);
      fetch(`/api/lesson-plans?${params.toString()}`)
        .then((r) => r.json())
        .then((j) => setImplementationList(j.data || []))
        .catch(() => setImplementationList([]));
    }
    // Also load global list for the landing page
    if (!selectedCourse) {
      fetch("/api/lesson-plans?limit=6")
        .then((r) => r.json())
        .then((j) => setGlobalImplementationList(j.data || []))
        .catch(() => setGlobalImplementationList([]));
    }
  }, [selectedCourse, curriculum?.id]);

  const deleteImplementation = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (
        !confirm(
          "Are you sure you want to delete this implementation? All associated teaching progress will be lost."
        )
      )
        return;
      setDeletingImpl(id);
      try {
        const res = await fetch(`/api/lesson-plans/${id}`, {
          method: "DELETE",
        });
        if (res.ok) {
          setImplementationList((prev) => prev.filter((p) => p.id !== id));
          setGlobalImplementationList((prev) =>
            prev.filter((p) => p.id !== id)
          );
          toast.success("Implementation deleted");
        } else {
          const j = await res.json().catch(() => ({}));
          toast.error(j?.error || "Failed to delete implementation");
        }
      } catch (err: any) {
        toast.error(err?.message || "Network error");
      } finally {
        setDeletingImpl(null);
      }
    },
    []
  );

  const applyQaSpine = useCallback(async () => {
    if (!curriculum || !selectedCourse) return;
    if (qaClassId && qaNeedsFreshPreview) {
      setQaApplyErr(
        "Run Preview class path for current class/year/lane before apply."
      );
      return;
    }
    if (qaOverwrite) {
      const ok = window.confirm(
        "Overwrite is ON. This will replace existing week rows in all terms for this syllabus copy. Continue?"
      );
      if (!ok) return;
    }
    setQaApplyLoading(true);
    setQaApplyErr("");
    try {
      const res = await fetch("/api/curricula/apply-qa-spine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          curriculum_id: curriculum.id,
          class_id: qaClassId || undefined,
          year_number: qaYear,
          lane_index: qaLaneOverride > 0 ? qaLaneOverride : undefined,
          catalog_version: "qa_spine_v1",
          overwrite_existing: qaOverwrite,
          program_start_term: effectiveProgramStartTerm,
          week_overrides:
            Object.keys(qaPreviewEdits).length > 0 ? qaPreviewEdits : undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setQaApplyErr(j.error || j.hint || "Apply failed");
        return;
      }
      const listRes = await fetch(
        `/api/curricula?course_id=${selectedCourse.id}`
      );
      const listJ = await listRes.json();
      const items: CurriculumDoc[] = listJ.data ?? [];
      const u = items.find((c) => c.id === curriculum.id);
      if (u) {
        setCurriculum(u);
        setCurriculumList(items);
        const tRes = await fetch(`/api/curricula/${u.id}/track`);
        const tJson = await tRes.json();
        setTracking(tJson.data ?? []);
        // Navigate to Prog.T1 (the national term where the school's programme begins)
        setActiveTerm(effectiveProgramStartTerm);
        toast.success(
          "Teaching template applied — showing your Programme Term 1"
        );
      }
    } catch {
      setQaApplyErr("Network error");
    } finally {
      setQaApplyLoading(false);
    }
  }, [
    curriculum,
    selectedCourse,
    qaClassId,
    qaYear,
    qaLaneOverride,
    qaOverwrite,
    qaNeedsFreshPreview,
    qaPreviewEdits,
    effectiveProgramStartTerm,
  ]);

  const injectRecoveryWeeks = useCallback(async () => {
    if (!curriculum || qaRecoveryChecked.size === 0) return;
    setQaRecoveryInjecting(true);
    try {
      const skipped = tracking.filter((t) => t.status === "skipped");
      const selected = skipped.filter((t) =>
        qaRecoveryChecked.has(`${t.term_number}-${t.week_number}`)
      );
      const recoveryWeeks: CurriculumWeek[] = selected.map((t) => {
        const term = curriculum.content.terms.find(
          (tm) => tm.term === t.term_number
        );
        const week = term?.weeks.find((w) => w.week === t.week_number);
        const key = `${t.term_number}-${t.week_number}`;
        const topic =
          qaRecoveryEditTopics[key] ??
          week?.topic ??
          `Review: Week ${t.week_number}`;
        return {
          week: 0,
          type: "lesson" as WeekType,
          topic: `[Recovery] ${topic}`,
          subtopics: week?.subtopics,
        };
      });
      const newContent: CurriculumContent = JSON.parse(
        JSON.stringify(curriculum.content)
      );
      const targetTerm = newContent.terms.find(
        (tm) => tm.term === qaRecoveryTargetTerm
      );
      if (targetTerm) {
        targetTerm.weeks = [...recoveryWeeks, ...targetTerm.weeks].map(
          (w, i) => ({ ...w, week: i + 1 })
        );
      }
      const res = await fetch(`/api/curricula/${curriculum.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newContent }),
      });
      const j = await res.json();
      if (res.ok) {
        setCurriculum((prev) =>
          prev
            ? {
                ...prev,
                content: j.data?.content ?? newContent,
                version: j.data?.version ?? prev.version,
              }
            : prev
        );
        toast.success(
          `${recoveryWeeks.length} recovery week${
            recoveryWeeks.length === 1 ? "" : "s"
          } added to Term ${qaRecoveryTargetTerm}`
        );
        setQaRecoveryChecked(new Set());
      } else {
        toast.error(j.error || "Failed to inject recovery weeks");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setQaRecoveryInjecting(false);
    }
  }, [
    curriculum,
    tracking,
    qaRecoveryChecked,
    qaRecoveryEditTopics,
    qaRecoveryTargetTerm,
  ]);

  const saveProgramStartTerm = useCallback(
    async (pst: number) => {
      if (!curriculum) return;
      setSavingProgramStartTerm(true);
      try {
        const res = await fetch(`/api/curricula/${curriculum.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ program_start_term: pst }),
        });
        const j = await res.json();
        if (res.ok) {
          setCurriculum((prev) =>
            prev ? { ...prev, content: j.data?.content ?? prev.content } : prev
          );
          setEditingProgramStartTerm(false);
          // Snap activeTerm to the new PST so the view immediately shows Prog.T1 Foundations
          setActiveTerm(pst);
          toast.success("Programme start term updated");
        } else {
          toast.error(j.error || "Failed to update");
        }
      } catch {
        toast.error("Network error");
      } finally {
        setSavingProgramStartTerm(false);
      }
    },
    [curriculum]
  );

  // Shared context builder — all regen calls use this to assemble rich AI payload fields
  const buildAiContext = useCallback(
    (termN: number, extraOverrides: Record<string, unknown> = {}) => {
      const natTermN =
        qaPreviewData?.terms.find((t) => t.term === termN)?.national_term ??
        termN;
      // Topics already in the curriculum for OTHER programme terms — AI must not repeat them
      const existingTopics: string[] = [];
      if (curriculum?.content?.terms) {
        for (const t of curriculum.content.terms) {
          const progT = ((t.term - effectiveProgramStartTerm + 3) % 3) + 1;
          if (progT !== termN) {
            (t.weeks ?? []).forEach((w: { topic?: string }) => {
              if (w.topic) existingTopics.push(w.topic);
            });
          }
        }
      }
      // Weeks that are completed in tracking — skip regenerating those
      const lockedWeeks = tracking
        .filter((tr) => {
          const termData = curriculum?.content?.terms?.find(
            (t) => t.term === tr.term_number
          );
          if (!termData) return false;
          const progT =
            ((termData.term - effectiveProgramStartTerm + 3) % 3) + 1;
          return progT === termN && tr.status === "completed";
        })
        .map((tr) => tr.week_number);

      return {
        lane_index: qaPreviewData?.lane_index ?? qaLaneOverride ?? 1,
        year_number: qaYear,
        term_number: termN,
        national_term_number: natTermN,
        class_name: selectedQaClass?.name,
        course_name: selectedCourse?.title,
        programme_name: selectedProgram?.name,
        qa_track_hint: selectedQaClass?.qa_track_hint ?? "",
        grade_level: selectedQaClass?.qa_grade_key ?? "",
        academic_year: academicYear,
        program_start_term: effectiveProgramStartTerm,
        weak_topics: qaLaneSuggestion?.weak_topics?.map((t) => t.title) ?? [],
        existing_curriculum_topics: existingTopics,
        locked_weeks: lockedWeeks,
        // Content pipeline footprint — AI uses this to avoid repeating anything already built
        content_footprint: qaContentFootprint
          ? {
              week_coverage: qaContentFootprint.weekCoverage
                .filter((w) => w.topic)
                .map((w) => ({
                  prog_term: w.progTerm,
                  week: w.week,
                  topic: w.topic,
                  objectives: w.objectives,
                  assignment_title: w.assignmentTitle,
                  project_title: w.projectTitle,
                })),
              assignment_titles: qaContentFootprint.assignmentTitles,
              flashcard_deck_titles: qaContentFootprint.flashcardDeckTitles,
              lesson_titles: qaContentFootprint.lessonTitles,
            }
          : undefined,
        ...extraOverrides,
      };
    },
    [
      qaPreviewData,
      qaLaneOverride,
      qaYear,
      selectedQaClass,
      selectedCourse,
      selectedProgram,
      academicYear,
      effectiveProgramStartTerm,
      qaLaneSuggestion,
      curriculum,
      tracking,
      qaContentFootprint,
    ]
  );

  // Regenerate a single week topic with AI
  const regenWeek = useCallback(
    async (termN: number, weekN: number, prevTopics: string[]) => {
      const key = `t${termN}-w${weekN}`;
      setQaWeekRegenLoading(key);
      try {
        // Also pass prev_term_topics for cross-term continuity on single-week regen
        const prevTermWeeks =
          termN > 1
            ? qaPreviewData?.terms.find((t) => t.term === termN - 1)?.weeks ??
              []
            : [];
        const prevTermTopics = prevTermWeeks
          .slice(-3)
          .map((w) => qaPreviewEdits[`t${termN - 1}-w${w.week}`] ?? w.topic);
        const res = await fetch("/api/ai/spine-regen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            buildAiContext(termN, {
              week_number: weekN,
              prev_topics: prevTopics,
              prev_term_topics: prevTermTopics,
            })
          ),
        });
        const j = await res.json();
        if (res.ok && j.weeks?.[0]?.topic) {
          setQaPreviewEdits((prev) => ({ ...prev, [key]: j.weeks[0].topic }));
        } else {
          toast.error(j.error || "Regeneration failed");
        }
      } catch {
        toast.error("Network error");
      } finally {
        setQaWeekRegenLoading(null);
      }
    },
    [buildAiContext, qaPreviewData, qaPreviewEdits]
  );

  // Regenerate all 12 weeks for a specific term sequentially (one week at a time with growing context)
  const regenFullTerm = useCallback(
    async (termN: number, hintPrevTermTopics?: string[]) => {
      if (!qaPreviewData) return;
      setQaSpineRegenLoading(true);
      setQaSpineRegenNote("");
      setQaSpineRegenProgress(null);
      try {
        const skippedTopics = tracking
          .filter((t) => t.status === "skipped")
          .map((t) => {
            const tm = curriculum?.content?.terms?.find(
              (x) => x.term === t.term_number
            );
            return (
              tm?.weeks?.find((w) => w.week === t.week_number)?.topic ??
              `Week ${t.week_number}`
            );
          })
          .slice(0, 5);
        // Prev-term context: caller can supply it (for progressive multi-term), else derive from preview/edits
        const prevTermWeeks =
          termN > 1
            ? qaPreviewData.terms.find((t) => t.term === termN - 1)?.weeks ?? []
            : [];
        const prevTermTopics =
          hintPrevTermTopics ??
          prevTermWeeks
            .slice(-3)
            .map((w) => qaPreviewEdits[`t${termN - 1}-w${w.week}`] ?? w.topic);

        const generatedTopics: string[] = [];
        const newEdits: Record<string, string> = {};
        let failCount = 0;

        for (let w = 1; w <= 12; w++) {
          setQaSpineRegenProgress(`Prog.T${termN} — Week ${w}/12…`);
          try {
            const res = await fetch("/api/ai/spine-regen", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(
                buildAiContext(termN, {
                  week_number: w,
                  skipped_topics: skippedTopics,
                  prev_term_topics: prevTermTopics,
                  prev_topics: generatedTopics.slice(-4),
                })
              ),
            });
            const j = await res.json();
            if (res.ok && j.weeks?.[0]?.topic) {
              const topic = j.weeks[0].topic as string;
              generatedTopics.push(topic);
              newEdits[`t${termN}-w${w}`] = topic;
            } else {
              failCount++;
            }
          } catch {
            failCount++;
          }
        }

        if (Object.keys(newEdits).length > 0) {
          setQaPreviewEdits((prev) => ({ ...prev, ...newEdits }));
          const successCount = Object.keys(newEdits).length;
          if (failCount > 0) {
            setQaSpineRegenNote(
              `${successCount} weeks personalised (${failCount} used spine defaults).`
            );
            toast.success(
              `Prog.T${termN}: ${successCount}/12 weeks personalised`
            );
          } else {
            setQaSpineRegenNote(
              `All 12 weeks personalised for ${
                selectedQaClass?.name ?? "this class"
              }.`
            );
            toast.success(
              `Prog.T${termN} fully personalised — 12 weeks updated`
            );
          }
          return generatedTopics; // caller can use for progressive chaining
        } else {
          toast.error("AI could not generate topics — try again");
        }
      } catch {
        toast.error("Network error during generation");
      } finally {
        setQaSpineRegenLoading(false);
        setQaSpineRegenProgress(null);
      }
      return [];
    },
    [
      qaPreviewData,
      buildAiContext,
      tracking,
      curriculum,
      qaPreviewEdits,
      selectedQaClass?.name,
    ]
  );

  // Regenerate all 3 terms progressively — delegates to regenFullTerm, passing each term's output as next term's context
  const regenAllTermsProgressive = useCallback(async () => {
    if (!qaPreviewData) return;
    setQaSpineRegenLoading(true); // hold loading ON across all 3 terms (regenFullTerm will toggle it too, but this prevents button flash)
    setQaSpineRegenNote("");
    let lastTermTopics: string[] = [];
    try {
      for (let termN = 1; termN <= 3; termN++) {
        const generated =
          (await regenFullTerm(
            termN,
            lastTermTopics.length ? lastTermTopics : undefined
          )) ?? [];
        lastTermTopics = (generated as string[]).slice(-3);
      }
      setQaSpineRegenNote("All 3 terms progressively personalised.");
    } finally {
      setQaSpineRegenLoading(false);
      setQaSpineRegenProgress(null);
    }
  }, [qaPreviewData, regenFullTerm]);

  // Adopt current content of fromTermN as baseline; AI-generate subsequent terms progressively from it
  const adoptAndContinueFrom = useCallback(
    async (fromTermN: number) => {
      if (!qaPreviewData) return;
      setQaSpineRegenLoading(true);
      setQaSpineRegenNote("");
      const adoptedWeeks =
        qaPreviewData.terms.find((t) => t.term === fromTermN)?.weeks ?? [];
      let lastTermTopics = adoptedWeeks
        .slice(-3)
        .map((w) => qaPreviewEdits[`t${fromTermN}-w${w.week}`] ?? w.topic);
      try {
        for (let termN = fromTermN + 1; termN <= 3; termN++) {
          const generated = (await regenFullTerm(termN, lastTermTopics)) ?? [];
          lastTermTopics = (generated as string[]).slice(-3);
        }
        setQaSpineRegenNote(
          `Adopted Prog.T${fromTermN} — subsequent terms generated progressively.`
        );
      } finally {
        setQaSpineRegenLoading(false);
        setQaSpineRegenProgress(null);
      }
    },
    [qaPreviewData, regenFullTerm, qaPreviewEdits]
  );

  const openGenerateModal = useCallback(() => {
    let scope: "platform" | string = "platform";
    if (curriculum) {
      scope = curriculum.school_id ? curriculum.school_id : "platform";
    } else if (assignedSchools.length === 0) {
      scope = "platform";
    } else if (assignedSchools.length === 1) {
      scope = assignedSchools[0].id;
    } else if (isAdmin) {
      scope = "platform";
    } else if (
      profile?.school_id &&
      assignedSchools.some((s) => s.id === profile.school_id)
    ) {
      scope = profile.school_id;
    } else {
      scope = assignedSchools[0].id;
    }
    setGenerateScope(scope);
    setShowSchoolScopeException(scope !== "platform");
    const targetCurriculum =
      curriculumList.find((item) =>
        scope === "platform" ? item.school_id == null : item.school_id === scope
      ) ??
      (curriculum &&
      (scope === "platform"
        ? curriculum.school_id == null
        : curriculum.school_id === scope)
        ? curriculum
        : null);
    const defaults = getCurriculumGenerationDefaults({
      content: targetCurriculum?.content,
      programmeName: selectedProgram?.name,
      courseTitle: selectedCourse?.title,
      rememberedGrade: gradeByScope[scope],
      officialAudience:
        officialStatus.release?.audience_label ??
        officialStatus.release?.grade_key,
    });
    setCurriculumFormat(defaults.format);
    setForm((prev) => ({
      ...prev,
      grade_level: defaults.gradeLevel,
      subject_area: defaults.subjectArea,
      weeks_per_term: defaults.weeksPerTerm,
    }));
    setBootcampDurationWeeks(defaults.bootcampDurationWeeks);
    setBootcampSchedule(defaults.bootcampSchedule);
    setOnlineDurationWeeks(defaults.onlineDurationWeeks);
    setOnlineSessionsPerWeek(defaults.onlineSessionsPerWeek);
    setSelfpacedModules(defaults.selfpacedModules);
    setSelfpacedHoursPerModule(defaults.selfpacedHoursPerModule);
    // Pre-load program_start_term from curriculum metadata only — never from programme policy.
    // PST is per-school-curriculum; reading programme policy here causes shared programmes
    // (Basic 1-3, Beginner, etc.) with stale policy PST to corrupt the generate form default.
    const resolvedPst = defaults.programStartTerm;
    setProgramStartTerm(resolvedPst);
    // Suggest next year/terms to generate based on existing curriculum content based on what terms are already complete
    if (targetCurriculum?.content?.terms?.length) {
      const allTerms = targetCurriculum.content.terms as CurriculumTerm[];
      const existingYears = Array.from(
        new Set(allTerms.map((t) => t.year ?? 1))
      );
      const maxYear = Math.max(...existingYears);

      // Check which terms exist in this maxYear
      const termsInMaxYear = allTerms
        .filter((t) => (t.year ?? 1) === maxYear)
        .map((t) => t.term);

      if (termsInMaxYear.length < 3) {
        // Current year is not complete yet, stay on this year
        setProgrammeYear(maxYear as 1 | 2 | 3);
        // Pre-select only the terms that are NOT generated yet in this year
        const ungeneratedTerms = [1, 2, 3].filter(
          (t) => !termsInMaxYear.includes(t)
        );
        setSelectedTerms(ungeneratedTerms);
      } else {
        // Current year has all 3 terms, suggest the next year
        const nextYear = Math.min(3, maxYear + 1) as 1 | 2 | 3;
        setProgrammeYear(nextYear);
        // Find if any terms exist in the next year
        const termsInNextYear = allTerms
          .filter((t) => (t.year ?? 1) === nextYear)
          .map((t) => t.term);
        const ungeneratedTerms = [1, 2, 3].filter(
          (t) => !termsInNextYear.includes(t)
        );
        setSelectedTerms(
          ungeneratedTerms.length > 0 ? ungeneratedTerms : [1, 2, 3]
        );
      }
    } else {
      setProgrammeYear(1);
      // First generation: start at the national term that equals Prog.T1 Foundations for this school
      setSelectedTerms([resolvedPst]);
    }
    setShowGenerate(true);
  }, [
    curriculum,
    assignedSchools,
    isAdmin,
    profile?.school_id,
    curriculumList,
    gradeByScope,
    selectedCourse?.title,
    selectedProgram?.name,
    officialStatus.release,
    selectedCourse?.program_id,
    programs,
  ]);

  // When filtering, expand every programme that still has a visible course
  useEffect(() => {
    if (!catalogQuery.trim()) return;
    setExpandedPrograms(new Set(filteredPrograms.map((p) => p.id)));
  }, [catalogQuery, filteredPrograms]);

  function pickCurriculumForScope(
    items: CurriculumDoc[],
    schoolId: string | null | undefined
  ) {
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
      const allTerms: CurriculumTerm[] = doc.content?.terms ?? [];
      const yearsInDoc = Array.from(
        new Set(allTerms.map((t) => t.year ?? 1))
      ).sort((a, b) => a - b);
      const firstYear = yearsInDoc[0] ?? 1;
      setActiveYear(firstYear);
      const termNumsForYear = allTerms
        .filter((t) => (t.year ?? 1) === firstYear)
        .map((t) => t.term);
      if (termNumsForYear.length > 0) {
        setActiveTerm((prev) =>
          termNumsForYear.includes(prev) ? prev : termNumsForYear[0]
        );
      }
      try {
        const tRes = await fetch(`/api/curricula/${id}/track`);
        const tJson = await tRes.json();
        setTracking(tJson.data ?? []);
      } catch {
        /* keep prior tracking */
      }
    },
    [curriculumList]
  );

  const restoreGradeForScope = useCallback(
    (scope: "platform" | string) => {
      const remembered = gradeByScope[scope];
      if (remembered) {
        setForm((prev) =>
          prev.grade_level === remembered
            ? prev
            : { ...prev, grade_level: remembered }
        );
      }
    },
    [gradeByScope]
  );

  const setGradeForCurrentScope = useCallback(
    (grade: string) => {
      setForm((prev) => ({ ...prev, grade_level: grade }));
      setGradeByScope((prev) => ({ ...prev, [currentScopeKey]: grade }));
    },
    [currentScopeKey]
  );

  const syncScopeToCurriculum = useCallback(
    (scope: "platform" | string) => {
      setGenerateScope(scope);
      setShowSchoolScopeException(scope !== "platform");
      const matching =
        scope === "platform"
          ? curriculumList.find((c) => c.school_id == null)
          : curriculumList.find((c) => c.school_id === scope);
      const defaults = getCurriculumGenerationDefaults({
        content: matching?.content,
        programmeName: selectedProgram?.name,
        courseTitle: selectedCourse?.title,
        rememberedGrade: gradeByScope[scope],
        officialAudience:
          officialStatus.release?.audience_label ??
          officialStatus.release?.grade_key,
      });
      setCurriculumFormat(defaults.format);
      setForm((prev) => ({
        ...prev,
        grade_level: defaults.gradeLevel,
        subject_area: defaults.subjectArea,
        weeks_per_term: defaults.weeksPerTerm,
      }));
      setProgramStartTerm(defaults.programStartTerm);
      setBootcampDurationWeeks(defaults.bootcampDurationWeeks);
      setBootcampSchedule(defaults.bootcampSchedule);
      setOnlineDurationWeeks(defaults.onlineDurationWeeks);
      setOnlineSessionsPerWeek(defaults.onlineSessionsPerWeek);
      setSelfpacedModules(defaults.selfpacedModules);
      setSelfpacedHoursPerModule(defaults.selfpacedHoursPerModule);
    },
    [
      curriculumList,
      selectedProgram?.name,
      selectedCourse?.title,
      gradeByScope,
      officialStatus.release,
    ]
  );

  // ── Load curriculum for selected course ──────────────────────────────────
  const loadCurriculum = useCallback(
    async (courseId: string, hintPst?: number) => {
      // Only show loading if it takes longer than 150ms
      const timer: ReturnType<typeof setTimeout> = setTimeout(
        () => setLoadingCurr(true),
        150
      );
      setLoadError("");
      // We DON'T clear curriculum immediately to avoid flashing white space
      // setCurriculum(null);
      setCurriculumList([]);
      setTracking([]);
      setActiveWeek(null);
      const role = profile?.role;
      const isLearnerRole = role === "student" || role === "parent";

      if (role === "student" && profile?.class_id) {
        try {
          const supabase = createClient();
          const { data: clsData } = await supabase
            .from("classes")
            .select("current_course_id")
            .eq("id", profile.class_id)
            .maybeSingle();
          if (
            clsData?.current_course_id &&
            courseId !== clsData.current_course_id
          ) {
            setLoadError(
              "This course syllabus is not active for your class yet."
            );
            clearTimeout(timer);
            setLoadingCurr(false);
            return;
          }
        } catch (err) {
          console.error("Error checking course lock:", err);
        }
      }
      try {
        const res = await fetch(`/api/curricula?course_id=${courseId}`);
        if (!res.ok) throw new Error("Failed to load syllabus");
        const json = await res.json();
        const items: CurriculumDoc[] = json.data ?? [];
        setCurriculumList(items);
        if (items.length > 0) {
          const curr = pickCurriculumForScope(items, profile?.school_id);
          if (curr) {
            const scope = curr.school_id ? curr.school_id : "platform";
            setGenerateScope(scope);
            restoreGradeForScope(scope);

            setCurriculum(curr);

            // Snap activeYear + activeTerm to valid values in this curriculum
            const loadedTerms: CurriculumTerm[] = curr.content?.terms ?? [];
            const loadedYears = Array.from(
              new Set(loadedTerms.map((t) => t.year ?? 1))
            ).sort((a, b) => a - b);
            const firstLoadedYear = loadedYears[0] ?? 1;
            setActiveYear(firstLoadedYear);
            const termNumsForYear = loadedTerms
              .filter((t) => (t.year ?? 1) === firstLoadedYear)
              .map((t) => t.term);
            if (termNumsForYear.length > 0) {
              // Snap to Prog.T1 (national term = PST). Priority: content metadata > keep existing (set by selectCourse) > first available.
              const savedPst = (
                curr.content?.metadata as
                  | { program_start_term?: number }
                  | undefined
              )?.program_start_term;
              const metaPst = [1, 2, 3].includes(Number(savedPst))
                ? Number(savedPst)
                : null;
              setActiveTerm(() => {
                const today = getCurrentTerm();
                const pstForSort = metaPst ?? 1;
                // Prefer today's national term if it exists in the curriculum
                if (termNumsForYear.includes(today)) return today;
                // Today not generated — show Prog.T1 (the national term = PST) if available
                if (metaPst && termNumsForYear.includes(metaPst))
                  return metaPst;
                // Neither today nor Prog.T1 exists — pick the term with the lowest programme
                // term number so we always land as close to Prog.T1 as possible
                const sorted = [...termNumsForYear].sort(
                  (a, b) =>
                    getProgrammeTerm(a, pstForSort) -
                    getProgrammeTerm(b, pstForSort)
                );
                return sorted[0];
              });
            }

            // Mark this course as having a curriculum (for sidebar badge)
            setCoursesWithCurricula((prev) => {
              const n = new Set(prev);
              n.add(courseId);
              return n;
            });

            // Tracking is a staff-only feature
            // avoid a 401 that can interfere with session cookie handling.
            if (!isLearnerRole) {
              try {
                const tRes = await fetch(`/api/curricula/${curr.id}/track`);
                const tJson = await tRes.json();
                setTracking(tJson.data ?? []);
              } catch {
                /* keep empty tracking */
              }
            }
          }
        }
      } catch {
        setLoadError("Could not load the syllabus — please try again.");
      } finally {
        clearTimeout(timer);
        setLoadingCurr(false);
      }
    },
    [
      profile?.school_id,
      profile?.role,
      profile?.class_id,
      currentCourseId,
      restoreGradeForScope,
    ]
  );
  loadCurriculumRef.current = loadCurriculum;

  const saveWeekEdit = useCallback(async () => {
    if (!curriculum || !editingWeekKey) return;
    const [termPart, weekPart] = editingWeekKey.split("-");
    const termNum = parseInt(termPart.replace("term", ""), 10);
    const weekNum = parseInt(weekPart.replace("week", ""), 10);
    setSavingWeek(true);
    try {
      const updatedContent = JSON.parse(JSON.stringify(curriculum.content));
      const termObj = (updatedContent.terms ?? []).find(
        (t: any) => t.term === termNum
      );
      if (!termObj) return;
      const weekObj = (termObj.weeks ?? []).find(
        (w: any) => w.week === weekNum
      );
      if (!weekObj) return;
      weekObj.topic = editWeekTopic.trim() || weekObj.topic;
      weekObj.subtopics = editWeekSubtopics
        ? editWeekSubtopics
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean)
        : weekObj.subtopics ?? [];
      const res = await fetch(`/api/curricula/${curriculum.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: updatedContent }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setCurriculum((prev) =>
        prev
          ? {
              ...prev,
              content: updatedContent,
              version: json.data?.version ?? prev.version,
            }
          : prev
      );
      setEditingWeekKey(null);
      toast.success("Week updated");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSavingWeek(false);
    }
  }, [curriculum, editingWeekKey, editWeekTopic, editWeekSubtopics]);

  const saveWeekContent = useCallback(async () => {
    if (!curriculum || !activeWeek) return;
    setSavingWeekContent(true);
    try {
      const updatedContent: CurriculumContent = JSON.parse(
        JSON.stringify(curriculum.content)
      );
      const termObj = updatedContent.terms.find((t) => t.term === activeTerm);
      if (!termObj) return;
      const weekObj = termObj.weeks.find((w) => w.week === activeWeek.week);
      if (!weekObj) return;
      if (activeWeek.type === "lesson" && weekPlanDraft) {
        weekObj.lesson_plan = weekPlanDraft;
      } else if (weekAssessmentDraft) {
        weekObj.assessment_plan = weekAssessmentDraft;
      }
      const res = await fetch(`/api/curricula/${curriculum.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: updatedContent }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setCurriculum((prev) =>
        prev
          ? {
              ...prev,
              content: updatedContent,
              version: json.data?.version ?? prev.version,
            }
          : prev
      );
      setActiveWeek((prev) =>
        prev
          ? {
              ...prev,
              lesson_plan:
                activeWeek.type === "lesson"
                  ? weekPlanDraft ?? prev.lesson_plan
                  : prev.lesson_plan,
              assessment_plan:
                activeWeek.type !== "lesson"
                  ? weekAssessmentDraft ?? prev.assessment_plan
                  : prev.assessment_plan,
            }
          : prev
      );
      setEditingWeekContent(false);
      toast.success("Week content saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSavingWeekContent(false);
    }
  }, [curriculum, activeWeek, activeTerm, weekPlanDraft, weekAssessmentDraft]);

  function selectCourse(prog: Program, course: Course) {
    const visited = {
      progId: prog.id,
      progName: prog.name,
      courseId: course.id,
      courseTitle: course.title,
    };
    try {
      window.localStorage.setItem(
        "curriculum.lastCourse.v1",
        JSON.stringify(visited)
      );
    } catch {
      /* ignore */
    }
    setLastVisited(visited);
    setSelectedProgram(prog);
    setSelectedCourse(course);
    // Always snap to 1 while curriculum loads — loadCurriculum will correct it from
    // curriculum metadata. PST is per-school-curriculum, not per-programme-policy.
    setActiveTerm(1);
    setActiveYear(1);
    setActiveWeek(null);
    setLoadError("");
    setMobileSidebarOpen(false);
    try {
      window.history.pushState(
        null,
        "",
        buildCurriculumHref({ programId: prog.id, courseId: course.id })
      );
    } catch {
      /* ignore */
    }
    loadCurriculum(course.id);
  }

  // ── Generate curriculum ──────────────────────────────────────────────────
  // Extract text from a teacher's PDF to ground AI generation in their real material.
  async function handleSourcePdf(file: File | null) {
    if (!file) {
      setSourceText("");
      setSourceName("");
      return;
    }
    setExtractingPdf(true);
    setGenError("");
    setExtractMsg("Reading PDF…");
    try {
      const text = await extractPdfText(file, 8000, setExtractMsg);
      if (!text) {
        setGenError(
          "Could not read any text from that PDF (is it scanned images?)."
        );
        setSourceName("");
        setSourceText("");
      } else {
        setSourceText(text);
        setSourceName(file.name);
      }
    } catch {
      setGenError("Could not read that PDF.");
      setSourceName("");
      setSourceText("");
    } finally {
      setExtractingPdf(false);
    }
  }

  async function generate() {
    if (!selectedCourse) return;
    // Teachers can't save to platform — auto-redirect to their first school
    let effectiveScope = generateScope;
    if (!isAdmin && effectiveScope === "platform") {
      if (assignedSchools.length === 0) {
        setGenError("No school assigned to your account. Contact an admin.");
        return;
      }
      effectiveScope = assignedSchools[0].id;
      setGenerateScope(effectiveScope);
    }
    setGenerating(true);
    setGenError("");
    setGenProgress("");

    // Apply a freshly-generated/updated curriculum doc to UI state.
    // One live row per scope: drop same-scope siblings from the local list.
    const finalizeDoc = (doc: CurriculumDoc, orphansRemoved = 0) => {
      const scope = doc.school_id ? doc.school_id : "platform";
      setCurriculum(doc);
      setGenerateScope(scope);
      restoreGradeForScope(scope);
      setCurriculumList((prev) => {
        const others = prev.filter((p) => {
          if (p.id === doc.id) return false;
          const sameScope =
            (p.school_id ?? null) === (doc.school_id ?? null) &&
            p.course_id === doc.course_id;
          return !sameScope;
        });
        return [doc, ...others];
      });
      setTracking([]);
      setShowGenerate(false);

      const orphanNote =
        orphansRemoved > 0
          ? ` Removed ${orphansRemoved} older same-scope draft${orphansRemoved === 1 ? "" : "s"}.`
          : "";
      if (!doc.school_id && isAdmin) {
        toast.success(`Curriculum updated to v${doc.version}.${orphanNote} Run the academic review next.`);
        router.push(
          buildCertifyHref({ curriculumId: doc.id, courseId: doc.course_id })
        );
      } else {
        toast.success(`Curriculum updated to v${doc.version}.${orphanNote}`);
      }

      const newPst = Number(
        (doc.content?.metadata as { program_start_term?: number } | undefined)
          ?.program_start_term ?? programStartTerm
      );
      if ([1, 2, 3].includes(newPst)) {
        setActiveTerm(newPst);
        setActiveYear(1);
      }
    };

    const targetSchoolId =
      effectiveScope === "platform" ? null : effectiveScope;
    const openMatchesScope =
      !!curriculum &&
      curriculum.course_id === selectedCourse.id &&
      (curriculum.school_id ?? null) === targetSchoolId;

    const baseBody = {
      course_id: selectedCourse.id,
      course_name: selectedCourse.title,
      school_id: targetSchoolId,
      ...(openMatchesScope ? { curriculum_id: curriculum.id } : {}),
      grade_level: form.grade_level,
      subject_area: form.subject_area,
      notes: form.notes,
      format: curriculumFormat,
      ...(sourceText ? { source_material: sourceText } : {}),
      is_visible_to_school: effectiveScope !== "platform",
    };

    try {
      // ── Online: generate ONE module per request so each call stays well under
      //    the 60s serverless cap. A single full-course call times out on Hobby
      //    and surfaces in the browser as a "network error". Each module is merged
      //    server-side into the growing document, with prior themes passed for
      //    continuity / no-repeat. ──
      if (curriculumFormat === "online") {
        const weeks = Math.max(1, Number(onlineDurationWeeks) || 8);
        const spw = Math.max(1, Number(onlineSessionsPerWeek) || 2);
        const totalModules = Math.max(2, Math.ceil(weeks / 3));
        const baseWeeks = Math.max(1, Math.round(weeks / totalModules));
        const priorThemes: string[] = [];
        let lastDoc: CurriculumDoc | null = null;
        let orphansRemoved = 0;

        for (let m = 1; m <= totalModules; m++) {
          setGenProgress(`Generating module ${m} of ${totalModules}…`);
          const weeksThisModule =
            m < totalModules
              ? baseWeeks
              : Math.max(1, weeks - baseWeeks * (totalModules - 1));
          const res = await fetch("/api/curricula", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...baseBody,
              ...(lastDoc?.id ? { curriculum_id: lastDoc.id } : {}),
              online_duration_weeks: weeks,
              online_sessions_per_week: spw,
              module_index: m,
              total_modules: totalModules,
              weeks_this_module: weeksThisModule,
              prior_module_themes: priorThemes,
            }),
          });
          const json = await res.json();
          if (!res.ok) {
            setGenError(
              json.error ||
                `Module ${m} of ${totalModules} failed${
                  m > 1 ? ` — ${m - 1} module(s) saved` : ""
                }`
            );
            if (m === 1) return; // nothing persisted yet
            break; // keep the modules already saved
          }
          lastDoc = json.data as CurriculumDoc;
          orphansRemoved = Math.max(
            orphansRemoved,
            Number(json.consolidated_orphans ?? 0)
          );
          const thisTerm = (
            lastDoc.content?.terms as
              | Array<{ term?: number; title?: string }>
              | undefined
          )?.find((t) => Number(t.term) === m);
          if (thisTerm?.title) priorThemes.push(thisTerm.title);
        }
        if (lastDoc) finalizeDoc(lastDoc, orphansRemoved);
        return;
      }

      // ── All other formats: single request (unchanged) ──
      const res = await fetch("/api/curricula", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...baseBody,
          // School
          ...(curriculumFormat === "school"
            ? {
                selected_terms: selectedTerms,
                weeks_per_term: Number(form.weeks_per_term),
                program_start_term: programStartTerm,
                programme_year: programmeYear,
              }
            : {}),
          // Bootcamp
          ...(curriculumFormat === "bootcamp"
            ? {
                bootcamp_duration_weeks: Number(bootcampDurationWeeks),
                bootcamp_schedule: bootcampSchedule,
              }
            : {}),
          // Self-paced
          ...(curriculumFormat === "selfpaced"
            ? {
                selfpaced_modules: Number(selfpacedModules),
                selfpaced_hours_per_module: Number(selfpacedHoursPerModule),
              }
            : {}),
          // Term start dates (school format only)
          ...(curriculumFormat === "school" &&
          Object.keys(termStartDates).length > 0
            ? {
                term_start_dates: termStartDates,
              }
            : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setGenError(json.error || "Generation failed");
        return;
      }
      finalizeDoc(
        json.data as CurriculumDoc,
        Number(json.consolidated_orphans ?? 0)
      );
    } catch {
      setGenError("Network error — please try again");
    } finally {
      setGenerating(false);
      setGenProgress("");
    }
  }

  // ── Track week ───────────────────────────────────────────────────────────
  function getTracking(
    termNum: number,
    weekNum: number
  ): WeekTracking | undefined {
    return tracking.find(
      (t) => t.term_number === termNum && t.week_number === weekNum
    );
  }

  // ── Save term start date ─────────────────────────────────────────────────
  async function saveTermDate(termNum: number, dateStr: string) {
    if (!curriculum) return;
    setSavingTermDate(true);
    try {
      const res = await fetch(`/api/curricula/${curriculum.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term_start_dates: { [termNum]: dateStr } }),
      });
      if (!res.ok) throw new Error("Failed to save date");
      setCurriculum((prev) => {
        if (!prev) return prev;
        const terms = (prev.content.terms ?? []).map((t) =>
          t.term === termNum ? { ...t, start_date: dateStr } : t
        );
        return { ...prev, content: { ...prev.content, terms } };
      });
      setEditingTermDate(null);
      toast.success("Term date updated");
    } catch {
      toast.error("Failed to save term date");
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
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notification_settings: settings }),
      });
      if (!res.ok) throw new Error("Save failed");
      setCurriculum((prev) =>
        prev
          ? {
              ...prev,
              content: { ...prev.content, notification_settings: settings },
            }
          : prev
      );
      setShowNotifSettings(false);
      toast.success("Notification settings saved");
    } catch {
      toast.error("Failed to save notification settings");
    } finally {
      setSavingNotifSettings(false);
    }
  }

  // ── Print functions ────────────────────────────────────────────────────────
  function printWeek() {
    setPrintMode("week");
    setTimeout(() => window.print(), 50);
  }

  function printOverview() {
    setPrintMode("overview");
    setTimeout(() => window.print(), 50);
  }

  function openPrintOptions() {
    // Pre-populate the term list from available terms in the curriculum
    const availableTerms = (curriculum?.content?.terms ?? []).map(
      (t) => t.term
    );
    setPrintOptions((o) => ({
      ...o,
      terms: availableTerms.length ? availableTerms : [1, 2, 3],
    }));
    setShowPrintOptions(true);
  }

  function pdfFileName(title: string): string {
    const stem = `${title || "curriculum"}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return `${stem || "curriculum"}.pdf`;
  }

  async function exportCurriculumPdf(mode: "overview" | "week" = "overview") {
    if (!curriculum) {
      toast.error("Select a curriculum before exporting.");
      return;
    }
    if (mode === "week" && !activeWeek) {
      toast.error("Select a week before exporting.");
      return;
    }

    setExportingPdf(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });
      const margin = 15;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      let y = margin;

      // Theme-aware PDF colors
      const isDark =
        typeof document !== "undefined" &&
        document.documentElement.classList.contains("dark");
      const primaryRgb: [number, number, number] = isDark
        ? [26, 58, 143]
        : [59, 111, 232];
      const bodyBg: [number, number, number] = isDark
        ? [10, 10, 20]
        : [255, 255, 255];
      const bodyText: [number, number, number] = isDark
        ? [229, 231, 235]
        : [17, 24, 39];
      const mutedText: [number, number, number] = isDark
        ? [107, 114, 128]
        : [75, 85, 99];

      if (isDark) {
        doc.setFillColor(...bodyBg);
        doc.rect(0, 0, pageWidth, pageHeight, "F");
      }

      const addPageIfNeeded = (needed = 12) => {
        if (y + needed > pageHeight - margin) {
          doc.addPage();
          if (isDark) {
            doc.setFillColor(...bodyBg);
            doc.rect(0, 0, pageWidth, pageHeight, "F");
          }
          y = margin;
        }
      };
      const text = (
        value: string,
        size = 10,
        style: "normal" | "bold" = "normal",
        color: [number, number, number] = bodyText
      ) => {
        addPageIfNeeded(size * 0.8);
        doc.setFont("helvetica", style);
        doc.setFontSize(size);
        doc.setTextColor(...color);
        const lines = doc.splitTextToSize(value || "-", pageWidth - margin * 2);
        doc.text(lines, margin, y);
        y += lines.length * (size * 0.45) + 3;
      };
      const heading = (value: string) => {
        addPageIfNeeded(16);
        doc.setFillColor(...primaryRgb);
        doc.rect(margin, y, pageWidth - margin * 2, 8, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text(value.toUpperCase(), margin + 3, y + 5.5);
        y += 12;
      };
      const bullets = (items?: string[]) => {
        if (!items?.length) {
          text("-", 9);
          return;
        }
        items.forEach((item) => text(`- ${item}`, 9));
      };

      const content = curriculum.content;
      const course =
        content?.course_title || selectedCourse?.title || "Curriculum";
      const school = curriculum.schools?.name || "Rillcod Managed Academy";
      // Format-aware unit naming for the export (Term vs Module vs Week).
      const pdfFormat: string = (content as any)?.metadata?.format ?? "school";
      const pdfUnitLabel = (t: { term: number; title?: string }): string => {
        if (pdfFormat === "school")
          return TERM_LABEL[t.term] ?? `Term ${t.term}`;
        const noun = pdfFormat === "bootcamp" ? "Week" : "Module";
        return t.title?.trim() || `${noun} ${t.term}`;
      };

      doc.setTextColor(...bodyText);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("RILLCOD TECHNOLOGIES", margin, y);
      y += 7;
      doc.setFontSize(9);
      doc.setTextColor(...mutedText);
      doc.text("Official Curriculum Export", margin, y);
      y += 8;
      doc.setDrawColor(...primaryRgb);
      doc.line(margin, y, pageWidth - margin, y);
      y += 10;

      text(
        mode === "week" && activeWeek
          ? `Week ${activeWeek.week}: ${activeWeek.topic}`
          : course,
        15,
        "bold"
      );
      text(`Programme: ${selectedProgram?.name || "Rillcod STEM Path"}`, 9);
      text(`School: ${school}`, 9);
      text(
        `Version: ${
          curriculum.version ?? 1
        } | Exported: ${new Date().toLocaleDateString("en-GB")}`,
        9
      );

      if (mode === "week" && activeWeek) {
        heading("Week Plan");
        const activeTermForPdf = (content?.terms ?? []).find(
          (t) => t.term === activeTerm
        );
        text(
          `${
            pdfFormat === "school"
              ? "Term"
              : pdfFormat === "bootcamp"
              ? "Week"
              : "Module"
          }: ${pdfUnitLabel({
            term: activeTerm,
            title: activeTermForPdf?.title,
          })}`,
          10,
          "bold"
        );
        text(
          `Type: ${WEEK_META[activeWeek.type]?.label ?? activeWeek.type}`,
          9
        );
        text(`Topic: ${activeWeek.topic}`, 10, "bold");
        if (activeWeek.subtopics?.length) {
          text("Subtopics", 10, "bold");
          bullets(activeWeek.subtopics);
        }
        const plan = activeWeek.lesson_plan;
        const assessment = activeWeek.assessment_plan;
        if (plan) {
          heading("Lesson Details");
          text(`Duration: ${plan.duration_minutes ?? "-"} minutes`, 9);
          text("Objectives", 10, "bold");
          bullets(plan.objectives);
          text("Teacher Activities", 10, "bold");
          bullets(plan.teacher_activities);
          text("Student Activities", 10, "bold");
          bullets(plan.student_activities);
          if (plan.classwork)
            text(
              `Classwork: ${plan.classwork.title || ""}\n${
                plan.classwork.instructions || ""
              }`,
              9
            );
          if (plan.assignment)
            text(
              `Assignment: ${plan.assignment.title || ""}\n${
                plan.assignment.instructions || ""
              }`,
              9
            );
          if (plan.project)
            text(
              `Project: ${plan.project.title || ""}\n${
                plan.project.description || ""
              }`,
              9
            );
        }
        if (assessment) {
          heading("Assessment Details");
          text(`Title: ${assessment.title || "-"}`, 10, "bold");
          text(`Format: ${assessment.format || "-"}`, 9);
          text(`Scoring Guide: ${assessment.scoring_guide || "-"}`, 9);
          text("Coverage", 10, "bold");
          bullets(assessment.coverage);
        }
      } else {
        if (printOptions.showOverview && content?.overview) {
          heading("Overview");
          text(content.overview, 9);
        }
        if (
          printOptions.showLearningOutcomes &&
          content?.learning_outcomes?.length
        ) {
          heading("Learning Outcomes");
          bullets(content.learning_outcomes);
        }
        (content?.terms ?? [])
          .filter((term) => printOptions.terms.includes(term.term))
          .forEach((term) => {
            heading(
              `${pdfUnitLabel(term)}${
                term.title && pdfFormat === "school" ? `: ${term.title}` : ""
              }`
            );
            if (term.objectives?.length) {
              text("Term Objectives", 10, "bold");
              bullets(term.objectives);
            }
            (term.weeks ?? []).forEach((week) => {
              addPageIfNeeded(18);
              text(`Week ${week.week}: ${week.topic}`, 10, "bold");
              text(`Type: ${WEEK_META[week.type]?.label ?? week.type}`, 8);
              if (week.subtopics?.length)
                text(`Coverage: ${week.subtopics.join(", ")}`, 8);
            });
          });
        if (
          printOptions.showAssessmentStrategy &&
          content?.assessment_strategy
        ) {
          heading("Assessment Strategy");
          text(content.assessment_strategy, 9);
        }
        if (printOptions.showMaterials && content?.materials_required?.length) {
          heading("Materials Required");
          bullets(content.materials_required);
        }
        if (printOptions.showTools && content?.recommended_tools?.length) {
          heading("Recommended Tools");
          bullets(content.recommended_tools);
        }
      }

      const name = pdfFileName(
        mode === "week" && activeWeek
          ? `${course}-week-${activeWeek.week}`
          : `${course}-syllabus`
      );
      doc.save(name);
      toast.success("PDF exported");
    } catch (e: any) {
      toast.error(e.message || "Could not export PDF");
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
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_visible_to_school: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Could not update visibility");
      }
      setCurriculum((prev) =>
        prev ? { ...prev, is_visible_to_school: next } : prev
      );
      toast.success(
        next ? "Curriculum shared with school" : "Curriculum made private"
      );
    } catch (e: any) {
      setLoadError(e.message || "Failed to update syllabus visibility");
    } finally {
      setPublishing(false);
    }
  }

  // ── Delete active Year (and all its terms) from this syllabus version ─────
  async function handleDeleteActiveYear() {
    if (!curriculum) return;
    const allTerms = curriculum.content?.terms ?? [];
    const remainingTerms = allTerms.filter((t) => (t.year ?? 1) !== activeYear);

    if (remainingTerms.length === 0) {
      toast.error(
        "You cannot delete the only remaining year in this curriculum. If you want to delete the entire curriculum, use the main Delete button."
      );
      return;
    }

    if (
      !window.confirm(
        `Are you sure you want to delete Year ${activeYear} from this syllabus? This will permanently delete all its terms and weeks. This action cannot be undone.`
      )
    ) {
      return;
    }

    setDeleting(true);
    try {
      const nextContent = {
        ...curriculum.content,
        terms: remainingTerms,
      };

      const res = await fetch(`/api/curricula/${curriculum.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: nextContent }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to delete year");
      }

      const { data: updated } = await res.json();
      if (!updated) throw new Error("Failed to update curriculum");

      // Update curriculum state
      const nextCurriculum = {
        ...curriculum,
        content: updated.content,
        version: updated.version,
      };
      setCurriculum(nextCurriculum);

      // Update curriculumList state
      setCurriculumList((prev) =>
        prev.map((c) =>
          c.id === curriculum.id
            ? { ...c, content: updated.content, version: updated.version }
            : c
        )
      );

      // Reset activeYear to one of the remaining years
      const remainingYears = Array.from(
        new Set(remainingTerms.map((t) => t.year ?? 1))
      ).sort((a, b) => a - b);
      const nextYear = remainingYears[0] ?? 1;
      setActiveYear(nextYear);

      // Snap activeTerm
      const termsInNewYear = remainingTerms
        .filter((t) => (t.year ?? 1) === nextYear)
        .map((t) => t.term);
      if (termsInNewYear.length > 0) {
        const progT1 = effectiveProgramStartTerm;
        setActiveTerm(
          termsInNewYear.includes(progT1) ? progT1 : termsInNewYear[0]
        );
      }
      setActiveWeek(null);

      toast.success(`Year ${activeYear} successfully deleted`);
    } catch (e: any) {
      toast.error(e.message || "Failed to delete year");
    } finally {
      setDeleting(false);
    }
  }

  // ── Delete active Term from this syllabus version ────────────────────────
  async function handleDeleteActiveTerm() {
    if (!curriculum) return;
    const allTerms = curriculum.content?.terms ?? [];
    const remainingTerms = allTerms.filter(
      (t) => (t.year ?? 1) !== activeYear || t.term !== activeTerm
    );

    if (remainingTerms.length === 0) {
      toast.error(
        "You cannot delete the only remaining term in this curriculum. If you want to delete the entire curriculum, use the main Delete button."
      );
      return;
    }

    if (
      !window.confirm(
        `Are you sure you want to delete Term ${activeTerm} of Year ${activeYear} from this syllabus? This action cannot be undone.`
      )
    ) {
      return;
    }

    setDeleting(true);
    try {
      // 1. Delete tracking rows for this term in the database
      await fetch(`/api/curricula/${curriculum.id}/track?term=${activeTerm}`, {
        method: "DELETE",
      }).catch(() => {});

      // 2. PATCH the curriculum content
      const nextContent = {
        ...curriculum.content,
        terms: remainingTerms,
      };

      const res = await fetch(`/api/curricula/${curriculum.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: nextContent }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to delete term");
      }

      const { data: updated } = await res.json();
      if (!updated) throw new Error("Failed to update curriculum");

      // Update curriculum state
      const nextCurriculum = {
        ...curriculum,
        content: updated.content,
        version: updated.version,
      };
      setCurriculum(nextCurriculum);

      // Update curriculumList state
      setCurriculumList((prev) =>
        prev.map((c) =>
          c.id === curriculum.id
            ? { ...c, content: updated.content, version: updated.version }
            : c
        )
      );

      // Reset activeYear and activeTerm
      const remainingYears = Array.from(
        new Set(remainingTerms.map((t) => t.year ?? 1))
      ).sort((a, b) => a - b);
      let nextYear = activeYear;
      if (!remainingYears.includes(activeYear)) {
        nextYear = remainingYears[0] ?? 1;
        setActiveYear(nextYear);
      }

      const termsInYear = remainingTerms
        .filter((t) => (t.year ?? 1) === nextYear)
        .map((t) => t.term);
      if (termsInYear.length > 0) {
        const progT1 = effectiveProgramStartTerm;
        setActiveTerm(termsInYear.includes(progT1) ? progT1 : termsInYear[0]);
      }
      setActiveWeek(null);

      toast.success(
        `Term ${activeTerm} of Year ${activeYear} successfully deleted`
      );
    } catch (e: any) {
      toast.error(e.message || "Failed to delete term");
    } finally {
      setDeleting(false);
    }
  }

  // ── Delete this curriculum version ──────────────────────────────────────
  async function handleDeleteCurriculum(targetId?: string, opts?: { force?: boolean }) {
    const id = targetId || curriculum?.id;
    if (!id) return;
    const label =
      curriculumList.find((c) => c.id === id)?.content?.description ||
      `version ${curriculumList.find((c) => c.id === id)?.version ?? ""}`;

    if (!opts?.force) {
      if (
        !window.confirm(
          `Delete this curriculum copy (${label})?\n\nIf something still uses it, you will see the blockers listed and can force-clean them (including linked editions, schedules, and tracking).`
        )
      )
        return;
    }

    setDeleting(true);
    setDeleteError("");
    setBlockers(null);
    try {
      const qs = opts?.force ? "?force=1" : "";
      const res = await fetch(`/api/curricula/${id}${qs}`, {
        method: "DELETE",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && j?.can_force && !opts?.force) {
          // Show WHAT is holding it, not just how many. A confirm() full of counts
          // cannot be inspected, and the records it refers to are invisible from here.
          setDeleteError(j.error || "Delete blocked");
          setBlockersLoading(true);
          try {
            const depRes = await fetch(`/api/curricula/${id}/dependents`);
            const dep = await depRes.json().catch(() => null);
            setBlockers(depRes.ok && dep?.dependents ? dep : null);
          } catch {
            setBlockers(null);
          } finally {
            setBlockersLoading(false);
          }
          return;
        }
        throw new Error(j.error || "Failed to delete curriculum");
      }
      toast.success(opts?.force ? "Copy cleaned up and deleted" : "Curriculum version deleted");

      const newList = curriculumList.filter((c) => c.id !== id);
      setCurriculumList(newList);
      if (curriculum?.id === id) {
        if (newList.length > 0) setCurriculum(newList[0]);
        else setCurriculum(null);
        setTracking([]);
      }
      setDeleteError("");
    } catch (e: any) {
      const msg = e.message || "Deletion failed";
      setDeleteError(msg);
      toast.error(msg, {
        duration: 9000,
        style: { maxWidth: "34rem" },
      });
    } finally {
      setDeleting(false);
    }
  }

  // ── Save curriculum version number and description details ─────────────────
  async function handleSaveVersionDetails() {
    if (!curriculum) return;
    if (!editVersionNumber || isNaN(Number(editVersionNumber))) {
      toast.error("Please enter a valid version number");
      return;
    }

    setSavingVersionDetails(true);
    try {
      const res = await fetch(`/api/curricula/${curriculum.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: Number(editVersionNumber),
          description: editVersionDesc,
        }),
      });

      const json = await res.json();
      if (!res.ok)
        throw new Error(json.error || "Failed to update version details");

      const updated = json.data as CurriculumDoc;

      // Update active curriculum state
      const nextCurriculum = {
        ...curriculum,
        version: updated.version,
        content: {
          ...curriculum.content,
          description: updated.content?.description,
        },
      };
      setCurriculum(nextCurriculum);

      // Update curriculumList state
      setCurriculumList((prev) =>
        prev.map((c) => (c.id === curriculum.id ? nextCurriculum : c))
      );

      toast.success("Version details updated successfully");
      setShowEditVersionModal(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to save version details");
    } finally {
      setSavingVersionDetails(false);
    }
  }

  // ── Save curriculum term title ───────────────────────────────────────────
  async function saveTermTitle(termNum: number, newTitle: string) {
    if (!curriculum) return;
    if (!newTitle.trim()) {
      toast.error("Please enter a valid term title");
      return;
    }

    setSavingTermTitle(true);
    try {
      const updatedTerms = (curriculum.content.terms ?? []).map((t) => {
        if (t.term === termNum) {
          return { ...t, title: newTitle };
        }
        return t;
      });

      const nextContent = { ...curriculum.content, terms: updatedTerms };

      const res = await fetch(`/api/curricula/${curriculum.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: nextContent }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update term title");

      const updated = json.data as CurriculumDoc;

      // Update local states
      const nextCurriculum = { ...curriculum, content: updated.content };
      setCurriculum(nextCurriculum);
      setCurriculumList((prev) =>
        prev.map((c) => (c.id === curriculum.id ? nextCurriculum : c))
      );

      toast.success("Term title updated successfully");
      setEditingTermTitle(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to update term title");
    } finally {
      setSavingTermTitle(false);
    }
  }

  // ── Clone curriculum ─────────────────────────────────────────────────────
  async function handleClone(curriculumId: string, schoolId?: string) {
    // If teacher has multiple schools and no target chosen yet, show the modal
    const targetSchool =
      schoolId ?? (assignedSchools.length === 1 ? assignedSchools[0].id : "");
    if (!targetSchool) {
      setCloneTargetSchool("");
      setShowCloneModal({ curriculumId });
      return;
    }
    setCloning(true);
    try {
      const res = await fetch(`/api/curricula/${curriculumId}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school_id: targetSchool }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Clone failed");
      toast.success(
        `Cloned to ${json.data?.schools?.name ?? "your school"} — v${
          json.data?.version
        }`
      );
      // Add to list and open the new curriculum
      const newCurr = json.data as CurriculumDoc;
      setCurriculumList((prev) => [newCurr, ...prev]);
      setCurriculum(newCurr);
      setTracking([]);
      setShowCloneModal(null);
    } catch (e: any) {
      toast.error(e.message || "Clone failed");
    } finally {
      setCloning(false);
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const allTerms: CurriculumTerm[] = curriculum?.content?.terms ?? [];
  // Format-aware unit naming. School curricula run on the Nigerian 3-term calendar;
  // online / bootcamp / self-paced are cohort-based and run on Modules / Weeks — they
  // must NOT be labelled "Term". The format is stamped into content.metadata.format.
  const loadedFormat: string =
    (curriculum?.content as any)?.metadata?.format ?? "school";
  const isCohortFormat =
    loadedFormat === "online" ||
    loadedFormat === "bootcamp" ||
    loadedFormat === "selfpaced";
  const unitNoun =
    loadedFormat === "bootcamp"
      ? "Phase"
      : loadedFormat === "online" || loadedFormat === "selfpaced"
      ? "Module"
      : "Term";
  const unitLabel = (term: { term: number; title?: string }): string => {
    if (loadedFormat === "school")
      return TERM_LABEL[term.term] ?? `Term ${term.term}`;
    const title = term.title?.trim();
    if (loadedFormat === "bootcamp" && title) {
      const phaseTitle = title.replace(/^Week\s+\d+\s*\W+\s*/i, "");
      return phaseTitle
        ? `Phase ${term.term} — ${phaseTitle}`
        : `Phase ${term.term}`;
    }
    return title || `${unitNoun} ${term.term}`;
  };
  const yearsAvailable = useMemo(() => {
    const yrs = Array.from(new Set(allTerms.map((t) => t.year ?? 1)));
    return yrs.sort((a, b) => a - b);
  }, [allTerms]);
  const termsForActiveYear = useMemo(
    () => allTerms.filter((t) => (t.year ?? 1) === activeYear),
    [allTerms, activeYear]
  );
  const currentTermData = termsForActiveYear.find((t) => t.term === activeTerm);
  const termCount = allTerms.length;
  const allWeeks = allTerms.flatMap((t) => t.weeks) ?? [];
  const completedCount = tracking.filter(
    (t) => t.status === "completed"
  ).length;
  const progressPct = allWeeks.length
    ? Math.round((completedCount / allWeeks.length) * 100)
    : 0;
  const weeks = currentTermData?.weeks ?? [];
  const linkedLessons: any[] = []; // Default empty array since it's not loaded
  const scopeLabel =
    generateScope === "platform"
      ? "Master curriculum"
      : assignedSchools.find((s) => s.id === generateScope)?.name ??
        "Selected school";
  const generationTargetCurriculum = curriculumList.find((item) =>
    generateScope === "platform"
      ? item.school_id == null
      : item.school_id === generateScope
  );

  // One request annotates the whole catalogue; the per-course loader stays as-is.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/curricula/coverage");
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled || !json?.coverage) return;
        setCoverage(json.coverage);
        // The sidebar dot used to fill in only as each course was opened, so on load it
        // said "no syllabus" for everything. Seed it from the same response.
        setCoursesWithCurricula((prev) => {
          const next = new Set(prev);
          for (const [courseId, c] of Object.entries(json.coverage as Record<string, { drafts: number }>)) {
            if (c.drafts > 0) next.add(courseId);
          }
          return next;
        });
      } catch {
        /* coverage is an annotation — the builder still works without it */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [curriculumList.length]);

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
            {selectedCourse
              ? selectedCourse.title
              : "Select a course to view its curriculum"}
          </p>
        </div>

        <div className="flex-1 px-4 py-6 max-w-4xl mx-auto w-full">
          {!selectedCourse ? (
            <div className="space-y-4">
              {programs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                  <BookOpenIcon className="w-10 h-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">
                    No courses available for your school yet.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {quickChooserCourses.length} course
                    {quickChooserCourses.length !== 1 ? "s" : ""} available
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {quickChooserCourses.map(({ prog, course }) => (
                      <button
                        key={course.id}
                        type="button"
                        onClick={() => selectCourse(prog, course)}
                        className="text-left border border-border bg-card hover:border-primary/40 hover:bg-muted/20 p-4 space-y-1.5 transition-colors"
                      >
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-black truncate">
                          {prog.name}
                        </p>
                        <p className="text-sm font-bold text-foreground line-clamp-2">
                          {course.title}
                        </p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-brand-red-600">
                          View curriculum →
                        </p>
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
              <p className="text-sm text-rose-600 dark:text-rose-400">{loadError}</p>
              <button
                onClick={() => setSelectedCourse(null)}
                className="text-xs text-muted-foreground border border-border px-3 py-1.5 hover:bg-muted/30"
              >
                ← Back to courses
              </button>
            </div>
          ) : !curriculum ? (
            <div className="flex flex-col items-center justify-center h-64 text-center space-y-3">
              <BookOpenIcon className="w-12 h-12 text-muted-foreground/30" />
              <div>
                <p className="font-bold text-sm">{selectedCourse.title}</p>
                <p className="text-muted-foreground text-sm mt-1">
                  Curriculum not available yet - check back soon.
                </p>
              </div>
              <button
                onClick={() => setSelectedCourse(null)}
                className="text-xs text-primary border border-primary/30 px-3 py-1.5 hover:bg-primary/10"
              >
                ← Back to courses
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setSelectedCourse(null);
                    setCurriculum(null);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← Courses
                </button>
                <span className="text-muted-foreground/40">›</span>
                <span className="text-xs font-bold text-primary">
                  {selectedCourse.title}
                </span>
                {yearsAvailable.length > 1 && (
                  <>
                    <span className="text-muted-foreground/40">›</span>
                    <div className="flex gap-1">
                      {yearsAvailable.map((yr) => (
                        <button
                          key={yr}
                          type="button"
                          onClick={() => setActiveYear(yr)}
                          className={`px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest border transition-colors ${
                            activeYear === yr
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border text-muted-foreground hover:border-primary/40"
                          }`}
                        >
                          Year {yr}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <SyllabusPreview
                content={
                  {
                    ...curriculum.content,
                    terms: termsForActiveYear,
                  } as unknown as SyllabusContent
                }
                courseTitle={selectedCourse.title}
                audienceIsLearner
                hideCourseHeader={true}
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
      <div style={{ display: printMode === "week" ? "block" : "none" }}>
        <CurriculumPrintDoc
          curriculum={curriculum as any}
          activeWeek={activeWeek}
          activeTerm={activeTerm}
          courseTitle={selectedCourse?.title}
          programName={selectedProgram?.name}
          teacherName={profile?.full_name ?? undefined}
        />
      </div>
      <div style={{ display: printMode === "overview" ? "block" : "none" }}>
        <CurriculumOverviewPrintDoc
          curriculum={curriculum as any}
          programName={selectedProgram?.name}
          isActive={printMode === "overview"}
          options={printOptions}
        />
      </div>
      {/* Print Options Modal */}
      {showPrintOptions && curriculum && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm print:hidden">
          <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 w-full sm:max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest">
                  Print / Export
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Choose sections to include.
                </p>
              </div>
              <button
                onClick={() => setShowPrintOptions(false)}
                className="text-muted-foreground hover:text-foreground p-1 -mt-1 -mr-1"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Terms */}
            <div className="space-y-2 mb-4">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">
                {unitNoun}s to include
              </p>
              <div className="flex flex-wrap gap-3">
                {(curriculum.content?.terms ?? [])
                  .sort((a, b) => a.term - b.term)
                  .map((t) => (
                    <label
                      key={t.term}
                      className="flex items-center gap-2 text-xs font-bold cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        className="rounded w-4 h-4 accent-primary"
                        checked={printOptions.terms.includes(t.term)}
                        onChange={(e) =>
                          setPrintOptions((o) => ({
                            ...o,
                            terms: e.target.checked
                              ? [...o.terms, t.term]
                              : o.terms.filter((x) => x !== t.term),
                          }))
                        }
                      />
                      {unitLabel(t)}
                    </label>
                  ))}
              </div>
            </div>

            {/* Sections */}
            <div className="space-y-2 mb-6">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">
                Sections
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-4">
                {(
                  [
                    { key: "showOverview", label: "Overview" },
                    { key: "showLearningOutcomes", label: "Learning Outcomes" },
                    {
                      key: "showAssessmentStrategy",
                      label: "Assessment Strategy",
                    },
                    { key: "showMaterials", label: "Materials Required" },
                    { key: "showTools", label: "Recommended Tools" },
                    {
                      key: "showApprovalSection",
                      label: "Approval Signatures",
                    },
                  ] as { key: keyof PrintSectionOptions; label: string }[]
                ).map(({ key, label }) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 text-xs font-bold cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      className="rounded w-4 h-4 accent-primary"
                      checked={!!printOptions[key]}
                      onChange={(e) =>
                        setPrintOptions((o) => ({
                          ...o,
                          [key]: e.target.checked,
                        }))
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setShowPrintOptions(false);
                  printOverview();
                }}
                className="py-3 bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest rounded-xl"
              >
                Print
              </button>
              <button
                onClick={() => {
                  setShowPrintOptions(false);
                  exportCurriculumPdf("overview");
                }}
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

            {/* Plain-English Mode Switcher Tabs for Staff */}
            {["admin", "teacher", "school"].includes(profile?.role || "") && (
              <div className="flex items-center gap-1.5 bg-background/80 backdrop-blur-md border border-border p-1.5 rounded-2xl shadow-inner my-1 md:my-0">
                <button
                  type="button"
                  onClick={() => setCurriculumViewMode("roster")}
                  className={`px-3.5 py-1.5 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all duration-200 flex items-center gap-1.5 ${
                    curriculumViewMode === "roster"
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  }`}
                >
                  <span>📋</span> All Curricula ({allCurricula.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCurriculumViewMode("inspector")}
                  className={`px-3.5 py-1.5 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all duration-200 flex items-center gap-1.5 ${
                    curriculumViewMode === "inspector"
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  }`}
                >
                  <span>🧩</span> Building Blocks
                </button>
                <button
                  type="button"
                  onClick={() => setCurriculumViewMode("builder")}
                  className={`px-3.5 py-1.5 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all duration-200 flex items-center gap-1.5 ${
                    curriculumViewMode === "builder"
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  }`}
                >
                  <span>🪄</span> Syllabus Builder
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowHelp((h) => !h)}
              title={showHelp ? "Hide guide" : "How it works"}
              className={`ml-auto md:ml-0 p-2 rounded-lg transition-colors shrink-0 ${
                showHelp
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
            >
              <InformationCircleIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* How it works guide */}
        {showHelp && (
          <div className="shrink-0 border-b border-border bg-muted/40 px-4 py-4">
            <div className="max-w-[1800px] mx-auto space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-brand-red-600">
                How to use this page
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-card border border-border p-3 space-y-1 rounded-xl">
                  <p className="font-black text-foreground">
                    Step 1 — Build the curriculum source
                  </p>
                  <p className="text-muted-foreground">
                    Pick a course and build the reusable week-by-week direction.
                    This source is shared safely; it is not a class delivery
                    record.
                  </p>
                </div>
                <div className="bg-card border border-border p-3 space-y-1 rounded-xl">
                  <p className="font-black text-foreground">
                    Step 2 — Make it official
                  </p>
                  <p className="text-muted-foreground">
                    The Academic Office certifies the edition and makes it
                    available to eligible school, online or special-programme
                    pathways.
                  </p>
                </div>
                <div className="bg-card border border-border p-3 space-y-1 rounded-xl">
                  <p className="font-black text-foreground">
                    Step 3 — Teach from the class
                  </p>
                  <p className="text-muted-foreground">
                    Open the class. Its teaching plan inherits the official
                    source and correct delivery period. Mark lessons taught
                    there so progress, reports and parents stay in sync.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* View Mode 1: Master Curriculum Roster */}
        {curriculumViewMode === "roster" && ["admin", "teacher", "school"].includes(profile?.role || "") && (
          <div className="p-4 sm:p-6 max-w-[1800px] mx-auto w-full">
            <MasterCurriculumRoster
              curricula={allCurricula}
              isAdmin={profile?.role === "admin"}
              onRefresh={loadAllCurricula}
              onSelectCurriculum={(item) => {
                const prog = programs.find((p) =>
                  (p.courses ?? []).some((c) => c.id === item.course_id)
                );
                const course = prog?.courses?.find((c) => c.id === item.course_id);
                if (prog && course) {
                  setSelectedProgram(prog);
                  setSelectedCourse(course);
                }
                setCurriculum(item);
                setCurriculumViewMode("builder");
              }}
            />
          </div>
        )}

        {/* View Mode 2: Building Block Inspector */}
        {curriculumViewMode === "inspector" && ["admin", "teacher", "school"].includes(profile?.role || "") && (
          <div className="p-4 sm:p-6 max-w-[1800px] mx-auto w-full">
            <CurriculumBuildingBlockInspector
              programs={programs}
              courses={programs.flatMap((p) => (p.courses ?? []).map((c) => ({ ...c, program_id: p.id })))}
              curricula={allCurricula}
              onSelectCourse={(prog, course) => {
                setSelectedProgram(prog);
                setSelectedCourse(course);
                setCurriculumViewMode("builder");
              }}
            />
          </div>
        )}

        {/* View Mode 3: Traditional Builder & Generator View */}
        {(curriculumViewMode === "builder" || !["admin", "teacher", "school"].includes(profile?.role || "")) && (
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
                        <span className="text-primary">
                          {selectedCourse.title}
                        </span>
                      </>
                    )}
                  </p>
                ) : (
                  <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                    Course & Curriculum
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setMobileSidebarOpen((v) => !v)}
                  className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-brand-red-600 border border-primary/30 px-2 py-1.5"
                >
                  <BookOpenIcon className="w-3.5 h-3.5" />
                  {mobileSidebarOpen ? "Close" : "Courses"}
                </button>
              </div>
            </div>
          </div>

          {/* ── Left Sidebar — Programs & Courses ── */}
          <aside
            className={`
        ${mobileSidebarOpen ? "flex" : "hidden"} md:flex
        flex-col w-full md:w-64 lg:w-72 shrink-0
        border-b md:border-b-0 md:border-r border-border
        bg-card overflow-y-auto md:h-screen
      `}
          >
            <div className="px-4 pt-4 pb-3 border-b border-border space-y-3">
              <div className="flex items-center gap-2">
                <SparklesIcon className="w-4 h-4 text-primary" />
                <h2 className="text-xs font-black uppercase tracking-widest text-foreground flex-1">
                  Catalog
                </h2>
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
              {/* Narrow the catalogue to the courses actually being built right now,
                  rather than scrolling the whole programme list every time. */}
              <div className="mt-2 flex gap-1" role="group" aria-label="Filter by curriculum coverage">
                {([
                  { key: "all", label: "All" },
                  { key: "written", label: "Written" },
                  { key: "missing", label: "Not written" },
                ] as const).map((opt) => {
                  const active = coverageFilter === opt.key;
                  const n =
                    opt.key === "all"
                      ? null
                      : programs.reduce(
                          (sum, p) =>
                            sum +
                            (p.courses ?? []).filter((c) => {
                              const has = (coverage[c.id]?.drafts ?? 0) > 0;
                              return opt.key === "written" ? has : !has;
                            }).length,
                          0
                        );
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setCoverageFilter(opt.key)}
                      aria-pressed={active}
                      className={`flex-1 rounded-md border px-2 py-1 text-[9px] font-black uppercase tracking-wider transition-colors ${
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {opt.label}
                      {n !== null && <span className="ml-1 opacity-70">{n}</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-2">
              {programs.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <div className="w-8 h-8 border-2 border-dashed border-border flex items-center justify-center mx-auto mb-4">
                    <AcademicCapIcon className="w-4 h-4 text-muted-foreground/30" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-4">
                    No programmes found
                  </p>
                </div>
              ) : filteredPrograms.length === 0 ? (
                <div className="px-4 py-8 text-center space-y-2">
                  <p className="text-xs text-muted-foreground">
                    No programmes or courses match &ldquo;{catalogQuery.trim()}
                    &rdquo;.
                  </p>
                  <button
                    type="button"
                    onClick={() => setCatalogQuery("")}
                    className="text-[10px] font-black uppercase tracking-widest text-brand-red-600 border border-primary/30 px-2 py-1"
                  >
                    Clear search
                  </button>
                </div>
              ) : (
                filteredPrograms.map((prog) => {
                  const isExpanded = expandedPrograms.has(prog.id);
                  let activeCourses =
                    prog.courses?.filter((c) => c.is_active !== false) ?? [];
                  if (profile?.role === "student" && currentCourseId) {
                    activeCourses = activeCourses.filter(
                      (c) => c.id === currentCourseId
                    );
                  }
                  if (
                    profile?.role === "student" &&
                    activeCourses.length === 0
                  ) {
                    return null;
                  }
                  return (
                    <div
                      key={prog.id}
                      className="border-b border-border/50 last:border-0"
                    >
                      <button
                        onClick={() =>
                          setExpandedPrograms((prev) => {
                            const next = new Set(prev);
                            if (next.has(prog.id)) next.delete(prog.id);
                            else next.add(prog.id);
                            return next;
                          })
                        }
                        className={`w-full flex items-center gap-2 px-4 py-4 text-left transition-all ${
                          isExpanded ? "bg-muted/30" : "hover:bg-muted/20"
                        }`}
                      >
                        {isExpanded ? (
                          <ChevronDownIcon className="w-4 h-4 text-primary shrink-0" />
                        ) : (
                          <ChevronRightIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                        )}
                        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-foreground truncate">
                          {prog.name || (prog as any).title}
                        </span>
                        {(() => {
                          // Show only what needs doing. A running "0/71" on every row is a number,
                          // not a task — it says the same thing whether or not anyone can act on it.
                          // A finished programme needs no badge at all; silence is the good state.
                          const written = activeCourses.filter(
                            (c) => (coverage[c.id]?.drafts ?? 0) > 0
                          ).length;
                          const remaining = activeCourses.length - written;
                          if (activeCourses.length === 0 || remaining === 0) return null;
                          return (
                            <span
                              title={`${remaining} of ${activeCourses.length} courses in this programme still need a curriculum`}
                              className="ml-auto px-1.5 py-0.5 text-[9px] font-black shrink-0 bg-amber-500/15 text-amber-800 dark:text-amber-200"
                            >
                              {remaining} to write
                            </span>
                          );
                        })()}
                      </button>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden bg-muted/10"
                          >
                            {activeCourses.map((course) => {
                              const isSelected =
                                selectedCourse?.id === course.id;
                              return (
                                <button
                                  key={course.id}
                                  onClick={() => selectCourse(prog, course)}
                                  className={`w-full flex items-center gap-3 pl-10 pr-4 py-3.5 text-left transition-all relative group ${
                                    isSelected
                                      ? "text-primary bg-primary/10"
                                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                  }`}
                                >
                                  {isSelected && (
                                    <motion.div
                                      layoutId="course-active-pill"
                                      className="absolute left-0 top-2 bottom-2 w-1 bg-primary rounded-r-full shadow-[0_0_10px_rgba(255,107,0,0.4)]"
                                    />
                                  )}
                                  <span
                                    className={`text-[13px] ${
                                      isSelected ? "font-black" : "font-medium"
                                    } truncate tracking-tight flex-1`}
                                  >
                                    {course.title}
                                  </span>
                                  {!isSelected &&
                                    coursesWithCurricula.has(course.id) && (
                                      <span
                                        className="ml-auto flex-shrink-0 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-emerald-400/20"
                                        title="Syllabus exists"
                                      />
                                    )}
                                  {!isSelected &&
                                    !coursesWithCurricula.has(course.id) && (
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
                })
              )}
            </div>
          </aside>

          {/* ── Main Content ── */}
          <main className="flex-1 overflow-y-auto flex flex-col">
            {/* Syllabus (always shown) */}
            {
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
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
                            <span className="text-[11px] font-black uppercase tracking-[0.3em]">
                              Continue Session
                            </span>
                          </div>
                          <div className="group relative overflow-hidden bg-card border border-border p-8 flex flex-col sm:flex-row sm:items-center gap-8 shadow-2xl transition-all hover:border-primary/40 duration-500 rounded-2xl">
                            <div className="absolute -top-12 -right-12 w-48 h-48 bg-primary/10 rounded-full blur-[80px] pointer-events-none group-hover:bg-primary/20 transition-all" />
                            <div className="flex-1 min-w-0 relative z-10">
                              <div className="flex items-center gap-3 mb-4">
                                <span className="px-3 py-1 bg-primary/10 border border-primary/20 rounded-full text-[10px] font-black uppercase tracking-widest text-primary">
                                  Last Visited
                                </span>
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-60">
                                  {lastVisited.progName}
                                </span>
                              </div>
                              <h3 className="text-3xl font-black text-foreground tracking-tighter mb-2 group-hover:text-primary transition-colors">
                                {lastVisited.courseTitle}
                              </h3>
                              <p className="text-sm text-muted-foreground font-medium max-w-md">
                                Pick up exactly where you left off in your
                                syllabus.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const prog = programs.find(
                                  (p) => p.id === lastVisited.progId
                                );
                                const course = prog?.courses?.find(
                                  (c) => c.id === lastVisited.courseId
                                );
                                if (prog && course) {
                                  selectCourse(prog, course);
                                  return;
                                }
                                setSelectedCourse({
                                  id: lastVisited.courseId,
                                  title: lastVisited.courseTitle,
                                  is_active: true,
                                });
                                loadCurriculum(lastVisited.courseId);
                              }}
                              className="relative z-10 shrink-0 flex items-center justify-center gap-3 px-8 py-4 bg-primary hover:bg-primary/90 text-primary-foreground text-[12px] font-black uppercase tracking-[0.2em] transition-all shadow-xl shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-1 active:translate-y-0 rounded-xl"
                            >
                              <ArrowRightIcon className="w-4 h-4" /> Open
                              Blueprint
                            </button>
                          </div>
                        </div>
                      )}
                      {!lastVisited && (
                        <div className="py-12 px-6">
                          <div className="max-w-3xl mx-auto text-center space-y-8">
                            <div className="space-y-3">
                              <h2 className="text-2xl font-black text-foreground tracking-tight">
                                Course Curriculum Builder
                              </h2>
                              <p className="text-muted-foreground text-sm max-w-lg mx-auto leading-relaxed">
                                Pick a course from the left panel to get
                                started. Here is the order of how it works:
                              </p>
                            </div>

                            {/* Steps — correct execution order */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-left">
                              {[
                                {
                                  step: "1",
                                  title: "Pick a course",
                                  desc: "Select any course from the left panel.",
                                  icon: BookOpenIcon,
                                },
                                {
                                  step: "2",
                                  title: "Build the curriculum",
                                  desc: "Generate or write the week-by-week direction for this course.",
                                  icon: SparklesIcon,
                                },
                                {
                                  step: "3",
                                  title: "Make it official",
                                  desc: "Academic Office certifies the edition for school, online, or programme pathways.",
                                  icon: ShieldCheckIcon,
                                },
                                {
                                  step: "4",
                                  title: "Teach and track",
                                  desc: "Open the class workspace, teach from the official flow, then mark delivered weeks.",
                                  icon: PresentationChartLineIcon,
                                },
                              ].map((s, i) => (
                                <div
                                  key={i}
                                  className="bg-card border border-border p-4 space-y-3 rounded-xl"
                                >
                                  <div className="w-9 h-9 rounded-lg border border-border bg-muted flex items-center justify-center">
                                    <s.icon className="w-4 h-4 text-foreground" />
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                                      Step {s.step}
                                    </p>
                                    <h3 className="text-sm font-black text-foreground">
                                      {s.title}
                                    </h3>
                                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                                      {s.desc}
                                    </p>
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
                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                              Active Class Plans
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {globalImplementationList.map((plan) => {
                              const {
                                totalWeeks,
                                completedWeeks,
                                progressPct,
                              } = getLessonPlanOperationStats(plan.plan_data);

                              return (
                                <Link
                                  key={plan.id}
                                  href={
                                    plan.class_id
                                      ? buildClassTeachingHref({
                                          classId: plan.class_id,
                                          courseId: plan.course_id,
                                        })
                                      : "/dashboard/classes"
                                  }
                                  className="group bg-card border border-border hover:border-primary/40 p-5 space-y-4 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-1 rounded-xl flex flex-col justify-between min-h-[160px]"
                                >
                                  <div>
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                      <div className="min-w-0">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">
                                          {plan.classes?.name ||
                                            "Unnamed Class"}
                                        </p>
                                        <h5 className="text-sm font-black text-foreground group-hover:text-primary transition-colors truncate">
                                          {plan.courses?.title ||
                                            "Unknown Course"}
                                        </h5>
                                      </div>
                                      <span className="bg-primary/10 border border-primary/20 text-primary text-[10px] font-black px-2 py-1 rounded shrink-0">
                                        {plan.term || "Term 1"}
                                      </span>
                                    </div>
                                    <div className="space-y-1.5">
                                      <div className="flex justify-between items-center text-[10px] font-bold text-muted-foreground">
                                        <span className="uppercase tracking-widest">
                                          Progress
                                        </span>
                                        <span>
                                          {completedWeeks} / {totalWeeks} Weeks
                                        </span>
                                      </div>
                                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden border border-border">
                                        <div
                                          className="h-full bg-primary rounded-full transition-all duration-500"
                                          style={{ width: `${progressPct}%` }}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                  <div className="pt-3 border-t border-border flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-primary opacity-80 group-hover:opacity-100 transition-opacity">
                                      Open Lesson Plan →
                                    </span>
                                    <span className="text-[9px] font-medium text-muted-foreground flex items-center gap-1">
                                      <CheckCircleIcon className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />{" "}
                                      Active Plan
                                    </span>
                                  </div>
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <div className="space-y-6">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 text-primary">
                            <Squares2X2Icon className="w-4 h-4" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                              Course Catalog
                            </span>
                          </div>
                          {(isTeacher || isSchool) && (
                            <p className="text-[11px] text-muted-foreground font-medium">
                              Showing courses linked to your assigned school
                              classes.
                            </p>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {quickChooserCourses.map(({ prog, course }) => (
                            <button
                              key={course.id}
                              type="button"
                              onClick={() => selectCourse(prog, course)}
                              className="group text-left bg-card border border-border hover:border-primary/40 p-5 space-y-4 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-1 rounded-xl"
                            >
                              <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60">
                                  {prog.name}
                                </p>
                                <h3 className="text-sm font-black text-foreground group-hover:text-primary transition-colors line-clamp-2 min-h-[2.5em]">
                                  {course.title}
                                </h3>
                              </div>
                              <div className="pt-2 flex items-center justify-between border-t border-border">
                                <span className="text-[10px] font-black uppercase tracking-widest text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                                  Select Course →
                                </span>
                                <div className="p-1 rounded bg-muted">
                                  <ChevronRightIcon className="w-3 h-3 text-muted-foreground" />
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                        {quickChooserCourses.length === 0 && (
                          <p className="text-[11px] text-muted-foreground mt-3">
                            No courses found for current school scope yet.
                            Add/assign classes first, or use the full sidebar
                            catalog.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : loadingCurr || !programs.length ? (
                  <div className="flex-1 px-4 md:px-6 py-8 space-y-12 animate-pulse">
                    {/* Skeleton Header mirroring the real one */}
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 pb-8 border-b border-border relative">
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-6 bg-muted rounded-lg" />
                          <div className="w-16 h-6 bg-muted rounded-lg opacity-50" />
                        </div>
                        <div className="space-y-2">
                          <div className="h-10 w-64 bg-muted rounded-xl" />
                          <div className="h-4 w-96 bg-muted rounded-lg opacity-60" />
                        </div>
                      </div>
                      <div className="w-32 h-12 bg-muted rounded-xl" />
                    </div>
                    {/* Skeleton Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="h-48 bg-muted rounded-2xl" />
                      <div className="h-48 bg-muted rounded-2xl" />
                    </div>
                  </div>
                ) : loadError ? (
                  <div className="flex flex-col items-center justify-center h-64 gap-4 px-4 text-center">
                    <ExclamationTriangleIcon className="w-10 h-10 text-rose-600 dark:text-rose-400" />
                    <p className="text-sm text-rose-600 dark:text-rose-400 font-bold">
                      {loadError}
                    </p>
                    <button
                      onClick={() =>
                        selectedCourse && loadCurriculum(selectedCourse.id)
                      }
                      className="px-4 py-2 text-xs font-bold border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                ) : !curriculum ? (
                  /* No curriculum yet — staff empty state unified with premium aesthetics */
                  <div className="px-4 md:px-6 py-8 space-y-12 max-w-5xl">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 pb-8 border-b border-border relative">
                      <div className="absolute -top-6 -left-6 w-32 h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
                      <div className="space-y-4 relative z-10">
                        <div className="flex flex-wrap items-center gap-2 text-primary">
                          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-muted border border-border rounded-lg text-[10px] font-black uppercase tracking-[0.2em]">
                            <InformationCircleIcon className="w-3 h-3" /> System
                            Status
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60">
                            Setup in progress
                          </span>
                        </div>

                        <div className="space-y-1">
                          <h1 className="text-2xl sm:text-4xl font-black leading-tight tracking-tighter text-foreground">
                            {selectedCourse.title}
                          </h1>
                          <p className="text-sm text-muted-foreground font-medium max-w-xl">
                            Build the real course direction for the selected school,
                            online or cohort format. Central curricula continue
                            automatically to the readiness check and school assignment.
                          </p>
                        </div>
                      </div>

                      {canGenerate && (
                        <button
                          onClick={openGenerateModal}
                          className="relative z-10 flex items-center gap-3 px-6 py-3.5 bg-primary hover:bg-primary text-primary-foreground text-[11px] font-black uppercase tracking-[0.2em] transition-all rounded-lg shrink-0"
                        >
                          <SparklesIcon className="w-4 h-4" /> Generate
                          Curriculum
                        </button>
                      )}
                    </div>
                    {curriculumList.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-primary">
                            <ClockIcon className="w-4 h-4" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                              Curriculum history
                            </span>
                          </div>
                          {isAdmin && curriculumList.length > 1 && (
                            <button
                              onClick={async () => {
                                if (
                                  !confirm(
                                    `Delete ALL ${curriculumList.length} visible copies for "${selectedCourse?.title}"?\n\nEach copy is force-cleaned: linked editions, delivery schedules, adoptions, draft plans, and week tracking are removed. Failures are listed if anything remains.`
                                  )
                                )
                                  return;
                                setDeleting(true);
                                setDeleteError("");
                                try {
                                  let successCount = 0;
                                  const failedIds = new Set<string>();
                                  const failures: string[] = [];
                                  for (const c of [...curriculumList]) {
                                    const res = await fetch(
                                      `/api/curricula/${c.id}?force=1`,
                                      { method: "DELETE" }
                                    );
                                    if (res.ok) {
                                      successCount++;
                                    } else {
                                      failedIds.add(c.id);
                                      const j = await res.json().catch(() => ({}));
                                      failures.push(
                                        `${c.content?.description || `Version ${c.version}`}: ${
                                          j?.error || `HTTP ${res.status}`
                                        }`
                                      );
                                    }
                                  }
                                  if (successCount > 0) {
                                    const remaining = curriculumList.filter((c) =>
                                      failedIds.has(c.id)
                                    );
                                    setCurriculumList(remaining);
                                    setCurriculum(remaining[0] ?? null);
                                    setTracking([]);
                                  }
                                  if (failures.length === 0) {
                                    toast.success("All syllabus copies deleted");
                                  } else if (successCount === 0) {
                                    setDeleteError(failures[0]);
                                    toast.error(
                                      `Could not delete any version. ${failures[0]}`
                                    );
                                  } else {
                                    setDeleteError(failures[0]);
                                    toast.error(
                                      `Deleted ${successCount} version(s), but ${failures.length} failed. ${failures[0]}`
                                    );
                                  }
                                } finally {
                                  setDeleting(false);
                                }
                              }}
                              disabled={deleting}
                              className="text-[10px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400 border border-rose-500/30 px-3 py-1.5 hover:bg-rose-500/10 transition-colors"
                            >
                              Delete All
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {curriculumList.map((c) => {
                            const schoolName = c.school_id
                              ? c.schools?.name ?? "School"
                              : "Rillcod shared template";
                            const terms = c.content?.terms?.length ?? 0;
                            const weeks = (c.content?.terms ?? []).reduce(
                              (sum: number, t: any) =>
                                sum + (t?.weeks ?? []).length,
                              0
                            );
                            return (
                              <div
                                key={c.id}
                                className="group relative bg-card border border-border hover:border-primary/40 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/5"
                              >
                                <button
                                  onClick={() => {
                                    void selectCurriculumVersion(c.id);
                                  }}
                                  className="w-full text-left p-5 space-y-4"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 space-y-2">
                                      <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">
                                        {schoolName}
                                      </p>
                                      <h3 className="text-sm font-black text-foreground group-hover:text-primary transition-colors">
                                        {c.content?.description ||
                                          `Version ${c.version}`}
                                      </h3>

                                      {/* Premium Badges */}
                                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                        {/* Christian STEM Badge */}
                                        {c.content?.metadata?.christian_stem !==
                                          false && (
                                          <span className="inline-flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[8px] sm:text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                                            <StarIcon className="w-2.5 h-2.5 shrink-0" />
                                            Christian STEM
                                          </span>
                                        )}

                                        {/* Format Badge */}
                                        {(() => {
                                          const fmt =
                                            c.content?.metadata?.format ||
                                            "school";
                                          let config = {
                                            label: "School Plan",
                                            style:
                                              "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400",
                                          };
                                          if (fmt === "bootcamp") {
                                            config = {
                                              label: "Bootcamp",
                                              style:
                                                "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400",
                                            };
                                          } else if (fmt === "online") {
                                            config = {
                                              label: "Online Course",
                                              style:
                                                "bg-purple-500/10 border-purple-500/20 text-purple-600 dark:text-purple-400",
                                            };
                                          } else if (fmt === "selfpaced") {
                                            config = {
                                              label: "Self-Paced",
                                              style:
                                                "bg-orange-500/10 border-orange-500/20 text-orange-600 dark:text-orange-400",
                                            };
                                          }

                                          return (
                                            <span
                                              className={`inline-flex items-center gap-1 text-[8px] sm:text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${config.style}`}
                                            >
                                              {config.label}
                                            </span>
                                          );
                                        })()}

                                        {/* Scope Badge */}
                                        {c.school_id ? (
                                          <span className="inline-flex items-center gap-1 bg-teal-500/10 border border-teal-500/20 text-teal-600 dark:text-teal-400 text-[8px] sm:text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                                            <BuildingOfficeIcon className="w-2.5 h-2.5 shrink-0" />
                                            School-Scoped
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 bg-muted border border-border text-foreground text-[8px] sm:text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                                            <ShieldCheckIcon className="w-2.5 h-2.5 shrink-0" />
                                            Platform Template
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <span className="bg-primary/10 border border-primary/20 text-primary text-[10px] font-black px-2 py-1">
                                      v{c.version}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-black uppercase tracking-widest opacity-60">
                                    <span className="flex items-center gap-1.5">
                                      <CalendarDaysIcon className="w-3.5 h-3.5" />{" "}
                                      {new Date(
                                        c.created_at
                                      ).toLocaleDateString()}
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                      <BookOpenIcon className="w-3.5 h-3.5" />{" "}
                                      {terms} Terms · {weeks} Weeks
                                    </span>
                                  </div>
                                  <div className="pt-1 flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                                      Open curriculum →
                                    </span>
                                  </div>
                                </button>
                                {/* Bottom action row: clone (platform only, teachers) + delete */}
                                <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
                                  {/* Clone to My School — platform cards only, teachers */}
                                  {isAdmin && !c.school_id && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleClone(c.id);
                                      }}
                                      disabled={cloning}
                                      className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-emerald-600/70 dark:text-emerald-400/70 hover:text-emerald-600 dark:hover:text-emerald-400 border border-emerald-500/0 hover:border-emerald-500/30 px-2 py-1 transition-all hover:bg-emerald-500/10 disabled:opacity-50"
                                      title="Clone to my school"
                                    >
                                      {cloning ? (
                                        <ArrowPathIcon className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <DocumentDuplicateIcon className="w-3 h-3" />
                                      )}
                                      Clone
                                    </button>
                                  )}
                                  {/* Delete — school curricula only (admin always, teacher only their own) */}
                                  {isAdmin && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleDeleteCurriculum(c.id);
                                      }}
                                      disabled={deleting}
                                      className="text-[9px] font-black uppercase tracking-widest text-rose-600/60 dark:text-rose-400/60 hover:text-rose-600 dark:hover:text-rose-400 border border-rose-500/0 hover:border-rose-500/30 px-2 py-1 transition-all hover:bg-rose-500/10 disabled:opacity-50"
                                      title="Delete this syllabus copy"
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
                  <div className="px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6 max-w-5xl mx-auto w-full">
                    <OfficialDirectionStatus
                      loading={officialStatus.loading}
                      release={officialStatus.release}
                      adoption={officialStatus.adoption}
                      isSchoolScoped={officialStatus.isSchoolScoped}
                      publishHref={
                        canPublish && curriculum && !curriculum.school_id
                          ? buildCertifyHref({
                              curriculumId: curriculum.id,
                              courseId: curriculum.course_id,
                            })
                          : undefined
                      }
                    />

                    {deleteError && (
                      <div
                        role="alert"
                        className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-800 dark:text-rose-200"
                      >
                        <p className="font-bold">Delete blocked</p>
                        <p className="mt-1 text-xs leading-5">{deleteError}</p>

                        {blockersLoading && (
                          <p className="mt-3 text-xs italic opacity-80">Finding what is holding it…</p>
                        )}

                        {blockers && blockers.dependents.length > 0 && (
                          <div className="mt-3 space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-widest opacity-80">
                              Holding this copy ({blockers.summary.total})
                            </p>
                            {blockers.dependents.map((d) => (
                              <div
                                key={`${d.kind}-${d.id}`}
                                className="rounded-xl border border-rose-500/25 bg-background/60 p-3"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-xs font-black text-foreground">{d.label}</p>
                                    <p className="mt-0.5 break-words text-[11px] text-muted-foreground">{d.detail}</p>
                                  </div>
                                  <span
                                    className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                                      d.onCleanup === "unlinked"
                                        ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                                        : d.onCleanup === "detached"
                                          ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                                          : "bg-rose-500/15 text-rose-700 dark:text-rose-200"
                                    }`}
                                  >
                                    {d.onCleanup === "unlinked"
                                      ? "stays published"
                                      : d.onCleanup === "detached"
                                        ? "kept, unlinked"
                                        : "will be removed"}
                                  </span>
                                </div>
                                {d.href && (
                                  <Link
                                    href={d.href}
                                    className="mt-2 inline-block text-[11px] font-bold text-primary hover:underline"
                                  >
                                    {d.kind === "official_edition"
                                      ? "Open in the builder →"
                                      : d.kind === "teaching_plan"
                                        ? "Open this plan →"
                                        : d.kind === "school_adoption"
                                          ? "Open rollout →"
                                          : "Open this class →"}
                                  </Link>
                                )}
                              </div>
                            ))}
                            <p className="text-[11px] leading-5 opacity-90">
                              {blockers.summary.fully_safe
                                ? "Nothing irreversible here — force cleanup can remove these blockers and delete this copy."
                                : "Some of these are real delivery history or live editions. Review them before cleaning up — force delete removes editions and schedules tied to this copy."}
                            </p>
                          </div>
                        )}

                        {isAdmin && (
                          <button
                            type="button"
                            disabled={deleting}
                            onClick={() =>
                              void handleDeleteCurriculum(curriculum.id, {
                                force: true,
                              })
                            }
                            className="mt-3 rounded-xl border border-rose-400/40 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-rose-800 dark:text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
                          >
                            Clean blockers and delete this draft
                          </button>
                        )}
                      </div>
                    )}

                    {/* ── Classes using this curriculum ──
                       These are exactly what blocks deletion, and the page
                       never showed them, so a refusal named a class the user
                       had no way to find. */}
                    {implementationList.length > 0 && (
                      <div className="rounded-2xl border border-border bg-card p-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          Used by {implementationList.length} class
                          {implementationList.length === 1 ? "" : "es"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          This curriculum cannot be deleted while any of these
                          teaching plans still use it.
                        </p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {implementationList.map((impl: any) => {
                            const klass = Array.isArray(impl.classes)
                              ? impl.classes[0]
                              : impl.classes;
                            return (
                              <div
                                key={impl.id}
                                className="flex items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm"
                              >
                                <span className="min-w-0">
                                  <span className="block truncate font-bold text-foreground">
                                    {klass?.name ?? "Unassigned class"}
                                  </span>
                                  <span className="block text-[11px] text-muted-foreground">
                                    {impl.term || "No term"} ·{" "}
                                    {impl.status || "draft"}
                                  </span>
                                </span>
                                <div className="flex shrink-0 items-center gap-2">
                                  {klass?.id && (
                                    <Link
                                      href={buildClassTeachingHref({
                                        classId: klass.id,
                                        courseId: curriculum?.course_id,
                                      })}
                                      className="text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary/70"
                                    >
                                      Teach
                                    </Link>
                                  )}
                                  {/* Removing a teaching plan is a delivery
                                     action, not a curriculum edit: the API
                                     allows a teacher who owns the class. */}
                                  {canTrack && (
                                    <button
                                      type="button"
                                      disabled={deletingImpl === impl.id}
                                      onClick={(e) =>
                                        void deleteImplementation(impl.id, e)
                                      }
                                      className="text-[10px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 disabled:opacity-50"
                                    >
                                      {deletingImpl === impl.id
                                        ? "Removing…"
                                        : "Remove"}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* ── Curriculum header — mobile-first ── */}
                    <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
                      <p className="text-xs font-black text-foreground">
                        What this page controls
                      </p>
                      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                        This is the reusable course direction. Teachers deliver
                        it from a class, where enrollment type and delivery
                        period choose the correct teaching plan. Changes here do
                        not overwrite scores, attendance or delivered lessons.
                      </p>
                    </div>

                    <div className="pb-4 sm:pb-5 border-b border-border space-y-3 sm:space-y-4 relative">
                      <div className="absolute -top-6 -left-6 w-32 h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

                      {/* Row 1: unified Year → Curriculum → Term control bar */}
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 relative z-10">
                        {/* Academic Year — display only; change from Settings */}
                        <div
                          className={`${
                            showAdvancedCurriculumControls
                              ? "inline-flex"
                              : "hidden"
                          } items-center h-7 sm:h-8 rounded-lg border border-border bg-card/60 backdrop-blur-sm overflow-hidden`}
                        >
                          <div className="flex items-center gap-1.5 px-2 border-r border-border h-full">
                            <CalendarDaysIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                              Year
                            </span>
                          </div>
                          <Link
                            href="/dashboard/learner-progress?view=rules&tab=academic-rules&sub=platform"
                            className="px-2 text-[9px] font-black text-primary hover:text-primary/70 transition-colors"
                            title="Academic year — click to change in Settings"
                          >
                            {academicYear}
                          </Link>
                        </div>

                        <ChevronRightIcon
                          className={`${
                            showAdvancedCurriculumControls ? "block" : "hidden"
                          } w-3 h-3 text-muted-foreground/40 shrink-0`}
                        />

                        {/* Curriculum */}
                        <div className="inline-flex items-center h-7 sm:h-8 rounded-lg border border-border bg-card/60 backdrop-blur-sm overflow-hidden">
                          <div
                            className={`flex items-center gap-1.5 px-2 border-r border-border h-full ${
                              curriculum.school_id
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-primary"
                            }`}
                          >
                            {curriculum.school_id ? (
                              <BuildingOfficeIcon className="w-3 h-3 shrink-0" />
                            ) : (
                              <ShieldCheckIcon className="w-3 h-3 shrink-0" />
                            )}
                            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                              Curriculum
                            </span>
                          </div>
                          {curriculumList.length > 1 ? (
                            <select
                              value={curriculum.id}
                              onChange={(e) =>
                                selectCurriculumVersion(e.target.value)
                              }
                              className="bg-transparent border-none text-[9px] font-black tracking-widest text-primary focus:ring-0 px-2 h-full cursor-pointer max-w-[150px] sm:max-w-[200px] truncate py-0"
                            >
                              {curriculumList.filter((c) => !c.school_id)
                                .length > 0 && (
                                <optgroup label="── Platform template">
                                  {curriculumList
                                    .filter((c) => !c.school_id)
                                    .map((c) => {
                                      const desc = c.content?.description
                                        ? ` (${c.content.description})`
                                        : "";
                                      return (
                                        <option
                                          key={c.id}
                                          value={c.id}
                                          className="bg-[#0a0a0a] text-foreground"
                                        >
                                          Platform v{c.version}
                                          {desc}
                                        </option>
                                      );
                                    })}
                                </optgroup>
                              )}
                              {curriculumList.filter((c) => !!c.school_id)
                                .length > 0 && (
                                <optgroup label="── School versions">
                                  {curriculumList
                                    .filter((c) => !!c.school_id)
                                    .map((c) => {
                                      const desc = c.content?.description
                                        ? ` (${c.content.description})`
                                        : "";
                                      return (
                                        <option
                                          key={c.id}
                                          value={c.id}
                                          className="bg-[#0a0a0a] text-foreground"
                                        >
                                          {c.schools?.name ?? "School"} v
                                          {c.version}
                                          {desc}
                                        </option>
                                      );
                                    })}
                                </optgroup>
                              )}
                            </select>
                          ) : (
                            <span className="px-2 text-[9px] font-black text-primary">
                              {curriculum.school_id
                                ? curriculum.schools?.name ?? "School"
                                : "Platform"}
                            </span>
                          )}
                        </div>

                        {/* Manage versions — return to history list */}
                        {curriculumList.length > 1 && (
                          <button
                            onClick={() => setCurriculum(null)}
                            className="inline-flex items-center gap-1 h-7 sm:h-8 px-2 rounded-lg border border-border bg-card/60 backdrop-blur-sm text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                            title="See all versions and manage them"
                          >
                            <RectangleStackIcon className="w-3 h-3 shrink-0" />
                            Versions ({curriculumList.length})
                          </button>
                        )}

                        {termCount > 0 && (
                          <>
                            <ChevronRightIcon className="w-3 h-3 text-muted-foreground/40 shrink-0" />

                            {/* Year tab — only shown for multi-year curricula */}
                            {yearsAvailable.length > 1 && (
                              <>
                                <div className="inline-flex items-center h-7 sm:h-8 rounded-lg border border-border bg-card/60 backdrop-blur-sm overflow-hidden">
                                  <div className="flex items-center gap-1.5 px-2 border-r border-border h-full">
                                    <AcademicCapIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                                      Year
                                    </span>
                                  </div>
                                  <select
                                    value={activeYear}
                                    onChange={(e) => {
                                      const yr = Number(e.target.value);
                                      setActiveYear(yr);
                                      setActiveWeek(null);
                                      // Snap term to Programme Term 1 in the new year
                                      const termsInYear = allTerms
                                        .filter((t) => (t.year ?? 1) === yr)
                                        .map((t) => t.term);
                                      if (termsInYear.length > 0) {
                                        const progT1 =
                                          effectiveProgramStartTerm;
                                        setActiveTerm(
                                          termsInYear.includes(progT1)
                                            ? progT1
                                            : termsInYear[0]
                                        );
                                      }
                                    }}
                                    className="bg-transparent border-none text-[9px] font-black tracking-widest text-primary focus:ring-0 px-2 h-full cursor-pointer py-0"
                                  >
                                    {yearsAvailable.map((yr) => (
                                      <option
                                        key={yr}
                                        value={yr}
                                        className="bg-[#0a0a0a] text-foreground"
                                      >
                                        Year {yr}
                                      </option>
                                    ))}
                                  </select>
                                  {canModifyCurriculum &&
                                    showAdvancedCurriculumControls && (
                                      <button
                                        type="button"
                                        onClick={handleDeleteActiveYear}
                                        disabled={deleting}
                                        className="flex items-center justify-center w-7 h-full border-l border-border bg-rose-500/0 hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                                        title={`Delete Year ${activeYear} and all its terms`}
                                      >
                                        <TrashIcon className="w-3 h-3" />
                                      </button>
                                    )}
                                </div>
                                <ChevronRightIcon className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                              </>
                            )}

                            {/* Term — filtered to active year */}
                            <div className="inline-flex items-center h-7 sm:h-8 rounded-lg border border-border bg-card/60 backdrop-blur-sm overflow-hidden">
                              <div className="flex items-center gap-1.5 px-2 border-r border-border h-full">
                                <BookOpenIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                                  {unitNoun}
                                </span>
                              </div>
                              <select
                                value={activeTerm}
                                onChange={(e) => {
                                  setActiveTerm(Number(e.target.value));
                                  setActiveWeek(null);
                                }}
                                className="bg-transparent border-none text-[9px] font-black tracking-widest text-primary focus:ring-0 px-2 h-full cursor-pointer py-0"
                              >
                                {[...termsForActiveYear]
                                  .sort((a, b) => {
                                    // Sort by programme term order so Prog.T1 always appears first
                                    const pa = getProgrammeTerm(
                                      a.term,
                                      effectiveProgramStartTerm
                                    );
                                    const pb = getProgrammeTerm(
                                      b.term,
                                      effectiveProgramStartTerm
                                    );
                                    return pa - pb;
                                  })
                                  .map((term) => {
                                    const tw = tracking.filter(
                                      (t) => t.term_number === term.term
                                    );
                                    const termWeeks = term.weeks?.length ?? 0;
                                    const termDone = tw.filter(
                                      (t) => t.status === "completed"
                                    ).length;
                                    const isNow =
                                      !isCohortFormat &&
                                      term.term === getCurrentTerm();
                                    const progTermNum = getProgrammeTerm(
                                      term.term,
                                      effectiveProgramStartTerm
                                    );
                                    const PROG_THEME: Record<number, string> = {
                                      1: "Foundations",
                                      2: "Application",
                                      3: "Innovation",
                                    };
                                    const nationalLabel = unitLabel(term);
                                    // Programme-term theming only applies to the school calendar; cohort
                                    // formats (online/bootcamp/self-paced) just show Module/Week labels.
                                    const progLabel =
                                      !isCohortFormat &&
                                      effectiveProgramStartTerm !== 1
                                        ? `T${progTermNum} ${
                                            PROG_THEME[progTermNum] ?? ""
                                          } (${nationalLabel})`
                                        : nationalLabel;
                                    const doneLabel =
                                      termWeeks > 0
                                        ? ` · ${termDone}/${termWeeks}`
                                        : "";
                                    return (
                                      <option
                                        key={term.term}
                                        value={term.term}
                                        className="bg-[#0a0a0a] text-foreground"
                                      >
                                        {isNow ? "▶ " : ""}
                                        {progLabel}
                                        {doneLabel}
                                      </option>
                                    );
                                  })}
                              </select>
                              {canModifyCurriculum &&
                                showAdvancedCurriculumControls &&
                                allTerms.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={handleDeleteActiveTerm}
                                    disabled={deleting}
                                    className="flex items-center justify-center w-7 h-full border-l border-border bg-rose-500/0 hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                                    title={`Delete Term ${activeTerm} of Year ${activeYear}`}
                                  >
                                    <TrashIcon className="w-3.5 h-3.5" />
                                  </button>
                                )}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Row 2: title + version + meta */}
                      <div className="space-y-2 relative z-10">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <h1 className="text-lg sm:text-2xl font-black leading-tight tracking-tighter text-foreground inline-flex items-center gap-2 flex-wrap">
                            <span>{curriculum.content.course_title}</span>
                            <span className="inline-flex items-center gap-1.5 shrink-0 select-none">
                              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[9px] sm:text-[10px] font-black uppercase tracking-widest bg-primary/10 border border-primary/20 text-primary h-6">
                                v{curriculum.version}
                              </span>
                              {canModifyCurriculum &&
                                showAdvancedCurriculumControls && (
                                  <button
                                    onClick={() => {
                                      setEditVersionNumber(curriculum.version);
                                      setEditVersionDesc(
                                        curriculum.content.description ?? ""
                                      );
                                      setShowEditVersionModal(true);
                                    }}
                                    className="inline-flex items-center justify-center w-6 h-6 rounded-md border border-border hover:border-primary/40 bg-muted hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all shrink-0 cursor-pointer"
                                    title="Edit version details"
                                  >
                                    <PencilIcon className="w-3.5 h-3.5" />
                                  </button>
                                )}
                            </span>
                          </h1>
                          {curriculum.content.description && (
                            <span
                              className="text-[10px] sm:text-xs font-semibold text-muted-foreground bg-muted px-2.5 py-0.5 border border-border rounded-lg max-w-[200px] sm:max-w-none truncate h-6 inline-flex items-center select-none"
                              title={curriculum.content.description}
                            >
                              {curriculum.content.description}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground font-medium">
                          {yearsAvailable.length > 1 ? (
                            <span className="flex items-center gap-1">
                              <AcademicCapIcon className="w-3 h-3" />{" "}
                              {yearsAvailable.length} Years · {termCount}{" "}
                              {unitNoun}
                              {termCount === 1 ? "" : "s"}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <BookOpenIcon className="w-3 h-3" /> {termCount}{" "}
                              {unitNoun}
                              {termCount === 1 ? "" : "s"}
                            </span>
                          )}
                          <span className="w-1 h-1 rounded-full bg-white/20" />
                          <span className="flex items-center gap-1">
                            <CalendarDaysIcon className="w-3 h-3" />{" "}
                            {new Date(
                              curriculum.created_at
                            ).toLocaleDateString()}
                          </span>
                          {allWeeks.length > 0 && completedCount > 0 && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-white/20" />
                              <span className="text-emerald-600 dark:text-emerald-400 font-black">
                                {completedCount}/{allWeeks.length} taught
                              </span>
                            </>
                          )}
                          {/* Programme start term — editable by staff */}
                          {canModifyCurriculum &&
                            showAdvancedCurriculumControls && (
                              <>
                                {/* Today indicator — shows current programme term and lets teacher jump to it */}
                                {(() => {
                                  const todayNational = getCurrentTerm();
                                  const todayProg = getProgrammeTerm(
                                    todayNational,
                                    effectiveProgramStartTerm
                                  );
                                  const PROG_PHASE: Record<number, string> = {
                                    1: "Foundations",
                                    2: "Application",
                                    3: "Innovation",
                                  };
                                  const isViewingToday =
                                    activeTerm === todayNational;
                                  const todayInCurriculum =
                                    termsForActiveYear.some(
                                      (t) => t.term === todayNational
                                    );
                                  if (!todayInCurriculum) return null;
                                  return (
                                    <>
                                      <span className="w-1 h-1 rounded-full bg-white/20" />
                                      {isViewingToday ? (
                                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                                          Now · Prog.T{todayProg}{" "}
                                          {PROG_PHASE[todayProg]}
                                        </span>
                                      ) : (
                                        <button
                                          onClick={() => {
                                            setActiveTerm(todayNational);
                                            setActiveWeek(null);
                                          }}
                                          title={`Jump to today's term — Prog.T${todayProg} ${PROG_PHASE[todayProg]}`}
                                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wide transition-all group bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                                        >
                                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                                          Today: Prog.T{todayProg}{" "}
                                          {PROG_PHASE[todayProg]}
                                          <ChevronRightIcon className="w-2.5 h-2.5 opacity-0 group-hover:opacity-70 transition-opacity" />
                                        </button>
                                      )}
                                    </>
                                  );
                                })()}
                                <span className="w-1 h-1 rounded-full bg-white/20" />
                                {editingProgramStartTerm ? (
                                  <span className="flex items-center gap-1.5">
                                    <select
                                      value={programStartTermDraft}
                                      onChange={(e) =>
                                        setProgramStartTermDraft(
                                          Number(e.target.value)
                                        )
                                      }
                                      className="text-[10px] font-black bg-muted border border-border rounded px-2 py-0.5 text-foreground focus:outline-none focus:border-amber-500/50"
                                      autoFocus
                                    >
                                      <option value={1}>
                                        Starts Term 1 — Sept
                                      </option>
                                      <option value={2}>
                                        Starts Term 2 — Jan
                                      </option>
                                      <option value={3}>
                                        Starts Term 3 — May
                                      </option>
                                    </select>
                                    <button
                                      onClick={() =>
                                        void saveProgramStartTerm(
                                          programStartTermDraft
                                        )
                                      }
                                      disabled={savingProgramStartTerm}
                                      className="px-2 py-0.5 text-[9px] font-black bg-primary text-primary-foreground rounded-full disabled:opacity-40 transition-colors"
                                    >
                                      {savingProgramStartTerm ? "…" : "Save"}
                                    </button>
                                    <button
                                      onClick={() =>
                                        setEditingProgramStartTerm(false)
                                      }
                                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                      ✕
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setProgramStartTermDraft(
                                        effectiveProgramStartTerm
                                      );
                                      setEditingProgramStartTerm(true);
                                    }}
                                    title="Tap to change which national term is Programme Term 1 for this school"
                                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wide transition-all group ${
                                      effectiveProgramStartTerm !== 1
                                        ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
                                        : "bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                                    }`}
                                  >
                                    <span
                                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                        effectiveProgramStartTerm !== 1
                                          ? "bg-amber-400"
                                          : "bg-muted-foreground/40"
                                      }`}
                                    />
                                    Prog. T{effectiveProgramStartTerm} starts
                                    <PencilIcon className="w-2.5 h-2.5 opacity-0 group-hover:opacity-70 transition-opacity" />
                                  </button>
                                )}
                              </>
                            )}
                        </div>
                      </div>

                      {/* Row 3: action buttons — primary then secondary, all wrap */}
                      <div className="flex flex-wrap gap-1.5 sm:gap-2 relative z-10">
                        {/* Authoring the curriculum source is admin-only at the
                           API, so gate on canGenerate rather than
                           canModifyCurriculum: the latter admits a teacher on a
                           school-scoped curriculum, who was shown a Generate
                           button that always came back 403. */}
                        {canGenerate && (
                          <button
                            onClick={openGenerateModal}
                            className="flex items-center justify-center gap-1.5 px-2.5 py-1 text-[9px] sm:px-3.5 sm:py-1.5 sm:text-[10px] font-black uppercase tracking-widest bg-primary hover:bg-primary/90 text-primary-foreground transition-all rounded-lg shadow-lg shadow-primary/20 shrink-0 cursor-pointer"
                          >
                            <SparklesIcon className="w-3.5 h-3.5" /> Generate
                          </button>
                        )}
                        {canPublish && !curriculum.school_id && (
                          <Link
                            href={buildCertifyHref({
                              curriculumId: curriculum.id,
                              courseId: curriculum.course_id,
                            })}
                            className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-white transition-colors hover:bg-emerald-500 sm:px-3.5 sm:py-1.5 sm:text-[10px]"
                          >
                            <RocketLaunchIcon className="h-3.5 w-3.5" />
                            Review &amp; certify
                          </Link>
                        )}
                        {canPublish &&
                          !!curriculum.school_id &&
                          showAdvancedCurriculumControls &&
                          (curriculum.is_visible_to_school ? (
                            <button
                              onClick={() => togglePublish(false)}
                              disabled={publishing}
                              className="flex items-center justify-center gap-1.5 px-2.5 py-1 text-[9px] sm:px-3 sm:py-1.5 sm:text-[10px] font-black uppercase tracking-widest bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-all rounded-lg shrink-0 cursor-pointer"
                              title="Make private"
                            >
                              {publishing ? (
                                <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <PencilIcon className="w-3.5 h-3.5" />
                              )}
                              <span className="hidden xs:inline">
                                Make Private
                              </span>
                              <span className="xs:hidden">Private</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => togglePublish(true)}
                              disabled={publishing}
                              className="flex items-center justify-center gap-1.5 px-2.5 py-1 text-[9px] sm:px-3 sm:py-1.5 sm:text-[10px] font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-500 text-white transition-all rounded-lg shrink-0 cursor-pointer"
                              title="Share with school"
                            >
                              {publishing ? (
                                <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <CheckCircleIcon className="w-3.5 h-3.5" />
                              )}
                              <span className="hidden sm:inline">
                                Share with School
                              </span>
                              <span className="sm:hidden">Share</span>
                            </button>
                          ))}
                        {/* Clone to school — only on platform curricula, for teachers */}
                        {canModifyCurriculum && (
                          <button
                            type="button"
                            onClick={() =>
                              setShowAdvancedCurriculumControls(
                                (value) => !value
                              )
                            }
                            aria-expanded={showAdvancedCurriculumControls}
                            className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground sm:px-3 sm:py-1.5 sm:text-[10px]"
                          >
                            {showAdvancedCurriculumControls
                              ? "Hide advanced tools"
                              : "Advanced tools"}
                          </button>
                        )}
                        <button
                          onClick={openPrintOptions}
                          className="flex items-center justify-center gap-1.5 px-2.5 py-1 text-[9px] sm:px-3 sm:py-1.5 sm:text-[10px] border border-border text-foreground hover:bg-muted/50 transition-colors rounded-lg shrink-0 cursor-pointer"
                        >
                          <PrinterIcon className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">
                            Print / Export
                          </span>
                          <span className="sm:hidden">Export</span>
                        </button>
                        {canModifyCurriculum &&
                          showAdvancedCurriculumControls && (
                            <button
                              onClick={() => {
                                setNotifSettingsDraft(
                                  curriculum.content.notification_settings ?? {
                                    mode: "all",
                                    channels: ["whatsapp"],
                                  }
                                );
                                setShowNotifSettings(true);
                              }}
                              className="flex items-center justify-center gap-1.5 px-2.5 py-1 text-[9px] sm:px-3 sm:py-1.5 sm:text-[10px] border border-border text-foreground hover:bg-muted/50 transition-colors rounded-lg shrink-0 cursor-pointer"
                            >
                              <BellIcon className="w-3.5 h-3.5" /> Notifications
                            </button>
                          )}
                        <Link
                          href="/dashboard/classes"
                          className="flex items-center justify-center gap-1.5 px-2.5 py-1 text-[9px] sm:px-3 sm:py-1.5 sm:text-[10px] text-muted-foreground hover:text-foreground border border-border hover:bg-muted/50 transition-colors rounded-lg shrink-0"
                        >
                          <ChartBarIcon className="w-3.5 h-3.5" /> Open classes
                        </Link>
                        {(isAdmin ||
                          (isTeacher && !!curriculum.school_id)) && (
                            <button
                              onClick={() => void handleDeleteCurriculum()}
                              disabled={deleting}
                              className="flex items-center justify-center gap-1.5 px-2.5 py-1 text-[9px] sm:px-3 sm:py-1.5 sm:text-[10px] text-rose-600 dark:text-rose-400 border border-rose-500/30 hover:bg-rose-500/10 transition-all rounded-lg disabled:opacity-50 shrink-0 cursor-pointer"
                            >
                              {deleting ? (
                                <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <TrashIcon className="w-3.5 h-3.5" />
                              )}
                              Delete
                            </button>
                          )}
                      </div>

                      {/* Description — below buttons on all sizes */}
                      {curriculum.content.description && (
                        <div className="relative max-w-2xl mt-1">
                          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary/30 rounded-full" />
                          <p className="text-xs text-muted-foreground/80 leading-relaxed pl-3 italic font-medium">
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
                            {editingTermTitle ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={editTermTitleVal}
                                  onChange={(e) =>
                                    setEditTermTitleVal(e.target.value)
                                  }
                                  className="text-xs bg-background border border-primary rounded px-2 py-1 text-foreground focus:outline-none focus:ring-0 w-64 font-bold"
                                  placeholder="Rename Term Title"
                                  autoFocus
                                />
                                <button
                                  onClick={() =>
                                    void saveTermTitle(
                                      activeTerm,
                                      editTermTitleVal
                                    )
                                  }
                                  disabled={
                                    savingTermTitle || !editTermTitleVal.trim()
                                  }
                                  className="px-2 py-1 text-[10px] font-black bg-primary text-primary-foreground rounded transition-colors disabled:opacity-50 shrink-0 cursor-pointer"
                                >
                                  {savingTermTitle ? "…" : "Save"}
                                </button>
                                <button
                                  onClick={() => setEditingTermTitle(false)}
                                  className="px-2 py-1 text-[10px] font-bold text-muted-foreground hover:text-foreground border border-border rounded transition-colors shrink-0 cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h2 className="text-lg font-black">
                                  {isCohortFormat
                                    ? unitLabel(currentTermData)
                                    : currentTermData.title ||
                                      unitLabel(currentTermData)}
                                </h2>
                                {canModifyCurriculum && (
                                  <button
                                    onClick={() => {
                                      setEditTermTitleVal(
                                        currentTermData.title ||
                                          unitLabel(currentTermData)
                                      );
                                      setEditingTermTitle(true);
                                    }}
                                    className="inline-flex items-center justify-center w-5 h-5 rounded-md border border-border hover:border-primary/40 bg-muted hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all shrink-0 cursor-pointer"
                                    title="Edit term title"
                                  >
                                    <PencilIcon className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            )}
                            {!isCohortFormat &&
                              (() => {
                                const pt = getProgrammeTerm(
                                  currentTermData.term,
                                  effectiveProgramStartTerm
                                );
                                const PILL_COLOR: Record<number, string> = {
                                  1: "bg-primary/10 border-primary/25 text-primary",
                                  2: "bg-blue-500/10 border-blue-500/25 text-blue-600 dark:text-blue-400",
                                  3: "bg-purple-500/10 border-purple-500/25 text-purple-600 dark:text-purple-400",
                                };
                                const DOT_COLOR: Record<number, string> = {
                                  1: "bg-primary",
                                  2: "bg-blue-400",
                                  3: "bg-purple-400",
                                };
                                const theme = PROGRAMME_TERM_THEME[pt] ?? "";
                                const pillCls = PILL_COLOR[pt] ?? PILL_COLOR[1];
                                const dotCls = DOT_COLOR[pt] ?? DOT_COLOR[1];
                                return (
                                  <div className="flex items-center gap-2 mt-1.5">
                                    <span
                                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${pillCls}`}
                                    >
                                      <span
                                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotCls}`}
                                      />
                                      Prog. Term {pt} · {theme}
                                    </span>
                                    {activeYear > 1 && (
                                      <span className="inline-flex items-center px-2 py-1 rounded-full border border-border bg-muted/40 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                                        Year {activeYear}
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            {!isCohortFormat &&
                              (() => {
                                const termAcYear = effectiveAcademicYearForTerm(
                                  activeTerm,
                                  effectiveProgramStartTerm,
                                  academicYear
                                );
                                const customStart = currentTermData.start_date;
                                const td = customStart
                                  ? {
                                      start: customStart,
                                      end:
                                        resolveTermDates(
                                          activeTerm,
                                          termAcYear,
                                          termCalendar
                                        )?.end ?? "",
                                    }
                                  : resolveTermDates(
                                      activeTerm,
                                      termAcYear,
                                      termCalendar
                                    );
                                if (!td) return null;
                                return (
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    {editingTermDate === activeTerm ? (
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="date"
                                          defaultValue={
                                            currentTermData.start_date ??
                                            resolveTermDates(
                                              activeTerm,
                                              termAcYear,
                                              termCalendar
                                            )?.start ??
                                            ""
                                          }
                                          onBlur={(e) => {
                                            if (e.target.value)
                                              saveTermDate(
                                                activeTerm,
                                                e.target.value
                                              );
                                            else setEditingTermDate(null);
                                          }}
                                          autoFocus
                                          className="text-xs bg-background border border-primary rounded px-2 py-1 text-foreground"
                                        />
                                        {savingTermDate && (
                                          <ArrowPathIcon className="w-3 h-3 animate-spin text-muted-foreground" />
                                        )}
                                      </div>
                                    ) : (
                                      <>
                                        <p className="text-[11px] text-muted-foreground font-bold">
                                          {new Date(
                                            td.start
                                          ).toLocaleDateString("en-GB", {
                                            day: "numeric",
                                            month: "short",
                                            year: "numeric",
                                          })}
                                          {td.end ? (
                                            <>
                                              {" – "}
                                              {new Date(
                                                td.end
                                              ).toLocaleDateString("en-GB", {
                                                day: "numeric",
                                                month: "short",
                                                year: "numeric",
                                              })}
                                            </>
                                          ) : null}
                                        </p>
                                        {canModifyCurriculum && (
                                          <button
                                            onClick={() => {
                                              setEditingTermDate(activeTerm);
                                              setTermDateDraft(
                                                currentTermData.start_date ??
                                                  resolveTermDates(
                                                    activeTerm,
                                                    effectiveAcademicYearForTerm(
                                                      activeTerm,
                                                      effectiveProgramStartTerm,
                                                      academicYear
                                                    ),
                                                    termCalendar
                                                  )?.start ??
                                                  ""
                                              );
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
                        </div>
                        {currentTermData.objectives?.length > 0 && (
                          <ul className="flex flex-wrap gap-2">
                            {currentTermData.objectives.map((o, i) => (
                              <li
                                key={i}
                                className="text-[11px] bg-muted text-muted-foreground px-2.5 py-1 border border-border font-bold"
                              >
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
                        {[...currentTermData.weeks]
                          .sort((a, b) => a.week - b.week)
                          .map((week) => {
                            const meta =
                              WEEK_META[week.type] ?? WEEK_META.lesson;
                            const trackRec = getTracking(activeTerm, week.week);
                            const trackMeta =
                              TRACK_META[trackRec?.status ?? "pending"];
                            const TrackIcon = trackMeta.icon;
                            const WeekIcon = meta.icon;
                            const isActive = activeWeek?.week === week.week;
                            const termAcYear = effectiveAcademicYearForTerm(
                              activeTerm,
                              effectiveProgramStartTerm,
                              academicYear
                            );
                            const dateRange = weekDateRange(
                              activeTerm,
                              week.week,
                              termAcYear,
                              currentTermData?.start_date
                            );

                            return (
                              <div
                                key={week.week}
                                className={`group relative border transition-all duration-500 ${
                                  isActive
                                    ? "border-primary/50 bg-primary/5 shadow-[0_0_30px_rgba(255,107,0,0.1)]"
                                    : "border-border bg-card/40 hover:border-border hover:bg-card/60 hover:shadow-xl"
                                }`}
                              >
                                <div
                                  className={`absolute top-0 left-0 w-1 h-full transition-colors ${
                                    isActive
                                      ? "bg-primary"
                                      : "bg-transparent group-hover:bg-primary/20"
                                  }`}
                                />
                                {editingWeekKey ===
                                `term${activeTerm}-week${week.week}` ? (
                                  <div
                                    className="p-3 space-y-2"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <p className="text-[10px] font-black uppercase tracking-widest text-brand-red-600">
                                      Week {week.week} · Edit
                                    </p>
                                    <input
                                      autoFocus
                                      value={editWeekTopic}
                                      onChange={(e) =>
                                        setEditWeekTopic(e.target.value)
                                      }
                                      placeholder="Week topic"
                                      className="w-full px-2 py-1.5 text-sm bg-muted/30 border border-border text-foreground rounded focus:outline-none focus:border-primary/50"
                                    />
                                    <input
                                      value={editWeekSubtopics}
                                      onChange={(e) =>
                                        setEditWeekSubtopics(e.target.value)
                                      }
                                      placeholder="Subtopics, comma-separated"
                                      className="w-full px-2 py-1.5 text-xs bg-muted/30 border border-border text-foreground rounded focus:outline-none focus:border-primary/50"
                                    />
                                    <div className="flex gap-2 pt-1">
                                      <button
                                        onClick={saveWeekEdit}
                                        disabled={savingWeek}
                                        className="flex-1 py-1.5 text-xs font-black bg-primary hover:bg-primary/90 text-primary-foreground rounded transition-colors disabled:opacity-50"
                                      >
                                        {savingWeek ? "…" : "Save"}
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
                                    onClick={() => setActiveWeek(week)}
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
                                      <span
                                        className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 border ${meta.color}`}
                                      >
                                        {meta.label}
                                      </span>
                                    </div>

                                    <div className="flex items-start gap-3">
                                      <div
                                        className={`p-2 rounded-lg bg-muted border border-border group-hover:border-border transition-colors`}
                                      >
                                        <WeekIcon
                                          className={`w-4 h-4 ${
                                            meta.color.split(" ")[0]
                                          }`}
                                        />
                                      </div>
                                      <h3 className="text-[13px] font-black text-foreground leading-tight group-hover:text-primary transition-colors line-clamp-2 min-h-[2.5em]">
                                        {week.topic}
                                      </h3>
                                    </div>

                                    {/* Subtopics preview */}
                                    {(week.subtopics ?? []).length > 0 && (
                                      <p className="text-[10px] text-muted-foreground truncate">
                                        {(week.subtopics ?? [])
                                          .slice(0, 2)
                                          .join(" · ")}
                                      </p>
                                    )}

                                    {/* Status */}
                                    <div
                                      className={`flex items-center gap-1 text-[10px] font-bold ${trackMeta.color}`}
                                    >
                                      <TrackIcon className="w-3 h-3" />
                                      <span>{trackMeta.label}</span>
                                    </div>
                                  </button>
                                )}
                                {canGenerate &&
                                  editingWeekKey !==
                                    `term${activeTerm}-week${week.week}` && (
                                    <button
                                      onClick={() => {
                                        setEditingWeekKey(
                                          `term${activeTerm}-week${week.week}`
                                        );
                                        setEditWeekTopic(week.topic);
                                        setEditWeekSubtopics(
                                          (week.subtopics ?? []).join(", ")
                                        );
                                        setActiveWeek(null);
                                      }}
                                      className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] font-bold text-muted-foreground/50 hover:text-primary hover:bg-primary/5 transition-colors border-t border-border"
                                      title="Edit week topic"
                                    >
                                      <PencilIcon className="w-3 h-3" /> Edit
                                      topic
                                    </button>
                                  )}
                              </div>
                            );
                          })}
                      </div>
                    )}

                    {/* Materials + tools */}
                    {(curriculum.content.materials_required?.length > 0 ||
                      curriculum.content.recommended_tools?.length > 0) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {curriculum.content.materials_required?.length > 0 && (
                          <div className="bg-card border border-border p-4">
                            <h3 className="text-[11px] font-black uppercase tracking-widest text-primary mb-3">
                              Materials Required
                            </h3>
                            <ul className="space-y-1">
                              {curriculum.content.materials_required.map(
                                (m, i) => (
                                  <li
                                    key={i}
                                    className="flex gap-2 text-xs text-foreground/70"
                                  >
                                    <span className="text-primary">•</span>
                                    {m}
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                        )}
                        {curriculum.content.recommended_tools?.length > 0 && (
                          <div className="bg-card border border-border p-4">
                            <h3 className="text-[11px] font-black uppercase tracking-widest text-primary mb-3">
                              Recommended Tools
                            </h3>
                            <ul className="space-y-1">
                              {curriculum.content.recommended_tools.map(
                                (t, i) => (
                                  <li
                                    key={i}
                                    className="flex gap-2 text-xs text-foreground/70"
                                  >
                                    <span className="text-primary">•</span>
                                    {t}
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Course overview + learning outcomes (from syllabus content) ── */}
                    {(curriculum.content.overview ||
                      curriculum.content.learning_outcomes?.length > 0) && (
                      <div className="space-y-4 mt-2">
                        {curriculum.content.overview && (
                          <div className="bg-card border border-border p-5">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-primary mb-3">
                              About this course
                            </h3>
                            <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
                              {curriculum.content.overview}
                            </p>
                          </div>
                        )}
                        {curriculum.content.learning_outcomes?.length > 0 && (
                          <div className="bg-card border border-border p-5">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-primary mb-3">
                              What students will learn
                            </h3>
                            <ul className="space-y-2">
                              {curriculum.content.learning_outcomes.map(
                                (o: string, i: number) => (
                                  <li
                                    key={i}
                                    className="flex gap-3 text-sm text-foreground/80"
                                  >
                                    <span className="text-emerald-600 dark:text-emerald-400 font-black shrink-0 text-xs mt-0.5">
                                      ✓
                                    </span>
                                    <span>{o}</span>
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Smart Teaching Template ── */}
                    {canGenerate && showAdvancedCurriculumControls && (
                      <div className="bg-card border border-border rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => {
                            setQaSpineOpen((o) => !o);
                            setQaApplyErr("");
                            setQaPreviewErr("");
                          }}
                          className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-muted/20 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <BoltIcon className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                            <div>
                              <p className="text-xs font-black text-foreground">
                                Smart Teaching Template
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                Instantly fill all your week topics with a
                                proven teaching sequence — saves hours of
                                planning
                              </p>
                            </div>
                          </div>
                          {qaSpineOpen ? (
                            <ChevronDownIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRightIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                          )}
                        </button>

                        <AnimatePresence>
                          {qaSpineOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden border-t border-border"
                            >
                              <div className="p-4 space-y-4">
                                <>
                                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    Pick your class and student level, preview
                                    the suggested weeks, then apply — your
                                    curriculum topics are filled in
                                    automatically.
                                  </p>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                      <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block">
                                        Which class?
                                      </label>
                                      <select
                                        className={SELECT_CLS}
                                        value={qaClassId}
                                        onChange={(e) => {
                                          setQaClassId(e.target.value);
                                          setQaPreviewData(null);
                                          setQaPreviewStamp("");
                                          setQaLaneSuggestion(null);
                                          setQaPreviewEdits({});
                                        }}
                                      >
                                        <option value="">
                                          — Pick a class —
                                        </option>
                                        {[...qaClassOptions]
                                          .sort((a, b) => {
                                            const ap =
                                              a.program_id === programIdForQa
                                                ? 0
                                                : 1;
                                            const bp =
                                              b.program_id === programIdForQa
                                                ? 0
                                                : 1;
                                            if (ap !== bp) return ap - bp;
                                            return (a.name || "").localeCompare(
                                              b.name || ""
                                            );
                                          })
                                          .map((c) => (
                                            <option key={c.id} value={c.id}>
                                              {c.name || c.id}
                                              {c.program_id &&
                                              c.program_id !== programIdForQa
                                                ? " (different programme)"
                                                : ""}
                                            </option>
                                          ))}
                                      </select>
                                    </div>

                                    <div className="space-y-1.5">
                                      <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block">
                                        Student level
                                      </label>
                                      <select
                                        className={SELECT_CLS}
                                        value={qaYear}
                                        onChange={(e) => {
                                          setQaYear(Number(e.target.value));
                                          setQaPreviewStamp("");
                                          setQaPreviewData(null);
                                          setQaPreviewEdits({});
                                          setQaLaneSuggestion(null);
                                        }}
                                      >
                                        <option value={1}>
                                          Beginners (Year 1)
                                        </option>
                                        <option value={2}>
                                          Intermediate (Year 2)
                                        </option>
                                        <option value={3}>
                                          Advanced (Year 3)
                                        </option>
                                      </select>
                                    </div>
                                  </div>

                                  {qaClassId && (
                                    <div className="space-y-1.5">
                                      <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block">
                                        How should the template be applied?
                                      </label>
                                      <div className="flex gap-2 flex-wrap">
                                        <button
                                          type="button"
                                          disabled={
                                            qaClassGradeMode === "optional" ||
                                            qaClassModeSaving
                                          }
                                          onClick={() =>
                                            void saveQaClassGradeMode(
                                              "optional"
                                            )
                                          }
                                          className={`px-3 py-1.5 text-[10px] font-black rounded-lg border transition-colors ${
                                            qaClassGradeMode === "optional"
                                              ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200"
                                              : "border-border text-muted-foreground hover:bg-muted/30"
                                          } disabled:opacity-60`}
                                        >
                                          AI adapts it to my class
                                        </button>
                                        <button
                                          type="button"
                                          disabled={
                                            qaClassGradeMode === "compulsory" ||
                                            qaClassModeSaving
                                          }
                                          onClick={() =>
                                            void saveQaClassGradeMode(
                                              "compulsory"
                                            )
                                          }
                                          className={`px-3 py-1.5 text-[10px] font-black rounded-lg border transition-colors ${
                                            qaClassGradeMode === "compulsory"
                                              ? "border-primary/40 bg-primary/10 text-primary"
                                              : "border-border text-muted-foreground hover:bg-muted/30"
                                          } disabled:opacity-60`}
                                        >
                                          Use template exactly as-is
                                        </button>
                                        {qaClassModeErr && (
                                          <p className="text-[10px] text-rose-600 dark:text-rose-400 font-bold w-full">
                                            {qaClassModeErr}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {/* ── Class progress stats ── */}
                                  {qaClassId &&
                                    (() => {
                                      const done = tracking.filter(
                                        (t) => t.status === "completed"
                                      ).length;
                                      const inProg = tracking.filter(
                                        (t) => t.status === "in_progress"
                                      ).length;
                                      const skipped = tracking.filter(
                                        (t) => t.status === "skipped"
                                      ).length;
                                      const avgScoreVal =
                                        qaLaneSuggestion?.avg_score ?? null;
                                      const items = [
                                        {
                                          label: "Done",
                                          val: String(done),
                                          color: "text-emerald-700 dark:text-emerald-300",
                                        },
                                        {
                                          label: "Active",
                                          val: String(inProg),
                                          color: "text-primary",
                                        },
                                        {
                                          label: "Skipped",
                                          val: String(skipped),
                                          color:
                                            skipped > 0
                                              ? "text-amber-700 dark:text-amber-300"
                                              : "text-muted-foreground",
                                        },
                                        {
                                          label: "Avg",
                                          val:
                                            avgScoreVal !== null
                                              ? `${avgScoreVal}%`
                                              : "—",
                                          color:
                                            avgScoreVal !== null
                                              ? avgScoreVal >= 75
                                                ? "text-emerald-700 dark:text-emerald-300"
                                                : avgScoreVal >= 60
                                                ? "text-amber-700 dark:text-amber-300"
                                                : "text-rose-700 dark:text-rose-300"
                                              : "text-muted-foreground",
                                        },
                                      ];
                                      return (
                                        <div className="grid grid-cols-4 gap-1.5">
                                          {items.map((item) => (
                                            <div
                                              key={item.label}
                                              className="bg-muted/10 rounded-lg p-2 text-center border border-border/30"
                                            >
                                              <p
                                                className={`text-[14px] font-black leading-none mb-0.5 ${item.color}`}
                                              >
                                                {item.val}
                                              </p>
                                              <p className="text-[8px] uppercase tracking-widest text-muted-foreground/70">
                                                {item.label}
                                              </p>
                                            </div>
                                          ))}
                                        </div>
                                      );
                                    })()}

                                  <label className="flex items-start gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      className="mt-0.5"
                                      checked={qaOverwrite}
                                      onChange={(e) =>
                                        setQaOverwrite(e.target.checked)
                                      }
                                    />
                                    <span className="text-[11px] text-muted-foreground">
                                      Overwrite my existing week topics
                                    </span>
                                  </label>

                                  <div className="flex gap-2 flex-wrap">
                                    <button
                                      type="button"
                                      onClick={() => void runQaSpinePreview()}
                                      disabled={!qaClassId || qaPreviewLoading}
                                      className="inline-flex items-center gap-1.5 px-4 py-2 text-[10px] font-black rounded-lg border border-cyan-500/40 text-cyan-800 dark:text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-50 transition-colors"
                                    >
                                      {qaPreviewLoading ? (
                                        <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <EyeIcon className="w-3.5 h-3.5" />
                                      )}
                                      Preview weeks first
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void applyQaSpine()}
                                      disabled={
                                        qaApplyLoading ||
                                        !programIdForQa ||
                                        qaNeedsFreshPreview
                                      }
                                      className="inline-flex items-center gap-1.5 px-4 py-2 text-[10px] font-black rounded-lg border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
                                    >
                                      {qaApplyLoading ? (
                                        <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <BoltIcon className="w-3.5 h-3.5" />
                                      )}
                                      Fill my week topics
                                    </button>
                                  </div>

                                  {qaNeedsFreshPreview && (
                                    <p className="text-amber-600 dark:text-amber-400 text-[10px]">
                                      Preview first before filling topics.
                                    </p>
                                  )}
                                  {qaPreviewErr && (
                                    <p className="text-rose-600 dark:text-rose-400 text-[11px] font-bold">
                                      {qaPreviewErr}
                                    </p>
                                  )}
                                  {qaApplyErr && (
                                    <p className="text-rose-600 dark:text-rose-400 text-[11px] font-bold">
                                      {qaApplyErr}
                                    </p>
                                  )}

                                  {qaPreviewData &&
                                    (() => {
                                      const editCount =
                                        Object.keys(qaPreviewEdits).length;
                                      const diffCount =
                                        Object.keys(qaDifficultyFlags).length;
                                      const progMap = qaPreviewData.terms
                                        .map((t) => {
                                          const nat =
                                            t.national_term === 1
                                              ? "T1"
                                              : t.national_term === 2
                                              ? "T2"
                                              : "T3";
                                          const natFull =
                                            t.national_term === 1
                                              ? "First"
                                              : t.national_term === 2
                                              ? "Second"
                                              : "Third";
                                          return `P${t.term}→${nat}`;
                                        })
                                        .join(" · ");
                                      return (
                                        <div className="border border-border rounded-xl overflow-hidden shadow-sm">
                                          {/* Header */}
                                          <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center justify-between gap-2 flex-wrap">
                                            <div className="flex items-center gap-2">
                                              <p className="text-[10px] font-black uppercase text-cyan-700 dark:text-cyan-300 tracking-wide">
                                                Week Plan Preview
                                              </p>
                                              <span className="text-[9px] text-muted-foreground/50 font-mono">
                                                {progMap}
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                              {!qaSpineRegenLoading && (
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    void regenAllTermsProgressive()
                                                  }
                                                  title="Personalise all 3 terms with AI — each term builds on the previous"
                                                  className="inline-flex items-center gap-1 text-[9px] font-black text-purple-700 dark:text-purple-300 hover:text-purple-800 dark:hover:text-purple-100 border border-purple-500/30 hover:border-purple-400/50 bg-purple-500/5 hover:bg-purple-500/10 rounded-md px-2 py-1 transition-all"
                                                >
                                                  <SparklesIcon className="w-3 h-3" />
                                                  All 3 terms progressive
                                                </button>
                                              )}
                                              {editCount > 0 && (
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    setQaPreviewEdits({})
                                                  }
                                                  className="text-[9px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                                                >
                                                  Reset {editCount} edit
                                                  {editCount === 1 ? "" : "s"}
                                                </button>
                                              )}
                                            </div>
                                          </div>

                                          {/* Fallback warning — auto-suggest full AI regen */}
                                          {qaPreviewData.fallback_used && (
                                            <div className="px-3 py-2.5 bg-amber-500/8 border-b border-amber-500/20">
                                              <div className="flex items-start gap-2.5">
                                                <div className="shrink-0 w-4 h-4 rounded-full bg-amber-500/20 flex items-center justify-center mt-0.5">
                                                  <span className="text-amber-600 dark:text-amber-400 text-[10px] font-black">
                                                    !
                                                  </span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                  <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300">
                                                    No programme-specific
                                                    template found
                                                  </p>
                                                  <p className="text-[9px] text-amber-700/70 dark:text-amber-300/70 mt-0.5">
                                                    Topics below are generic
                                                    defaults — not specific to
                                                    your programme or course.
                                                    Replace them with
                                                    AI-generated content
                                                    tailored to{" "}
                                                    <strong className="text-amber-800 dark:text-amber-200">
                                                      {selectedCourse?.title ??
                                                        "this course"}
                                                    </strong>
                                                    .
                                                  </p>
                                                </div>
                                              </div>
                                              {!qaSpineRegenLoading && (
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    void regenAllTermsProgressive()
                                                  }
                                                  className="mt-2 w-full inline-flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-black text-amber-800 dark:text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded-lg transition-all"
                                                >
                                                  <SparklesIcon className="w-3 h-3" />
                                                  Fix all 3 terms with AI now
                                                  (programme-specific)
                                                </button>
                                              )}
                                            </div>
                                          )}

                                          {/* Progress bar during generation */}
                                          {qaSpineRegenLoading &&
                                            qaSpineRegenProgress && (
                                              <div className="px-3 py-2 bg-cyan-500/5 border-b border-cyan-500/10 flex items-center gap-2">
                                                <ArrowPathIcon className="w-3 h-3 animate-spin text-cyan-600 dark:text-cyan-400 shrink-0" />
                                                <p className="text-[10px] text-cyan-700 dark:text-cyan-300">
                                                  {qaSpineRegenProgress}
                                                </p>
                                              </div>
                                            )}

                                          {/* Terms */}
                                          <div className="divide-y divide-border/40">
                                            {qaPreviewData.terms.map((t) => {
                                              const natFull =
                                                t.national_term === 1
                                                  ? "First Term"
                                                  : t.national_term === 2
                                                  ? "Second Term"
                                                  : "Third Term";
                                              const termWeekTopics =
                                                t.weeks.map(
                                                  (w) =>
                                                    qaPreviewEdits[
                                                      `t${t.term}-w${w.week}`
                                                    ] ?? w.topic
                                                );
                                              const aiEditCount =
                                                t.weeks.filter(
                                                  (w) =>
                                                    qaPreviewEdits[
                                                      `t${t.term}-w${w.week}`
                                                    ]
                                                ).length;
                                              const pillCls =
                                                t.term === 1
                                                  ? "bg-primary/15 text-primary border-primary/30"
                                                  : t.term === 2
                                                  ? "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30"
                                                  : "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30";
                                              return (
                                                <div
                                                  key={t.term}
                                                  className="p-3"
                                                >
                                                  {/* Term header */}
                                                  <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                      <span
                                                        className={`shrink-0 text-[9px] font-black px-2 py-0.5 rounded-full border ${pillCls}`}
                                                      >
                                                        Prog.T{t.term}
                                                      </span>
                                                      <span className="text-[9px] text-muted-foreground">
                                                        →
                                                      </span>
                                                      <span className="text-[9px] font-bold text-foreground/70 truncate">
                                                        {natFull}
                                                      </span>
                                                      <span className="text-[9px] text-muted-foreground/40">
                                                        (Nat.T{t.national_term})
                                                      </span>
                                                      {aiEditCount > 0 && (
                                                        <span className="shrink-0 text-[8px] font-bold text-cyan-600/80 dark:text-cyan-400/80 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-px rounded-full">
                                                          ✓ {aiEditCount} AI
                                                        </span>
                                                      )}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                      {t.term < 3 &&
                                                        !qaSpineRegenLoading && (
                                                          <button
                                                            type="button"
                                                            onClick={() =>
                                                              void adoptAndContinueFrom(
                                                                t.term
                                                              )
                                                            }
                                                            title={`Keep T${
                                                              t.term
                                                            } as-is and AI-generate T${
                                                              t.term + 1
                                                            }${
                                                              t.term < 2
                                                                ? "+T3"
                                                                : ""
                                                            } using T${
                                                              t.term
                                                            } as context`}
                                                            className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-600/70 dark:text-emerald-400/70 hover:text-emerald-800 dark:hover:text-emerald-200 hover:bg-emerald-500/10 border border-emerald-500/20 hover:border-emerald-500/40 rounded px-1.5 py-0.5 transition-all"
                                                          >
                                                            Adopt &amp; continue
                                                            ↓
                                                          </button>
                                                        )}
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          void regenFullTerm(
                                                            t.term
                                                          )
                                                        }
                                                        disabled={
                                                          qaSpineRegenLoading
                                                        }
                                                        title={`AI-personalise all 12 Prog.T${
                                                          t.term
                                                        } weeks for ${
                                                          selectedQaClass?.name ??
                                                          "this class"
                                                        }`}
                                                        className="inline-flex items-center gap-1 text-[9px] font-bold text-cyan-600/70 dark:text-cyan-400/70 hover:text-cyan-800 dark:hover:text-cyan-200 hover:bg-cyan-500/10 border border-cyan-500/20 hover:border-cyan-500/40 rounded px-1.5 py-0.5 transition-all disabled:opacity-40"
                                                      >
                                                        <SparklesIcon className="w-2.5 h-2.5" />
                                                        Personalise
                                                      </button>
                                                    </div>
                                                  </div>

                                                  {/* Week list */}
                                                  <ul className="space-y-0.5">
                                                    {t.weeks.map((w) => {
                                                      const key = `t${t.term}-w${w.week}`;
                                                      const edited =
                                                        qaPreviewEdits[key];
                                                      const diffFlag =
                                                        qaDifficultyFlags[key];
                                                      const weekRegenLoading =
                                                        qaWeekRegenLoading ===
                                                        key;
                                                      // Is this week locked (completed in tracking)?
                                                      const isLocked =
                                                        tracking.some((tr) => {
                                                          const termData =
                                                            curriculum?.content?.terms?.find(
                                                              (ct) =>
                                                                ct.term ===
                                                                tr.term_number
                                                            );
                                                          if (!termData)
                                                            return false;
                                                          const progT =
                                                            ((termData.term -
                                                              effectiveProgramStartTerm +
                                                              3) %
                                                              3) +
                                                            1;
                                                          return (
                                                            progT === t.term &&
                                                            tr.week_number ===
                                                              w.week &&
                                                            tr.status ===
                                                              "completed"
                                                          );
                                                        });
                                                      return (
                                                        <li
                                                          key={w.week}
                                                          className={`flex items-center gap-1.5 min-w-0 group rounded px-1 py-0.5 transition-colors ${
                                                            isLocked
                                                              ? "opacity-50"
                                                              : "hover:bg-muted/10"
                                                          }`}
                                                        >
                                                          <span className="shrink-0 text-[8px] text-foreground/25 font-mono w-5 text-right">
                                                            {w.week}
                                                          </span>
                                                          {isLocked ? (
                                                            <span
                                                              title="Completed — will be skipped during AI regen"
                                                              className="shrink-0 text-emerald-600/60 dark:text-emerald-400/60 text-[9px]"
                                                            >
                                                              ✓
                                                            </span>
                                                          ) : diffFlag ? (
                                                            <span
                                                              title={diffFlag}
                                                              className="shrink-0 text-amber-600 dark:text-amber-400 text-[9px] cursor-help"
                                                            >
                                                              ⚠
                                                            </span>
                                                          ) : (
                                                            <span
                                                              className={`shrink-0 w-1 h-1 rounded-full ${
                                                                edited
                                                                  ? "bg-cyan-400"
                                                                  : "bg-border/40"
                                                              }`}
                                                            />
                                                          )}
                                                          <input
                                                            type="text"
                                                            value={
                                                              edited ?? w.topic
                                                            }
                                                            onChange={(e) =>
                                                              !isLocked &&
                                                              setQaPreviewEdits(
                                                                (prev) => ({
                                                                  ...prev,
                                                                  [key]:
                                                                    e.target
                                                                      .value,
                                                                })
                                                              )
                                                            }
                                                            readOnly={isLocked}
                                                            className={`flex-1 min-w-0 bg-transparent text-[10px] border-b outline-none pb-px transition-colors ${
                                                              isLocked
                                                                ? "text-foreground/30 border-transparent cursor-default"
                                                                : edited
                                                                ? "text-cyan-800 dark:text-cyan-200 border-cyan-500/30 font-medium"
                                                                : "text-muted-foreground border-transparent hover:border-border/40 focus:border-primary/60"
                                                            }`}
                                                          />
                                                          {!isLocked && (
                                                            <button
                                                              type="button"
                                                              onClick={() =>
                                                                void regenWeek(
                                                                  t.term,
                                                                  w.week,
                                                                  termWeekTopics.slice(
                                                                    0,
                                                                    w.week - 1
                                                                  )
                                                                )
                                                              }
                                                              disabled={
                                                                weekRegenLoading ||
                                                                qaSpineRegenLoading
                                                              }
                                                              title="Regenerate this week with AI"
                                                              className="shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground/40 hover:text-cyan-700 dark:hover:text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-20 transition-all"
                                                            >
                                                              {weekRegenLoading ? (
                                                                <ArrowPathIcon className="w-2.5 h-2.5 animate-spin text-cyan-600 dark:text-cyan-400" />
                                                              ) : (
                                                                <SparklesIcon className="w-2.5 h-2.5" />
                                                              )}
                                                            </button>
                                                          )}
                                                        </li>
                                                      );
                                                    })}
                                                  </ul>
                                                </div>
                                              );
                                            })}
                                          </div>

                                          {/* Footer summary */}
                                          {(qaSpineRegenNote ||
                                            editCount > 0 ||
                                            diffCount > 0) && (
                                            <div className="px-3 py-2 bg-muted/10 border-t border-border flex flex-wrap items-center gap-x-3 gap-y-1">
                                              {qaSpineRegenNote && (
                                                <p className="text-[9px] text-cyan-600/70 dark:text-cyan-400/70 italic">
                                                  {qaSpineRegenNote}
                                                </p>
                                              )}
                                              {editCount > 0 && (
                                                <p className="text-[9px] text-cyan-600/60 dark:text-cyan-400/60">
                                                  {editCount} topic
                                                  {editCount === 1
                                                    ? ""
                                                    : "s"}{" "}
                                                  edited — will apply when you
                                                  fill week topics
                                                </p>
                                              )}
                                              {diffCount > 0 && (
                                                <p className="text-[9px] text-amber-600/50 dark:text-amber-400/50">
                                                  ⚠ = may be challenging based
                                                  on class performance
                                                </p>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })()}

                                  {/* ── Lane Intelligence ── */}
                                  {(qaLaneSuggestLoading ||
                                    qaLaneSuggestion) && (
                                    <div className="border border-cyan-500/20 rounded-lg overflow-hidden">
                                      <p className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-cyan-700 dark:text-cyan-300 bg-cyan-500/5 border-b border-cyan-500/10">
                                        Lane Intelligence
                                      </p>
                                      <div className="p-3 space-y-3">
                                        {qaLaneSuggestLoading ? (
                                          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                                            <ArrowPathIcon className="w-3 h-3 animate-spin" />{" "}
                                            Analysing class performance…
                                          </p>
                                        ) : qaLaneSuggestion ? (
                                          <>
                                            {/* Score badges */}
                                            <div className="flex items-center gap-2 flex-wrap">
                                              {qaLaneSuggestion.avg_score !==
                                              null ? (
                                                <span
                                                  className={`px-2 py-0.5 text-[10px] font-black rounded border ${
                                                    qaLaneSuggestion.avg_score >=
                                                    75
                                                      ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10"
                                                      : qaLaneSuggestion.avg_score >=
                                                        60
                                                      ? "border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/10"
                                                      : "border-rose-500/40 text-rose-700 dark:text-rose-300 bg-rose-500/10"
                                                  }`}
                                                >
                                                  {qaLaneSuggestion.avg_score}%
                                                  avg ·{" "}
                                                  {
                                                    qaLaneSuggestion.submission_count
                                                  }{" "}
                                                  assessments
                                                </span>
                                              ) : (
                                                <span className="px-2 py-0.5 text-[10px] font-black rounded border border-border text-muted-foreground">
                                                  No data yet
                                                </span>
                                              )}
                                              {qaLaneSuggestion.direction !==
                                                "stay" && (
                                                <span
                                                  className={`px-2 py-0.5 text-[10px] font-black rounded border ${
                                                    qaLaneSuggestion.direction ===
                                                    "up"
                                                      ? "border-emerald-500/40 text-emerald-800 dark:text-emerald-200 bg-emerald-500/5"
                                                      : "border-amber-500/40 text-amber-800 dark:text-amber-200 bg-amber-500/5"
                                                  }`}
                                                >
                                                  {qaLaneSuggestion.direction ===
                                                  "up"
                                                    ? "↑"
                                                    : "↓"}{" "}
                                                  Lane{" "}
                                                  {
                                                    qaLaneSuggestion.suggested_lane
                                                  }{" "}
                                                  suggested
                                                </span>
                                              )}
                                            </div>

                                            {/* AI narrative */}
                                            <p className="text-[10px] text-foreground/80 leading-relaxed">
                                              {qaLaneSuggestion.narrative}
                                            </p>

                                            {/* Score distribution */}
                                            {qaLaneSuggestion.avg_score !==
                                              null &&
                                              qaLaneSuggestion.submission_count >=
                                                3 && (
                                                <div className="grid grid-cols-3 gap-1.5">
                                                  {[
                                                    {
                                                      label: "Excelling",
                                                      count:
                                                        qaLaneSuggestion
                                                          .score_distribution
                                                          .excelling,
                                                      cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                                                    },
                                                    {
                                                      label: "Developing",
                                                      count:
                                                        qaLaneSuggestion
                                                          .score_distribution
                                                          .developing,
                                                      cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                                                    },
                                                    {
                                                      label: "Struggling",
                                                      count:
                                                        qaLaneSuggestion
                                                          .score_distribution
                                                          .struggling,
                                                      cls: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
                                                    },
                                                  ].map((d) => (
                                                    <div
                                                      key={d.label}
                                                      className={`${d.cls} rounded p-1.5 text-center`}
                                                    >
                                                      <p className="text-[13px] font-black">
                                                        {d.count}
                                                      </p>
                                                      <p className="text-[8px] uppercase tracking-widest opacity-70">
                                                        {d.label}
                                                      </p>
                                                    </div>
                                                  ))}
                                                </div>
                                              )}

                                            {/* Weak topics */}
                                            {qaLaneSuggestion.weak_topics
                                              .length > 0 && (
                                              <div>
                                                <p className="text-[9px] font-black uppercase text-rose-600 dark:text-rose-400 mb-1.5">
                                                  Topics needing reinforcement
                                                </p>
                                                <ul className="space-y-1">
                                                  {qaLaneSuggestion.weak_topics.map(
                                                    (t) => (
                                                      <li
                                                        key={t.title}
                                                        className="flex items-center gap-2 text-[10px]"
                                                      >
                                                        <span
                                                          className={`w-8 text-right font-black shrink-0 ${
                                                            t.avg_score < 50
                                                              ? "text-rose-600 dark:text-rose-400"
                                                              : "text-amber-600 dark:text-amber-400"
                                                          }`}
                                                        >
                                                          {t.avg_score}%
                                                        </span>
                                                        <span className="text-muted-foreground truncate">
                                                          {t.title}
                                                        </span>
                                                        <span className="text-muted-foreground/40 shrink-0 text-[9px]">
                                                          {t.count} subs
                                                        </span>
                                                      </li>
                                                    )
                                                  )}
                                                </ul>
                                              </div>
                                            )}

                                            {/* Per-source breakdown */}
                                            {(qaLaneSuggestion.assignment_avg !==
                                              null ||
                                              qaLaneSuggestion.cbt_avg !==
                                                null) && (
                                              <div className="flex gap-3 text-[9px] text-muted-foreground/60">
                                                {qaLaneSuggestion.assignment_avg !==
                                                  null && (
                                                  <span>
                                                    Assignments:{" "}
                                                    {
                                                      qaLaneSuggestion.assignment_avg
                                                    }
                                                    %
                                                  </span>
                                                )}
                                                {qaLaneSuggestion.cbt_avg !==
                                                  null && (
                                                  <span>
                                                    CBT:{" "}
                                                    {qaLaneSuggestion.cbt_avg}%
                                                  </span>
                                                )}
                                              </div>
                                            )}

                                            {/* Accept / dismiss */}
                                            {qaLaneSuggestion.direction !==
                                              "stay" && (
                                              <div className="flex gap-2 flex-wrap">
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setQaLaneOverride(
                                                      qaLaneSuggestion.suggested_lane
                                                    );
                                                    setQaPreviewData(null);
                                                    setQaPreviewStamp("");
                                                    setQaPreviewEdits({});
                                                    setQaLaneSuggestion(null);
                                                  }}
                                                  className="px-3 py-1.5 text-[10px] font-black rounded border border-cyan-500/40 text-cyan-800 dark:text-cyan-200 hover:bg-cyan-500/10 transition-colors"
                                                >
                                                  Accept → Lane{" "}
                                                  {
                                                    qaLaneSuggestion.suggested_lane
                                                  }
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    setQaLaneSuggestion(null)
                                                  }
                                                  className="px-3 py-1.5 text-[10px] font-black rounded border border-border text-muted-foreground hover:bg-muted/20 transition-colors"
                                                >
                                                  Keep current
                                                </button>
                                              </div>
                                            )}
                                            <p className="text-[9px] text-muted-foreground/40">
                                              Lane{" "}
                                              {qaLaneSuggestion.current_lane} —{" "}
                                              {qaLaneSuggestion.current_label}
                                            </p>
                                          </>
                                        ) : null}
                                      </div>
                                    </div>
                                  )}

                                  {/* ── Missed Topics Recovery ── */}
                                  {(() => {
                                    const skipped = tracking.filter(
                                      (t) => t.status === "skipped"
                                    );
                                    if (skipped.length === 0) return null;
                                    return (
                                      <div className="p-3 border border-amber-500/30 rounded-lg space-y-2 bg-amber-500/5">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
                                          {skipped.length} Missed Topic
                                          {skipped.length === 1 ? "" : "s"} —
                                          Recovery Plan
                                        </p>
                                        <p className="text-[10px] text-muted-foreground">
                                          Select topics to inject as recovery
                                          weeks into a future term. You can edit
                                          topic names first.
                                        </p>
                                        <ul className="space-y-2">
                                          {skipped.map((t) => {
                                            const key = `${t.term_number}-${t.week_number}`;
                                            const termObj =
                                              curriculum?.content?.terms?.find(
                                                (tm) =>
                                                  tm.term === t.term_number
                                              );
                                            const weekObj =
                                              termObj?.weeks?.find(
                                                (w) => w.week === t.week_number
                                              );
                                            const displayTopic =
                                              qaRecoveryEditTopics[key] ??
                                              weekObj?.topic ??
                                              `Term ${t.term_number} Week ${t.week_number}`;
                                            return (
                                              <li
                                                key={key}
                                                className="flex items-start gap-2"
                                              >
                                                <input
                                                  type="checkbox"
                                                  checked={qaRecoveryChecked.has(
                                                    key
                                                  )}
                                                  onChange={(e) =>
                                                    setQaRecoveryChecked(
                                                      (prev) => {
                                                        const n = new Set(prev);
                                                        if (e.target.checked) {
                                                          n.add(key);
                                                        } else {
                                                          n.delete(key);
                                                        }
                                                        return n;
                                                      }
                                                    )
                                                  }
                                                  className="mt-0.5 shrink-0"
                                                />
                                                <div className="flex-1 min-w-0">
                                                  <p className="text-[9px] text-muted-foreground mb-0.5">
                                                    Term {t.term_number} · Week{" "}
                                                    {t.week_number}
                                                  </p>
                                                  <input
                                                    type="text"
                                                    value={displayTopic}
                                                    onChange={(e) =>
                                                      setQaRecoveryEditTopics(
                                                        (prev) => ({
                                                          ...prev,
                                                          [key]: e.target.value,
                                                        })
                                                      )
                                                    }
                                                    className="w-full bg-transparent text-[11px] text-foreground border-b border-border/60 focus:border-amber-400 outline-none pb-0.5"
                                                  />
                                                </div>
                                              </li>
                                            );
                                          })}
                                        </ul>
                                        {qaRecoveryChecked.size > 0 && (
                                          <div className="flex items-center gap-2 pt-1 flex-wrap">
                                            <span className="text-[10px] text-muted-foreground">
                                              Inject into
                                            </span>
                                            <select
                                              value={qaRecoveryTargetTerm}
                                              onChange={(e) =>
                                                setQaRecoveryTargetTerm(
                                                  Number(e.target.value)
                                                )
                                              }
                                              className={SELECT_CLS}
                                            >
                                              <option value={1}>
                                                First Term
                                              </option>
                                              <option value={2}>
                                                Second Term
                                              </option>
                                              <option value={3}>
                                                Third Term
                                              </option>
                                            </select>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                void injectRecoveryWeeks()
                                              }
                                              disabled={qaRecoveryInjecting}
                                              className="inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-black rounded border border-amber-500/40 text-amber-800 dark:text-amber-200 hover:bg-amber-500/10 disabled:opacity-50 transition-colors"
                                            >
                                              {qaRecoveryInjecting && (
                                                <ArrowPathIcon className="w-3 h-3 animate-spin" />
                                              )}
                                              Inject {qaRecoveryChecked.size}{" "}
                                              week
                                              {qaRecoveryChecked.size === 1
                                                ? ""
                                                : "s"}{" "}
                                              →
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    {/* ── Teach this course ──
                       A term plan belongs to one class, term and course, and is
                       started from inside the class so it inherits the official
                       edition assigned to that class's pathway. There is no
                       second way to create one from here. */}
                    {canTrack && (
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 px-4 py-4 bg-primary/10 border border-primary/20">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-foreground">
                            Teach this course
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Open the class and start its teaching plan there.
                            The class pathway applies the correct official
                            curriculum and delivery period automatically.
                          </p>
                        </div>
                        <Link
                          href="/dashboard/classes"
                          className="inline-flex shrink-0 items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-[11px] font-black uppercase tracking-widest transition-all"
                        >
                          <RocketLaunchIcon className="w-4 h-4 shrink-0" />
                          Open Classes
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            }
          </main>
        </div>
        )}

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
                    <span
                      className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 border ${
                        WEEK_META[activeWeek.type]?.color
                      }`}
                    >
                      Week {activeWeek.week} ·{" "}
                      {WEEK_META[activeWeek.type]?.label}
                    </span>
                    {getTracking(activeTerm, activeWeek.week) && (
                      <span
                        className={`text-[9px] font-bold ${
                          TRACK_META[
                            getTracking(activeTerm, activeWeek.week)!.status
                          ].color
                        }`}
                      >
                        {
                          TRACK_META[
                            getTracking(activeTerm, activeWeek.week)!.status
                          ].label
                        }
                      </span>
                    )}
                  </div>
                  <h2 className="text-base font-black leading-tight">
                    {activeWeek.topic}
                  </h2>
                  {(activeWeek.subtopics ?? []).length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {(activeWeek.subtopics ?? []).join(" · ")}
                    </p>
                  )}
                  {(() => {
                    const dr = weekDateRange(
                      activeTerm,
                      activeWeek.week,
                      effectiveAcademicYearForTerm(
                        activeTerm,
                        effectiveProgramStartTerm,
                        academicYear
                      ),
                      currentTermData?.start_date
                    );
                    return dr ? (
                      <p className="text-[10px] text-muted-foreground/60 font-bold mt-1">
                        {dr.start} – {dr.end}
                      </p>
                    ) : null;
                  })()}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {canGenerate &&
                    (activeWeek.lesson_plan || activeWeek.assessment_plan) && (
                      <button
                        onClick={() => {
                          if (editingWeekContent) {
                            setEditingWeekContent(false);
                          } else {
                            setWeekPlanDraft(
                              activeWeek.lesson_plan
                                ? JSON.parse(
                                    JSON.stringify(activeWeek.lesson_plan)
                                  )
                                : null
                            );
                            setWeekAssessmentDraft(
                              activeWeek.assessment_plan
                                ? JSON.parse(
                                    JSON.stringify(activeWeek.assessment_plan)
                                  )
                                : null
                            );
                            setEditingWeekContent(true);
                          }
                        }}
                        className={`min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors ${
                          editingWeekContent
                            ? "text-primary"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                        title={
                          editingWeekContent
                            ? "Cancel editing"
                            : "Edit week content"
                        }
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                    )}
                  <button
                    onClick={() => setActiveWeek(null)}
                    className="text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Panel body — overflow-x-hidden prevents horizontal panning */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5 space-y-6">
                {/* LESSON WEEK */}
                {activeWeek.type === "lesson" &&
                  activeWeek.lesson_plan &&
                  (editingWeekContent && weekPlanDraft ? (
                    <EditableLessonPlan
                      plan={weekPlanDraft}
                      onChange={setWeekPlanDraft}
                      onSave={saveWeekContent}
                      onCancel={() => setEditingWeekContent(false)}
                      saving={savingWeekContent}
                    />
                  ) : (
                    <LessonPlanView plan={activeWeek.lesson_plan} />
                  ))}

                {/* ASSESSMENT / EXAMINATION WEEK */}
                {(activeWeek.type === "assessment" ||
                  activeWeek.type === "examination") &&
                  activeWeek.assessment_plan &&
                  (editingWeekContent && weekAssessmentDraft ? (
                    <EditableAssessmentPlan
                      plan={weekAssessmentDraft}
                      onChange={setWeekAssessmentDraft}
                      onSave={saveWeekContent}
                      onCancel={() => setEditingWeekContent(false)}
                      saving={savingWeekContent}
                    />
                  ) : (
                    <AssessmentPlanView
                      plan={activeWeek.assessment_plan}
                      type={activeWeek.type}
                    />
                  ))}

                {/* No plan generated */}
                {activeWeek.type === "lesson" && !activeWeek.lesson_plan && (
                  <div className="text-center py-10 text-muted-foreground text-sm">
                    <p>No lesson plan data found for this week.</p>
                    <p className="text-xs mt-1">
                      Try regenerating the curriculum to get full lesson plans.
                    </p>
                  </div>
                )}
              </div>
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
                    {generationTargetCurriculum
                      ? "Regenerate"
                      : "Generate"}{" "}
                    Curriculum
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selectedCourse?.title}
                  </p>
                </div>
                <button
                  onClick={() => setShowGenerate(false)}
                  disabled={generating}
                  className="p-1.5 hover:bg-muted rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <XMarkIcon className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
              {/* Scrollable body */}
              <div className="p-5 space-y-4 overflow-y-auto flex-1">
                {generationTargetCurriculum && (
                  <div className="bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-600 dark:text-amber-400 flex gap-2">
                    <ExclamationTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      This will create a new version (v
                      {(generationTargetCurriculum.version ?? 0) + 1}). Existing
                      tracking progress will be preserved.
                    </span>
                  </div>
                )}

                {isAdmin && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Where should this curriculum apply?
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => syncScopeToCurriculum("platform")}
                        className={`rounded-xl border p-3 text-left transition-colors ${
                          generateScope === "platform"
                            ? "border-primary/50 bg-primary/10"
                            : "border-border bg-background hover:bg-muted/40"
                        }`}
                      >
                        <span className="block text-xs font-black text-foreground">
                          Master curriculum
                        </span>
                        <span className="mt-1 block text-[10px] leading-4 text-muted-foreground">
                          Normal route. Publish once and eligible schools
                          inherit it automatically.
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (showSchoolScopeException)
                            syncScopeToCurriculum("platform");
                          else setShowSchoolScopeException(true);
                        }}
                        className={`rounded-xl border p-3 text-left transition-colors ${
                          showSchoolScopeException
                            ? "border-amber-500/40 bg-amber-500/5"
                            : "border-border bg-background hover:bg-muted/40"
                        }`}
                      >
                        <span className="block text-xs font-black text-foreground">
                          School exception
                        </span>
                        <span className="mt-1 block text-[10px] leading-4 text-muted-foreground">
                          Use only when one school genuinely needs different
                          content.
                        </span>
                      </button>
                    </div>
                    <select
                      value={generateScope}
                      onChange={(e) => {
                        if (e.target.value)
                          syncScopeToCurriculum(
                            e.target.value === "platform"
                              ? "platform"
                              : e.target.value
                          );
                      }}
                      className={`${SELECT_CLS} ${
                        showSchoolScopeException ? "" : "hidden"
                      }`}
                    >
                      <option value="" disabled>
                        — Select an option —
                      </option>
                      {isAdmin && (
                        <option value="platform">
                          Master curriculum (central direction)
                        </option>
                      )}
                      {assignedSchools.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} (private to this school)
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-muted-foreground">
                      {generateScope === "platform"
                        ? isAdmin
                          ? // "Visible to all schools" was untrue: a master
                            // curriculum reaches a school only once it has been
                            // certified and assigned in the Academic Office.
                            "Central direction. Schools inherit it only after it is certified and assigned — writing it here does not release it."
                          : "Viewing the master curriculum. Choose a school to generate a private copy for that school."
                        : `Saved privately for ${scopeLabel}. It stays with this school and is never released to others.`}
                    </p>
                  </div>
                )}

                {/* ── Delivery format ── */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-2">
                    Delivery pathway
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(
                      [
                        {
                          key: "school",
                          label: "School",
                          sub: "Nigerian term calendar",
                        },
                        {
                          key: "bootcamp",
                          label: "Bootcamp",
                          sub: "Intensive short course",
                        },
                        {
                          key: "online",
                          label: "Online",
                          sub: "Virtual / cohort-based",
                        },
                        {
                          key: "selfpaced",
                          label: "Self-paced",
                          sub: "Learner-driven modules",
                        },
                      ] as const
                    ).map(({ key, label, sub }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setCurriculumFormat(key)}
                        className={`px-3 py-2.5 border text-left transition-all ${
                          curriculumFormat === key
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                        }`}
                      >
                        <div className="text-xs font-black">{label}</div>
                        <div className="text-[9px] mt-0.5 opacity-75 leading-snug">
                          {sub}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Common: grade + topic ── */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">
                      {curriculumFormat === "bootcamp" ||
                      curriculumFormat === "online" ||
                      curriculumFormat === "selfpaced"
                        ? "Audience / Level"
                        : "Grade Level"}
                    </label>
                    <select
                      value={form.grade_level}
                      onChange={(e) => setGradeForCurrentScope(e.target.value)}
                      className={SELECT_CLS}
                    >
                      <option value="General">General audience</option>
                      <option value="Beginner">Beginner</option>
                      <option value="Intermediate">Intermediate</option>
                      <option value="Advanced">Advanced</option>
                      {GRADE_LEVEL_OPTIONS.map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">
                      Topic Focus{" "}
                      <span className="font-normal normal-case">
                        (optional)
                      </span>
                    </label>
                    <input
                      value={form.subject_area}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, subject_area: e.target.value }))
                      }
                      placeholder="e.g. Python, Robotics, Web dev, AI basics"
                      className={INPUT_CLS}
                    />
                  </div>
                </div>

                {/* ── Format-specific options ── */}
                {curriculumFormat === "school" && (
                  <div className="space-y-3 p-3 bg-muted/30 border border-border">
                    {/* Programme Year */}
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">
                        Programme Year
                      </label>
                      <select
                        value={programmeYear}
                        onChange={(e) =>
                          setProgrammeYear(Number(e.target.value) as 1 | 2 | 3)
                        }
                        className={SELECT_CLS}
                      >
                        <option value={1}>
                          Year 1 — Foundations (first year of this course)
                        </option>
                        <option value={2}>
                          Year 2 — Deeper Practice (second year, builds on Year
                          1)
                        </option>
                        <option value={3}>
                          Year 3 — Mastery (final year, advanced capstone)
                        </option>
                      </select>
                      {programmeYear > 1 && (
                        <p className="text-[9px] text-amber-600 dark:text-amber-400 font-bold mt-1">
                          Year {programmeYear} content will build directly on
                          all prior year topics. Prior year terms are preserved
                          in the curriculum.
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">
                          Weeks / Term
                        </label>
                        <select
                          value={form.weeks_per_term}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              weeks_per_term: e.target.value,
                            }))
                          }
                          className={SELECT_CLS}
                        >
                          {["8", "10", "12"].map((w) => (
                            <option key={w}>{w}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col justify-end">
                        <p className="text-[10px] text-muted-foreground">
                          Assessment: week 3, 6, {form.weeks_per_term}
                        </p>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">
                        Programme starts in
                      </label>
                      <select
                        value={programStartTerm}
                        onChange={(e) => {
                          const pst = Number(e.target.value);
                          setProgramStartTerm(pst);
                          // For first generation, auto-select the national term that equals Prog.T1 Foundations
                          if (!curriculum?.content?.terms?.length)
                            setSelectedTerms([pst]);
                        }}
                        className={SELECT_CLS}
                      >
                        <option value={1}>Term 1 — Sept (default)</option>
                        <option value={2}>
                          Term 2 — Jan (school started coding in January)
                        </option>
                        <option value={3}>
                          Term 3 — May (school started coding in May/3rd term)
                        </option>
                      </select>
                      {programStartTerm !== 1 && (
                        <p className="text-[9px] text-amber-600 dark:text-amber-400 font-bold mt-1">
                          Foundations content will be placed in Term{" "}
                          {programStartTerm} of the national calendar.
                        </p>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          Which terms to generate
                        </label>
                        <span className="text-[9px] font-black uppercase tracking-widest text-primary/70">
                          Now: {TERM_LABEL[getCurrentTerm()]}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {([1, 2, 3] as const).map((t) => {
                          const isCurrentCalendarTerm = t === getCurrentTerm();
                          const isSelected = selectedTerms.includes(t);
                          const progTerm = getProgrammeTerm(
                            t,
                            programStartTerm
                          );
                          const PROG_PHASE = [
                            "Foundations",
                            "Application",
                            "Innovation",
                          ] as const;
                          const isProgT1 = progTerm === 1;
                          return (
                            <button
                              key={t}
                              type="button"
                              onClick={() => toggleTerm(t)}
                              className={`relative flex-1 px-2 py-2 border text-center transition-all ${
                                isSelected
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-background text-muted-foreground border-border hover:border-primary/40"
                              }`}
                            >
                              {isCurrentCalendarTerm && (
                                <span
                                  className={`absolute -top-1.5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest rounded-full ${
                                    isSelected
                                      ? "bg-white text-primary"
                                      : "bg-primary text-primary-foreground"
                                  }`}
                                >
                                  Now
                                </span>
                              )}
                              <div className="text-[10px] font-black mt-1">
                                {TERM_LABEL[t]}
                              </div>
                              <div className="text-[9px] opacity-70">
                                {t === 1
                                  ? "Sept–Dec"
                                  : t === 2
                                  ? "Jan–Apr"
                                  : "May–Aug"}
                              </div>
                              <div
                                className={`text-[8px] font-black mt-0.5 ${
                                  isProgT1
                                    ? isSelected
                                      ? "text-yellow-700 dark:text-yellow-300"
                                      : "text-primary"
                                    : "opacity-50"
                                }`}
                              >
                                P.T{progTerm} {PROG_PHASE[progTerm - 1]}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {selectedTerms.length === 3
                          ? "Full academic year."
                          : selectedTerms
                              .map((t) => TERM_LABEL[t])
                              .join(" + ") + "."}{" "}
                        {selectedTerms.length} term
                        {selectedTerms.length > 1 ? "s" : ""} ×{" "}
                        {form.weeks_per_term} weeks ={" "}
                        <strong className="text-foreground">
                          {selectedTerms.length * Number(form.weeks_per_term)}{" "}
                          total weeks
                        </strong>
                        .
                      </p>
                      {/* Term start dates */}
                      <div className="space-y-2 pt-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          Term start dates{" "}
                          <span className="font-normal normal-case opacity-60">
                            (optional — defaults to Nigerian calendar)
                          </span>
                        </label>
                        {[...selectedTerms]
                          .sort((a, b) => a - b)
                          .map((t) => {
                            const fallback =
                              resolveTermDates(t, academicYear, termCalendar)
                                ?.start ?? "";
                            return (
                              <div key={t} className="flex items-center gap-3">
                                <span className="text-[10px] font-black text-muted-foreground w-24 shrink-0">
                                  {TERM_LABEL[t]}
                                </span>
                                <input
                                  type="date"
                                  value={termStartDates[t] ?? ""}
                                  placeholder={fallback}
                                  onChange={(e) =>
                                    setTermStartDates((prev) => ({
                                      ...prev,
                                      [t]: e.target.value,
                                    }))
                                  }
                                  className={INPUT_CLS + " flex-1 text-xs"}
                                />
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                )}

                {curriculumFormat === "bootcamp" && (
                  <div className="space-y-3 p-3 bg-muted/30 border border-border">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">
                          Duration
                        </label>
                        <select
                          value={bootcampDurationWeeks}
                          onChange={(e) =>
                            setBootcampDurationWeeks(e.target.value)
                          }
                          className={SELECT_CLS}
                        >
                          {["1", "2", "3", "4", "6", "8", "10", "12"].map(
                            (w) => (
                              <option key={w} value={w}>
                                {w} week{Number(w) > 1 ? "s" : ""}
                              </option>
                            )
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">
                          Schedule
                        </label>
                        <select
                          value={bootcampSchedule}
                          onChange={(e) =>
                            setBootcampSchedule(e.target.value as any)
                          }
                          className={SELECT_CLS}
                        >
                          <option value="fulltime">
                            Full-time (5 days/week)
                          </option>
                          <option value="parttime">
                            Part-time (3 days/week)
                          </option>
                          <option value="weekend">
                            Weekend only (Sat + Sun)
                          </option>
                          <option value="evening">
                            Evening (3 evenings/week)
                          </option>
                        </select>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {bootcampDurationWeeks} week
                      {Number(bootcampDurationWeeks) > 1 ? "s" : ""} ·{" "}
                      {bootcampSchedule === "fulltime"
                        ? "5 sessions/wk"
                        : bootcampSchedule === "parttime"
                        ? "3 sessions/wk"
                        : bootcampSchedule === "weekend"
                        ? "2 sessions/wk (Sat+Sun)"
                        : "3 evenings/wk"}{" "}
                      ·{" "}
                      <strong className="text-foreground">
                        {Number(bootcampDurationWeeks) *
                          (bootcampSchedule === "fulltime"
                            ? 5
                            : bootcampSchedule === "parttime" ||
                              bootcampSchedule === "evening"
                            ? 3
                            : 2)}{" "}
                        total sessions
                      </strong>
                      . Project-driven, hands-on every session.
                    </p>
                  </div>
                )}

                {curriculumFormat === "online" && (
                  <div className="space-y-3 p-3 bg-muted/30 border border-border">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">
                          Duration
                        </label>
                        <select
                          value={onlineDurationWeeks}
                          onChange={(e) =>
                            setOnlineDurationWeeks(e.target.value)
                          }
                          className={SELECT_CLS}
                        >
                          {["4", "6", "8", "10", "12", "16", "20", "24"].map(
                            (w) => (
                              <option key={w} value={w}>
                                {w} weeks
                              </option>
                            )
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">
                          Sessions / week
                        </label>
                        <select
                          value={onlineSessionsPerWeek}
                          onChange={(e) =>
                            setOnlineSessionsPerWeek(e.target.value)
                          }
                          className={SELECT_CLS}
                        >
                          {["1", "2", "3", "4", "5"].map((n) => (
                            <option key={n} value={n}>
                              {n} session{Number(n) > 1 ? "s" : ""}/week
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {onlineDurationWeeks} weeks × {onlineSessionsPerWeek}{" "}
                      sessions ={" "}
                      <strong className="text-foreground">
                        {Number(onlineDurationWeeks) *
                          Number(onlineSessionsPerWeek)}{" "}
                        total sessions
                      </strong>
                      . Async-friendly, self-contained lessons with resources.
                    </p>
                  </div>
                )}

                {curriculumFormat === "selfpaced" && (
                  <div className="space-y-3 p-3 bg-muted/30 border border-border">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">
                          Number of modules
                        </label>
                        <select
                          value={selfpacedModules}
                          onChange={(e) => setSelfpacedModules(e.target.value)}
                          className={SELECT_CLS}
                        >
                          {["3", "4", "5", "6", "8", "10", "12"].map((n) => (
                            <option key={n} value={n}>
                              {n} modules
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">
                          Hours / module
                        </label>
                        <select
                          value={selfpacedHoursPerModule}
                          onChange={(e) =>
                            setSelfpacedHoursPerModule(e.target.value)
                          }
                          className={SELECT_CLS}
                        >
                          {["1", "2", "3", "4", "6", "8"].map((h) => (
                            <option key={h} value={h}>
                              {h} hour{Number(h) > 1 ? "s" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {selfpacedModules} modules × {selfpacedHoursPerModule} hr
                      ={" "}
                      <strong className="text-foreground">
                        {Number(selfpacedModules) *
                          Number(selfpacedHoursPerModule)}{" "}
                        total hours
                      </strong>
                      . Learner sets their own pace. Each module is
                      self-contained.
                    </p>
                  </div>
                )}

                {/* ── Notes ── */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">
                    Extra context for AI{" "}
                    <span className="font-normal normal-case">(optional)</span>
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, notes: e.target.value }))
                    }
                    placeholder={
                      curriculumFormat === "bootcamp"
                        ? "e.g. Participants have laptops, focus on hands-on projects, final day = demo day"
                        : curriculumFormat === "online"
                        ? "e.g. Async-first, participants in different time zones, use Zoom for live sessions"
                        : curriculumFormat === "selfpaced"
                        ? "e.g. Learners are working professionals, mobile-friendly content, include quizzes"
                        : "e.g. Students have laptops, follow WAEC syllabus, avoid week 5 (public holiday)"
                    }
                    rows={2}
                    className={INPUT_CLS + " resize-none"}
                  />
                </div>

                {/* Ground generation in a teacher's document */}
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                    Base it on a document{" "}
                    <span className="normal-case font-normal text-muted-foreground">
                      (optional — upload a PDF and the AI builds the course from
                      it)
                    </span>
                  </label>
                  {sourceName ? (
                    <div className="flex items-center gap-2 px-3 py-2 bg-violet-500/10 border border-violet-500/25 rounded-xl">
                      <span className="text-sm">📄</span>
                      <span className="text-xs text-violet-700 dark:text-violet-300 font-bold truncate flex-1">
                        {sourceName} — grounding the AI
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSourceText("");
                          setSourceName("");
                        }}
                        className="text-[10px] font-black uppercase text-muted-foreground hover:text-foreground"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <label
                      className={`flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed rounded-xl cursor-pointer transition-all text-center ${
                        extractingPdf
                          ? "border-violet-500/30 bg-violet-500/5"
                          : "border-border hover:border-violet-500/40 hover:bg-violet-500/5"
                      }`}
                    >
                      <span className="text-sm">📄</span>
                      <span className="text-xs font-bold text-muted-foreground">
                        {extractingPdf
                          ? extractMsg || "Reading PDF…"
                          : "Upload a PDF to build from"}
                      </span>
                      <input
                        type="file"
                        className="hidden"
                        accept="application/pdf"
                        disabled={extractingPdf}
                        onChange={(e) => {
                          handleSourcePdf(e.target.files?.[0] ?? null);
                          e.currentTarget.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>

                {genError && (
                  <p className="text-rose-600 dark:text-rose-400 text-xs">{genError}</p>
                )}
                {generating && (
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs">
                    <SparklesIcon className="w-3.5 h-3.5 animate-spin" />
                    <span>
                      {genProgress ||
                        "Generating complete curriculum with all lesson plans… this takes 60–90 seconds"}
                    </span>
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
                  {generating
                    ? "Generating…"
                    : generationTargetCurriculum
                    ? "Regenerate"
                    : "Generate Curriculum"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Notification Settings Modal ── */}
        {showNotifSettings && curriculum && canModifyCurriculum && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
            <div className="bg-card border border-border w-full sm:max-w-md sm:rounded-xl rounded-t-2xl">
              <div className="flex items-center justify-between p-5 border-b border-border">
                <h2 className="font-black text-sm flex items-center gap-2">
                  <BellIcon className="w-4 h-4 text-primary" /> Parent
                  Notifications
                </h2>
                <button
                  onClick={() => setShowNotifSettings(false)}
                  className="p-2 hover:bg-muted/50 rounded-lg"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-5">
                {/* Channel selection */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-2">
                    Channels
                  </label>
                  <div className="flex gap-2">
                    {(["whatsapp", "email"] as const).map((ch) => (
                      <button
                        key={ch}
                        onClick={() =>
                          setNotifSettingsDraft((prev) => ({
                            ...prev,
                            channels: prev.channels.includes(ch)
                              ? prev.channels.filter((c) => c !== ch)
                              : [...prev.channels, ch],
                          }))
                        }
                        className={`flex-1 py-2 border text-xs font-black uppercase tracking-widest transition-all rounded-lg ${
                          notifSettingsDraft.channels.includes(ch)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground border-border hover:border-primary/40"
                        }`}
                      >
                        {ch === "whatsapp" ? "📱 WhatsApp" : "📧 Email"}
                      </button>
                    ))}
                  </div>
                </div>
                {/* When to notify */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-2">
                    When to notify
                  </label>
                  <div className="space-y-1.5">
                    {(
                      [
                        { value: "all", label: "Every completed week" },
                        { value: "every_n", label: "Every N weeks" },
                        { value: "specific", label: "Specific weeks only" },
                        { value: "none", label: "Never (off)" },
                      ] as const
                    ).map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() =>
                          setNotifSettingsDraft((prev) => ({
                            ...prev,
                            mode: value,
                          }))
                        }
                        className={`w-full flex items-center gap-3 px-3 py-2.5 border rounded-lg text-xs font-bold text-left transition-all ${
                          notifSettingsDraft.mode === value
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border text-muted-foreground hover:border-foreground/30"
                        }`}
                      >
                        <div
                          className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                            notifSettingsDraft.mode === value
                              ? "bg-primary border-primary"
                              : "border-muted-foreground"
                          }`}
                        />
                        {label}
                      </button>
                    ))}
                  </div>
                  {notifSettingsDraft.mode === "every_n" && (
                    <div className="mt-3 flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        Notify every
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={notifSettingsDraft.every_n ?? 4}
                        onChange={(e) =>
                          setNotifSettingsDraft((prev) => ({
                            ...prev,
                            every_n: Number(e.target.value),
                          }))
                        }
                        className="w-16 px-2 py-1.5 bg-background border border-border text-foreground text-xs rounded-lg text-center"
                      />
                      <span className="text-xs text-muted-foreground">
                        weeks
                      </span>
                    </div>
                  )}
                  {notifSettingsDraft.mode === "specific" && (
                    <div className="mt-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-2">
                        Tap the week numbers to notify parents
                      </label>
                      <div className="grid grid-cols-6 gap-1.5">
                        {Array.from({ length: 13 }, (_, i) => i + 1).map(
                          (wk) => {
                            const selected = (
                              notifSettingsDraft.specific_weeks ?? []
                            ).includes(wk);
                            return (
                              <button
                                key={wk}
                                type="button"
                                onClick={() =>
                                  setNotifSettingsDraft((prev) => ({
                                    ...prev,
                                    specific_weeks: selected
                                      ? (prev.specific_weeks ?? []).filter(
                                          (w) => w !== wk
                                        )
                                      : [
                                          ...(prev.specific_weeks ?? []),
                                          wk,
                                        ].sort((a, b) => a - b),
                                  }))
                                }
                                className={`py-2 rounded-lg text-xs font-black border transition-all ${
                                  selected
                                    ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/30"
                                    : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                                }`}
                              >
                                {wk}
                              </button>
                            );
                          }
                        )}
                      </div>
                      {(notifSettingsDraft.specific_weeks ?? []).length > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-2">
                          Notifying after week
                          {(notifSettingsDraft.specific_weeks ?? []).length > 1
                            ? "s"
                            : ""}
                          :{" "}
                          <span className="text-primary font-black">
                            {(notifSettingsDraft.specific_weeks ?? []).join(
                              ", "
                            )}
                          </span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="p-5 border-t border-border flex gap-2">
                <button
                  onClick={() => setShowNotifSettings(false)}
                  className="flex-1 py-2.5 border border-border text-xs font-bold rounded-lg hover:bg-muted/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => saveNotifSettings(notifSettingsDraft)}
                  disabled={
                    savingNotifSettings ||
                    notifSettingsDraft.channels.length === 0
                  }
                  className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black rounded-lg transition-all disabled:opacity-50"
                >
                  {savingNotifSettings ? "Saving…" : "Save Settings"}
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
                    <DocumentDuplicateIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
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
                {assignedSchools.map((school) => (
                  <button
                    key={school.id}
                    onClick={() =>
                      handleClone(showCloneModal.curriculumId, school.id)
                    }
                    disabled={cloning}
                    className="w-full flex items-center gap-3 p-4 bg-background border border-border hover:border-emerald-500/40 hover:bg-emerald-500/5 rounded-xl transition-all text-left group disabled:opacity-50"
                  >
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                      <BuildingOfficeIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                        {school.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                        Click to clone here
                      </p>
                    </div>
                    {cloning ? (
                      <ArrowPathIcon className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />
                    ) : (
                      <DocumentDuplicateIcon className="w-4 h-4 text-muted-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors shrink-0" />
                    )}
                  </button>
                ))}
              </div>

              {/* Info footer */}
              <div className="px-5 pb-5">
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  The cloned copy will be private to your school. You can edit,
                  customise, and regenerate it without affecting the platform
                  template.
                </p>
              </div>
            </div>
          </div>
        )}
        {/* ── Edit Version Modal ── */}
        {showEditVersionModal && curriculum && canModifyCurriculum && (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
            <div className="bg-card border border-border w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden relative">
              <div className="absolute top-0 inset-x-0 h-1 bg-primary" />
              <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-white/[0.01]">
                <h2 className="font-black text-sm flex items-center gap-2 tracking-wide uppercase text-foreground">
                  <PencilIcon className="w-4 h-4 text-primary" /> Edit
                  Curriculum Version
                </h2>
                <button
                  onClick={() => setShowEditVersionModal(false)}
                  className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
              <div className="p-6 space-y-5">
                {/* Version Number Input */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                    Version Number
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground/60 select-none">
                      v
                    </span>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={editVersionNumber}
                      onChange={(e) => setEditVersionNumber(e.target.value)}
                      placeholder="1.0"
                      className="w-full pl-7 pr-4 py-2 bg-[#0d0d0d] border border-border focus:border-primary/50 text-foreground rounded-xl focus:outline-none focus:ring-0 transition-all font-bold placeholder:text-muted-foreground/30 text-sm"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 leading-normal">
                    E.g.,{" "}
                    <span className="font-semibold text-primary/95">1.0</span>{" "}
                    or{" "}
                    <span className="font-semibold text-primary/95">1.1</span>.
                    Bumping the version tracks a complete set of terms (Term 1,
                    2, and 3 complete), not just individual regenerations.
                  </p>
                </div>

                {/* Version Description/Label Input */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                    Version Label / Description
                  </label>
                  <input
                    type="text"
                    value={editVersionDesc}
                    onChange={(e) => setEditVersionDesc(e.target.value)}
                    placeholder="e.g., Initial curriculum approved, 2026 core"
                    maxLength={100}
                    className="w-full px-4 py-2 bg-[#0d0d0d] border border-border focus:border-primary/50 text-foreground rounded-xl focus:outline-none focus:ring-0 transition-all font-semibold placeholder:text-muted-foreground/30 text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground/60 leading-normal">
                    Provide a brief tag to identify this curriculum version for
                    other teachers and admins.
                  </p>
                </div>
              </div>
              <div className="px-6 py-5 border-t border-border bg-white/[0.01] flex gap-3">
                <button
                  onClick={() => setShowEditVersionModal(false)}
                  className="flex-1 py-2.5 border border-border text-xs font-black uppercase tracking-wider rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveVersionDetails}
                  disabled={savingVersionDetails || !editVersionNumber}
                  className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2 cursor-pointer"
                >
                  {savingVersionDetails ? (
                    <>
                      <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />{" "}
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Section({
  label,
  color,
  children,
  icon: Icon,
}: {
  label: string;
  color: string;
  children: React.ReactNode;
  icon?: any;
}) {
  return (
    <div className="bg-card/50 border border-border p-5 space-y-4 hover:border-border/80 transition-colors relative group overflow-hidden">
      <div
        className={`absolute top-0 left-0 w-1 h-full ${color.replace(
          "text-",
          "bg-"
        )}`}
      />
      <div className="flex items-center justify-between">
        <h3
          className={`text-[10px] font-black uppercase tracking-[0.2em] ${color} flex items-center gap-2`}
        >
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
        <span className="text-[10px] text-muted-foreground font-black uppercase tracking-widest truncate">
          {plan.duration_minutes} Minute Session
        </span>
      </div>

      {/* Objectives */}
      {plan.objectives?.length > 0 && (
        <Section
          label="Learning Objectives"
          color="text-primary"
          icon={BoltIcon}
        >
          <ol className="space-y-2">
            {plan.objectives.map((o, i) => (
              <li key={i} className="flex gap-3 text-sm text-foreground/80">
                <span className="text-primary font-black shrink-0 w-5 flex items-center justify-center bg-primary/10 text-[10px] h-5 border border-primary/20">
                  {i + 1}
                </span>
                <span className="leading-snug">{o}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* Teacher + Student Activities side by side */}
      {(plan.teacher_activities?.length > 0 ||
        plan.student_activities?.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plan.teacher_activities?.length > 0 && (
            <Section
              label="Teacher Protocol"
              color="text-primary"
              icon={UserGroupIcon}
            >
              <ol className="space-y-3">
                {plan.teacher_activities.map((a, i) => (
                  <li
                    key={i}
                    className="flex gap-3 text-xs text-foreground/80 leading-relaxed"
                  >
                    <span className="text-primary font-black shrink-0 w-4">
                      {i + 1}.
                    </span>
                    <span>{a}</span>
                  </li>
                ))}
              </ol>
            </Section>
          )}
          {plan.student_activities?.length > 0 && (
            <Section
              label="Student Interaction"
              color="text-primary"
              icon={AcademicCapIcon}
            >
              <ul className="space-y-2">
                {plan.student_activities.map((a, i) => (
                  <li
                    key={i}
                    className="flex gap-3 text-xs text-foreground/80 leading-relaxed"
                  >
                    <span className="text-primary shrink-0 select-none opacity-50">
                      #
                    </span>
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
        <Section
          label="In-Class Assessment"
          color="text-emerald-600 dark:text-emerald-400"
          icon={ClipboardDocumentListIcon}
        >
          <div className="space-y-3">
            <p className="font-black uppercase tracking-tight text-foreground/90 italic">
              {plan.classwork.title}
            </p>
            <p className="text-xs text-foreground/70 leading-relaxed border-l-2 border-emerald-500/20 pl-3 py-1">
              {plan.classwork.instructions}
            </p>
            {plan.classwork.materials?.length > 0 && (
              <div className="pt-2">
                <ul className="flex flex-wrap gap-2">
                  {plan.classwork.materials.map((m, i) => (
                    <li
                      key={i}
                      className="text-[9px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2 py-1 font-black uppercase tracking-widest"
                    >
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Assignment */}
      {plan.assignment?.title && (
        <Section
          label="Post-Session Mission"
          color="text-amber-600 dark:text-amber-400"
          icon={DocumentTextIcon}
        >
          <div className="space-y-2">
            <p className="font-black uppercase tracking-tight text-foreground/90 italic">
              {plan.assignment.title}
            </p>
            <p className="text-xs text-foreground/70 leading-relaxed">
              {plan.assignment.instructions}
            </p>
            <div className="inline-flex items-center gap-2 text-[10px] text-amber-600 dark:text-amber-400 font-black uppercase tracking-widest bg-amber-400/5 max-w-full px-2 py-1 border border-amber-400/10 overflow-hidden">
              <ClockIcon className="w-3 h-3 shrink-0" />
              <span className="truncate">Deadline: {plan.assignment.due}</span>
            </div>
          </div>
        </Section>
      )}

      {/* Project */}
      {plan.project && (
        <Section
          label="Neural Project: Milestone"
          color="text-rose-600 dark:text-rose-400"
          icon={RocketLaunchIcon}
        >
          <div className="space-y-4">
            <p className="font-black uppercase tracking-tight text-foreground/90 italic">
              {plan.project.title}
            </p>
            <p className="text-xs text-foreground/70 leading-relaxed border-l-2 border-rose-500/20 pl-3">
              {plan.project.description}
            </p>
            {plan.project.deliverables?.length > 0 && (
              <div className="bg-muted/30 p-3 border border-border">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-3">
                  Target Deliverables
                </p>
                <ul className="space-y-2">
                  {plan.project.deliverables.map((d, i) => (
                    <li
                      key={i}
                      className="flex gap-2 text-xs text-foreground/70"
                    >
                      <span className="text-rose-600 dark:text-rose-400 font-black">›</span>
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
        <Section
          label="Archives & Tools"
          color="text-cyan-600 dark:text-cyan-400"
          icon={DocumentTextIcon}
        >
          <ul className="flex flex-wrap gap-2">
            {plan.resources.map((r, i) => (
              <li
                key={i}
                className="text-[10px] bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 px-3 py-1 font-black uppercase tracking-widest"
              >
                {r}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Engagement tips */}
      {plan.engagement_tips?.length > 0 && (
        <Section
          label="Delivery Strategies"
          color="text-pink-600 dark:text-pink-400"
          icon={SparklesIcon}
        >
          <ul className="space-y-3">
            {plan.engagement_tips.map((t, i) => (
              <li
                key={i}
                className="flex gap-3 text-xs text-foreground/80 leading-relaxed"
              >
                <span className="text-pink-600 dark:text-pink-400 shrink-0 select-none">💡</span>
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
function AssessmentPlanView({
  plan,
  type,
}: {
  plan: AssessmentPlan;
  type: WeekType;
}) {
  const typeLabel =
    type === "examination" ? "End-of-Term Examination" : "Assessment";
  return (
    <div className="space-y-6 text-sm min-w-0">
      <div className="inline-flex items-center gap-3 px-4 py-2 bg-muted/30 border border-border max-w-full">
        <ClipboardDocumentListIcon className="w-4 h-4 text-primary shrink-0" />
        <span className="text-[10px] text-muted-foreground font-black uppercase tracking-widest truncate">
          {typeLabel} · {plan.duration_minutes} Min
        </span>
      </div>

      {plan.title && (
        <Section
          label="Assessment Title"
          color="text-primary"
          icon={DocumentTextIcon}
        >
          <p className="font-black uppercase tracking-tight text-foreground/90 italic">
            {plan.title}
          </p>
        </Section>
      )}

      {plan.format && (
        <Section
          label="Format"
          color="text-amber-600 dark:text-amber-400"
          icon={ClipboardDocumentListIcon}
        >
          <p className="text-xs text-foreground/80 leading-relaxed">
            {plan.format}
          </p>
        </Section>
      )}

      {plan.coverage?.length > 0 && (
        <Section label="Topics Covered" color="text-primary" icon={BoltIcon}>
          <ul className="space-y-2">
            {plan.coverage.map((c, i) => (
              <li
                key={i}
                className="flex gap-3 text-xs text-foreground/80 leading-relaxed"
              >
                <span className="text-primary font-black shrink-0 w-4">
                  {i + 1}.
                </span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {plan.scoring_guide && (
        <Section label="Scoring Guide" color="text-emerald-600 dark:text-emerald-400" icon={StarIcon}>
          <p className="text-xs text-foreground/70 leading-relaxed border-l-2 border-emerald-500/20 pl-3 py-1">
            {plan.scoring_guide}
          </p>
        </Section>
      )}

      {plan.teacher_prep?.length > 0 && (
        <Section
          label="Teacher Preparation"
          color="text-cyan-600 dark:text-cyan-400"
          icon={UserGroupIcon}
        >
          <ol className="space-y-2">
            {plan.teacher_prep.map((s, i) => (
              <li
                key={i}
                className="flex gap-3 text-xs text-foreground/80 leading-relaxed"
              >
                <span className="text-cyan-600 dark:text-cyan-400 font-black shrink-0 w-4">
                  {i + 1}.
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {plan.sample_questions && plan.sample_questions.length > 0 && (
        <Section
          label="Sample Questions"
          color="text-rose-600 dark:text-rose-400"
          icon={AcademicCapIcon}
        >
          <ol className="space-y-3">
            {plan.sample_questions.map((q, i) => (
              <li
                key={i}
                className="flex gap-3 text-xs text-foreground/80 leading-relaxed"
              >
                <span className="text-rose-600 dark:text-rose-400 font-black shrink-0 w-5 flex items-center justify-center bg-rose-500/10 text-[10px] h-5 border border-rose-500/20">
                  {i + 1}
                </span>
                <span>{q}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  );
}

// ── Editable Lesson Plan Component ───────────────────────────────────────────
function EditableLessonPlan({
  plan,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  plan: LessonPlan;
  onChange: (p: LessonPlan) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const inp =
    "w-full px-3 py-2 text-xs bg-muted/40 border border-border text-foreground focus:outline-none focus:border-primary/60 transition-colors";
  const ta = inp + " resize-none";
  const lbl =
    "text-[10px] font-black uppercase tracking-widest text-muted-foreground";
  const sec = "space-y-1.5";

  return (
    <div className="space-y-5 text-sm">
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-border">
        <p className="text-[10px] font-black uppercase tracking-widest text-primary">
          Editing Week Content
        </p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-bold border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-black bg-primary text-primary-foreground disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className={sec}>
        <label className={lbl}>Duration (minutes)</label>
        <input
          type="number"
          value={plan.duration_minutes}
          onChange={(e) =>
            onChange({ ...plan, duration_minutes: Number(e.target.value) })
          }
          className={inp}
        />
      </div>

      <div className={sec}>
        <label className={lbl}>Learning Objectives — one per line</label>
        <textarea
          rows={5}
          value={(plan.objectives ?? []).join("\n")}
          onChange={(e) =>
            onChange({ ...plan, objectives: e.target.value.split("\n") })
          }
          className={ta}
        />
      </div>

      <div className={sec}>
        <label className={lbl}>Teacher Protocol — one per line</label>
        <textarea
          rows={5}
          value={(plan.teacher_activities ?? []).join("\n")}
          onChange={(e) =>
            onChange({
              ...plan,
              teacher_activities: e.target.value.split("\n"),
            })
          }
          className={ta}
        />
      </div>

      <div className={sec}>
        <label className={lbl}>Student Interaction — one per line</label>
        <textarea
          rows={5}
          value={(plan.student_activities ?? []).join("\n")}
          onChange={(e) =>
            onChange({
              ...plan,
              student_activities: e.target.value.split("\n"),
            })
          }
          className={ta}
        />
      </div>

      <fieldset className="space-y-2 border border-border p-3">
        <legend className={lbl + " px-1"}>In-Class Assessment</legend>
        <div className={sec}>
          <label className={lbl}>Title</label>
          <input
            value={plan.classwork?.title ?? ""}
            onChange={(e) =>
              onChange({
                ...plan,
                classwork: {
                  ...(plan.classwork ?? {
                    title: "",
                    instructions: "",
                    materials: [],
                  }),
                  title: e.target.value,
                },
              })
            }
            placeholder="Classwork title"
            className={inp}
          />
        </div>
        <div className={sec}>
          <label className={lbl}>Instructions</label>
          <textarea
            rows={3}
            value={plan.classwork?.instructions ?? ""}
            onChange={(e) =>
              onChange({
                ...plan,
                classwork: {
                  ...(plan.classwork ?? {
                    title: "",
                    instructions: "",
                    materials: [],
                  }),
                  instructions: e.target.value,
                },
              })
            }
            className={ta}
          />
        </div>
        <div className={sec}>
          <label className={lbl}>Materials — comma-separated</label>
          <input
            value={(plan.classwork?.materials ?? []).join(", ")}
            onChange={(e) =>
              onChange({
                ...plan,
                classwork: {
                  ...(plan.classwork ?? {
                    title: "",
                    instructions: "",
                    materials: [],
                  }),
                  materials: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                },
              })
            }
            className={inp}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-2 border border-border p-3">
        <legend className={lbl + " px-1"}>Post-Session Assignment</legend>
        <div className={sec}>
          <label className={lbl}>Title</label>
          <input
            value={plan.assignment?.title ?? ""}
            onChange={(e) =>
              onChange({
                ...plan,
                assignment: {
                  ...(plan.assignment ?? {
                    title: "",
                    instructions: "",
                    due: "",
                  }),
                  title: e.target.value,
                },
              })
            }
            className={inp}
          />
        </div>
        <div className={sec}>
          <label className={lbl}>Instructions</label>
          <textarea
            rows={3}
            value={plan.assignment?.instructions ?? ""}
            onChange={(e) =>
              onChange({
                ...plan,
                assignment: {
                  ...(plan.assignment ?? {
                    title: "",
                    instructions: "",
                    due: "",
                  }),
                  instructions: e.target.value,
                },
              })
            }
            className={ta}
          />
        </div>
        <div className={sec}>
          <label className={lbl}>Due / Timeframe</label>
          <input
            value={plan.assignment?.due ?? ""}
            onChange={(e) =>
              onChange({
                ...plan,
                assignment: {
                  ...(plan.assignment ?? {
                    title: "",
                    instructions: "",
                    due: "",
                  }),
                  due: e.target.value,
                },
              })
            }
            className={inp}
          />
        </div>
      </fieldset>

      <div className={sec}>
        <label className={lbl}>Resources — one per line</label>
        <textarea
          rows={3}
          value={(plan.resources ?? []).join("\n")}
          onChange={(e) =>
            onChange({ ...plan, resources: e.target.value.split("\n") })
          }
          className={ta}
        />
      </div>

      <div className={sec}>
        <label className={lbl}>Delivery Strategies — one per line</label>
        <textarea
          rows={3}
          value={(plan.engagement_tips ?? []).join("\n")}
          onChange={(e) =>
            onChange({ ...plan, engagement_tips: e.target.value.split("\n") })
          }
          className={ta}
        />
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 text-xs font-bold border border-border text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="flex-1 py-2.5 text-xs font-black bg-primary text-primary-foreground disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save Week Content"}
        </button>
      </div>
    </div>
  );
}

// ── Editable Assessment Plan Component ───────────────────────────────────────
function EditableAssessmentPlan({
  plan,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  plan: AssessmentPlan;
  onChange: (p: AssessmentPlan) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const inp =
    "w-full px-3 py-2 text-xs bg-muted/40 border border-border text-foreground focus:outline-none focus:border-primary/60 transition-colors";
  const ta = inp + " resize-none";
  const lbl =
    "text-[10px] font-black uppercase tracking-widest text-muted-foreground";
  const sec = "space-y-1.5";

  return (
    <div className="space-y-5 text-sm">
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-border">
        <p className="text-[10px] font-black uppercase tracking-widest text-primary">
          Editing Assessment
        </p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-bold border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-black bg-primary text-primary-foreground disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      <div className={sec}>
        <label className={lbl}>Title</label>
        <input
          value={plan.title ?? ""}
          onChange={(e) => onChange({ ...plan, title: e.target.value })}
          className={inp}
        />
      </div>
      <div className={sec}>
        <label className={lbl}>Format</label>
        <input
          value={plan.format ?? ""}
          onChange={(e) => onChange({ ...plan, format: e.target.value })}
          className={inp}
        />
      </div>
      <div className={sec}>
        <label className={lbl}>Duration (minutes)</label>
        <input
          type="number"
          value={plan.duration_minutes ?? ""}
          onChange={(e) =>
            onChange({ ...plan, duration_minutes: Number(e.target.value) })
          }
          className={inp}
        />
      </div>
      <div className={sec}>
        <label className={lbl}>Coverage — one per line</label>
        <textarea
          rows={4}
          value={(plan.coverage ?? []).join("\n")}
          onChange={(e) =>
            onChange({ ...plan, coverage: e.target.value.split("\n") })
          }
          className={ta}
        />
      </div>
      <div className={sec}>
        <label className={lbl}>Scoring Guide</label>
        <textarea
          rows={3}
          value={plan.scoring_guide ?? ""}
          onChange={(e) => onChange({ ...plan, scoring_guide: e.target.value })}
          className={ta}
        />
      </div>
      <div className={sec}>
        <label className={lbl}>Teacher Prep — one per line</label>
        <textarea
          rows={4}
          value={(plan.teacher_prep ?? []).join("\n")}
          onChange={(e) =>
            onChange({ ...plan, teacher_prep: e.target.value.split("\n") })
          }
          className={ta}
        />
      </div>
      {(plan.sample_questions?.length ?? 0) > 0 && (
        <div className={sec}>
          <label className={lbl}>Sample Questions — one per line</label>
          <textarea
            rows={5}
            value={(plan.sample_questions ?? []).join("\n")}
            onChange={(e) =>
              onChange({
                ...plan,
                sample_questions: e.target.value.split("\n"),
              })
            }
            className={ta}
          />
        </div>
      )}
      <div className="flex gap-2 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 text-xs font-bold border border-border text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="flex-1 py-2.5 text-xs font-black bg-primary text-primary-foreground disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save Assessment Content"}
        </button>
      </div>
    </div>
  );
}
