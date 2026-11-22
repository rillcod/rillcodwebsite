// @refresh reset
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeftIcon, AcademicCapIcon, PlusIcon, TrashIcon,
  CheckIcon, ArrowPathIcon, ExclamationTriangleIcon, ChevronUpIcon, ChevronDownIcon,
  SparklesIcon, CheckCircleIcon,
} from '@/lib/icons';
import {
  isObjectiveQuestion,
  isTheoryQuestion,
  buildCbtPrintHtml,
  openCbtPrintWindow,
} from '@/lib/cbt/print-utils';
import { dedupeCbtQuestions, resolveMcqAnswerToOption, stripOptionPrefix } from '@/lib/cbt/question-bank-catalog';
import { hostAssessmentKindFromExam, parseHostAssessmentKind } from '@/lib/academic/taught-assessment';
import { hostPaperLabel, paperTotalFromQuestions, SUGGESTED_HOST_PAPER_MAX } from '@/lib/academic/host-marks';
import { hostPaperDatasheetHref } from '@/lib/curriculum/href';
import CbtMarkdown from '@/components/cbt/CbtMarkdown';
import QuestionAuthoringStudio, { type StudioGeneratedQuestion } from '@/components/cbt/QuestionAuthoringStudio';
import { SmartCourseSelect } from '@/components/courses/SmartCourseSelect';
import {
  buildCbtEntrySuggestion,
  type CbtExamType,
} from '@/lib/cbt/predictive-entry';
import {
  EXAMINER_PRESETS,
  auditExamReadiness,
  autoBalanceQuestionMarks,
  composeSmartExamTitle,
  type ExaminerPreset,
} from '@/lib/cbt/examiner-presets';

interface Question {
  question_text: string;
  question_type: string;
  options: string[];
  correct_answer: string;
  marking_guide?: string;
  curriculumTag?: string;
  cognitiveLevel?: string;
  points: number;
  section: 'objective' | 'subjective' | 'practical';
}

interface AssessmentClassOption {
  id: string;
  name: string;
  school_id: string;
  program_id: string | null;
  current_course_id: string | null;
  academic_offering_id: string | null;
  offering_period_id: string | null;
  status: string | null;
}

const emptyQuestion = (): Question => ({
  question_text: '',
  question_type: 'multiple_choice',
  options: ['', '', '', ''],
  correct_answer: '',
  points: 5,
  section: 'objective',
});

