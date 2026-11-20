// @refresh reset
'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
    ArrowLeftIcon, AcademicCapIcon, PlusIcon, TrashIcon,
    CheckIcon, ArrowPathIcon, ExclamationTriangleIcon, PencilSquareIcon,
    ChevronUpIcon, ChevronDownIcon, SparklesIcon, CheckCircleIcon,
} from '@/lib/icons';
import QuestionAuthoringStudio, { type StudioGeneratedQuestion } from '@/components/cbt/QuestionAuthoringStudio';
import { cbtAnswerMatchesOption } from '@/lib/cbt/grading';
import { dedupeCbtQuestions, resolveMcqAnswerToOption, stripOptionPrefix } from '@/lib/cbt/question-bank-catalog';

function resolveNormalizedOptionAnswer(options: string[], rawAnswer: string): string {
    const cleanOpts = options.map((o) => o.trim()).filter(Boolean);
    const trimmed = (rawAnswer || '').trim();
    if (!trimmed || cleanOpts.length === 0) return trimmed;
    const exact = cleanOpts.find((o) => o === trimmed);
    if (exact) return exact;
    const matchedIdx = cleanOpts.findIndex((opt, idx) => cbtAnswerMatchesOption(opt, idx, trimmed));
    return matchedIdx >= 0 ? cleanOpts[matchedIdx] : trimmed;
}

