'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  SparklesIcon,
  BookOpenIcon,
  AcademicCapIcon,
  CheckIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
} from '@/lib/icons';
import { extractPdfText } from '@/lib/pdf/extract-text';
import CbtMarkdown from '@/components/cbt/CbtMarkdown';
import {
  buildAssessmentBlueprint,
  buildCurriculumAlignmentBrief,
  filterPremadeQuestions,
  parsePremadeQuestionsFromText,
  resolveMcqAnswerToOption,
  type AssessmentBlueprint,
  type CurriculumWeekItem,
  type PremadeQuestionItem,
} from '@/lib/cbt/question-bank-catalog';

export interface StudioGeneratedQuestion {
  question_text: string;
  question_type: 'multiple_choice' | 'true_false' | 'fill_blank' | 'short_answer' | 'essay';
  options: string[];
  correct_answer: string;
  marking_guide?: string;
  points: number;
  section: 'objective' | 'subjective' | 'practical';
  explanation?: string;
  curriculumTag?: string;
  weekNumber?: number | null;
  cognitiveLevel?: 'foundation' | 'application' | 'reasoning';
  metadata?: Record<string, any> | null;
}

interface QuestionAuthoringStudioProps {
  mode: 'cbt' | 'written';
  courseId?: string | null;
  courseTitle?: string | null;
  programId?: string | null;
  programName?: string | null;
  classId?: string | null;
  className?: string | null;
  examType?: 'examination' | 'evaluation';
  currentQuestions?: Array<{
    question_text: string;
    question_type: string;
    options?: string[] | null;
    correct_answer?: unknown;
    points?: number;
    section?: string;
    explanation?: string | null;
    metadata?: Record<string, any> | null;
  }>;
  existingQuestionTexts: string[];
  onImportQuestions: (questions: StudioGeneratedQuestion[], importMode: 'append' | 'replace') => void;
  onUpdateExamMeta?: (meta: {
    title?: string;
    description?: string;
    durationMinutes?: number;
    passingScore?: number;
  }) => void;
  initialTopic?: string;
  initialSourceText?: string;
  initialSourceName?: string;
  defaultMcqCount?: number;
  defaultTheoryCount?: number;
  minQuestions?: number;
  maxQuestions?: number;
  disabled?: boolean;
}