export default function NewExamPage() {
  const router = useRouter();
  const { profile, loading: authLoading, profileLoading } = useAuth();
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const preProgramId = searchParams?.get('program_id');
  const preCourseId = searchParams?.get('course_id');
  const preClassId = searchParams?.get('class_id');
  const preSchoolId = searchParams?.get('school_id');
  const preTopic = searchParams?.get('topic');
  const preWeek = searchParams?.get('week');
  const preCurrId = searchParams?.get('curriculum_id');
  const preLessonPlanId = searchParams?.get('lesson_plan_id');
  const preLessonId = searchParams?.get('lesson_id');
  const preExamType = searchParams?.get('exam_type') as 'examination' | 'evaluation' | null;
  const preSource = searchParams?.get('source') || '';
  const preSit = searchParams?.get('sit');
  const preHostAssessment = parseHostAssessmentKind(searchParams?.get('host_assessment'));
  const preTitle = searchParams?.get('title') || '';
  const isMinimal = searchParams?.get('minimal') === 'true';
  const initialExamType: CbtExamType = preExamType === 'evaluation' ? 'evaluation' : 'examination';
  const initialSuggestion = buildCbtEntrySuggestion(initialExamType);
  const [programs, setPrograms] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [assignedSchools, setAssignedSchools] = useState<Array<{ id: string; name: string }>>([]);
  const [availableClasses, setAvailableClasses] = useState<AssessmentClassOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomErrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error && bottomErrorRef.current) {
      bottomErrorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [error]);

  const [classId, setClassId] = useState<string | null>(preClassId || null);
  const [className, setClassName] = useState<string>('');
  const [assessmentScope, setAssessmentScope] = useState<'class_result' | 'practice'>('class_result');
  const [form, setForm] = useState({
    title: preTitle,
    description: '',
    program_id: '',
    course_id: '',
    duration_minutes: initialSuggestion.durationMinutes.toString(),
    passing_score: initialSuggestion.passingScore.toString(),
    start_date: '',
    end_date: '',
    access_window_minutes: initialSuggestion.accessWindowMinutes.toString(),
    is_active: preSit === 'print' ? false : true,
    exam_type: initialExamType,
    school_id: preSchoolId || '',
  });
  const [questions, setQuestions] = useState<Question[]>([emptyQuestion()]);
  const [sectionWeights, setSectionWeights] = useState({ objective: 60, subjective: 30, practical: 10 });
  const [useWeights, setUseWeights] = useState(false);

  // AI Generation State (synced with QuestionAuthoringStudio)
  const [aiTopic, setAiTopic] = useState(preTopic || '');
  const [sourceText] = useState(preSource);
  const [sourceName] = useState(preSource ? 'Taught weeks' : '');
  const [aiMcqCount, setAiMcqCount] = useState(initialSuggestion.mcqCount.toString());
  const [aiTheoryCount, setAiTheoryCount] = useState(initialSuggestion.theoryCount.toString());
  const [solvingCardIdx, setSolvingCardIdx] = useState<number | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const draftStorageKey = `rillcod:cbt-new-draft:${preClassId || 'any'}:${preHostAssessment || 'std'}`;

  const teacherEdits = useRef({
    title: false,
    description: false,
    duration: false,
    passingScore: false,
    accessWindow: false,
    questionMix: false,
  });
  const topicPriority = useRef(preTopic ? 100 : 0);
  // Track the paper explicitly: a deselected question is never silently restored on save.
  const [selectedQuestions, setSelectedQuestions] = useState<Set<number>>(new Set([0]));
  const [printFilter, setPrintFilter] = useState<'all' | 'mcq' | 'theory'>('all');
  const [paperOutOf, setPaperOutOf] = useState('');
  const [paperOutOfEdited, setPaperOutOfEdited] = useState(false);
  const [showAdvancedSetup, setShowAdvancedSetup] = useState(false);
  const [activePresetId, setActivePresetId] = useState<ExaminerPreset['id'] | null>(null);
  const [showContextSelectors, setShowContextSelectors] = useState(false);

  const toLocalDateTimeInput = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  const examSuggestion = buildCbtEntrySuggestion(form.exam_type);
  const examBoundary = {
    label: examSuggestion.label,
    min: examSuggestion.minimumQuestions,
    max: examSuggestion.maximumQuestions,
    duration: form.exam_type === 'evaluation' ? '20-45 min' : '45-120 min',
    note: examSuggestion.boundaryNote,
  };
  const hostKind = preHostAssessment || hostAssessmentKindFromExam({ title: form.title });
  const backHref =
    hostKind && classId
      ? hostPaperDatasheetHref({
          kind: hostKind,
          classId,
          courseId: form.course_id || preCourseId,
          programId: form.program_id || preProgramId,
          schoolId: form.school_id || preSchoolId,
          from: 'write',
        })
      : classId
        ? `/dashboard/classes/${classId}?operation=assessment`
        : '/dashboard/cbt';
  const backLabel = hostKind
    ? `Back to ${hostPaperLabel(hostKind)}`
    : classId && className
      ? `Back to ${className}`
      : 'Back to CBT';
  const questionPoints = paperTotalFromQuestions(
    questions.filter((question, index) => selectedQuestions.has(index) && question.question_text.trim()),
  );
  const suggestedPaperMax = questionPoints || (hostKind ? SUGGESTED_HOST_PAPER_MAX[hostKind] : null);
  const paperMaxDisplay = paperOutOfEdited ? paperOutOf : String(suggestedPaperMax ?? '');

  // Restore unsaved draft on mount so navigating back never loses teacher work
  useEffect(() => {
    if (typeof window === 'undefined' || preSource) return;
    try {
      const raw = window.sessionStorage.getItem(draftStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.questions?.length > 0 && parsed.questions.some((q: any) => q.question_text?.trim())) {
        setQuestions(parsed.questions);
        setSelectedQuestions(new Set(parsed.questions.map((_: any, i: number) => i)));
        setDraftRestored(true);
      }
      if (parsed?.form?.title && !preTitle) {
        setForm(prev => ({
          ...prev,
          title: parsed.form.title || prev.title,
          description: parsed.form.description || prev.description,
          program_id: preProgramId || parsed.form.program_id || prev.program_id,
          course_id: preCourseId || parsed.form.course_id || prev.course_id,
          school_id: preSchoolId || parsed.form.school_id || prev.school_id,
        }));
      }
      if (parsed?.classId && !preClassId) {
        setClassId(parsed.classId);
        if (parsed.className) setClassName(parsed.className);
      }
    } catch {
      // Ignore corrupt session draft
    }
  }, [draftStorageKey, preClassId, preCourseId, preProgramId, preSchoolId, preSource, preTitle]);

  // Auto-save draft to sessionStorage whenever form or questions change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasContent = form.title.trim().length > 0 || questions.some(q => q.question_text.trim().length > 0);
    if (!hasContent) return;
    try {
      window.sessionStorage.setItem(
        draftStorageKey,
        JSON.stringify({
          form,
          questions,
          classId,
          className,
          savedAt: Date.now(),
        }),
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [form, questions, classId, className, draftStorageKey]);

  const clearSavedDraft = () => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(draftStorageKey);
    }
    setQuestions([emptyQuestion()]);
    setSelectedQuestions(new Set([0]));
    setDraftRestored(false);
  };

  const suggestAiTopic = useCallback((candidate: string | null | undefined, priority: number) => {
    const clean = candidate?.trim();
    if (!clean || priority <= topicPriority.current) return;
    topicPriority.current = priority;
    setAiTopic(clean);
  }, []);

  const handleExamTypeChange = (examType: CbtExamType) => {
    setActivePresetId(null);
    const suggestion = buildCbtEntrySuggestion(examType);
    setForm(previous => ({
      ...previous,
      exam_type: examType,
      ...(!teacherEdits.current.duration
        ? { duration_minutes: suggestion.durationMinutes.toString() }
        : {}),
      ...(!teacherEdits.current.passingScore
        ? { passing_score: suggestion.passingScore.toString() }
        : {}),
      ...(!teacherEdits.current.accessWindow
        ? { access_window_minutes: suggestion.accessWindowMinutes.toString() }
        : {}),
    }));
    if (!teacherEdits.current.questionMix) {
      setAiMcqCount(suggestion.mcqCount.toString());
      setAiTheoryCount(suggestion.theoryCount.toString());
    }
  };

  const applyExaminerPreset = (preset: ExaminerPreset) => {
    setActivePresetId(preset.id);
    teacherEdits.current.duration = false;
    teacherEdits.current.passingScore = false;
    teacherEdits.current.questionMix = false;
    setAiMcqCount(String(preset.mcqCount));
    setAiTheoryCount(String(preset.theoryCount));
    setForm(previous => ({
      ...previous,
      exam_type: preset.examType,
      duration_minutes: String(preset.durationMinutes),
      passing_score: String(preset.passingScore),
      access_window_minutes: String(Math.max(preset.durationMinutes + 15, preset.durationMinutes)),
    }));
  };

  const handleBalanceMarks = (targetTotal: number) => {
    setQuestions(current => {
      const selectedOnly = current.filter((_, idx) => selectedQuestions.has(idx));
      if (selectedOnly.length === 0 || targetTotal < selectedOnly.length) return current;
      const balancedSelected = autoBalanceQuestionMarks(selectedOnly, targetTotal);
      let cursor = 0;
      return current.map((q, idx) => (selectedQuestions.has(idx) ? balancedSelected[cursor++] : q));
    });
    if (hostKind) {
      setPaperOutOf(String(targetTotal));
      setPaperOutOfEdited(true);
    }
  };

  // Auto-compose an official exam title whenever class, course, programme, or preset changes
  // (never overwrites if the teacher already typed their own title).
  useEffect(() => {
    if (teacherEdits.current.title || preTitle) return;
    const selectedCourseTitle = courses.find((c: any) => c.id === form.course_id)?.title || null;
    const selectedProgramName = programs.find((p: any) => p.id === form.program_id)?.name || null;
    const presetLabel = activePresetId
      ? EXAMINER_PRESETS.find((p) => p.id === activePresetId)?.label ?? null
      : null;
    const suggested = composeSmartExamTitle({
      courseTitle: selectedCourseTitle,
      programName: selectedProgramName,
      className: className || null,
      examType: form.exam_type,
      presetLabel,
      hostKindLabel: hostKind ? hostPaperLabel(hostKind) : null,
    });
    if (suggested) {
      setForm(prev => (prev.title === suggested ? prev : { ...prev, title: suggested }));
    }
  }, [courses, programs, form.course_id, form.program_id, form.exam_type, className, activePresetId, hostKind, preTitle]);

  const handleStudioMixChange = (mcq: number, theory: number) => {
    teacherEdits.current.questionMix = true;
    setAiMcqCount(String(mcq));
    setAiTheoryCount(String(theory));
    const suggestion = buildCbtEntrySuggestion(form.exam_type, {
      mcqCount: mcq,
      theoryCount: theory,
    });
    setForm(previous => ({
      ...previous,
      ...(!teacherEdits.current.duration
        ? { duration_minutes: suggestion.durationMinutes.toString() }
        : {}),
      ...(!teacherEdits.current.accessWindow
        ? { access_window_minutes: suggestion.accessWindowMinutes.toString() }
        : {}),
    }));
  };

  // Per-question 1-click AI solver/completer for teachers editing a single card
  const handleAiSolveSingleCard = async (qi: number) => {
    const target = questions[qi];
    if (!target || !target.question_text.trim()) {
      setError('Type the question text on this card first, then click AI Complete.');
      return;
    }
    setSolvingCardIdx(qi);
    setError(null);
    try {
      const selectedCourse = courses.find((c: any) => c.id === form.course_id);
      const isObj = ['multiple_choice', 'true_false'].includes(target.question_type);
      const optsText = isObj && target.options.filter(Boolean).length >= 2
        ? `\n${target.options.filter(Boolean).map((o, idx) => `${String.fromCharCode(65 + idx)}) ${o}`).join('\n')}`
        : '';
      const rawPromptText = `1. ${target.question_text.trim()} [${target.points || 5} marks]${optsText}`;

      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'cbt',
          cbtMode: 'align_premade',
          topic: aiTopic || selectedCourse?.title || form.title || 'Assessment Question',
          questionCount: 1,
          mcqCount: isObj ? 1 : 0,
          theoryCount: isObj ? 0 : 1,
          courseName: selectedCourse?.title || undefined,
          subject: selectedCourse?.title || undefined,
          className: className || undefined,
          examType: form.exam_type,
          sourceMaterial: rawPromptText,
          premadeQuestionsText: rawPromptText,
        }),
      });
      const result = await res.json();
      const solved = result?.data?.questions?.[0];
      if (!res.ok || !solved) throw new Error(result?.error || 'Could not auto-complete this question.');

      const nextOpts = target.question_type === 'true_false'
        ? ['True', 'False']
        : Array.isArray(solved.options) && solved.options.length >= 2
          ? solved.options.map((o: any) => stripOptionPrefix(String(o ?? '')))
          : target.options.map((o) => stripOptionPrefix(o));

      const rawSolvedAns = String(solved.correct_answer || solved.answer || solved.marking_guide || target.correct_answer || '').trim();
      const resolvedAns = target.question_type === 'multiple_choice'
        ? resolveMcqAnswerToOption(rawSolvedAns, nextOpts)
        : target.question_type === 'true_false'
          ? (/^false$/i.test(rawSolvedAns) ? 'False' : 'True')
          : rawSolvedAns;

      updateQuestion(qi, {
        options: nextOpts,
        correct_answer: resolvedAns,
        marking_guide: String(solved.marking_guide || solved.metadata?.marking_guide || solved.explanation || target.marking_guide || ''),
      });
    } catch (e: any) {
      setError(e?.message || 'AI could not complete this question right now.');
    } finally {
      setSolvingCardIdx(null);
    }
  };

  useEffect(() => {
    if (authLoading || !profile) return;
    const db = createClient();

    let classQuery = db
      .from('classes')
      .select('id,name,school_id,program_id,current_course_id,academic_offering_id,offering_period_id,status')
      .order('name');
    if (profile.role === 'teacher') classQuery = classQuery.eq('teacher_id', profile.id);
    classQuery.then(({ data }) => {
      const activeClasses = ((data ?? []) as AssessmentClassOption[]).filter(item => item.status !== 'archived');
      setAvailableClasses(activeClasses);
      // Time-saver for teachers: if they teach 1 active class and no class was pre-selected, select it automatically!
      if (!preClassId && activeClasses.length === 1) {
        const only = activeClasses[0];
        setClassId(only.id);
        setClassName(only.name);
        suggestAiTopic(only.name, 1);
        setForm(prev => ({
          ...prev,
          school_id: only.school_id || prev.school_id,
          program_id: only.program_id || prev.program_id,
          course_id: only.current_course_id || prev.course_id,
        }));
      }
    });
    
    // 1. Fetch admin school list; teachers load schools together with scoped courses below.
    if (profile.role === 'admin') {
      db.from('schools').select('id, name').eq('status', 'approved').order('name')
        .then(({ data }) => setAssignedSchools(data ?? []));
    }

    // 2. Fetch programs
    db.from('programs').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => {
        setPrograms(data ?? []);
        if (preProgramId) setForm(prev => ({ ...prev, program_id: preProgramId }));
      });

    const loadCourses = (schoolIds?: string[]) => {
      let courseQuery = db.from('courses').select('id, title, program_id, school_id, programs(name)').eq('is_active', true);
      if (profile.role === 'teacher') {
        const filters = ['school_id.is.null', ...(schoolIds ?? []).map(id => `school_id.eq.${id}`)];
        courseQuery = courseQuery.or(filters.join(','));
      } else if (profile.role !== 'admin' && profile?.school_id) {
        courseQuery = courseQuery.or(`school_id.eq.${profile.school_id},school_id.is.null`);
      }
      return courseQuery.order('title').then(({ data }) => {
        const cList = data ?? [];
        setCourses(cList);
        if (preCourseId) {
          const c = cList.find((x: any) => x.id === preCourseId);
          setForm(prev => ({ ...prev, course_id: c ? preCourseId : '', program_id: c?.program_id || prev.program_id }));
          if (c?.title) suggestAiTopic(c.title, 2);
        }
      });
    };

    // 3. Fetch courses after teacher school scope is known.
    if (profile.role !== 'teacher') {
      loadCourses();
    }

    const setTeacherSchools = (schools: Array<{ id: string; name: string }>) => {
      setAssignedSchools(schools);
      if (schools.length === 1) setForm(prev => ({ ...prev, school_id: prev.school_id || schools[0].id }));
      loadCourses(schools.map(s => s.id));
    };

    // Keep the old promise chain lightweight while still avoiding broad teacher course fetches.
    if (profile.role === 'teacher') {
      const schoolMap = new Map<string, string>();
      const loads: PromiseLike<any>[] = [];
      if (profile.school_id) {
        loads.push(
          db.from('schools').select('id, name').eq('id', profile.school_id).maybeSingle()
            .then(({ data }) => { if (data?.id) schoolMap.set(data.id, data.name); }),
        );
      }
      loads.push(
        db.from('teacher_schools').select('school_id, schools(id, name)').eq('teacher_id', profile.id)
          .then(({ data }) => {
            (data ?? []).forEach((row: any) => {
              if (row.schools?.id) schoolMap.set(row.schools.id, row.schools.name);
            });
          }),
      );
      Promise.all(loads).then(() => {
        setTeacherSchools([...schoolMap.entries()]
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name)));
      });
    }

    // Pre-fill programme and lock school when launched from a class page.
    if (preClassId) {
      db.from('classes').select('id, name, program_id, school_id, current_course_id').eq('id', preClassId).maybeSingle()
        .then(({ data: cls, error: classError }) => {
          if (classError) {
            setError('Could not load the selected class context.');
            return;
          }
          if (!cls) return;
          setClassId(cls.id);
          setClassName(cls.name || '');
          suggestAiTopic(cls.name, 1);
          setForm(prev => ({
            ...prev,
            program_id: cls.program_id || prev.program_id,
            school_id: cls.school_id || prev.school_id,
            course_id: cls.current_course_id || prev.course_id,
          }));
        });
    }

    // A lesson title is the strongest automatic topic because it preserves the
    // class-plan -> lesson -> assessment spine without asking the teacher twice.
    if (preLessonId) {
      db.from('lessons').select('id, title, course_id').eq('id', preLessonId).maybeSingle()
        .then(({ data: lesson, error: lessonError }) => {
          if (lessonError) {
            setError('Could not load the linked lesson context.');
            return;
          }
          if (!lesson) return;
          suggestAiTopic(lesson.title, 3);
          setForm(previous => ({
            ...previous,
            course_id: lesson.course_id || previous.course_id,
          }));
        });
    }
  }, [profile?.id, authLoading, preProgramId, preCourseId, preClassId, preSchoolId, preLessonId, suggestAiTopic]);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';
  const selectedSchoolName = assignedSchools.find(s => s.id === form.school_id)?.name || '';
  const selectAssessmentClass = (nextClassId: string) => {
    if (!nextClassId) {
      setClassId(null);
      setClassName('');
      return;
    }
    const selected = availableClasses.find(item => item.id === nextClassId);
    if (!selected) return;
    setClassId(selected.id);
    setClassName(selected.name);
    setForm(previous => ({
      ...previous,
      school_id: selected.school_id,
      program_id: selected.program_id || previous.program_id,
      course_id: selected.current_course_id || previous.course_id,
    }));
    suggestAiTopic(selected.name, 1);
  };
  const autoClosePreview = form.start_date
    ? new Date(new Date(form.start_date).getTime() + ((parseInt(form.access_window_minutes, 10) || parseInt(form.duration_minutes, 10) || 60) * 60_000))
    : null;

  const addQuestion = (presetType: string = 'multiple_choice') => setQuestions(current => {
    setSelectedQuestions(selected => new Set(selected).add(current.length));
    const isTheory = presetType === 'essay' || presetType === 'fill_blank';
    return [
      ...current,
      {
        ...emptyQuestion(),
        question_type: presetType,
        options: presetType === 'true_false' ? ['True', 'False'] : ['', '', '', ''],
        points: presetType === 'essay' ? 10 : 5,
        section: isTheory ? 'subjective' : 'objective',
      },
    ];
  });
  const duplicateQuestion = (i: number) => setQuestions(current => {
    const copy = { ...current[i], options: [...(current[i].options ?? [])] };
    const next = [...current.slice(0, i + 1), copy, ...current.slice(i + 1)];
    setSelectedQuestions(new Set(next.map((_, idx) => idx)));
    return next;
  });
  const moveQuestion = (i: number, dir: -1 | 1) => setQuestions(current => {
    const target = i + dir;
    if (target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[i], next[target]] = [next[target], next[i]];
    setSelectedQuestions(prev => {
      const updated = new Set<number>();
      prev.forEach(idx => {
        if (idx === i) updated.add(target);
        else if (idx === target) updated.add(i);
        else updated.add(idx);
      });
      return updated;
    });
    return next;
  });
  const handleStudioImport = (imported: StudioGeneratedQuestion[], importMode: 'append' | 'replace') => {
    const mapped: Question[] = imported.map(q => {
      const cbtType = q.question_type === 'short_answer' ? 'fill_blank' : q.question_type;
      const cleanedOpts =
        cbtType === 'true_false'
          ? ['True', 'False']
          : cbtType === 'multiple_choice'
            ? q.options.length >= 2
              ? q.options.map((o) => stripOptionPrefix(o))
              : ['', '', '', '']
            : ['', '', '', ''];
      const rawAns = String(q.correct_answer || q.marking_guide || '').trim();
      const resolvedAns =
        cbtType === 'multiple_choice'
          ? resolveMcqAnswerToOption(rawAns, cleanedOpts)
          : cbtType === 'true_false'
            ? /^false$/i.test(rawAns) ? 'False' : 'True'
            : rawAns;
      return {
        question_text: q.question_text,
        question_type: cbtType,
        options: cleanedOpts,
        correct_answer: resolvedAns,
        marking_guide: q.marking_guide || q.explanation,
        curriculumTag: q.curriculumTag,
        cognitiveLevel: q.cognitiveLevel,
        points: Math.max(1, Number(q.points) || (['essay', 'coding_blocks'].includes(cbtType) ? 10 : 5)),
        section: q.section || (['essay', 'fill_blank', 'coding_blocks'].includes(cbtType) ? 'subjective' : 'objective'),
      };
    });
    const nonEmptyCurrent = questions.filter(item => item.question_text.trim().length > 0);
    const { unique: uniqueMapped } = dedupeCbtQuestions(
      mapped,
      importMode === 'replace' || nonEmptyCurrent.length === 0
        ? []
        : nonEmptyCurrent.map((item) => item.question_text),
    );
    const next = importMode === 'replace' || nonEmptyCurrent.length === 0
      ? uniqueMapped
      : [...nonEmptyCurrent, ...uniqueMapped];
    const resolved = next.length > 0 ? next : [emptyQuestion()];
    setQuestions(resolved);
    setSelectedQuestions(new Set(resolved.map((_, idx) => idx)));
    setError(null);
  };
  const removeQuestion = (i: number) => setQuestions(current => {
    setSelectedQuestions(selected => new Set(
      [...selected]
        .filter(index => index !== i)
        .map(index => index > i ? index - 1 : index),
    ));
    return current.filter((_, index) => index !== i);
  });
  const updateQuestion = (i: number, patch: Partial<Question>) =>
    setQuestions(q => q.map((item, idx) => idx === i ? { ...item, ...patch } : item));
  const updateOption = (qi: number, oi: number, val: string) =>
    setQuestions(q => q.map((item, idx) => idx === qi ? { ...item, options: item.options.map((o, j) => j === oi ? val : o) } : item));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.program_id) {
      setError('Title and programme are required.');
      return;
    }
    if (assessmentScope === 'class_result' && !classId) {
      setError('Choose the class whose report should receive this result, or select Practice only.');
      return;
    }
    const selectedClass = classId ? availableClasses.find(item => item.id === classId) : null;
    if (assessmentScope === 'class_result' && selectedClass
      && (!selectedClass.academic_offering_id || !selectedClass.offering_period_id)) {
      setError('This class needs its academic offering and period repaired before it can receive automatic results.');
      return;
    }
    if (profile?.role === 'teacher' && !form.school_id) {
      setError('Select the school that should see this exam.');
      return;
    }
    if (useWeights && sectionWeights.objective + sectionWeights.subjective + sectionWeights.practical !== 100) {
      setError('Section weights must total exactly 100%.');
      return;
    }
    const nonEmptyQuestions = questions.filter(q => q.question_text.trim());
    const validQuestions = questions.filter((q, i) =>
      q.question_text.trim() && selectedQuestions.has(i)
    );
    if (validQuestions.length === 0) {
      setError('Add at least one question (or tick the questions you want to include).');
      return;
    }
    const publishMinimum = Math.min(5, examBoundary.min);
    if (form.is_active && (validQuestions.length < publishMinimum || validQuestions.length > examBoundary.max)) {
      if (nonEmptyQuestions.length >= publishMinimum && validQuestions.length < nonEmptyQuestions.length) {
        setError(`Only ${validQuestions.length} of your ${nonEmptyQuestions.length} questions are ticked for inclusion. Tick at least ${publishMinimum} questions before publishing.`);
      } else {
        setError(`${examBoundary.label} needs at least ${publishMinimum} questions (up to ${examBoundary.max}) before publishing — currently ${validQuestions.length}. Save as draft (inactive) or add more questions.`);
      }
      return;
    }
    const invalidObjective = validQuestions.find(question => {
      if (!['multiple_choice', 'true_false'].includes(question.question_type)) return false;
      const options = question.options.filter(option => option.trim());
      return options.length < 2 || !question.correct_answer.trim()
        || !options.includes(question.correct_answer);
    });
    if (form.is_active && invalidObjective) {
      setError('Every objective question needs at least two options and one selected correct answer.');
      return;
    }
    const durationMinutes = parseInt(form.duration_minutes, 10);
    const accessWindowMinutes = parseInt(form.access_window_minutes, 10);
    const passingScore = parseInt(form.passing_score, 10);
    if (!Number.isFinite(durationMinutes) || durationMinutes < 5) {
      setError('Enter a valid assessment duration of at least 5 minutes.');
      return;
    }
    if (!Number.isFinite(passingScore) || passingScore < 1 || passingScore > 100) {
      setError('Passing score must be between 1% and 100%.');
      return;
    }
    if (form.start_date && (!Number.isFinite(accessWindowMinutes) || accessWindowMinutes < durationMinutes)) {
      setError('The open window must be at least as long as the assessment so students can finish.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const weightTotal = sectionWeights.objective + sectionWeights.subjective + sectionWeights.practical;
      const examPayload: any = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        program_id: form.program_id,
        course_id: form.course_id || null,
        duration_minutes: durationMinutes,
        passing_score: passingScore,
        total_questions: validQuestions.length,
        is_active: form.is_active,
        metadata: {
            exam_type: form.exam_type,
            assessment_scope: assessmentScope,
            result_eligible: assessmentScope === 'class_result',
            ...(useWeights ? { section_weights: sectionWeights, weights_total: weightTotal } : {}),
            ...(preWeek ? { week: parseInt(preWeek, 10) } : {}),
            ...(preCurrId ? { curriculum_id: preCurrId } : {}),
            ...(preLessonPlanId ? { lesson_plan_id: preLessonPlanId } : {}),
            ...(preLessonId ? { lesson_id: preLessonId } : {}),
            source: preSource ? 'taught' : (preCurrId ? 'curriculum' : (classId ? 'class' : 'standalone')),
            ...(preSource ? { generated_from: 'taught_weeks' } : {}),
            ...(preSit === 'print' || preSit === 'cbt' ? { sit: preSit } : {}),
            ...((preHostAssessment || hostAssessmentKindFromExam({ title: form.title }))
              ? (() => {
                  const kind = preHostAssessment || hostAssessmentKindFromExam({ title: form.title });
                  const fromQuestions = paperTotalFromQuestions(validQuestions);
                  const typed = Math.round(Number(paperOutOf));
                  const hostMax =
                    (paperOutOfEdited && Number.isFinite(typed) && typed > 0 && typed)
                    || fromQuestions
                    || (kind ? SUGGESTED_HOST_PAPER_MAX[kind] : null);
                  return kind ? { host_assessment: kind, ...(hostMax ? { host_max: hostMax } : {}) } : {};
                })()
              : {}),
            ...(classId ? { target_class_id: classId, visibility: 'class' } : {}),
        },
        questions: validQuestions.map((q, i) => ({
          question_text: q.question_text.trim(),
          question_type: q.question_type,
          options: ['multiple_choice', 'true_false'].includes(q.question_type)
            ? q.options.filter((o: string) => o.trim())
            : null,
          correct_answer: (q.correct_answer || q.marking_guide || '').trim(),
          points: q.points,
          section: q.section,
          order_index: i + 1,
          metadata: {
            section: q.section,
            ...(q.marking_guide ? { marking_guide: q.marking_guide } : {}),
            ...(q.curriculumTag ? { curriculum_tag: q.curriculumTag } : {}),
            ...(q.cognitiveLevel ? { cognitive_level: q.cognitiveLevel } : {}),
          },
        })),
      };
      if (form.start_date) {
        const start = new Date(form.start_date);
        examPayload.start_date = start.toISOString();
        const windowMinutes = parseInt(form.access_window_minutes, 10) || parseInt(form.duration_minutes, 10) || 60;
        examPayload.end_date = new Date(start.getTime() + windowMinutes * 60_000).toISOString();
        examPayload.metadata.access_window_minutes = windowMinutes;
      } else if (form.end_date) {
        examPayload.end_date = new Date(form.end_date).toISOString();
      }
      if (classId) examPayload.class_id = classId;
      if (preLessonPlanId) examPayload.lesson_plan_id = preLessonPlanId;
      if (preLessonId) examPayload.lesson_id = preLessonId;
      if (preWeek) examPayload.curriculum_week_number = parseInt(preWeek, 10);
      if (form.school_id) examPayload.school_id = form.school_id;
      else if (profile?.school_id) examPayload.school_id = profile.school_id;

      const res = await fetch('/api/cbt/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(examPayload),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to create exam'); }

      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(draftStorageKey);
      }
      const kind = preHostAssessment || hostAssessmentKindFromExam({ title: form.title });
      router.push(backHref);
    } catch (e: any) {
      setError(e.message ?? 'Failed to create exam');
    } finally {
      setSaving(false);
    }
  };

  // ── Print exam sheet — always prints every filled question (selection is for save only) ──
  const handlePrintExam = (mode: 'student' | 'staff') => {
    let toPrint = questions.filter((q) => q.question_text.trim());
    if (printFilter === 'mcq') toPrint = toPrint.filter(isObjectiveQuestion);
    if (printFilter === 'theory') toPrint = toPrint.filter(isTheoryQuestion);
    if (toPrint.length === 0) {
      alert(printFilter === 'mcq' ? 'No objective (MCQ/True-False) questions found.' : printFilter === 'theory' ? 'No theory questions found.' : 'No questions to print. Add questions first.');
      return;
    }

    const prog = programs.find(p => p.id === form.program_id)?.name ?? '';
    const course = courses.find(c => c.id === form.course_id)?.title ?? '';
    const mcq = toPrint.filter(isObjectiveQuestion);
    const theory = toPrint.filter(isTheoryQuestion);

    openCbtPrintWindow(buildCbtPrintHtml({
      title: form.title || 'Computer-Based Test',
      schoolName: 'Rillcod Technologies',
      subtitle: [prog, course].filter(Boolean).join(' · ') || undefined,
      description: form.description.trim() || undefined,
      durationMinutes: parseInt(form.duration_minutes, 10) || 60,
      passingScore: parseInt(form.passing_score, 10) || 70,
      dateStr: new Date().toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' }),
      docRef: `CBT-${Date.now().toString(36).toUpperCase()}`,
      logoUrl: `${window.location.origin}/logo.png`,
      mcqQuestions: mcq,
      theoryQuestions: theory,
      mode,
      examTypeLabel: printFilter === 'mcq' ? 'OBJECTIVE' : printFilter === 'theory' ? 'THEORY' : 'EXAMINATION',
    }));
  };

  if (authLoading || profileLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center mobile-page-root">
      <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!isStaff) return (
    <div className="min-h-screen bg-background flex items-center justify-center mobile-page-root">
      <p className="text-muted-foreground">Staff access required.</p>
    </div>
  );

  return (
    <div className={`min-h-screen bg-background text-foreground ${isMinimal ? 'p-0' : 'p-4 sm:p-8'}`}>
      <div className={`${isMinimal ? 'w-full' : 'max-w-4xl mx-auto'} space-y-6`}>
        {!isMinimal && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeftIcon className="w-4 h-4" /> {backLabel}
            </Link>
            {draftRestored && (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-300 font-semibold">
                <span>Unsaved draft restored</span>
                <button
                  type="button"
                  onClick={clearSavedDraft}
                  className="underline font-black hover:text-foreground"
                >
                  Clear draft
                </button>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <AcademicCapIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">{hostKind ? 'School paper' : isMinimal ? 'Add Context' : 'New Exam'}</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">{hostKind ? `Prepare ${hostPaperLabel(hostKind)}` : 'Create assessment'}</h1>
            {!isMinimal && (
              <p className="text-muted-foreground text-sm mt-1">
                {hostKind
                  ? 'Generate this paper from what the class has already been taught. Then return to the datasheet to print it and enter hall marks.'
                  : 'Build, review, and publish one class-ready assessment.'}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {questions.some(q => q.question_text.trim()) && (
              <div className="flex items-center gap-1">
                {/* Question type filter for print */}
                <div className="flex border border-primary/30 rounded-xl overflow-hidden">
                  {(['all', 'mcq', 'theory'] as const).map(f => (
                    <button key={f} type="button" onClick={() => setPrintFilter(f)}
                      className={`px-2.5 py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${printFilter === f ? 'bg-primary/30 text-primary' : 'bg-primary/10 text-primary/50 hover:bg-primary/20 hover:text-primary'}`}>
                      {f === 'all' ? 'All' : f === 'mcq' ? 'Obj' : 'Theory'}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handlePrintExam('student')}
                    className="flex items-center gap-2 px-4 py-3 bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary font-black text-[10px] uppercase tracking-[0.18em] rounded-xl transition-all"
                  >
                    Student Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrintExam('staff')}
                    className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-black text-[10px] uppercase tracking-[0.18em] rounded-xl transition-all"
                  >
                    Teacher Copy
                  </button>
                </div>
              </div>
            )}
            <button onClick={handleSubmit} disabled={saving} className="flex items-center gap-2 px-8 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs uppercase tracking-[0.2em] rounded-xl shadow-xl shadow-emerald-900/40 transition-all disabled:opacity-50">
              {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
              {saving ? 'Saving…' : hostKind ? `Save ${hostPaperLabel(hostKind)}` : (isMinimal ? 'CREATE' : (form.is_active ? 'PUBLISH ASSESSMENT' : 'SAVE DRAFT'))}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
            <ExclamationTriangleIcon className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0" />
            <p className="text-rose-600 dark:text-rose-400 text-sm">{error}</p>
          </div>
        )}

        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3">
          <div className="flex items-start gap-3">
            <SparklesIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="text-xs font-bold text-foreground">{hostKind ? `${hostPaperLabel(hostKind)} from taught weeks` : 'Smart draft prepared'}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {hostKind
                  ? `Questions should come only from weeks this class has already been taught.${className ? ` Linked to ${className}.` : ''} After you save, the datasheet is where you print the paper and enter hall marks.`
                  : `${examSuggestion.label}: ${aiMcqCount || 0} objective + ${aiTheoryCount || 0} written questions, ${form.duration_minutes} minutes, ${form.passing_score}% pass mark.${className ? ` Linked to ${className}.` : ''} Official report contribution follows the active academic grading scheme.`}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Exam Details */}
          <div className="bg-card shadow-sm border border-border rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-black text-foreground uppercase tracking-widest flex items-center gap-2">
                  <SparklesIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  1. Examiner Setup
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Pick a blueprint &amp; class — programme, school, title, timing, and question mix configure automatically.
                </p>
              </div>
              {activePresetId && (
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                  Blueprint Active
                </span>
              )}
            </div>

            {/* 1-Click Chief Examiner Blueprint Presets */}
            {!hostKind && (
              <div className="space-y-2">
                <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                  Quick Examiner Blueprints (1-Click Setup)
                </p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {EXAMINER_PRESETS.map((preset) => {
                    const isSelected = activePresetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyExaminerPreset(preset)}
                        className={`rounded-xl border p-3 text-left transition-all ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-500/12 shadow-sm ring-1 ring-emerald-500/30'
                            : 'border-border bg-muted/20 hover:border-emerald-500/40 hover:bg-muted/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-black text-foreground">{preset.shortLabel}</span>
                          <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md ${
                            isSelected
                              ? 'bg-emerald-700 text-white'
                              : 'bg-card border border-border text-muted-foreground'
                          }`}>
                            {preset.targetMarks}m
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                          {preset.badge}
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2 leading-snug">
                          {preset.summary}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-foreground">Class &amp; Result Routing</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Choose the class once — school, programme, and active course auto-fill immediately.
                  </p>
                </div>
                {!hostKind && (
                  <div className="inline-flex rounded-xl border border-border bg-card p-1 gap-1">
                    <button
                      type="button"
                      onClick={() => setAssessmentScope('class_result')}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-colors ${
                        assessmentScope === 'class_result'
                          ? 'bg-emerald-700 text-white shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Official Class Result
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssessmentScope('practice')}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-colors ${
                        assessmentScope === 'practice'
                          ? 'bg-sky-700 text-white shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Practice Only
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  {assessmentScope === 'class_result' ? 'Result class' : 'Limit practice to a class'}
                  {assessmentScope === 'class_result' && <span className="text-rose-600 dark:text-rose-400"> *</span>}
                </label>
                {/* 1-Click Teacher Class Quick-Select Pills */}
                {!preClassId && !preLessonPlanId && !preHostAssessment && availableClasses.length > 0 && availableClasses.length <= 8 && (
                  <div className="flex flex-wrap gap-1.5">
                    {availableClasses
                      .filter(item => !form.school_id || item.school_id === form.school_id)
                      .map(item => {
                        const active = classId === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => selectAssessmentClass(item.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                              active
                                ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                                : 'bg-card border-border text-foreground hover:border-emerald-500/40'
                            }`}
                          >
                            {item.name}
                          </button>
                        );
                      })}
                  </div>
                )}
                <select
                  aria-label="Result class"
                  value={classId || ''}
                  onChange={event => selectAssessmentClass(event.target.value)}
                  disabled={!!preClassId || !!preLessonPlanId || !!preHostAssessment}
                  className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground focus:outline-none focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">
                    {assessmentScope === 'class_result' ? 'Choose the class receiving this result…' : 'All eligible learners in the selected school/programme'}
                  </option>
                  {availableClasses
                    .filter(item => !form.school_id || item.school_id === form.school_id)
                    .map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name}{item.academic_offering_id && item.offering_period_id ? '' : ' — setup required'}
                      </option>
                    ))}
                </select>

                {/* Auto-Resolved Programme & School Summary Strip — replaces clunky disabled selects */}
                {classId && form.program_id && (form.school_id || profile?.role === 'admin') && !showContextSelectors && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-3.5 py-2.5 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-black text-emerald-800 dark:text-emerald-300 uppercase text-[10px] tracking-wider">
                        Auto-linked:
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-card border border-border font-bold text-foreground">
                        Programme: {programs.find(p => p.id === form.program_id)?.name || 'Selected'}
                      </span>
                      {selectedSchoolName && (
                        <span className="px-2 py-0.5 rounded-md bg-card border border-border font-bold text-foreground">
                          School: {selectedSchoolName}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowContextSelectors(true)}
                      className="text-[11px] font-black text-emerald-700 dark:text-emerald-300 hover:underline"
                    >
                      Change Programme / School
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Course + Exam Title side-by-side for speed */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <SmartCourseSelect
                  label="Course / Subject"
                  labelClass="block text-xs font-semibold text-muted-foreground uppercase tracking-widest"
                  classId={classId}
                  programId={form.program_id}
                  schoolId={form.school_id}
                  value={form.course_id}
                  onChange={(courseId, course) => {
                    suggestAiTopic(course?.title, 2);
                    setForm(f => ({
                      ...f,
                      course_id: courseId,
                      program_id: course?.programId || f.program_id,
                    }));
                  }}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                    Exam Title <span className="text-rose-600 dark:text-rose-400">*</span>
                  </label>
                  {!teacherEdits.current.title && form.title && (
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                      Auto-titled
                    </span>
                  )}
                </div>
                <input type="text" required value={form.title}
                  onChange={e => {
                    teacherEdits.current.title = true;
                    setForm(f => ({ ...f, title: e.target.value }));
                  }}
                  placeholder="Auto-fills from class & course, or type your own…"
                  className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors" />
              </div>
            </div>

            {/* Programme & School selectors — NEVER trapped disabled when empty! */}
            {(!classId || !form.program_id || (!form.school_id && profile?.role === 'teacher') || showContextSelectors) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-border bg-muted/15 p-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                      Programme <span className="text-rose-600 dark:text-rose-400">*</span>
                    </label>
                    {classId && !form.program_id && (
                      <span className="text-[10px] font-black text-amber-700 dark:text-amber-300">
                        Not set on class — pick one
                      </span>
                    )}
                  </div>
                  <select required value={form.program_id}
                    aria-label="Programme"
                    onChange={e => {
                      const pid = e.target.value;
                      const currentCourse = courses.find(x => x.id === form.course_id);
                      setForm(f => ({
                        ...f,
                        program_id: pid,
                        course_id: currentCourse?.program_id === pid ? f.course_id : '',
                      }));
                    }}
                    className={`w-full px-4 py-3 bg-card shadow-sm border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer ${
                      !form.program_id ? 'border-amber-500/60' : 'border-border'
                    }`}>
                    <option value="">Select programme…</option>
                    {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                    Visible To School {profile?.role === 'teacher' ? <span className="text-rose-600 dark:text-rose-400">*</span> : <span className="text-muted-foreground">(optional for admin)</span>}
                  </label>
                  <select
                    aria-label="Visible To School"
                    value={form.school_id}
                    onChange={e => {
                      const schoolId = e.target.value;
                      setForm(f => {
                        const currentCourse = courses.find(c => c.id === f.course_id);
                        const keepCourse = !currentCourse?.school_id || !schoolId || currentCourse.school_id === schoolId;
                        return { ...f, school_id: schoolId, course_id: keepCourse ? f.course_id : '' };
                      });
                    }}
                    disabled={!!classId && !!form.school_id}
                    className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="">
                      {profile?.role === 'admin' ? 'Platform-wide / no school gate' : 'Select one of your assigned schools…'}
                    </option>
                    {assignedSchools.map(school => <option key={school.id} value={school.id}>{school.name}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* Exam Type — critical for score routing */}
            <div className={`grid grid-cols-2 gap-3 ${hostKind ? 'hidden' : ''}`}>
              <button type="button"
                onClick={() => handleExamTypeChange('examination')}
                className={`flex items-start gap-3 rounded-xl px-4 py-3 border text-left transition-all ${form.exam_type === 'examination' ? 'bg-indigo-500/10 border-indigo-500/50' : 'bg-card border-border hover:border-indigo-500/30'}`}>
                <div className={`w-3 h-3 rounded-full mt-0.5 flex-shrink-0 border-2 ${form.exam_type === 'examination' ? 'bg-indigo-500 border-indigo-500' : 'border-muted-foreground'}`} />
                <div>
                  <p className="text-xs font-black text-foreground uppercase tracking-widest">Examination</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Broad end-of-term assessment. Report weighting comes from the active academic scheme.</p>
                </div>
              </button>
              <button type="button"
                onClick={() => handleExamTypeChange('evaluation')}
                className={`flex items-start gap-3 rounded-xl px-4 py-3 border text-left transition-all ${form.exam_type === 'evaluation' ? 'bg-cyan-500/10 border-cyan-500/50' : 'bg-card border-border hover:border-cyan-500/30'}`}>
                <div className={`w-3 h-3 rounded-full mt-0.5 flex-shrink-0 border-2 ${form.exam_type === 'evaluation' ? 'bg-cyan-500 border-cyan-500' : 'border-muted-foreground'}`} />
                <div>
                  <p className="text-xs font-black text-foreground uppercase tracking-widest">Evaluation (Test)</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Focused check of recent learning. Report weighting comes from the active academic scheme.</p>
                </div>
              </button>
            </div>

            {hostKind ? (
              <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 space-y-2">
                <label className="block text-xs font-semibold text-sky-800 dark:text-sky-300 uppercase tracking-widest">This paper is out of</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    value={paperMaxDisplay}
                    onChange={(e) => {
                      setPaperOutOfEdited(true);
                      setPaperOutOf(e.target.value);
                    }}
                    className="w-28 px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Set the total for this {hostKind === 'examination' ? 'Examination' : hostKind === 'second_test' ? 'Second Test' : 'First Test'}.
                    Question points add to {questionPoints ?? '—'}. Hall marks, Write and the parent report all use this same total.
                  </p>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Duration (min)</label>
                <input type="number" min="5" value={form.duration_minutes}
                  onChange={e => {
                    teacherEdits.current.duration = true;
                    setForm(f => ({ ...f, duration_minutes: e.target.value }));
                  }}
                  className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Passing Score (%)</label>
                <input type="number" min="1" max="100" value={form.passing_score}
                  onChange={e => {
                    teacherEdits.current.passingScore = true;
                    setForm(f => ({ ...f, passing_score: e.target.value }));
                  }}
                  className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Status</label>
                <select value={form.is_active ? 'active' : 'inactive'}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.value === 'active' }))}
                  className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer">
                  <option value="active">Publish when saved</option>
                  <option value="inactive">Keep as draft</option>
                </select>
              </div>
            </div>

            <div className="pt-1 border-t border-border/60">
              <button
                type="button"
                onClick={() => setShowAdvancedSetup((v) => !v)}
                className="inline-flex items-center gap-2 text-xs font-black text-primary hover:underline"
              >
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${showAdvancedSetup ? 'rotate-180' : ''}`} />
                {showAdvancedSetup ? 'Hide Schedule, Description & Section Weights' : 'Schedule Window, Description & Section Weights (Optional)'}
                {form.start_date && !showAdvancedSetup && (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                    Scheduled
                  </span>
                )}
              </button>
            </div>

            {showAdvancedSetup && (
              <div className="space-y-4 pt-2">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="font-bold text-muted-foreground mr-1">Quick schedule:</span>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, start_date: '' }))}
                    className={`rounded-lg border px-2.5 py-1 font-bold transition-colors ${!form.start_date ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-border bg-card text-foreground hover:bg-muted'}`}
                  >
                    Live Immediately
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, start_date: toLocalDateTimeInput(new Date(Date.now() + 60 * 60_000)) }))}
                    className="rounded-lg border border-border bg-card hover:bg-muted px-2.5 py-1 font-bold text-foreground transition-colors"
                  >
                    In 1 Hour
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + 1);
                      d.setHours(9, 0, 0, 0);
                      setForm((f) => ({ ...f, start_date: toLocalDateTimeInput(d) }));
                    }}
                    className="rounded-lg border border-border bg-card hover:bg-muted px-2.5 py-1 font-bold text-foreground transition-colors"
                  >
                    Tomorrow 9:00 AM
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Start Date/Time</label>
                    <input type="datetime-local" value={form.start_date}
                      onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                      className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Open Window (min)</label>
                    <input type="number" min="5" value={form.access_window_minutes}
                      onChange={e => {
                        teacherEdits.current.accessWindow = true;
                        setForm(f => ({ ...f, access_window_minutes: e.target.value }));
                      }}
                      className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 transition-colors" />
                  </div>
                  <div className="rounded-xl border border-border bg-card px-4 py-3">
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Auto Closes</label>
                    <p className="text-sm font-semibold text-foreground">
                      {autoClosePreview ? autoClosePreview.toLocaleString() : 'Live immediately when published'}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed">
                      After closing, non-starters are marked Absent automatically.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Description</label>
                  <textarea rows={2} value={form.description}
                    onChange={e => {
                      teacherEdits.current.description = true;
                      setForm(f => ({ ...f, description: e.target.value }));
                    }}
                    placeholder="Optional exam description…"
                    className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors resize-none" />
                </div>

                {/* Within-paper section weights */}
                <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-foreground">Within-paper section weighting</p>
                      <p className="text-[10px] text-muted-foreground">Optional: override how sections combine inside this paper only.</p>
                    </div>
                    <button type="button" onClick={() => setUseWeights(w => !w)}
                      className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-xl border transition-all ${useWeights ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-700 dark:text-emerald-300' : 'bg-card border-border text-muted-foreground hover:border-emerald-500/30'}`}>
                      {useWeights ? 'Weighted ON' : 'Flat Points'}
                    </button>
                  </div>
                  {useWeights && (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {(['objective', 'subjective', 'practical'] as const).map(sec => (
                          <div key={sec}>
                            <label className="block text-xs text-muted-foreground uppercase tracking-widest mb-1">{sec} %</label>
                            <input type="number" min="0" max="100"
                              value={sectionWeights[sec]}
                              onChange={e => setSectionWeights(w => ({ ...w, [sec]: parseInt(e.target.value) || 0 }))}
                              className="w-full px-3 py-2 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 transition-colors" />
                          </div>
                        ))}
                      </div>
                      {(() => {
                        const total = sectionWeights.objective + sectionWeights.subjective + sectionWeights.practical;
                        return (
                          <div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${total === 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            <div className={`w-2 h-2 rounded-full ${total === 100 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            Total: {total}% {total === 100 ? '— Valid' : '— Must equal 100%'}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 2. Streamlined AI Question Assistant — right above Questions so context is already set */}
          <QuestionAuthoringStudio
            mode="cbt"
            courseId={form.course_id || null}
            courseTitle={courses.find((c: any) => c.id === form.course_id)?.title || null}
            programId={form.program_id || null}
            programName={programs.find((p: any) => p.id === form.program_id)?.name || null}
            classId={classId}
            className={className || null}
            examType={form.exam_type}
            currentQuestions={questions}
            existingQuestionTexts={questions.map(q => q.question_text)}
            onImportQuestions={handleStudioImport}
            onQuestionMixChange={handleStudioMixChange}
            onUpdateExamMeta={meta => {
              setForm(prev => ({
                ...prev,
                title: !teacherEdits.current.title && meta.title ? meta.title : prev.title,
                description: !teacherEdits.current.description && meta.description ? meta.description : prev.description,
                duration_minutes: !teacherEdits.current.duration && meta.durationMinutes ? String(meta.durationMinutes) : prev.duration_minutes,
                passing_score: !teacherEdits.current.passingScore && meta.passingScore ? String(meta.passingScore) : prev.passing_score,
              }));
            }}
            initialTopic={aiTopic}
            initialSourceText={sourceText}
            initialSourceName={sourceName}
            defaultMcqCount={parseInt(aiMcqCount, 10) || examSuggestion.mcqCount}
            defaultTheoryCount={parseInt(aiTheoryCount, 10) || examSuggestion.theoryCount}
            minQuestions={examBoundary.min}
            maxQuestions={examBoundary.max}
          />

          {/* Questions */}
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
                  2. Paper Questions ({selectedQuestions.size} selected / {questions.length} total · {questionPoints || 0} pts)
                </h2>
                <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
                  Only ticked questions are included in the saved paper. Answers &amp; marking guides are auto-populated by the AI Studio.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {questions.length > 0 && (
                  <button type="button"
                    onClick={() => {
                      if (selectedQuestions.size === questions.length) {
                        setSelectedQuestions(new Set());
                      } else {
                        setSelectedQuestions(new Set(questions.map((_, i) => i)));
                      }
                    }}
                    className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 bg-card shadow-sm rounded-xl border border-border">
                    {selectedQuestions.size === questions.length ? 'Deselect All' : 'Select All'}
                  </button>
                )}
                <button type="button" onClick={() => addQuestion('multiple_choice')}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 rounded-xl transition-colors">
                  <PlusIcon className="w-3.5 h-3.5" /> + MCQ
                </button>
                <button type="button" onClick={() => addQuestion('true_false')}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-foreground bg-card hover:bg-muted border border-border rounded-xl transition-colors">
                  + True/False
                </button>
                <button type="button" onClick={() => addQuestion('fill_blank')}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-foreground bg-card hover:bg-muted border border-border rounded-xl transition-colors">
                  + Fill Blank
                </button>
                <button type="button" onClick={() => addQuestion('essay')}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/25 rounded-xl transition-colors">
                  + Theory / Essay
                </button>
              </div>
            </div>

            {/* Chief Examiner Readiness & 1-Click Mark Balancer Bar */}
            {questions.some((q) => q.question_text.trim()) && (() => {
              const audit = auditExamReadiness(questions, selectedQuestions);
              return (
                <div className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-black uppercase tracking-wider text-foreground">
                        Examiner Check:
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-emerald-500/12 border border-emerald-500/25 font-bold text-emerald-800 dark:text-emerald-300">
                        {audit.objectiveCount} Objective
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-amber-500/12 border border-amber-500/25 font-bold text-amber-800 dark:text-amber-300">
                        {audit.theoryCount} Theory
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-muted border border-border font-bold text-foreground">
                        {audit.totalMarks} Marks
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          teacherEdits.current.duration = true;
                          setForm((f) => ({ ...f, duration_minutes: String(audit.recommendedMinutes) }));
                        }}
                        title="Apply Chief Examiner recommended sitting duration"
                        className="px-2 py-0.5 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/25 font-bold text-primary transition-colors"
                      >
                        Est. {audit.recommendedMinutes}m (Apply)
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="font-bold text-muted-foreground">Auto-balance marks:</span>
                      {[20, 40, 60, 100].map((target) => (
                        <button
                          key={target}
                          type="button"
                          disabled={audit.totalQuestions === 0 || target < audit.totalQuestions}
                          onClick={() => handleBalanceMarks(target)}
                          className={`px-2.5 py-1 rounded-lg border font-black transition-colors disabled:opacity-35 ${
                            audit.totalMarks === target
                              ? 'bg-emerald-700 text-white border-emerald-700'
                              : 'bg-muted/40 hover:bg-muted border-border text-foreground'
                          }`}
                        >
                          {target}
                        </button>
                      ))}
                    </div>
                  </div>

                  {audit.isReady ? (
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-800 dark:text-emerald-200">
                      <CheckCircleIcon className="h-4 w-4 shrink-0" />
                      All {audit.totalQuestions} selected questions verified with valid answer keys — ready to publish!
                    </div>
                  ) : audit.issues.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs">
                      <span className="font-black text-amber-900 dark:text-amber-200">
                        {audit.issues.length} question{audit.issues.length === 1 ? '' : 's'} need attention:
                      </span>
                      {audit.issues.slice(0, 8).map((item) => (
                        <button
                          key={`new-issue-${item.index}`}
                          type="button"
                          onClick={() => document.getElementById(`new-q-${item.index}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                          className="rounded-lg border border-amber-500/40 bg-card px-2 py-0.5 text-[11px] font-black text-amber-900 dark:text-amber-200 hover:bg-amber-500/20"
                        >
                          Q{item.index + 1} ({item.reason})
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })()}

            {questions.map((q, qi) => {
              const isSelected = selectedQuestions.has(qi);
              return (
              <div key={qi} id={`new-q-${qi}`} className={`border rounded-xl overflow-hidden transition-all group ${isSelected ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-card shadow-sm border-border hover:bg-white/[0.07]'}`}>
                <div className="flex items-center justify-between px-5 py-3 bg-white/3 border-b border-border">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {/* Selection checkbox */}
                    <button
                      type="button"
                      onClick={() => {
                        const next = new Set(selectedQuestions);
                        if (next.has(qi)) next.delete(qi); else next.add(qi);
                        setSelectedQuestions(next);
                      }}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${isSelected ? 'bg-emerald-500 border-emerald-400' : 'border-border hover:border-emerald-500/50'}`}
                    >
                      {isSelected && <CheckIcon className="w-3 h-3 text-foreground" />}
                    </button>
                    <span className="text-xs font-black text-muted-foreground w-6 tracking-tighter italic">#{qi + 1}</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {q.question_type === 'essay' || q.question_type === 'fill_blank' ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[9px] font-black uppercase text-amber-700 dark:text-amber-300 flex items-center gap-1">
                                <SparklesIcon className="w-2.5 h-2.5" /> Rubric / Manual Eval
                            </span>
                        ) : (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-black uppercase text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                                <CheckCircleIcon className="w-2.5 h-2.5" /> Auto Graded
                            </span>
                        )}
                        {q.cognitiveLevel && (
                          <span className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[9px] font-black uppercase text-primary">
                            {q.cognitiveLevel}
                          </span>
                        )}
                        {q.curriculumTag && (
                          <span className="px-2 py-0.5 rounded-full bg-muted border border-border text-[9px] font-bold text-muted-foreground truncate max-w-[220px]">
                            {q.curriculumTag}
                          </span>
                        )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleAiSolveSingleCard(qi)}
                      disabled={solvingCardIdx === qi || !q.question_text.trim()}
                      title="Use AI to fill options, correct answer, and marking guide for this question"
                      className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-black text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 rounded-lg transition-colors disabled:opacity-40"
                    >
                      {solvingCardIdx === qi ? (
                        <ArrowPathIcon className="w-3 h-3 animate-spin" />
                      ) : (
                        <SparklesIcon className="w-3 h-3" />
                      )}
                      {solvingCardIdx === qi ? 'Solving…' : 'AI Complete'}
                    </button>
                    <button
                      type="button"
                      onClick={() => moveQuestion(qi, -1)}
                      disabled={qi === 0}
                      title="Move question up"
                      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:opacity-25"
                    >
                      <ChevronUpIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveQuestion(qi, 1)}
                      disabled={qi === questions.length - 1}
                      title="Move question down"
                      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:opacity-25"
                    >
                      <ChevronDownIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateQuestion(qi)}
                      className="px-2 py-1 text-[10px] font-bold text-muted-foreground hover:text-foreground bg-card border border-border rounded-lg transition-colors"
                    >
                      Duplicate
                    </button>
                    {questions.length > 1 && (
                      <button type="button" onClick={() => removeQuestion(qi)}
                        className="p-1.5 text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl transition-colors">
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-5 space-y-4">

                <textarea rows={4} value={q.question_text}
                  onChange={e => updateQuestion(qi, { question_text: e.target.value })}
                  placeholder="Enter question text… Use ```python for code blocks, or `inline code`"
                  className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors resize-y font-mono" />
                {(q.question_text.includes('```') || q.question_text.includes('`')) && (
                  <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-2">Preview</p>
                    <CbtMarkdown text={q.question_text} className="text-sm" />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs text-muted-foreground uppercase tracking-widest mb-1">Type</label>
                    <select value={q.question_type}
                      onChange={e => {
                        const questionType = e.target.value;
                        updateQuestion(qi, {
                          question_type: questionType,
                          options: questionType === 'true_false' ? ['True', 'False'] : ['', '', '', ''],
                          correct_answer: '',
                          section: ['essay', 'fill_blank', 'coding_blocks'].includes(questionType) ? 'subjective' : 'objective',
                        });
                      }}
                      className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer">
                      <option value="multiple_choice">Multiple Choice</option>
                      <option value="true_false">True / False</option>
                      <option value="fill_blank">Fill in Blank</option>
                      <option value="essay">Essay</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground uppercase tracking-widest mb-1">Section</label>
                    <select value={q.section}
                      onChange={e => updateQuestion(qi, { section: e.target.value as Question['section'] })}
                      className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer">
                      <option value="objective">Objective — multiple choice / true-false</option>
                      <option value="subjective">Subjective — written / essay answers</option>
                      <option value="practical">Practical — hands-on / lab task</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground uppercase tracking-widest mb-1">Points</label>
                    <input type="number" min="1" value={q.points}
                      onChange={e => updateQuestion(qi, { points: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 transition-colors" />
                  </div>
                  {(q.question_type === 'fill_blank' || q.question_type === 'essay') ? (
                    <div className="sm:col-span-4">
                      <label className="block text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-widest mb-1">
                        {q.question_type === 'fill_blank'
                          ? 'Expected Answer & Marking Guide'
                          : 'Model Answer & Point-by-Point Marking Guide'}
                      </label>
                      <textarea
                        rows={2}
                        value={q.correct_answer}
                        onChange={e => updateQuestion(qi, { correct_answer: e.target.value, marking_guide: e.target.value })}
                        placeholder={q.question_type === 'fill_blank' ? 'Exact expected answer…' : 'e.g. Award 4 marks for algorithm steps, 3 marks for code syntax, 3 marks for explanation…'}
                        className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors resize-y"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs text-muted-foreground uppercase tracking-widest mb-1">
                        Marking Rationale (Optional)
                      </label>
                      <input
                        type="text"
                        value={q.marking_guide || ''}
                        onChange={e => updateQuestion(qi, { marking_guide: e.target.value })}
                        placeholder="Why the selected option is correct…"
                        className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>
                  )}
                </div>

                {q.question_type === 'true_false' && (
                  <div className="flex gap-4">
                    {['True', 'False'].map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => updateQuestion(qi, { correct_answer: opt })}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border font-bold transition-all ${q.correct_answer === opt ? 'bg-emerald-500 border-emerald-400 text-foreground' : 'bg-card shadow-sm border-border text-muted-foreground hover:bg-muted'}`}
                      >
                        {q.correct_answer === opt && <CheckIcon className="w-4 h-4" />}
                        {opt}
                      </button>
                    ))}
                  </div>
                )}

                {q.question_type === 'multiple_choice' && (() => {
                  const matchedCorrect = resolveMcqAnswerToOption(q.correct_answer, q.options);
                  const hasMatchedCorrect = q.options.some((o) => o.trim() !== '' && o === matchedCorrect);
                  return (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="block text-xs text-muted-foreground uppercase tracking-widest">Options (Click A–D to mark the correct answer)</label>
                      {!hasMatchedCorrect && q.options.some((o) => o.trim()) && (
                        <span className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-black text-amber-800 dark:text-amber-200">
                          No answer selected yet — click A–D to pick
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {q.options.map((opt, oi) => {
                        const isCorrect = opt.trim() !== '' && (q.correct_answer === opt || matchedCorrect === opt);
                        const letter = String.fromCharCode(65 + oi);
                        return (
                          <div
                            key={oi}
                            className={`flex items-center gap-2 p-1.5 rounded-xl border transition-all group/opt ${isCorrect ? 'bg-emerald-500/10 border-emerald-500/60 ring-1 ring-emerald-500/30' : 'bg-card shadow-sm border-border hover:border-primary/40'}`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (opt.trim()) updateQuestion(qi, { correct_answer: opt });
                              }}
                              aria-label={`Mark option ${letter} as correct answer`}
                              title={opt.trim() ? `Mark option ${letter} as correct` : 'Type option text first'}
                              className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center flex-shrink-0 transition-all cursor-pointer ${isCorrect ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm' : 'border-border hover:border-emerald-500 text-muted-foreground hover:text-emerald-700'}`}
                            >
                              {isCorrect ? <CheckIcon className="w-4 h-4 font-black" /> : <span className="text-[10px] font-black">{letter}</span>}
                            </button>
                            <input
                              type="text"
                              value={opt}
                              onChange={e => {
                                const newVal = e.target.value;
                                const wasCorrect = isCorrect;
                                updateOption(qi, oi, newVal);
                                if (wasCorrect) updateQuestion(qi, { correct_answer: newVal });
                              }}
                              placeholder={`Enter option ${letter}…`}
                              className="flex-1 min-w-0 bg-transparent border-none px-1 py-1 text-sm text-foreground placeholder-muted-foreground focus:outline-none"
                            />
                            {isCorrect ? (
                              <span className="shrink-0 rounded-md bg-emerald-600/15 px-1.5 py-0.5 text-[9px] font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-wider mr-1">Correct</span>
                            ) : opt.trim() ? (
                              <button
                                type="button"
                                onClick={() => updateQuestion(qi, { correct_answer: opt })}
                                className="shrink-0 opacity-0 group-hover/opt:opacity-100 focus:opacity-100 rounded-md border border-border bg-background px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground hover:text-emerald-700 hover:border-emerald-500/40 mr-1 transition-opacity"
                              >
                                Set
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  );
                })()}
                </div>
              </div>
              );
            })}
          </div>

          {/* Inline Error near Submit */}
          {error && (
            <div ref={bottomErrorRef} role="alert" className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/30 rounded-xl p-4">
              <ExclamationTriangleIcon className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0" />
              <p className="text-rose-600 dark:text-rose-400 text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Sticky Swift Publish & Assign Bar */}
          <div className="sticky bottom-3 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/95 backdrop-blur-xl px-4 py-3 shadow-lg">
            <div className="flex items-center gap-3 min-w-0">
              <Link href={backHref}
                className="px-4 py-2 bg-muted/60 hover:bg-muted text-foreground text-xs font-bold rounded-xl transition-colors">
                {backLabel}
              </Link>
              <div className="hidden sm:block text-xs text-muted-foreground truncate">
                <span className="font-black text-foreground">{questions.filter((q, i) => q.question_text.trim() && selectedQuestions.has(i)).length}</span> selected
                {questionPoints ? <> · <span className="font-bold text-foreground">{questionPoints} pts</span></> : null}
                {form.start_date ? <> · <span className="text-emerald-700 dark:text-emerald-300 font-bold">Scheduled</span></> : null}
              </div>
            </div>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-black rounded-xl transition-all disabled:opacity-50 shadow-md">
              {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
              {saving ? 'Publishing…' : hostKind ? `Save ${hostPaperLabel(hostKind)}` : (form.is_active ? 'Publish & Assign Exam' : 'Save Draft')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