interface Question {
    id?: string;
    question_text: string;
    question_type: string;
    options: string[];
    correct_answer: string;
    points: number;
    order_index: number;
    metadata?: Record<string, unknown> | null;
    _new?: boolean;
    _deleted?: boolean;
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

export default function EditExamPage() {
    const params = useParams();
    const id = params?.id as string;
    const router = useRouter();
    const { profile, loading: authLoading } = useAuth();
    const [programs, setPrograms] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const bottomErrorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (error && bottomErrorRef.current) {
            bottomErrorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [error]);
    const [success, setSuccess] = useState('');
    const [definitionLocked, setDefinitionLocked] = useState(false);
    const [availableClasses, setAvailableClasses] = useState<AssessmentClassOption[]>([]);
    const [originalClassId, setOriginalClassId] = useState('');
    const [examSchoolId, setExamSchoolId] = useState('');
    const [assessmentScope, setAssessmentScope] = useState<'class_result' | 'practice'>('class_result');
    const [examMetadata, setExamMetadata] = useState<Record<string, unknown>>({});

    const [form, setForm] = useState({
        title: '',
        description: '',
        program_id: '',
        course_id: '',
        duration_minutes: '60',
        passing_score: '70',
        start_date: '',
        end_date: '',
        is_active: true,
        class_id: '',
    });
    const [questions, setQuestions] = useState<Question[]>([]);
    const [courses, setCourses] = useState<any[]>([]);
    const [solvingCardIdx, setSolvingCardIdx] = useState<number | null>(null);

    const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

    useEffect(() => {
        if (authLoading || !profile || !id) return;
        const db = createClient();
        
        // Fetch Exam + Questions via admin API; Programs via client
        Promise.all([
            fetch(`/api/cbt/exams/${id}`, { cache: 'no-store' }).then(async response => {
                const payload = await response.json();
                if (!response.ok) throw new Error(payload.error || 'Exam not found');
                return payload;
            }),
            db.from('programs').select('id, name').eq('is_active', true).order('name'),
        ]).then(([examJson, progRes]) => {
            const e = examJson.data;
            if (e) {
                const metadata = e.metadata && typeof e.metadata === 'object' && !Array.isArray(e.metadata)
                    ? e.metadata as Record<string, unknown>
                    : {};
                setDefinitionLocked(e.definition_locked === true);
                setForm({
                    title: e.title ?? '',
                    description: e.description ?? '',
                    program_id: e.program_id ?? '',
                    course_id: e.course_id ?? '',
                    duration_minutes: String(e.duration_minutes ?? 60),
                    passing_score: String(e.passing_score ?? 70),
                    start_date: e.start_date ? new Date(e.start_date).toISOString().slice(0, 16) : '',
                    end_date: e.end_date ? new Date(e.end_date).toISOString().slice(0, 16) : '',
                    is_active: e.is_active ?? true,
                    class_id: e.class_id ?? '',
                });
                setOriginalClassId(e.class_id ?? '');
                setExamSchoolId(e.school_id ?? '');
                setExamMetadata(metadata);
                setAssessmentScope(metadata.assessment_scope === 'practice' || metadata.result_eligible === false
                    ? 'practice'
                    : 'class_result');
                setQuestions([...(e.cbt_questions ?? [])].sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0)).map((q: any) => ({
                    ...q,
                    options: Array.isArray(q.options) ? q.options : ['', '', '', ''],
                })));
            } else {
                setError('Exam not found.');
            }
            setPrograms(progRes.data ?? []);
        }).catch((loadError: any) => {
            setError(loadError.message || 'Could not load this assessment.');
        }).finally(() => setLoading(false));

        // Fetch courses for linking
        let courseQuery = db.from('courses').select('id, title, program_id, school_id, programs(name)').eq('is_active', true);
        if (profile?.school_id) {
            courseQuery = courseQuery.or(`school_id.eq.${profile.school_id},school_id.is.null`);
        }
        courseQuery.order('title').then(({ data }) => setCourses(data ?? []));

        let classQuery = db
            .from('classes')
            .select('id,name,school_id,program_id,current_course_id,academic_offering_id,offering_period_id,status')
            .order('name');
        if (profile.role === 'teacher') classQuery = classQuery.eq('teacher_id', profile.id);
        classQuery.then(({ data }) => setAvailableClasses(
            ((data ?? []) as AssessmentClassOption[]).filter(item => item.status !== 'archived'),
        ));
    }, [profile?.id, authLoading, id]);

    const addQuestion = (questionType: string = 'multiple_choice') => {
        const manual = ['essay', 'fill_blank', 'coding_blocks'].includes(questionType);
        setQuestions(q => [...q, {
            question_text: '',
            question_type: questionType,
            options: questionType === 'true_false' ? ['True', 'False'] : ['', '', '', ''],
            correct_answer: questionType === 'true_false' ? 'True' : '',
            points: questionType === 'essay' ? 10 : 5,
            order_index: q.filter(item => !item._deleted).length + 1,
            metadata: { section: manual ? 'subjective' : 'objective' },
            _new: true,
        }]);
    };

    const handleStudioQuestions = (incoming: StudioGeneratedQuestion[], importMode: 'append' | 'replace') => {
        if (!incoming.length) return;
        const replaceExisting = importMode === 'replace';
        setQuestions(prev => {
            const deleted = prev.filter(q => q._deleted);
            const active = prev.filter(q => !q._deleted);
            const nextQuestions: Question[] = incoming.map((q, idx) => {
                const cbtType = q.question_type === 'short_answer' ? 'fill_blank' : q.question_type;
                const cleanedOpts =
                    cbtType === 'true_false'
                        ? ['True', 'False']
                        : cbtType === 'multiple_choice'
                            ? Array.isArray(q.options) && q.options.length >= 2
                                ? q.options.map((o) => stripOptionPrefix(o))
                                : ['', '', '', '']
                            : ['', '', '', ''];
                const rawAns = String(q.correct_answer || q.marking_guide || '').trim();
                const resolvedAns =
                    cbtType === 'multiple_choice'
                        ? resolveMcqAnswerToOption(rawAns, cleanedOpts)
                        : cbtType === 'true_false'
                            ? (/^false$/i.test(rawAns) ? 'False' : 'True')
                            : rawAns;
                return {
                    question_text: q.question_text,
                    question_type: cbtType,
                    options: cleanedOpts,
                    correct_answer: resolvedAns,
                    points: Math.max(1, Number(q.points) || (['essay', 'coding_blocks'].includes(cbtType) ? 10 : 5)),
                    order_index: idx + 1,
                    metadata: q.metadata ?? {
                        section: q.section || (['essay', 'fill_blank', 'coding_blocks'].includes(cbtType) ? 'subjective' : 'objective'),
                        ...(q.marking_guide ? { marking_guide: q.marking_guide } : {}),
                        ...(q.curriculumTag ? { curriculum_tag: q.curriculumTag } : {}),
                        ...(q.cognitiveLevel ? { cognitive_level: q.cognitiveLevel } : {}),
                    },
                    _new: true,
                };
            });
            if (replaceExisting) {
                const { unique: uniqueNext } = dedupeCbtQuestions(nextQuestions, []);
                const markedDeleted = active.filter(q => q.id && !q._new).map(q => ({ ...q, _deleted: true }));
                return [...uniqueNext.map((q, i) => ({ ...q, order_index: i + 1 })), ...deleted, ...markedDeleted];
            }
            const cleanedActive = active.filter(q => q.question_text.trim().length > 0);
            const { unique: uniqueNext } = dedupeCbtQuestions(
                nextQuestions,
                cleanedActive.map((item) => item.question_text),
            );
            const combined = [...cleanedActive, ...uniqueNext].map((q, idx) => ({ ...q, order_index: idx + 1 }));
            return [...combined, ...deleted];
        });
    };

    const handleAiSolveSingleCard = async (realIdx: number) => {
        const target = questions[realIdx];
        if (!target || !target.question_text.trim()) {
            setError('Type the question text on this card first, then click AI Complete.');
            return;
        }
        setSolvingCardIdx(realIdx);
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
                    topic: form.title || selectedCourse?.title || 'Assessment Question',
                    questionCount: 1,
                    mcqCount: isObj ? 1 : 0,
                    theoryCount: isObj ? 0 : 1,
                    courseName: selectedCourse?.title || undefined,
                    subject: selectedCourse?.title || undefined,
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
                    ? solved.options.map((o: unknown) => stripOptionPrefix(String(o ?? '')))
                    : target.options.map((o) => stripOptionPrefix(o));

            const rawSolved = String(solved.correct_answer || solved.answer || solved.marking_guide || target.correct_answer || '').trim();
            const resolvedAns = target.question_type === 'multiple_choice'
                ? resolveMcqAnswerToOption(rawSolved, nextOpts)
                : target.question_type === 'true_false'
                    ? (/^false$/i.test(rawSolved) ? 'False' : 'True')
                    : rawSolved;

            updateQuestion(realIdx, {
                options: nextOpts,
                correct_answer: resolvedAns,
                metadata: {
                    ...(target.metadata ?? {}),
                    marking_guide: String(solved.marking_guide || solved.metadata?.marking_guide || solved.explanation || target.metadata?.marking_guide || ''),
                },
            });
        } catch (e: any) {
            setError(e?.message || 'AI could not complete this question right now.');
        } finally {
            setSolvingCardIdx(null);
        }
    };

    const removeQuestion = (i: number) => {
        setQuestions(prev => {
            const updated = [...prev];
            if (updated[i].id && !updated[i]._new) {
                // Mark for deletion
                updated[i] = { ...updated[i], _deleted: true };
            } else {
                updated.splice(i, 1);
            }
            return updated;
        });
    };

    const updateQuestion = (i: number, patch: Partial<Question>) =>
        setQuestions(prev => prev.map((item, idx) => idx === i ? { ...item, ...patch } : item));

    const updateOption = (qi: number, oi: number, val: string) =>
        setQuestions(prev => prev.map((item, idx) => idx === qi
            ? { ...item, options: item.options.map((o, j) => j === oi ? val : o) } : item));

    const moveQuestion = (i: number, dir: -1 | 1) => {
        const deleted = questions.filter(q => q._deleted);
        const newArr = [...questions.filter(q => !q._deleted)];
        const target = i + dir;
        if (target < 0 || target >= newArr.length) return;
        [newArr[i], newArr[target]] = [newArr[target], newArr[i]];
        setQuestions([
            ...newArr.map((q, idx) => ({ ...q, order_index: idx + 1 })),
            ...deleted,
        ]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.title.trim() || !form.program_id) {
            setError('Title and programme are required.');
            return;
        }
        const activeQuestions = questions.filter(q => !q._deleted);
        if (!definitionLocked && activeQuestions.length === 0) {
            setError('Add at least one question.');
            return;
        }
        const missingTextNums = activeQuestions
            .map((q, idx) => (!q.question_text.trim() ? `Q${idx + 1}` : null))
            .filter(Boolean);
        if (!definitionLocked && missingTextNums.length > 0) {
            setError(`Question(s) ${missingTextNums.join(', ')} need question text before this assessment can be saved.`);
            return;
        }
        const normalizedActiveQuestions = activeQuestions.map((q) => {
            if (!['multiple_choice', 'true_false'].includes(q.question_type)) return q;
            const cleanOpts = q.options.map((o) => o.trim()).filter(Boolean);
            return {
                ...q,
                options: cleanOpts,
                correct_answer: resolveNormalizedOptionAnswer(cleanOpts, q.correct_answer),
            };
        });
        if (!definitionLocked && form.is_active) {
            const badObjNums = normalizedActiveQuestions
                .map((q, idx) => {
                    if (!['multiple_choice', 'true_false'].includes(q.question_type)) return null;
                    const options = q.options.filter((option) => option.trim());
                    if (options.length < 2 || !q.correct_answer.trim() || !options.includes(q.correct_answer)) {
                        return `Q${idx + 1}`;
                    }
                    return null;
                })
                .filter(Boolean);
            if (badObjNums.length > 0) {
                setError(`Question(s) ${badObjNums.join(', ')} need at least two options and a selected correct answer before publishing.`);
                return;
            }
        }
        const durationMinutes = parseInt(form.duration_minutes, 10);
        const passingScore = parseInt(form.passing_score, 10);
        if (!definitionLocked && (!Number.isFinite(durationMinutes) || durationMinutes < 5)) {
            setError('Enter a valid assessment duration of at least 5 minutes.');
            return;
        }
        if (!definitionLocked && (!Number.isFinite(passingScore) || passingScore < 1 || passingScore > 100)) {
            setError('Passing score must be between 1% and 100%.');
            return;
        }
        if (form.start_date && form.end_date && new Date(form.end_date) <= new Date(form.start_date)) {
            setError('End date and time must be after the start date and time.');
            return;
        }
        if (assessmentScope === 'class_result' && !originalClassId && !form.class_id) {
            setError('Choose the class receiving these results, or select Practice only.');
            return;
        }
        setSaving(true);
        setError(null);
        setSuccess('');
        try {
            const payload: Record<string, unknown> = {
                title: form.title.trim(),
                description: form.description.trim() || null,
                is_active: form.is_active,
                start_date: form.start_date ? new Date(form.start_date).toISOString() : null,
                end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
                metadata: {
                    ...examMetadata,
                    assessment_scope: originalClassId ? assessmentScope : assessmentScope,
                    result_eligible: assessmentScope === 'class_result',
                },
            };
            if (!definitionLocked) {
              payload.program_id = form.program_id;
              payload.course_id = form.course_id || null;
              payload.duration_minutes = durationMinutes;
              payload.passing_score = passingScore;
              payload.total_questions = activeQuestions.length;
              payload.deletedQuestionIds = questions
                .filter((q: any) => q._deleted && q.id)
                .map((q: any) => q.id);
              payload.questions = normalizedActiveQuestions.map((q: any, i: number) => ({
                    id: q._new ? undefined : q.id,
                    question_text: q.question_text.trim(),
                    question_type: q.question_type,
                    options: ['multiple_choice', 'true_false'].includes(q.question_type)
                      ? q.options.filter((o: string) => o.trim())
                      : null,
                    correct_answer: q.correct_answer.trim(),
                    points: q.points,
                    order_index: q.order_index ?? i + 1,
                    metadata: q.metadata ?? null,
                }));
            }
            if (!originalClassId && form.class_id) payload.class_id = form.class_id;

            const res = await fetch(`/api/cbt/exams/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to update exam'); }

            setSuccess('Exam updated successfully!');
            setTimeout(() => router.push(`/dashboard/cbt/${id}`), 1200);
        } catch (e: any) {
            setError(e.message ?? 'Failed to update exam');
        } finally {
            setSaving(false);
        }
    };

    const visibleQuestions = questions.filter(q => !q._deleted);

    if (authLoading || loading) return (
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
        <div className="min-h-screen bg-background text-foreground mobile-page-root">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-4">
                        <Link href={`/dashboard/cbt/${id}`} className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
                            <ArrowLeftIcon className="w-4 h-4" /> Back to Exam
                        </Link>
                        {(originalClassId || form.class_id) && (
                            <Link href={`/dashboard/classes/${originalClassId || form.class_id}?operation=assessment`} className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline">
                                ← Back to Class Assessment
                            </Link>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {!definitionLocked && (
                            <button
                                type="button"
                                onClick={async () => {
                                    if (!confirm(`Delete "${form.title || 'this exam'}" permanently? This cannot be undone.`)) return;
                                    setError(null);
                                    const res = await fetch(`/api/cbt/exams/${id}`, { method: 'DELETE' });
                                    const json = await res.json().catch(() => ({}));
                                    if (!res.ok) {
                                        setError(json?.error || 'Could not delete this exam.');
                                        return;
                                    }
                                    router.push('/dashboard/cbt');
                                }}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-black uppercase tracking-wider rounded-xl transition-colors"
                            >
                                <TrashIcon className="w-4 h-4" /> Delete
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleSubmit as any}
                            disabled={saving}
                            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 shadow-md"
                        >
                            {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                            {saving ? 'Saving…' : 'Save Changes'}
                        </button>
                    </div>
                </div>

                <div className="relative overflow-hidden border border-border/80 bg-card/90 backdrop-blur-2xl rounded-3xl p-6 sm:p-8 shadow-xl">
                    <div className="absolute -right-32 -top-32 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
                    <div className="relative z-10 flex items-start gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-indigo-600 text-white border border-primary/30 flex items-center justify-center shadow-xl shadow-primary/30 shrink-0">
                            <AcademicCapIcon className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <span className="inline-block px-3 py-1 bg-brand-red-accent text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-sm mb-2">
                                CBT Exam Builder &amp; Questions
                            </span>
                            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-foreground leading-none">Edit CBT Exam</h1>
                            <p className="text-muted-foreground text-sm mt-1.5 font-medium">Update exam settings, questions, and grading criteria</p>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
                        <ExclamationTriangleIcon className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0" />
                        <p className="text-rose-600 dark:text-rose-400 text-sm">{error}</p>
                    </div>
                )}
                {success && (
                    <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                        <CheckIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                        <p className="text-emerald-600 dark:text-emerald-400 text-sm font-semibold">{success}</p>
                    </div>
                )}
                {definitionLocked && (
                    <div className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
                        <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                        <div>
                            <p className="text-sm font-bold text-foreground">Assessment definition protected</p>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                A learner has started this assessment. Questions, points, course, duration, and pass mark are locked to preserve evidence. You may still update the title, description, schedule, or publication status.
                            </p>
                        </div>
                    </div>
                )}

                <div className={`rounded-2xl border p-5 ${originalClassId || assessmentScope === 'practice' ? 'border-emerald-500/25 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
                    <div className="flex items-start gap-3">
                        {originalClassId || assessmentScope === 'practice'
                            ? <CheckCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                            : <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />}
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-foreground">
                                {originalClassId
                                    ? assessmentScope === 'practice' ? 'Class practice — excluded from reports' : 'Connected to the central result pipeline'
                                    : assessmentScope === 'practice' ? 'Practice assessment — no result link required' : 'Class result link needs attention'}
                            </p>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                {originalClassId
                                    ? assessmentScope === 'practice'
                                        ? 'Learners can use this assessment for feedback, while its attempts remain outside Auto-fill.'
                                        : 'The class, academic offering and period travel with every attempt. Existing learner evidence cannot be moved to another class.'
                                    : assessmentScope === 'practice'
                                        ? 'Its attempts remain preserved for learning and feedback, but never change an official report.'
                                        : 'This older assessment is preserved, but its attempts cannot enter Auto-fill until you confirm the correct class.'}
                            </p>
                            {!originalClassId && (
                                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <button type="button" onClick={() => setAssessmentScope('class_result')}
                                        className={`rounded-xl border px-4 py-3 text-left text-sm font-bold ${assessmentScope === 'class_result' ? 'border-emerald-500/60 bg-emerald-500/10 text-foreground' : 'border-border bg-card text-muted-foreground'}`}>
                                        Use in class results
                                    </button>
                                    <button type="button" onClick={() => {
                                        setAssessmentScope('practice');
                                        setForm(current => ({ ...current, class_id: '' }));
                                    }}
                                        className={`rounded-xl border px-4 py-3 text-left text-sm font-bold ${assessmentScope === 'practice' ? 'border-sky-500/60 bg-sky-500/10 text-foreground' : 'border-border bg-card text-muted-foreground'}`}>
                                        Keep as practice only
                                    </button>
                                </div>
                            )}
                            {assessmentScope === 'class_result' && (
                              <>
                            <label className="mt-4 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                                Result class
                            </label>
                            <select
                                value={form.class_id}
                                onChange={event => setForm(current => ({ ...current, class_id: event.target.value }))}
                                disabled={!!originalClassId}
                                className="mt-2 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground focus:outline-none focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <option value="">Choose the class that owns these results…</option>
                                {availableClasses
                                    .filter(item => (!examSchoolId || item.school_id === examSchoolId)
                                        && (!form.program_id || !item.program_id || item.program_id === form.program_id))
                                    .map(item => (
                                        <option key={item.id} value={item.id} disabled={!item.academic_offering_id || !item.offering_period_id}>
                                            {item.name}{item.academic_offering_id && item.offering_period_id ? '' : ' — repair class setup first'}
                                        </option>
                                    ))}
                            </select>
                            {!originalClassId && (
                                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                                    Linking repairs context only. It does not recalculate, replace or delete any learner mark.
                                </p>
                            )}
                              </>
                            )}
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Exam Details */}
                    <div className="bg-card shadow-sm border border-border rounded-xl p-6 space-y-5">
                        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Exam Details</h2>

                        <div>
                            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                                Exam Title <span className="text-rose-600 dark:text-rose-400">*</span>
                            </label>
                            <input type="text" required value={form.title}
                                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors" />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                                    Programme <span className="text-rose-600 dark:text-rose-400">*</span>
                                </label>
                                <select required value={form.program_id}
                                    onChange={e => {
                                        const pid = e.target.value;
                                        const currentCourse = courses.find(x => x.id === form.course_id);
                                        setForm(f => ({
                                            ...f,
                                            program_id: pid,
                                            course_id: currentCourse?.program_id === pid ? f.course_id : '',
                                        }));
                                    }}
                                    disabled={definitionLocked}
                                    className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60">
                                    <option value="">Select programme…</option>
                                    {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                                    Course {form.program_id ? <span className="text-muted-foreground">(optional for programme-wide assessments)</span> : <span className="text-muted-foreground">(select programme first)</span>}
                                </label>
                                <select value={form.course_id}
                                    onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))}
                                    disabled={!form.program_id || definitionLocked}
                                    className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-40">
                                    <option value="">{form.program_id ? 'Select a course…' : '— pick a programme first —'}</option>
                                    {courses.filter(c => c.program_id === form.program_id)
                                        .map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Duration (min)</label>
                                <input type="number" min="5" value={form.duration_minutes}
                                    onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))}
                                    disabled={definitionLocked}
                                    className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 transition-colors disabled:cursor-not-allowed disabled:opacity-60" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Passing Score (%)</label>
                                <input type="number" min="1" max="100" value={form.passing_score}
                                    onChange={e => setForm(f => ({ ...f, passing_score: e.target.value }))}
                                    disabled={definitionLocked}
                                    className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 transition-colors disabled:cursor-not-allowed disabled:opacity-60" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Status</label>
                                <select value={form.is_active ? 'active' : 'inactive'}
                                    onChange={e => setForm(f => ({ ...f, is_active: e.target.value === 'active' }))}
                                    className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer">
                                    <option value="active">Published</option>
                                    <option value="inactive">Draft / inactive</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Start Date/Time</label>
                                <input type="datetime-local" value={form.start_date}
                                    onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                                    className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 transition-colors" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">End Date/Time</label>
                                <input type="datetime-local" value={form.end_date}
                                    onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                                    className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 transition-colors" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Description</label>
                            <textarea rows={3} value={form.description}
                                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors resize-y" />
                        </div>
                    </div>

                    {/* ── AI Question Designer & Blueprint Studio ── */}
                    {!definitionLocked && (
                        <QuestionAuthoringStudio
                            mode="cbt"
                            classId={form.class_id || originalClassId || null}
                            className={availableClasses.find(c => c.id === (form.class_id || originalClassId))?.name ?? null}
                            programId={form.program_id}
                            programName={programs.find(p => p.id === form.program_id)?.name ?? ''}
                            courseId={form.course_id}
                            courseTitle={courses.find(c => c.id === form.course_id)?.title ?? ''}
                            initialTopic={form.title}
                            currentQuestions={visibleQuestions}
                            existingQuestionTexts={visibleQuestions.map(q => q.question_text)}
                            onImportQuestions={handleStudioQuestions}
                            onUpdateExamMeta={(meta) => {
                                if (!form.title.trim() && meta.title) setForm(f => ({ ...f, title: meta.title! }));
                            }}
                        />
                    )}

                    {/* ── Question Canvas ── */}
                    <fieldset disabled={definitionLocked} className="space-y-4 disabled:opacity-70">
                        <div className="space-y-3 bg-card shadow-sm border border-border rounded-2xl px-5 py-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                                <h2 className="font-black text-foreground">Exam Paper Questions</h2>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {visibleQuestions.length} question{visibleQuestions.length !== 1 ? 's' : ''} ({visibleQuestions.filter(q => ['multiple_choice', 'true_false'].includes(q.question_type)).length} objective · {visibleQuestions.filter(q => !['multiple_choice', 'true_false'].includes(q.question_type)).length} theory) ·&nbsp;
                                    {visibleQuestions.reduce((s, q) => s + (q.points || 0), 0)} total points
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                                <button type="button" onClick={() => addQuestion('multiple_choice')}
                                    className="flex items-center gap-1 px-3 py-2 text-xs font-black text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 rounded-xl transition-colors">
                                    <PlusIcon className="w-3.5 h-3.5" /> + MCQ
                                </button>
                                <button type="button" onClick={() => addQuestion('true_false')}
                                    className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-foreground bg-muted/60 hover:bg-muted border border-border rounded-xl transition-colors">
                                    + True/False
                                </button>
                                <button type="button" onClick={() => addQuestion('fill_blank')}
                                    className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-foreground bg-muted/60 hover:bg-muted border border-border rounded-xl transition-colors">
                                    + Fill Blank
                                </button>
                                <button type="button" onClick={() => addQuestion('essay')}
                                    className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 rounded-xl transition-colors">
                                    + Theory / Essay
                                </button>
                            </div>
                        </div>
                        {visibleQuestions.length > 0 && (() => {
                            const issues = visibleQuestions.map((q, idx) => {
                                if (!q.question_text.trim()) return { idx, reason: 'missing text' };
                                if (['multiple_choice', 'true_false'].includes(q.question_type)) {
                                    const cleanOpts = q.options.map((o) => o.trim()).filter(Boolean);
                                    const resolved = resolveNormalizedOptionAnswer(cleanOpts, q.correct_answer);
                                    if (cleanOpts.length < 2) return { idx, reason: 'needs 2+ options' };
                                    if (!resolved || !cleanOpts.includes(resolved)) return { idx, reason: 'missing answer key' };
                                }
                                return null;
                            }).filter(Boolean) as Array<{ idx: number; reason: string }>;

                            if (issues.length === 0) {
                                return (
                                    <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-800 dark:text-emerald-200">
                                        <CheckCircleIcon className="h-4 w-4 shrink-0" />
                                        All {visibleQuestions.length} questions verified — ready to deploy to students!
                                    </div>
                                );
                            }
                            return (
                                <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs">
                                    <span className="font-black text-amber-900 dark:text-amber-200">
                                        {issues.length} question{issues.length === 1 ? '' : 's'} need attention before publishing:
                                    </span>
                                    {issues.map((item) => (
                                        <button
                                            key={`issue-${item.idx}`}
                                            type="button"
                                            onClick={() => document.getElementById(`edit-q-${item.idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                                            className="rounded-lg border border-amber-500/40 bg-card px-2 py-0.5 text-[11px] font-black text-amber-900 dark:text-amber-200 hover:bg-amber-500/20"
                                        >
                                            Q{item.idx + 1} ({item.reason})
                                        </button>
                                    ))}
                                </div>
                            );
                        })()}
                        </div>

                        {visibleQuestions.length === 0 && (
                            <div className="text-center py-16 bg-card shadow-sm border border-dashed border-border rounded-xl">
                                <PencilSquareIcon className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                                <p className="text-muted-foreground text-sm">No questions yet. Click "Add Question" to begin.</p>
                            </div>
                        )}

                        {visibleQuestions.map((q, qi) => (
                            <div key={q.id ?? `new-${qi}`} id={`edit-q-${qi}`} className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
                                {/* Question header */}
                                <div className="flex items-center justify-between px-5 py-3 bg-white/3 border-b border-border">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-xs font-black text-muted-foreground w-6 tracking-tighter italic mr-1">#{qi + 1}</span>
                                            {q.question_type === 'essay' || q.question_type === 'fill_blank' ? (
                                                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[9px] font-black uppercase text-amber-600 dark:text-amber-400 italic flex items-center gap-1">
                                                    <SparklesIcon className="w-2.5 h-2.5" /> Manual Eval
                                                </span>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-black uppercase text-emerald-600 dark:text-emerald-400 italic flex items-center gap-1">
                                                    <CheckCircleIcon className="w-2.5 h-2.5" /> Auto Graded
                                                </span>
                                            )}
                                        </div>
                                        {q._new && (
                                            <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 text-[9px] font-black uppercase tracking-widest italic">
                                                New
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => handleAiSolveSingleCard(questions.indexOf(q))}
                                            disabled={solvingCardIdx === questions.indexOf(q) || !q.question_text.trim()}
                                            title="Use AI to fill options, correct answer, and marking guide for this question"
                                            className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-black text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 rounded-lg transition-colors disabled:opacity-40"
                                        >
                                            {solvingCardIdx === questions.indexOf(q) ? (
                                                <ArrowPathIcon className="w-3 h-3 animate-spin" />
                                            ) : (
                                                <SparklesIcon className="w-3 h-3" />
                                            )}
                                            {solvingCardIdx === questions.indexOf(q) ? 'Solving…' : 'AI Complete'}
                                        </button>
                                        <button type="button" onClick={() => moveQuestion(qi, -1)} disabled={qi === 0}
                                            className="p-1.5 text-muted-foreground hover:text-muted-foreground hover:bg-muted rounded-xl transition-colors disabled:opacity-20">
                                            <ChevronUpIcon className="w-3.5 h-3.5" />
                                        </button>
                                        <button type="button" onClick={() => moveQuestion(qi, 1)} disabled={qi === visibleQuestions.length - 1}
                                            className="p-1.5 text-muted-foreground hover:text-muted-foreground hover:bg-muted rounded-xl transition-colors disabled:opacity-20">
                                            <ChevronDownIcon className="w-3.5 h-3.5" />
                                        </button>
                                        <button type="button" onClick={() => removeQuestion(questions.indexOf(q))}
                                            className="p-1.5 text-rose-600/60 dark:text-rose-400/60 bg-rose-500/10 hover:bg-rose-500/20 hover:text-rose-600 dark:hover:text-rose-400 rounded-xl transition-colors">
                                            <TrashIcon className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>

                                <div className="p-5 space-y-4">
                                    <textarea rows={4} value={q.question_text}
                                        onChange={e => updateQuestion(questions.indexOf(q), { question_text: e.target.value })}
                                        placeholder="Enter question text…"
                                        className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors resize-y" />

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-xs text-muted-foreground uppercase tracking-widest mb-1">Type</label>
                                            <select value={q.question_type}
                                                onChange={e => {
                                                    const questionType = e.target.value;
                                                    const manual = ['essay', 'fill_blank', 'coding_blocks'].includes(questionType);
                                                    updateQuestion(questions.indexOf(q), {
                                                        question_type: questionType,
                                                        options: questionType === 'true_false' ? ['True', 'False'] : ['', '', '', ''],
                                                        correct_answer: '',
                                                        metadata: {
                                                            ...(q.metadata ?? {}),
                                                            section: manual ? 'subjective' : 'objective',
                                                        },
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
                                            <select
                                                value={String(q.metadata?.section ?? (['essay', 'fill_blank', 'coding_blocks'].includes(q.question_type) ? 'subjective' : 'objective'))}
                                                onChange={e => updateQuestion(questions.indexOf(q), {
                                                    metadata: { ...(q.metadata ?? {}), section: e.target.value },
                                                })}
                                                className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer"
                                            >
                                                <option value="objective">Objective</option>
                                                <option value="subjective">Subjective</option>
                                                <option value="practical">Practical</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-muted-foreground uppercase tracking-widest mb-1">Points</label>
                                            <input type="number" min="1" value={q.points}
                                                onChange={e => updateQuestion(questions.indexOf(q), { points: parseInt(e.target.value) || 1 })}
                                                className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 transition-colors" />
                                        </div>
                                        {(q.question_type === 'fill_blank' || q.question_type === 'essay') && (
                                            <div className="sm:col-span-3 space-y-3">
                                                <div>
                                                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">
                                                        {q.question_type === 'essay' ? 'Model Answer & Point-by-Point Marking Guide' : 'Correct Answer'}
                                                    </label>
                                                    {q.question_type === 'essay' ? (
                                                        <textarea rows={3} value={q.correct_answer}
                                                            onChange={e => updateQuestion(questions.indexOf(q), {
                                                                correct_answer: e.target.value,
                                                                metadata: { ...(q.metadata ?? {}), marking_guide: e.target.value },
                                                            })}
                                                            placeholder="E.g. Award 2 marks for defining the concept, 2 marks for code syntax, 1 mark for output…"
                                                            className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors resize-y" />
                                                    ) : (
                                                        <input type="text" value={q.correct_answer}
                                                            onChange={e => updateQuestion(questions.indexOf(q), { correct_answer: e.target.value })}
                                                            placeholder="Exact answer…"
                                                            className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors" />
                                                    )}
                                                </div>
                                                {q.question_type === 'fill_blank' && (
                                                    <div>
                                                        <label className="block text-xs text-muted-foreground uppercase tracking-widest mb-1">
                                                            Marking Guide / Acceptable Variants (optional)
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={String(q.metadata?.marking_guide ?? '')}
                                                            onChange={e => updateQuestion(questions.indexOf(q), {
                                                                metadata: { ...(q.metadata ?? {}), marking_guide: e.target.value },
                                                            })}
                                                            placeholder="E.g. Accept case-insensitive spelling or synonym…"
                                                            className="w-full px-3 py-2 bg-card shadow-sm border border-border rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-emerald-500"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {q.question_type === 'true_false' && (
                                        <div className="flex gap-4">
                                            {['True', 'False'].map(opt => (
                                                <button
                                                    key={opt}
                                                    type="button"
                                                    onClick={() => updateQuestion(questions.indexOf(q), { correct_answer: opt })}
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
                                        const hasMatchedCorrect = q.options.some((o) => o.trim() !== '' && (q.correct_answer === o || matchedCorrect === o));
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
                                                                    if (opt.trim()) updateQuestion(questions.indexOf(q), { correct_answer: opt });
                                                                }}
                                                                aria-label={`Mark option ${letter} as correct answer`}
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
                                                                    updateOption(questions.indexOf(q), oi, newVal);
                                                                    if (wasCorrect) updateQuestion(questions.indexOf(q), { correct_answer: newVal });
                                                                }}
                                                                placeholder={`Enter option ${letter}…`}
                                                                className="flex-1 min-w-0 bg-transparent border-none px-1 py-1 text-sm text-foreground placeholder-muted-foreground focus:outline-none"
                                                            />
                                                            {isCorrect ? (
                                                                <span className="shrink-0 rounded-md bg-emerald-600/15 px-1.5 py-0.5 text-[9px] font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-wider mr-1">Correct</span>
                                                            ) : opt.trim() ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => updateQuestion(questions.indexOf(q), { correct_answer: opt })}
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
                        ))}
                    </fieldset>

                    {/* Inline Error near Submit */}
                    {error && (
                        <div ref={bottomErrorRef} role="alert" className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/30 rounded-xl p-4">
                            <ExclamationTriangleIcon className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0" />
                            <p className="text-rose-600 dark:text-rose-400 text-sm font-medium">{error}</p>
                        </div>
                    )}

                    {/* Sticky Save Changes Bar */}
                    <div className="sticky bottom-3 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/95 backdrop-blur-xl px-4 py-3 shadow-lg">
                        <div className="flex items-center gap-3 min-w-0">
                            <Link href={`/dashboard/cbt/${id}`}
                                className="px-4 py-2 bg-muted/60 hover:bg-muted text-foreground text-xs font-bold rounded-xl transition-colors">
                                Cancel
                            </Link>
                            <span className="hidden sm:inline text-xs text-muted-foreground">
                                <strong className="text-foreground">{visibleQuestions.length}</strong> question{visibleQuestions.length === 1 ? '' : 's'} · <strong className="text-foreground">{visibleQuestions.reduce((s, q) => s + (Number(q.points) || 0), 0)}</strong> pts
                            </span>
                        </div>
                        <button type="submit" disabled={saving}
                            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-black rounded-xl transition-all disabled:opacity-50 shadow-md">
                            {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                            {saving ? 'Saving…' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