export default function QuestionAuthoringStudio({
  mode,
  courseId,
  courseTitle,
  programId,
  programName,
  classId,
  className,
  examType = 'examination',
  currentQuestions = [],
  existingQuestionTexts,
  onImportQuestions,
  onUpdateExamMeta,
  initialTopic = '',
  initialSourceText = '',
  initialSourceName = '',
  defaultMcqCount = 10,
  defaultTheoryCount = 2,
  minQuestions = 1,
  maxQuestions = 50,
  disabled = false,
}: QuestionAuthoringStudioProps) {
  const [activeTab, setActiveTab] = useState<'ai' | 'blueprint' | 'bank' | 'alignment'>('ai');

  // Data from /api/cbt/question-bank (database past exams & lessons)
  const [bankQuestions, setBankQuestions] = useState<PremadeQuestionItem[]>([]);
  const [curriculumWeeks, setCurriculumWeeks] = useState<CurriculumWeekItem[]>([]);
  const [loadingBank, setLoadingBank] = useState(false);

  // Selected Curriculum Weeks for Alignment
  const [selectedWeeks, setSelectedWeeks] = useState<Set<number>>(new Set());

  // AI Question Designer State (supports .txt, .pdf, and raw text paste)
  const [aiTopic, setAiTopic] = useState(initialTopic);
  const [sourceText, setSourceText] = useState(initialSourceText);
  const [sourceName, setSourceName] = useState(initialSourceName);
  const [showRawTextInput, setShowRawTextInput] = useState(false);
  const [mcqCount, setMcqCount] = useState(String(defaultMcqCount));
  const [theoryCount, setTheoryCount] = useState(String(defaultTheoryCount));
  const [importBehavior, setImportBehavior] = useState<'append' | 'replace'>('replace');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiSolvingPremade, setAiSolvingPremade] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuccessMsg, setAiSuccessMsg] = useState<string | null>(null);
  const [extractingFile, setExtractingFile] = useState(false);
  const [extractMsg, setExtractMsg] = useState('');
  const [lastAiBlueprint, setLastAiBlueprint] = useState<AssessmentBlueprint | null>(null);

  // Premade Bank Filters & Selection
  const [searchQuery, setSearchQuery] = useState('');
  const [trackFilter, setTrackFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [weekFilter, setWeekFilter] = useState<number | null>(null);
  const [selectedBankIds, setSelectedBankIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (initialTopic && !aiTopic) {
      setAiTopic(initialTopic);
    }
  }, [initialTopic, aiTopic]);

  useEffect(() => {
    if (initialSourceText && !sourceText) {
      setSourceText(initialSourceText);
      setSourceName(initialSourceName || 'Taught weeks');
    }
  }, [initialSourceText, initialSourceName, sourceText]);

  const fetchBankAndCurriculum = useCallback(async () => {
    setLoadingBank(true);
    try {
      const params = new URLSearchParams();
      if (courseId) params.set('course_id', courseId);
      if (programId) params.set('program_id', programId);
      if (classId) params.set('class_id', classId);

      const res = await fetch(`/api/cbt/question-bank?${params.toString()}`);
      if (!res.ok) return;
      const json = await res.json();
      if (Array.isArray(json.data?.questions)) {
        setBankQuestions(json.data.questions);
      }
      if (Array.isArray(json.data?.curriculumWeeks) && json.data.curriculumWeeks.length > 0) {
        const weeks: CurriculumWeekItem[] = json.data.curriculumWeeks;
        setCurriculumWeeks(weeks);
        const taughtSet = new Set(weeks.filter((w) => w.taught).map((w) => w.week));
        setSelectedWeeks(taughtSet.size > 0 ? taughtSet : new Set(weeks.slice(0, 3).map((w) => w.week)));
      }
    } catch {
      // Non-fatal
    } finally {
      setLoadingBank(false);
    }
  }, [courseId, programId, classId]);

  useEffect(() => {
    void fetchBankAndCurriculum();
  }, [fetchBankAndCurriculum]);

  // Detect premade questions inside the uploaded .txt / .pdf / pasted text
  const detectedPremadeFromSource = useMemo(() => {
    if (!sourceText.trim()) return [];
    return parsePremadeQuestionsFromText(sourceText, {
      sourceName: sourceName || 'Uploaded Document',
      defaultTrack: courseTitle || programName || aiTopic || 'Course Alignment',
    });
  }, [sourceText, sourceName, courseTitle, programName, aiTopic]);

  // Merge database bank questions with any parsed questions from the uploaded .txt / .pdf
  const combinedBankQuestions = useMemo(() => {
    const merged: PremadeQuestionItem[] = [...detectedPremadeFromSource, ...bankQuestions];
    const seen = new Set<string>();
    return merged.filter((item) => {
      const k = item.question_text.trim().toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [detectedPremadeFromSource, bankQuestions]);

  // Live Assessment Blueprint computed from the active paper questions (or latest AI output)
  const liveBlueprint = useMemo(() => {
    const nonEmptyPaper = currentQuestions.filter((q) => String(q.question_text ?? '').trim().length > 0);
    if (nonEmptyPaper.length > 0) {
      return buildAssessmentBlueprint(nonEmptyPaper, {
        title: aiTopic || courseTitle || 'Assessment Blueprint',
        courseTitle: courseTitle || programName,
        sourceName: sourceName || aiTopic || courseTitle,
      });
    }
    return (
      lastAiBlueprint ??
      buildAssessmentBlueprint([], {
        title: aiTopic || courseTitle || 'Assessment Blueprint',
        courseTitle: courseTitle || programName,
        sourceName: sourceName || aiTopic || courseTitle,
      })
    );
  }, [currentQuestions, lastAiBlueprint, aiTopic, courseTitle, programName, sourceName]);

  const existingNormalizedSet = useMemo(
    () => new Set(existingQuestionTexts.map((t) => t.trim().toLowerCase()).filter(Boolean)),
    [existingQuestionTexts],
  );

  const availableTracks = useMemo(() => {
    const set = new Set<string>();
    for (const q of combinedBankQuestions) {
      if (q.track) set.add(q.track);
    }
    return Array.from(set);
  }, [combinedBankQuestions]);

  const filteredBankQuestions = useMemo(
    () =>
      filterPremadeQuestions(combinedBankQuestions, {
        search: searchQuery,
        track: trackFilter,
        source: sourceFilter,
        questionType: typeFilter,
        weekNumber: weekFilter,
      }),
    [combinedBankQuestions, searchQuery, trackFilter, sourceFilter, typeFilter, weekFilter],
  );

  const applyWeekAlignmentToAi = (weeksToAlign?: Set<number>) => {
    const activeSet = weeksToAlign ?? selectedWeeks;
    const chosen = curriculumWeeks.filter((w) => activeSet.has(w.week));
    if (chosen.length === 0) return;
    const brief = buildCurriculumAlignmentBrief(chosen, courseTitle);
    setAiTopic(brief.topicSummary);
    setSourceText(brief.sourceMaterial);
    setSourceName(`Aligned Weeks (${brief.weekNumbers.map((n) => `W${n}`).join(', ')})`);
    setAiError(null);
  };

  const toggleWeekSelection = (weekNum: number) => {
    const next = new Set(selectedWeeks);
    if (next.has(weekNum)) next.delete(weekNum);
    else next.add(weekNum);
    setSelectedWeeks(next);
    if (next.size > 0) {
      applyWeekAlignmentToAi(next);
    }
  };

  const handleFileUpload = async (file: File) => {
    setExtractingFile(true);
    setAiError(null);
    setExtractMsg(`Reading ${file.name}…`);
    try {
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.txt') || lowerName.endsWith('.md') || file.type === 'text/plain') {
        const raw = await file.text();
        const trimmed = raw.trim().slice(0, 15000);
        if (!trimmed) {
          setAiError('The uploaded text file is empty.');
        } else {
          setSourceText(trimmed);
          setSourceName(file.name);
          if (!aiTopic.trim()) {
            setAiTopic(file.name.replace(/\.(txt|md)$/i, '').replace(/[_-]/g, ' '));
          }
        }
      } else {
        const pdfText = await extractPdfText(file, 12000, setExtractMsg);
        if (pdfText) {
          setSourceText(pdfText);
          setSourceName(file.name);
          if (!aiTopic.trim()) {
            setAiTopic(file.name.replace(/\.pdf$/i, '').replace(/[_-]/g, ' '));
          }
        } else {
          setAiError('Could not read text from that PDF (it may be scanned images).');
        }
      }
    } catch {
      setAiError('Could not read the uploaded file. Try a .txt or text-based .pdf file.');
    } finally {
      setExtractingFile(false);
      setExtractMsg('');
    }
  };

  const mapApiQuestionsToStudio = (rawList: any[], fallbackTag: string): StudioGeneratedQuestion[] => {
    return (rawList ?? [])
      .map((q: any) => {
        const rawType = String(q.question_type || 'multiple_choice');
        const qType: StudioGeneratedQuestion['question_type'] =
          rawType === 'true_false' || rawType === 'fill_blank' || rawType === 'short_answer' || rawType === 'essay'
            ? rawType
            : 'multiple_choice';
        const opts =
          qType === 'true_false'
            ? ['True', 'False']
            : Array.isArray(q.options) && q.options.length > 0
              ? q.options.map(String)
              : ['', '', '', ''];
        const rawCorrect = String(
          q.correct_answer ?? q.marking_guide ?? q.metadata?.marking_guide ?? q.explanation ?? '',
        ).trim();
        const resolvedCorrect =
          qType === 'multiple_choice'
            ? resolveMcqAnswerToOption(rawCorrect, opts) || opts[0] || ''
            : qType === 'true_false'
              ? /^false$/i.test(rawCorrect)
                ? 'False'
                : 'True'
              : rawCorrect;
        const markingGuide =
          String(
            q.marking_guide ??
              q.metadata?.marking_guide ??
              q.explanation ??
              (qType === 'essay' || qType === 'fill_blank' ? resolvedCorrect : ''),
          ).trim() || undefined;

        return {
          question_text: String(q.question_text || '').trim(),
          question_type: qType,
          options: opts,
          correct_answer: resolvedCorrect,
          marking_guide: markingGuide,
          points: Number(q.points) || (qType === 'essay' ? 10 : 5),
          section: (q.section ||
            q.metadata?.section ||
            (['essay', 'fill_blank', 'short_answer'].includes(qType)
              ? 'subjective'
              : 'objective')) as StudioGeneratedQuestion['section'],
          explanation: markingGuide || (q.explanation ? String(q.explanation) : undefined),
          curriculumTag: q.metadata?.curriculum_tag || fallbackTag,
          cognitiveLevel: q.metadata?.cognitive_level || undefined,
        };
      })
      .filter((q: StudioGeneratedQuestion) => q.question_text.length > 0);
  };

  const handleAiGenerate = async () => {
    const effectiveTopic =
      aiTopic.trim() || sourceName.trim() || courseTitle?.trim() || programName?.trim() || '';
    if (!effectiveTopic && !sourceText.trim()) {
      setAiError('Enter a topic, upload a .txt / .pdf document, or select curriculum weeks above.');
      return;
    }
    const mcq = Math.max(0, Math.min(maxQuestions, parseInt(mcqCount, 10) || 0));
    const theory = Math.max(0, Math.min(maxQuestions, parseInt(theoryCount, 10) || 0));
    const total = mcq + theory;
    if (total < minQuestions) {
      setAiError(`Select at least ${minQuestions} question${minQuestions === 1 ? '' : 's'} to generate.`);
      return;
    }
    if (total > maxQuestions) {
      setAiError(`Maximum ${maxQuestions} questions per batch. Reduce Objective or Theory count.`);
      return;
    }

    setAiGenerating(true);
    setAiError(null);
    setAiSuccessMsg(null);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'cbt',
          cbtMode: 'generate',
          topic: effectiveTopic || 'Course Assessment',
          questionCount: total,
          mcqCount: mcq,
          theoryCount: theory,
          courseName: courseTitle || undefined,
          subject: courseTitle || undefined,
          programName: programName || undefined,
          className: className || undefined,
          examType,
          sourceName: sourceName || undefined,
          ...(sourceText.trim() ? { sourceMaterial: sourceText.trim() } : {}),
        }),
      });
      const result = await res.json();
      if (!res.ok || result.error) {
        throw new Error(result.error || 'AI question generation failed.');
      }

      const data = result.data;
      if (onUpdateExamMeta && data) {
        onUpdateExamMeta({
          title: data.title,
          description: data.description,
          durationMinutes: Number(data.duration_minutes) || undefined,
          passingScore: Number(data.passing_score) || undefined,
        });
      }

      if (data?.blueprint) {
        setLastAiBlueprint(data.blueprint);
      }

      const generatedList = mapApiQuestionsToStudio(
        data?.questions ?? [],
        sourceName || effectiveTopic || 'Aligned Blueprint',
      );

      if (generatedList.length === 0) {
        throw new Error('No valid questions were returned. Try refining your topic or source material.');
      }

      onImportQuestions(generatedList, importBehavior);
      setAiSuccessMsg(
        `Blueprint ready: Generated ${generatedList.length} aligned questions with verified answers & marking guides.`,
      );
    } catch (err: any) {
      setAiError(err?.message || 'Could not generate questions right now.');
    } finally {
      setAiGenerating(false);
    }
  };

  /**
   * Smart AI Premade Question Extractor, Answer Solver & Marking Guide Builder.
   * Works on uploaded .txt/.pdf premade questions OR existing questions on the paper that need answers/rubrics!
   */
  const handleAiAlignAndSolvePremade = async (fromCurrentPaper = false) => {
    const serializedCurrent = fromCurrentPaper
      ? currentQuestions
          .filter((q) => String(q.question_text ?? '').trim())
          .map((q, idx) => {
            const opts = Array.isArray(q.options) && q.options.filter(Boolean).length > 0
              ? `\n${q.options.filter(Boolean).map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join('\n')}`
              : '';
            const ans = String(q.correct_answer ?? '').trim()
              ? `\nAnswer: ${q.correct_answer}`
              : '';
            return `${idx + 1}. ${q.question_text} [${q.points || 5} marks]${opts}${ans}`;
          })
          .join('\n\n')
      : sourceText.trim();

    if (!serializedCurrent) {
      setAiError('Upload a .txt or .pdf file or paste premade questions first.');
      return;
    }

    const effectiveTopic =
      aiTopic.trim() || sourceName.trim() || courseTitle?.trim() || programName?.trim() || 'Assessment Alignment';

    const localParsed = parsePremadeQuestionsFromText(serializedCurrent, {
      sourceName: sourceName || 'Premade Script',
      defaultTrack: effectiveTopic,
    });

    const detectedMcq = localParsed.filter(
      (q) => q.question_type === 'multiple_choice' || q.question_type === 'true_false',
    ).length;
    const detectedOpen = localParsed.length - detectedMcq;

    const reqMcq = localParsed.length > 0 ? detectedMcq : parseInt(mcqCount, 10) || 10;
    const reqTheory = localParsed.length > 0 ? detectedOpen : parseInt(theoryCount, 10) || 2;
    const reqTotal = Math.max(1, reqMcq + reqTheory);

    setAiSolvingPremade(true);
    setAiError(null);
    setAiSuccessMsg(null);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'cbt',
          cbtMode: 'align_premade',
          topic: effectiveTopic,
          questionCount: reqTotal,
          mcqCount: reqMcq,
          theoryCount: reqTheory,
          courseName: courseTitle || undefined,
          subject: courseTitle || undefined,
          programName: programName || undefined,
          className: className || undefined,
          examType,
          sourceName: sourceName || (fromCurrentPaper ? 'Current Paper Questions' : 'Premade Script'),
          sourceMaterial: serializedCurrent,
          premadeQuestionsText: serializedCurrent,
        }),
      });
      const result = await res.json();
      if (!res.ok || result.error) {
        // Fallback to deterministic parser if AI tier is unreachable
        if (localParsed.length > 0) {
          onImportQuestions(
            localParsed.map((item) => ({
              question_text: item.question_text,
              question_type: item.question_type,
              options: item.options,
              correct_answer: item.correct_answer,
              marking_guide: item.marking_guide,
              points: item.points,
              section: item.section,
              explanation: item.explanation || item.marking_guide,
              curriculumTag: item.curriculumTag,
              cognitiveLevel: item.difficulty,
            })),
            fromCurrentPaper ? 'replace' : importBehavior,
          );
          setAiSuccessMsg(`Parsed and aligned ${localParsed.length} premade questions from your document.`);
          return;
        }
        throw new Error(result.error || 'Failed to align and solve premade questions.');
      }

      const data = result.data;
      if (data?.blueprint) {
        setLastAiBlueprint(data.blueprint);
      }

      const solvedList = mapApiQuestionsToStudio(
        data?.questions ?? [],
        sourceName || effectiveTopic,
      );

      if (solvedList.length === 0) {
        throw new Error('Could not extract questions from the provided text.');
      }

      onImportQuestions(solvedList, fromCurrentPaper ? 'replace' : importBehavior);
      setAiSuccessMsg(
        `AI solved answers, generated marking guides, and aligned ${solvedList.length} questions to the Blueprint!`,
      );
      setActiveTab('blueprint');
    } catch (err: any) {
      setAiError(err?.message || 'Failed to align premade questions.');
    } finally {
      setAiSolvingPremade(false);
    }
  };

  const handleImportSinglePremade = (item: PremadeQuestionItem) => {
    onImportQuestions(
      [
        {
          question_text: item.question_text,
          question_type: item.question_type,
          options: item.options,
          correct_answer: item.correct_answer,
          marking_guide: item.marking_guide,
          points: item.points,
          section: item.section,
          explanation: item.explanation || item.marking_guide,
          curriculumTag: item.curriculumTag,
          weekNumber: item.weekNumber,
          cognitiveLevel: item.difficulty,
        },
      ],
      'append',
    );
  };

  const handleImportSelectedPremade = () => {
    const chosen = combinedBankQuestions.filter((q) => selectedBankIds.has(q.id));
    if (chosen.length === 0) return;
    onImportQuestions(
      chosen.map((item) => ({
        question_text: item.question_text,
        question_type: item.question_type,
        options: item.options,
        correct_answer: item.correct_answer,
        marking_guide: item.marking_guide,
        points: item.points,
        section: item.section,
        explanation: item.explanation || item.marking_guide,
        curriculumTag: item.curriculumTag,
        weekNumber: item.weekNumber,
        cognitiveLevel: item.difficulty,
      })),
      importBehavior,
    );
    setSelectedBankIds(new Set());
  };

  if (disabled) return null;

  return (
    <section
      aria-label="AI Question Designer, TXT/PDF Alignment and Blueprint Studio"
      className="rounded-2xl border border-primary/25 bg-card shadow-sm overflow-hidden"
    >
      {/* Top Studio Header & 4-Tab Bar */}
      <div className="bg-gradient-to-r from-primary/15 via-primary/5 to-emerald-500/10 border-b border-border px-4 sm:px-6 py-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0 text-primary">
              <SparklesIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-foreground tracking-tight">
                  AI Question Designer &amp; Blueprint Studio
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  TXT · PDF · Auto Answers &amp; Marking Guide
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Upload `.txt` or `.pdf` notes/questions, align with taught curriculum weeks, auto-solve answers &amp; marking guides, and inspect the Blueprint output.
              </p>
            </div>
          </div>

          {/* 4-Tab Segmented Control */}
          <div className="flex flex-wrap items-center gap-1.5 bg-background/80 p-1.5 rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setActiveTab('ai')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black transition-all ${
                activeTab === 'ai'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              <SparklesIcon className="w-4 h-4" />
              AI Designer (.txt / .pdf)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('blueprint')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black transition-all ${
                activeTab === 'blueprint'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              <ChartBarIcon className="w-4 h-4" />
              Blueprint Output
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-black/15 dark:bg-white/15">
                {liveBlueprint.alignmentScore}%
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('bank')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black transition-all ${
                activeTab === 'bank'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              <BookOpenIcon className="w-4 h-4" />
              Premade Bank
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-black/15 dark:bg-white/15">
                {combinedBankQuestions.length}
              </span>
            </button>
            {curriculumWeeks.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('alignment')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black transition-all ${
                  activeTab === 'alignment'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                }`}
              >
                <AcademicCapIcon className="w-4 h-4" />
                Syllabus Weeks
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-black/15 dark:bg-white/15">
                  {selectedWeeks.size}/{curriculumWeeks.length}w
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* TAB 1: SMART AI QUESTION DESIGNER (.TXT + .PDF + PASTE + ANSWERS & MARKING GUIDE) */}
      {activeTab === 'ai' && (
        <div className="p-4 sm:p-6 space-y-5">
          {/* Quick Curriculum Alignment Strip (when class/course has curriculum weeks) */}
          {curriculumWeeks.length > 0 && (
            <div className="rounded-xl border border-border bg-muted/20 p-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AcademicCapIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-black uppercase tracking-wider text-foreground">
                    Curriculum Week Alignment
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    (Click weeks taught to ground the AI Designer &amp; Blueprint)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const taughtWeeks = new Set(curriculumWeeks.filter((w) => w.taught).map((w) => w.week));
                    const target = taughtWeeks.size > 0 ? taughtWeeks : new Set(curriculumWeeks.map((w) => w.week));
                    setSelectedWeeks(target);
                    applyWeekAlignmentToAi(target);
                  }}
                  className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:underline"
                >
                  Select All Taught Weeks
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {curriculumWeeks.map((w) => {
                  const active = selectedWeeks.has(w.week);
                  return (
                    <button
                      key={w.week}
                      type="button"
                      onClick={() => toggleWeekSelection(w.week)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        active
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-800 dark:text-emerald-200'
                          : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
                      }`}
                    >
                      <span
                        className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                          active ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-muted-foreground/40'
                        }`}
                      >
                        {active && <CheckIcon className="w-2.5 h-2.5" />}
                      </span>
                      <span>W{w.week}: {w.title}</span>
                      {w.taught && (
                        <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                          Taught
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Row 1: Topic + TXT/PDF Upload / Paste */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-5 space-y-1.5">
              <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">
                1. Assessment Topic &amp; Alignment Focus
              </label>
              <input
                type="text"
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                placeholder={
                  courseTitle
                    ? `e.g. ${courseTitle} — Midterm Assessment`
                    : 'e.g. Python Loops & Functions, Robotics Sensors, Web Flexbox'
                }
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            <div className="lg:col-span-7 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">
                  2. Source Material or Premade Questions (`.txt` / `.pdf` / Paste)
                </label>
                <button
                  type="button"
                  onClick={() => setShowRawTextInput((v) => !v)}
                  className="text-[11px] font-bold text-primary hover:underline"
                >
                  {showRawTextInput ? 'Hide Text Editor' : 'Paste / Edit Raw Text or Premade Questions'}
                </button>
              </div>

              {sourceName ? (
                <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-primary/10 border border-primary/25 rounded-xl">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <DocumentTextIcon className="w-4 h-4 text-primary flex-shrink-0" />
                      <p className="text-xs font-bold text-foreground truncate">{sourceName}</p>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-background border border-border text-muted-foreground">
                        {sourceText.length.toLocaleString()} chars
                      </span>
                      {detectedPremadeFromSource.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                          {detectedPremadeFromSource.length} Premade Qs Detected
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowRawTextInput((v) => !v)}
                      className="px-2.5 py-1 text-[10px] font-black uppercase rounded-lg bg-background border border-border text-foreground hover:bg-muted"
                    >
                      {showRawTextInput ? 'Close' : 'Inspect'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSourceText('');
                        setSourceName('');
                      }}
                      className="px-2.5 py-1 text-[10px] font-black uppercase rounded-lg bg-background border border-border text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-border hover:border-primary/50 rounded-xl cursor-pointer transition-colors bg-background/50">
                    <DocumentTextIcon className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="text-xs font-bold text-foreground truncate">
                      {extractingFile ? extractMsg || 'Reading file…' : 'Upload .TXT or .PDF File'}
                    </span>
                    <input
                      type="file"
                      accept=".pdf,.txt,.md,application/pdf,text/plain"
                      className="hidden"
                      disabled={extractingFile}
                      onChange={async (e) => {
                        const file = e.currentTarget.files?.[0] ?? null;
                        e.currentTarget.value = '';
                        if (!file) return;
                        await handleFileUpload(file);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowRawTextInput(true)}
                    className="flex items-center justify-center gap-2 px-4 py-3 border border-border hover:border-primary/40 rounded-xl bg-background/50 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <SparklesIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Paste Notes or Premade Questions
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Expandable Raw TXT / Premade Question Paste & Inspection Box */}
          {showRawTextInput && (
            <div className="rounded-xl border border-border bg-background/70 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-foreground">
                    Source Text / Premade Questions Buffer (`.txt` / `.pdf` / Paste)
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Paste lesson notes OR existing premade questions (even without answers or marking guides — the AI will solve answers and build the marking guide!).
                  </p>
                </div>
                {detectedPremadeFromSource.length > 0 && (
                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                    Detected {detectedPremadeFromSource.length} questions ({detectedPremadeFromSource.filter((q) => !q.needsAiAnswer).length} with answers, {detectedPremadeFromSource.filter((q) => q.needsAiAnswer).length} need AI answer/rubric)
                  </span>
                )}
              </div>
              <textarea
                rows={5}
                value={sourceText}
                onChange={(e) => {
                  setSourceText(e.target.value);
                  if (!sourceName && e.target.value.trim()) {
                    setSourceName('Pasted Text / Premade Script');
                  }
                }}
                placeholder={`Paste lesson notes OR premade questions here, e.g.:\n1. What is the output of print(7 // 2) in Python?\nA) 3.5  B) 3  C) 1  D) 14\n\n2. Explain how an ultrasonic sensor measures distance in a robot car. [10 marks]`}
                className="w-full px-3.5 py-2.5 bg-card border border-border rounded-xl text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-y"
              />
            </div>
          )}

          {/* Smart Detection Banner when Premade Questions are found in TXT/PDF/Paste */}
          {detectedPremadeFromSource.length > 0 && (
            <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-xs font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5">
                  <SparklesIcon className="w-4 h-4" />
                  {detectedPremadeFromSource.length} Premade Question{detectedPremadeFromSource.length === 1 ? '' : 's'} Found in {sourceName || 'Document'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {detectedPremadeFromSource.some((q) => q.needsAiAnswer)
                    ? `${detectedPremadeFromSource.filter((q) => q.needsAiAnswer).length} question(s) do not have an answer key or marking guide yet. Click "AI Solve Answers & Marking Guide" to complete and align them!`
                    : 'All detected questions have answers/guides ready, or use AI to enrich their marking rubrics and blueprint alignment.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleAiAlignAndSolvePremade(false)}
                  disabled={aiSolvingPremade}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black uppercase tracking-wider shadow-sm transition-all disabled:opacity-50"
                >
                  {aiSolvingPremade ? (
                    <>
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                      Solving Answers &amp; Guide…
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="w-4 h-4" />
                      AI Solve Answers, Marking Guide &amp; Align
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onImportQuestions(
                      detectedPremadeFromSource.map((item) => ({
                        question_text: item.question_text,
                        question_type: item.question_type,
                        options: item.options,
                        correct_answer: item.correct_answer,
                        marking_guide: item.marking_guide,
                        points: item.points,
                        section: item.section,
                        explanation: item.explanation || item.marking_guide,
                        curriculumTag: item.curriculumTag,
                        cognitiveLevel: item.difficulty,
                      })),
                      importBehavior,
                    );
                    setAiSuccessMsg(`Imported ${detectedPremadeFromSource.length} premade questions directly into the paper.`);
                  }}
                  className="px-3.5 py-2.5 rounded-xl border border-border bg-card hover:bg-muted text-xs font-bold text-foreground transition-colors"
                >
                  Direct Import ({detectedPremadeFromSource.length})
                </button>
              </div>
            </div>
          )}

          {/* Blueprint Mix Presets & Append/Replace Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mr-1">
                Blueprint Mix:
              </span>
              {[
                { label: 'Evaluation (10 Obj + 2 Theory)', mcq: 10, theory: 2 },
                { label: 'Mid-Term (15 Obj + 3 Theory)', mcq: 15, theory: 3 },
                { label: 'Main Exam (20 Obj + 5 Theory)', mcq: 20, theory: 5 },
                { label: 'Written / Theory Paper (5 Obj + 5 Essay)', mcq: 5, theory: 5 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setMcqCount(String(preset.mcq));
                    setTheoryCount(String(preset.theory));
                  }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-muted/50 hover:bg-muted text-foreground border border-border transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                Import Mode:
              </span>
              <button
                type="button"
                onClick={() => setImportBehavior('replace')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                  importBehavior === 'replace'
                    ? 'bg-primary/15 border-primary/40 text-primary'
                    : 'bg-background border-border text-muted-foreground'
                }`}
              >
                Replace Draft
              </button>
              <button
                type="button"
                onClick={() => setImportBehavior('append')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                  importBehavior === 'append'
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                    : 'bg-background border-border text-muted-foreground'
                }`}
              >
                Append to Paper
              </button>
            </div>
          </div>

          {/* Count Controls + Generate Action */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                Objective (MCQ / T-F)
              </label>
              <input
                type="number"
                min={0}
                max={maxQuestions}
                value={mcqCount}
                onChange={(e) => setMcqCount(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm font-bold text-foreground focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                Theory / Written (with Rubric)
              </label>
              <input
                type="number"
                min={0}
                max={maxQuestions}
                value={theoryCount}
                onChange={(e) => setTheoryCount(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm font-bold text-foreground focus:outline-none focus:border-primary"
              />
            </div>
            <div className="rounded-xl border border-border bg-muted/20 px-3.5 py-2 flex flex-col justify-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Target Blueprint
              </span>
              <span className="text-lg font-black text-foreground">
                {(parseInt(mcqCount, 10) || 0) + (parseInt(theoryCount, 10) || 0)} Qs + Marking Guide
              </span>
            </div>
            <button
              type="button"
              onClick={handleAiGenerate}
              disabled={aiGenerating}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md transition-all disabled:opacity-50"
            >
              {aiGenerating ? (
                <>
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  Designing Blueprint…
                </>
              ) : (
                <>
                  <SparklesIcon className="w-4 h-4" />
                  Generate Questions &amp; Guide
                </>
              )}
            </button>
          </div>

          {aiError && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-bold text-rose-700 dark:text-rose-300">
              {aiError}
            </div>
          )}
          {aiSuccessMsg && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />
                {aiSuccessMsg}
              </span>
              <button
                type="button"
                onClick={() => setActiveTab('blueprint')}
                className="underline text-[11px] font-black"
              >
                Inspect Blueprint &amp; Marking Guide →
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: BLUEPRINT OUTPUT & AUTO ANSWER / MARKING GUIDE SOLVER */}
      {activeTab === 'blueprint' && (
        <div className="p-4 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-widest text-primary">
                  Assessment Blueprint Output
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  {liveBlueprint.alignmentScore}% Aligned
                </span>
              </div>
              <h3 className="text-base font-black text-foreground mt-0.5">{liveBlueprint.title}</h3>
              <p className="text-xs text-muted-foreground">{liveBlueprint.sourceSummary}</p>
            </div>

            {currentQuestions.some((q) => String(q.question_text ?? '').trim()) && (
              <button
                type="button"
                onClick={() => handleAiAlignAndSolvePremade(true)}
                disabled={aiSolvingPremade}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black uppercase tracking-wider shadow-sm transition-all disabled:opacity-50"
              >
                {aiSolvingPremade ? (
                  <>
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    Solving Answers &amp; Rubrics…
                  </>
                ) : (
                  <>
                    <SparklesIcon className="w-4 h-4" />
                    Auto-Solve Missing Answers &amp; Marking Guides
                  </>
                )}
              </button>
            )}
          </div>

          {/* Top KPI Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="rounded-xl border border-border bg-background/60 p-3.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Questions</p>
              <p className="text-xl font-black text-foreground mt-1">{liveBlueprint.totalQuestions}</p>
              <p className="text-[11px] text-muted-foreground">Active in paper</p>
            </div>
            <div className="rounded-xl border border-border bg-background/60 p-3.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Total Marks</p>
              <p className="text-xl font-black text-primary mt-1">{liveBlueprint.totalPoints} pts</p>
              <p className="text-[11px] text-muted-foreground">~{liveBlueprint.estimatedMinutes} mins est.</p>
            </div>
            <div className="rounded-xl border border-border bg-background/60 p-3.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Answer Keys</p>
              <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {liveBlueprint.answeredCount}/{liveBlueprint.totalQuestions}
              </p>
              <p className="text-[11px] text-muted-foreground">Verified answers</p>
            </div>
            <div className="rounded-xl border border-border bg-background/60 p-3.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Marking Guides</p>
              <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {liveBlueprint.markingGuideCount}/{liveBlueprint.totalQuestions}
              </p>
              <p className="text-[11px] text-muted-foreground">Scoring rubrics</p>
            </div>
            <div className="rounded-xl border border-border bg-background/60 p-3.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Cognitive Spread</p>
              <p className="text-sm font-black text-foreground mt-1.5">
                {liveBlueprint.cognitiveDistribution.foundation}F · {liveBlueprint.cognitiveDistribution.application}A · {liveBlueprint.cognitiveDistribution.reasoning}R
              </p>
              <p className="text-[11px] text-muted-foreground">Recall · Apply · Reason</p>
            </div>
          </div>

          {/* Section Weighting & Topic Alignment Table */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-background/50 p-4 space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
                Section &amp; Mark Distribution
              </h4>
              {(['objective', 'subjective', 'practical'] as const).map((sec) => {
                const info = liveBlueprint.sections[sec];
                return (
                  <div key={sec} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold capitalize text-foreground">{sec} Section</span>
                      <span className="text-muted-foreground font-medium">
                        {info.count} Qs · {info.points} pts ({info.percent}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          sec === 'objective'
                            ? 'bg-primary'
                            : sec === 'subjective'
                              ? 'bg-emerald-500'
                              : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.min(100, info.percent)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-xl border border-border bg-background/50 p-4 space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
                Curriculum &amp; Source Topic Coverage
              </h4>
              {liveBlueprint.topicCoverage.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Generate or add questions to see the topic-by-topic blueprint matrix.
                </p>
              ) : (
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {liveBlueprint.topicCoverage.map((row, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-foreground truncate">{row.topic}</p>
                        <p className="text-[10px] text-muted-foreground">
                          Questions: {row.questionNumbers.map((n) => `Q${n}`).join(', ')}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-md font-black text-[10px] bg-primary/15 text-primary flex-shrink-0">
                        {row.questionCount} Qs · {row.points} pts
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {liveBlueprint.readinessWarnings.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-1.5">
              <p className="text-xs font-black uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                <ExclamationTriangleIcon className="w-4 h-4" />
                Blueprint Readiness Checks ({liveBlueprint.readinessWarnings.length})
              </p>
              <ul className="text-xs text-amber-900 dark:text-amber-200 list-disc list-inside space-y-0.5">
                {liveBlueprint.readinessWarnings.slice(0, 5).map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PREMADE QUESTION BANK (PAST EXAMS + UPLOADED TXT/PDF QUESTIONS) */}
      {activeTab === 'bank' && (
        <div className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            <div className="sm:col-span-2 relative">
              <MagnifyingGlassIcon className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search past exam or imported TXT/PDF questions…"
                className="w-full pl-9 pr-3.5 py-2.5 bg-background border border-border rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <select
              value={trackFilter}
              onChange={(e) => setTrackFilter(e.target.value)}
              aria-label="Filter by course or subject"
              className="px-3 py-2.5 bg-background border border-border rounded-xl text-xs font-bold text-foreground focus:outline-none focus:border-primary"
            >
              <option value="all">All Courses ({combinedBankQuestions.length})</option>
              {availableTracks.map((tr) => (
                <option key={tr} value={tr}>
                  {tr}
                </option>
              ))}
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Filter by question type"
              className="px-3 py-2.5 bg-background border border-border rounded-xl text-xs font-bold text-foreground focus:outline-none focus:border-primary"
            >
              <option value="all">All Question Types</option>
              <option value="multiple_choice">Multiple Choice (MCQ)</option>
              <option value="true_false">True / False</option>
              <option value="fill_blank">Fill in the Blank</option>
              <option value="essay">Theory / Essay</option>
            </select>

            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              aria-label="Filter by question source"
              className="px-3 py-2.5 bg-background border border-border rounded-xl text-xs font-bold text-foreground focus:outline-none focus:border-primary"
            >
              <option value="all">All Sources</option>
              <option value="txt_pdf_import">Uploaded TXT / PDF Script</option>
              <option value="cbt_past">Past CBT Assessments</option>
              <option value="written_past">Past Written Exams</option>
              <option value="lesson_quiz">Taught Lesson Quizzes</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-4 py-2.5">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-bold text-foreground">
                {filteredBankQuestions.length} premade question{filteredBankQuestions.length === 1 ? '' : 's'} available
              </span>
              {weekFilter != null && (
                <button
                  type="button"
                  onClick={() => setWeekFilter(null)}
                  className="px-2 py-0.5 rounded-full text-[10px] font-black bg-primary/15 text-primary border border-primary/30"
                >
                  Week {weekFilter} Filter ✕
                </button>
              )}
              {filteredBankQuestions.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const allFilteredSelected = filteredBankQuestions.every((q) => selectedBankIds.has(q.id));
                    const next = new Set(selectedBankIds);
                    if (allFilteredSelected) {
                      filteredBankQuestions.forEach((q) => next.delete(q.id));
                    } else {
                      filteredBankQuestions.forEach((q) => next.add(q.id));
                    }
                    setSelectedBankIds(next);
                  }}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  {filteredBankQuestions.every((q) => selectedBankIds.has(q.id))
                    ? 'Deselect Visible'
                    : `Select All ${filteredBankQuestions.length} Visible`}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {selectedBankIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleImportSelectedPremade}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black uppercase tracking-wider shadow-sm transition-all"
                >
                  <PlusIcon className="w-4 h-4" />
                  Import {selectedBankIds.size} Selected to Paper
                </button>
              )}
            </div>
          </div>

          {loadingBank ? (
            <div className="py-10 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <ArrowPathIcon className="w-4 h-4 animate-spin text-primary" />
              Loading past exams &amp; lesson questions…
            </div>
          ) : filteredBankQuestions.length === 0 ? (
            <div className="py-10 text-center space-y-2.5 rounded-xl border border-dashed border-border p-6">
              <p className="text-sm font-bold text-foreground">
                No premade questions found for this filter yet.
              </p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Upload a `.txt` or `.pdf` question paper or paste premade questions in the AI Designer tab to extract, solve answers, and build marking guides automatically.
              </p>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('ai');
                  setShowRawTextInput(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-black"
              >
                <SparklesIcon className="w-4 h-4" />
                Upload .TXT / .PDF or Paste Premade Questions
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 max-h-[460px] overflow-y-auto pr-1">
              {filteredBankQuestions.map((item) => {
                const isChecked = selectedBankIds.has(item.id);
                const alreadyInPaper = existingNormalizedSet.has(item.question_text.trim().toLowerCase());
                return (
                  <div
                    key={item.id}
                    className={`rounded-xl border p-4 transition-all ${
                      isChecked
                        ? 'border-emerald-500/50 bg-emerald-500/5'
                        : 'border-border bg-background/60 hover:border-primary/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => {
                            const next = new Set(selectedBankIds);
                            if (next.has(item.id)) next.delete(item.id);
                            else next.add(item.id);
                            setSelectedBankIds(next);
                          }}
                          aria-label={`Select question: ${item.question_text.slice(0, 40)}`}
                          className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                            isChecked
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'border-border hover:border-primary'
                          }`}
                        >
                          {isChecked && <CheckIcon className="w-3 h-3" />}
                        </button>

                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-primary/15 text-primary">
                              {item.question_type.replace(/_/g, ' ')}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted text-muted-foreground">
                              {item.track}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                              {item.points} pts · {item.section}
                            </span>
                            <span className="text-[10px] text-muted-foreground ml-auto">
                              {item.sourceLabel}
                            </span>
                          </div>

                          <div className="text-sm font-medium text-foreground">
                            <CbtMarkdown text={item.question_text} />
                          </div>

                          {item.options && item.options.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                              {item.options.map((opt, idx) => {
                                const isCorrect =
                                  opt.trim().toLowerCase() === String(item.correct_answer ?? '').trim().toLowerCase();
                                return (
                                  <div
                                    key={idx}
                                    className={`text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-2 ${
                                      isCorrect
                                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 font-bold'
                                        : 'border-border/60 bg-card/50 text-muted-foreground'
                                    }`}
                                  >
                                    <span className="font-black text-[10px]">
                                      {String.fromCharCode(65 + idx)}.
                                    </span>
                                    <span className="truncate">{opt}</span>
                                    {isCorrect && <CheckCircleIcon className="w-3.5 h-3.5 ml-auto flex-shrink-0" />}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {(item.marking_guide || item.explanation || (item.options.length === 0 && item.correct_answer)) && (
                            <p className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1.5">
                              <strong className="font-black uppercase text-[10px] mr-1.5">Marking Guide / Answer:</strong>
                              {item.marking_guide || item.explanation || item.correct_answer}
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleImportSinglePremade(item)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1 flex-shrink-0 transition-all ${
                          alreadyInPaper
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                            : 'bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30'
                        }`}
                      >
                        {alreadyInPaper ? (
                          <>
                            <CheckIcon className="w-3.5 h-3.5" /> Added
                          </>
                        ) : (
                          <>
                            <PlusIcon className="w-3.5 h-3.5" /> Use
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: CURRICULUM & TAUGHT-WEEK ALIGNMENT MATRIX */}
      {activeTab === 'alignment' && (
        <div className="p-4 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-4">
            <div>
              <h3 className="text-sm font-black text-foreground">
                Syllabus &amp; Taught-Week Alignment Matrix
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Select the weeks your class has covered to ground AI question generation and Blueprint alignment.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const all = new Set(curriculumWeeks.map((w) => w.week));
                  setSelectedWeeks(all);
                  applyWeekAlignmentToAi(all);
                }}
                className="px-3 py-2 rounded-xl border border-border bg-card text-xs font-bold text-foreground hover:bg-muted"
              >
                Select All Weeks
              </button>
              <button
                type="button"
                onClick={() => {
                  applyWeekAlignmentToAi(selectedWeeks);
                  setActiveTab('ai');
                }}
                disabled={selectedWeeks.size === 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black uppercase tracking-wider disabled:opacity-50"
              >
                <SparklesIcon className="w-4 h-4" />
                Align &amp; Open AI Designer ({selectedWeeks.size}w)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {curriculumWeeks.map((w) => {
              const isSelected = selectedWeeks.has(w.week);
              return (
                <div
                  key={w.week}
                  onClick={() => toggleWeekSelection(w.week)}
                  className={`rounded-xl border p-4 cursor-pointer transition-all ${
                    isSelected
                      ? 'border-emerald-500/50 bg-emerald-500/10'
                      : 'border-border bg-background/60 hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-5 h-5 rounded flex items-center justify-center border ${
                          isSelected
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'border-muted-foreground/40'
                        }`}
                      >
                        {isSelected && <CheckIcon className="w-3.5 h-3.5" />}
                      </span>
                      <span className="text-xs font-black uppercase tracking-wider text-primary">
                        Week {w.week}
                      </span>
                      {w.taught ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                          Taught
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-muted text-muted-foreground">
                          Upcoming
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-sm font-bold text-foreground mt-2">{w.title}</p>

                  {w.objectives.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground list-disc list-inside">
                      {w.objectives.slice(0, 2).map((obj, idx) => (
                        <li key={idx} className="truncate">
                          {obj}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
