'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  ChevronDownIcon,
  XMarkIcon,
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
  onQuestionMixChange?: (mcqCount: number, theoryCount: number) => void;
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
  onQuestionMixChange,
  initialTopic = '',
  initialSourceText = '',
  initialSourceName = '',
  defaultMcqCount = 10,
  defaultTheoryCount = 2,
  minQuestions = 1,
  maxQuestions = 50,
  disabled = false,
}: QuestionAuthoringStudioProps) {
  // Optional secondary drawers (kept closed by default so the main AI workflow is fast and simple)
  const [openDrawer, setOpenDrawer] = useState<'none' | 'bank' | 'blueprint'>('none');

  // Scoped data from /api/cbt/question-bank
  const [bankQuestions, setBankQuestions] = useState<PremadeQuestionItem[]>([]);
  const [curriculumWeeks, setCurriculumWeeks] = useState<CurriculumWeekItem[]>([]);
  const [loadingBank, setLoadingBank] = useState(false);
  const [selectedWeeks, setSelectedWeeks] = useState<Set<number>>(new Set());

  // AI Question Bar state
  const [aiTopic, setAiTopic] = useState(initialTopic);
  const [sourceText, setSourceText] = useState(initialSourceText);
  const [sourceName, setSourceName] = useState(initialSourceName);
  const [isWeekDerivedSource, setIsWeekDerivedSource] = useState(false);
  const [showPasteBox, setShowPasteBox] = useState(false);
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

  // Track manual edits to prevent stale bleed while still updating dynamically on context switches
  const userEditedTopicRef = useRef(false);
  const userEditedCountsRef = useRef(false);
  const lastScopeKeyRef = useRef(`${classId || ''}:${courseId || ''}:${programId || ''}`);

  // Premade Bank filters
  const [searchQuery, setSearchQuery] = useState('');
  const [trackFilter, setTrackFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedBankIds, setSelectedBankIds] = useState<Set<string>>(new Set());

  // Dynamic sync when parent changes Exam Type (Examination <-> Evaluation)
  useEffect(() => {
    if (!userEditedCountsRef.current) {
      setMcqCount(String(defaultMcqCount));
      setTheoryCount(String(defaultTheoryCount));
    }
  }, [defaultMcqCount, defaultTheoryCount, examType]);

  // Dynamic sync when parent changes Course / Class / Initial Topic — prevents stale topic bleed
  useEffect(() => {
    const nextScopeKey = `${classId || ''}:${courseId || ''}:${programId || ''}`;
    const scopeChanged = nextScopeKey !== lastScopeKeyRef.current;
    if (scopeChanged) {
      lastScopeKeyRef.current = nextScopeKey;
      userEditedTopicRef.current = false;
      setAiError(null);
      setAiSuccessMsg(null);
      setSelectedBankIds(new Set());
      if (isWeekDerivedSource) {
        setSourceText('');
        setSourceName('');
        setIsWeekDerivedSource(false);
      }
    }
    if (!userEditedTopicRef.current) {
      const nextTopic = initialTopic?.trim() || courseTitle?.trim() || '';
      if (nextTopic) setAiTopic(nextTopic);
      else if (scopeChanged) setAiTopic('');
    }
  }, [classId, courseId, programId, courseTitle, initialTopic, isWeekDerivedSource]);

  useEffect(() => {
    if (initialSourceText && !sourceText) {
      setSourceText(initialSourceText);
      setSourceName(initialSourceName || 'Taught weeks');
    }
  }, [initialSourceText, initialSourceName, sourceText]);

  // Default bank filter to current course when available
  useEffect(() => {
    if (courseTitle && bankQuestions.some((q) => q.track === courseTitle)) {
      setTrackFilter(courseTitle);
    } else {
      setTrackFilter('all');
    }
  }, [courseTitle, bankQuestions]);

  // Scoped fetch with AbortController so rapid class/course changes never bleed or race
  useEffect(() => {
    const controller = new AbortController();
    const run = async () => {
      setLoadingBank(true);
      try {
        const params = new URLSearchParams();
        if (courseId) params.set('course_id', courseId);
        if (programId) params.set('program_id', programId);
        if (classId) params.set('class_id', classId);

        const res = await fetch(`/api/cbt/question-bank?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok || controller.signal.aborted) return;
        const json = await res.json();
        if (controller.signal.aborted) return;

        setBankQuestions(Array.isArray(json.data?.questions) ? json.data.questions : []);

        const weeks: CurriculumWeekItem[] = Array.isArray(json.data?.curriculumWeeks)
          ? json.data.curriculumWeeks
          : [];
        setCurriculumWeeks(weeks);

        if (weeks.length > 0) {
          const taughtSet = new Set(weeks.filter((w) => w.taught).map((w) => w.week));
          const initialSet = taughtSet.size > 0 ? taughtSet : new Set(weeks.slice(0, 3).map((w) => w.week));
          setSelectedWeeks(initialSet);
        } else {
          setSelectedWeeks(new Set());
        }
      } catch {
        // Ignore aborted or offline fetches
      } finally {
        if (!controller.signal.aborted) {
          setLoadingBank(false);
        }
      }
    };
    void run();
    return () => controller.abort();
  }, [courseId, programId, classId]);

  // Detect premade questions inside uploaded .txt / .pdf / pasted text
  const detectedPremadeFromSource = useMemo(() => {
    if (!sourceText.trim() || isWeekDerivedSource) return [];
    return parsePremadeQuestionsFromText(sourceText, {
      sourceName: sourceName || 'Uploaded Document',
      defaultTrack: courseTitle || programName || aiTopic || 'Course Alignment',
    });
  }, [sourceText, sourceName, courseTitle, programName, aiTopic, isWeekDerivedSource]);

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

  // automatically default to 'append' if the paper already has real questions
  useEffect(() => {
    if (existingNormalizedSet.size > 0) {
      setImportBehavior('append');
    } else {
      setImportBehavior('replace');
    }
  }, [existingNormalizedSet.size]);

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
        weekNumber: null,
      }),
    [combinedBankQuestions, searchQuery, trackFilter, sourceFilter, typeFilter],
  );

  const applyWeekAlignmentToAi = useCallback(
    (weeksToAlign: Set<number>) => {
      const chosen = curriculumWeeks.filter((w) => weeksToAlign.has(w.week));
      if (chosen.length === 0) {
        if (isWeekDerivedSource) {
          setSourceText('');
          setSourceName('');
          setIsWeekDerivedSource(false);
        }
        return;
      }
      const brief = buildCurriculumAlignmentBrief(chosen, courseTitle);
      if (!userEditedTopicRef.current) {
        setAiTopic(brief.topicSummary);
      }
      setSourceText(brief.sourceMaterial);
      setSourceName(`Taught Weeks (${brief.weekNumbers.map((n) => `W${n}`).join(', ')})`);
      setIsWeekDerivedSource(true);
      setAiError(null);
    },
    [curriculumWeeks, courseTitle, isWeekDerivedSource],
  );

  const toggleWeekSelection = (weekNum: number) => {
    const next = new Set(selectedWeeks);
    if (next.has(weekNum)) next.delete(weekNum);
    else next.add(weekNum);
    setSelectedWeeks(next);
    applyWeekAlignmentToAi(next);
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
          setIsWeekDerivedSource(false);
          if (!aiTopic.trim()) {
            setAiTopic(file.name.replace(/\.(txt|md)$/i, '').replace(/[_-]/g, ' '));
          }
        }
      } else {
        const pdfText = await extractPdfText(file, 12000, setExtractMsg);
        if (pdfText) {
          setSourceText(pdfText);
          setSourceName(file.name);
          setIsWeekDerivedSource(false);
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
    // If the teacher uploaded/pasted premade questions, solve & align them automatically!
    if (detectedPremadeFromSource.length > 0) {
      await handleAiAlignAndSolvePremade(false);
      return;
    }

    // If curriculum weeks are selected and no custom sourceText is set yet, build the week brief on the fly
    let effectiveSourceText = sourceText.trim();
    let effectiveSourceName = sourceName.trim();
    if (!effectiveSourceText && selectedWeeks.size > 0 && curriculumWeeks.length > 0) {
      const chosen = curriculumWeeks.filter((w) => selectedWeeks.has(w.week));
      if (chosen.length > 0) {
        const brief = buildCurriculumAlignmentBrief(chosen, courseTitle);
        effectiveSourceText = brief.sourceMaterial;
        effectiveSourceName = `Taught Weeks (${brief.weekNumbers.map((n) => `W${n}`).join(', ')})`;
      }
    }

    const effectiveTopic =
      aiTopic.trim() || effectiveSourceName || courseTitle?.trim() || programName?.trim() || '';
    if (!effectiveTopic && !effectiveSourceText) {
      setAiError('Enter a topic, select a course/week, or upload a .txt / .pdf document first.');
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
          sourceName: effectiveSourceName || undefined,
          ...(effectiveSourceText ? { sourceMaterial: effectiveSourceText } : {}),
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
        effectiveSourceName || effectiveTopic || 'Aligned Blueprint',
      );

      if (generatedList.length === 0) {
        throw new Error('No valid questions were returned. Try refining your topic or source material.');
      }

      onImportQuestions(generatedList, importBehavior);
      setAiSuccessMsg(
        `Added ${generatedList.length} AI questions with verified answers & marking guides.`,
      );
    } catch (err: any) {
      setAiError(err?.message || 'Could not generate questions right now.');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleAiAlignAndSolvePremade = async (fromCurrentPaper = false) => {
    const serializedCurrent = fromCurrentPaper
      ? currentQuestions
          .filter((q) => String(q.question_text ?? '').trim())
          .map((q, idx) => {
            const opts =
              Array.isArray(q.options) && q.options.filter(Boolean).length > 0
                ? `\n${q.options
                    .filter(Boolean)
                    .map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`)
                    .join('\n')}`
                : '';
            const ans = String(q.correct_answer ?? '').trim() ? `\nAnswer: ${q.correct_answer}` : '';
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
          setAiSuccessMsg(`Extracted ${localParsed.length} questions from your document.`);
          return;
        }
        throw new Error(result.error || 'Failed to solve and align premade questions.');
      }

      const data = result.data;
      if (data?.blueprint) {
        setLastAiBlueprint(data.blueprint);
      }

      const solvedList = mapApiQuestionsToStudio(data?.questions ?? [], sourceName || effectiveTopic);
      if (solvedList.length === 0) {
        throw new Error('Could not extract questions from the provided text.');
      }

      // Never drop any locally parsed pasted questions if the AI returned fewer items
      let finalQuestions = solvedList;
      if (localParsed.length > 0 && solvedList.length < localParsed.length) {
        finalQuestions = localParsed.map((item, idx) => {
          const normStem = item.question_text.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60);
          const aiMatch =
            solvedList.find(
              (s) => s.question_text.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60) === normStem,
            ) || solvedList[idx];
          return {
            question_text: item.question_text,
            question_type: item.question_type,
            options: item.options,
            correct_answer: item.correct_answer || aiMatch?.correct_answer || '',
            marking_guide: item.marking_guide || aiMatch?.marking_guide || aiMatch?.explanation || '',
            points: item.points,
            section: item.section,
            explanation: item.explanation || item.marking_guide || aiMatch?.explanation || '',
            curriculumTag: item.curriculumTag || aiMatch?.curriculumTag,
            cognitiveLevel: item.difficulty || aiMatch?.cognitiveLevel,
          };
        });
      }

      onImportQuestions(finalQuestions, fromCurrentPaper ? 'replace' : importBehavior);
      setAiSuccessMsg(
        `Solved answers & marking guides for ${finalQuestions.length} questions!`,
      );
      setShowPasteBox(false);
    } catch (err: any) {
      setAiError(err?.message || 'Failed to solve premade questions.');
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
      'append',
    );
    setSelectedBankIds(new Set());
    setOpenDrawer('none');
  };

  if (disabled) return null;

  const targetTotal = (parseInt(mcqCount, 10) || 0) + (parseInt(theoryCount, 10) || 0);
  const hasPaperQuestions = currentQuestions.some((q) => String(q.question_text ?? '').trim().length > 0);
  const missingAnswersCount = Math.max(0, liveBlueprint.totalQuestions - liveBlueprint.answeredCount);

  return (
    <section
      aria-label="AI Question Generator and Question Bank"
      className="rounded-2xl border border-emerald-500/25 bg-card shadow-sm overflow-hidden"
    >
      {/* STREAMLINED MAIN AI BAR */}
      <div className="p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <SparklesIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-foreground tracking-tight flex items-center gap-2">
                AI Question Assistant
                {courseTitle && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                    {courseTitle}
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Generate from topic, taught weeks, or `.txt` / `.pdf` — answers &amp; marking guides are filled automatically.
              </p>
            </div>
          </div>

          {/* Secondary Quick Drawers: Past Questions & Blueprint Check */}
          <div className="flex flex-wrap items-center gap-1.5">
            {hasPaperQuestions && missingAnswersCount > 0 && (
              <button
                type="button"
                onClick={() => handleAiAlignAndSolvePremade(true)}
                disabled={aiSolvingPremade}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition-all disabled:opacity-50"
              >
                {aiSolvingPremade ? (
                  <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <SparklesIcon className="w-3.5 h-3.5" />
                )}
                Solve {missingAnswersCount} Missing Answer{missingAnswersCount === 1 ? '' : 's'}
              </button>
            )}

            <button
              type="button"
              onClick={() => setOpenDrawer((d) => (d === 'bank' ? 'none' : 'bank'))}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                openDrawer === 'bank'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border text-foreground hover:bg-muted'
              }`}
            >
              <BookOpenIcon className="w-3.5 h-3.5" />
              Past Questions ({combinedBankQuestions.length})
              <ChevronDownIcon className={`w-3 h-3 transition-transform ${openDrawer === 'bank' ? 'rotate-180' : ''}`} />
            </button>

            {hasPaperQuestions && (
              <button
                type="button"
                onClick={() => setOpenDrawer((d) => (d === 'blueprint' ? 'none' : 'blueprint'))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                  openDrawer === 'blueprint'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border text-foreground hover:bg-muted'
                }`}
              >
                <ChartBarIcon className="w-3.5 h-3.5" />
                Blueprint ({liveBlueprint.alignmentScore}%)
              </button>
            )}
          </div>
        </div>

        {/* Inline Taught Weeks Strip (only when weeks exist for this Class/Course) */}
        {curriculumWeeks.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1 mr-1">
              <AcademicCapIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Taught Weeks:
            </span>
            <button
              type="button"
              onClick={() => {
                const taught = new Set(curriculumWeeks.filter((w) => w.taught).map((w) => w.week));
                const target = taught.size > 0 ? taught : new Set(curriculumWeeks.map((w) => w.week));
                setSelectedWeeks(target);
                applyWeekAlignmentToAi(target);
              }}
              className="px-2 py-1 rounded-lg text-[11px] font-black bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/20"
            >
              All Taught
            </button>
            {curriculumWeeks.map((w) => {
              const active = selectedWeeks.has(w.week);
              return (
                <button
                  key={w.week}
                  type="button"
                  onClick={() => toggleWeekSelection(w.week)}
                  title={w.title}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                    active
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-background border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span>W{w.week}: {w.title.length > 22 ? `${w.title.slice(0, 22)}…` : w.title}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Primary Input Row: Topic + MCQ Count + Theory Count + Generate Button */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
          <div className="sm:col-span-5">
            <label className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
              Topic or Focus
            </label>
            <input
              type="text"
              value={aiTopic}
              onChange={(e) => {
                userEditedTopicRef.current = true;
                setAiTopic(e.target.value);
              }}
              placeholder={
                courseTitle
                  ? `e.g. ${courseTitle}`
                  : 'e.g. Python Loops, Robotics Sensors, HTML Forms'
              }
              className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:col-span-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                MCQ
              </label>
              <input
                type="number"
                min={0}
                max={maxQuestions}
                value={mcqCount}
                onChange={(e) => {
                  userEditedCountsRef.current = true;
                  setMcqCount(e.target.value);
                  onQuestionMixChange?.(parseInt(e.target.value, 10) || 0, parseInt(theoryCount, 10) || 0);
                }}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm font-bold text-foreground focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
                Theory
              </label>
              <input
                type="number"
                min={0}
                max={maxQuestions}
                value={theoryCount}
                onChange={(e) => {
                  userEditedCountsRef.current = true;
                  setTheoryCount(e.target.value);
                  onQuestionMixChange?.(parseInt(mcqCount, 10) || 0, parseInt(e.target.value, 10) || 0);
                }}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm font-bold text-foreground focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="sm:col-span-4">
            <button
              type="button"
              onClick={handleAiGenerate}
              disabled={aiGenerating || aiSolvingPremade}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all disabled:opacity-50"
            >
              {aiGenerating || aiSolvingPremade ? (
                <>
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  {detectedPremadeFromSource.length > 0 ? 'Solving Answers & Guide…' : 'Generating…'}
                </>
              ) : detectedPremadeFromSource.length > 0 ? (
                <>
                  <SparklesIcon className="w-4 h-4" />
                  Solve &amp; Import {detectedPremadeFromSource.length} Qs
                </>
              ) : (
                <>
                  <SparklesIcon className="w-4 h-4" />
                  Generate {targetTotal} Questions
                </>
              )}
            </button>
          </div>
        </div>

        {/* Compact File / Paste / Replace-vs-Append Footer Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/60 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {sourceName && !isWeekDerivedSource ? (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-primary/10 border border-primary/25 text-xs">
                <DocumentTextIcon className="w-3.5 h-3.5 text-primary" />
                <span className="font-bold text-foreground truncate max-w-[200px]">{sourceName}</span>
                {detectedPremadeFromSource.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 text-[10px] font-black">
                    {detectedPremadeFromSource.length} Qs found
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSourceText('');
                    setSourceName('');
                  }}
                  className="text-rose-600 dark:text-rose-400 hover:underline font-bold ml-1"
                >
                  ✕
                </button>
              </div>
            ) : (
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-border hover:border-primary/50 bg-background/60 cursor-pointer text-xs font-bold text-muted-foreground hover:text-foreground transition-colors">
                <DocumentTextIcon className="w-3.5 h-3.5 text-primary" />
                <span>{extractingFile ? extractMsg || 'Reading…' : 'Upload .TXT / .PDF'}</span>
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
            )}

            <button
              type="button"
              onClick={() => setShowPasteBox((v) => !v)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-background/60 hover:bg-muted text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPasteBox ? 'Hide Paste Box' : 'Paste Questions / Notes'}
            </button>
          </div>

          {hasPaperQuestions && (
            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-muted-foreground font-semibold mr-1">When adding:</span>
              <button
                type="button"
                onClick={() => setImportBehavior('append')}
                className={`px-2 py-1 rounded-md font-bold border ${
                  importBehavior === 'append'
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                    : 'border-border text-muted-foreground'
                }`}
              >
                Add to existing
              </button>
              <button
                type="button"
                onClick={() => setImportBehavior('replace')}
                className={`px-2 py-1 rounded-md font-bold border ${
                  importBehavior === 'replace'
                    ? 'bg-primary/15 border-primary/40 text-primary'
                    : 'border-border text-muted-foreground'
                }`}
              >
                Replace paper
              </button>
            </div>
          )}
        </div>

        {/* Collapsible Paste Box */}
        {showPasteBox && (
          <div className="rounded-xl border border-border bg-background/80 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-foreground">
                Paste Lesson Notes or Premade Questions (AI will solve missing answers &amp; write marking guides)
              </p>
              {detectedPremadeFromSource.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                    {detectedPremadeFromSource.length} questions detected
                  </span>
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
                      setShowPasteBox(false);
                      setAiSuccessMsg(`Imported ${detectedPremadeFromSource.length} questions directly.`);
                    }}
                    className="px-2.5 py-1 rounded-lg border border-border bg-card hover:bg-muted text-[11px] font-bold text-foreground"
                  >
                    Import Without AI
                  </button>
                </div>
              )}
            </div>
            <textarea
              rows={4}
              value={isWeekDerivedSource ? '' : sourceText}
              onChange={(e) => {
                setIsWeekDerivedSource(false);
                setSourceText(e.target.value);
                if (!sourceName && e.target.value.trim()) {
                  setSourceName('Pasted Script');
                }
              }}
              placeholder={`Paste notes or questions here, e.g.:\n1. What is the output of print(7 // 2)?\nA) 3.5  B) 3  C) 1  D) 14\n\n2. Explain two uses of loops in Python. [10 marks]`}
              className="w-full px-3 py-2 bg-card border border-border rounded-xl text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500 resize-y"
            />
          </div>
        )}

        {aiError && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center justify-between">
            <span>{aiError}</span>
            <button type="button" onClick={() => setAiError(null)} className="text-rose-700 dark:text-rose-300">
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        )}
        {aiSuccessMsg && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />
              {aiSuccessMsg}
            </span>
            <button type="button" onClick={() => setAiSuccessMsg(null)} className="text-emerald-700 dark:text-emerald-300">
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* COLLAPSIBLE DRAWER 1: PAST QUESTIONS BANK */}
      {openDrawer === 'bank' && (
        <div className="border-t border-border bg-background/50 p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
              Reuse Past Exam &amp; Lesson Questions
            </h3>
            <button
              type="button"
              onClick={() => setOpenDrawer('none')}
              className="text-xs font-bold text-muted-foreground hover:text-foreground"
            >
              Close ✕
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <div className="sm:col-span-2 relative">
              <MagnifyingGlassIcon className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search questions…"
                className="w-full pl-8 pr-3 py-2 bg-card border border-border rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <select
              value={trackFilter}
              onChange={(e) => setTrackFilter(e.target.value)}
              aria-label="Filter by course"
              className="px-3 py-2 bg-card border border-border rounded-xl text-xs font-bold text-foreground"
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
              className="px-3 py-2 bg-card border border-border rounded-xl text-xs font-bold text-foreground"
            >
              <option value="all">All Types</option>
              <option value="multiple_choice">MCQ</option>
              <option value="true_false">True / False</option>
              <option value="fill_blank">Fill Blank</option>
              <option value="essay">Theory / Essay</option>
            </select>
          </div>

          {selectedBankIds.size > 0 && (
            <div className="flex items-center justify-between rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-3.5 py-2">
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-200">
                {selectedBankIds.size} question{selectedBankIds.size === 1 ? '' : 's'} selected
              </span>
              <button
                type="button"
                onClick={handleImportSelectedPremade}
                className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black uppercase"
              >
                + Add Selected to Paper
              </button>
            </div>
          )}

          {loadingBank ? (
            <div className="py-6 text-center text-xs text-muted-foreground">Loading past questions…</div>
          ) : filteredBankQuestions.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No past questions match this filter yet.
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {filteredBankQuestions.map((item) => {
                const isChecked = selectedBankIds.has(item.id);
                const alreadyInPaper = existingNormalizedSet.has(item.question_text.trim().toLowerCase());
                return (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-3 text-xs"
                  >
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          const next = new Set(selectedBankIds);
                          if (next.has(item.id)) next.delete(item.id);
                          else next.add(item.id);
                          setSelectedBankIds(next);
                        }}
                        aria-label={`Select question ${item.question_text.slice(0, 30)}`}
                        className="mt-1 rounded border-border"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-black uppercase bg-primary/10 text-primary">
                            {item.question_type.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[10px] font-bold text-muted-foreground">{item.track}</span>
                          <span className="text-[10px] text-muted-foreground">· {item.points} pts</span>
                        </div>
                        <div className="text-foreground font-medium">
                          <CbtMarkdown text={item.question_text} />
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleImportSinglePremade(item)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-black flex-shrink-0 ${
                        alreadyInPaper
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'bg-primary/15 text-primary hover:bg-primary/25'
                      }`}
                    >
                      {alreadyInPaper ? 'Added' : '+ Add'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* COLLAPSIBLE DRAWER 2: COMPACT BLUEPRINT SUMMARY */}
      {openDrawer === 'blueprint' && (
        <div className="border-t border-border bg-background/50 p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
                Paper Blueprint &amp; Readiness ({liveBlueprint.alignmentScore}% Aligned)
              </h3>
              <p className="text-[11px] text-muted-foreground">{liveBlueprint.sourceSummary}</p>
            </div>
            <div className="flex items-center gap-2">
              {hasPaperQuestions && (
                <button
                  type="button"
                  onClick={() => handleAiAlignAndSolvePremade(true)}
                  disabled={aiSolvingPremade}
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black disabled:opacity-50"
                >
                  {aiSolvingPremade ? 'Solving…' : '✨ Auto-Fill Missing Answers & Guides'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpenDrawer('none')}
                className="text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                Close ✕
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="rounded-xl border border-border bg-card p-3">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">Questions &amp; Marks</span>
              <p className="text-sm font-black text-foreground mt-0.5">
                {liveBlueprint.totalQuestions} Qs · {liveBlueprint.totalPoints} pts
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">Answers Ready</span>
              <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                {liveBlueprint.answeredCount} / {liveBlueprint.totalQuestions}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">Marking Guides</span>
              <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                {liveBlueprint.markingGuideCount} / {liveBlueprint.totalQuestions}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">Mix</span>
              <p className="text-sm font-black text-foreground mt-0.5">
                {liveBlueprint.sections.objective.count} Obj · {liveBlueprint.sections.subjective.count} Theory
              </p>
            </div>
          </div>

          {liveBlueprint.readinessWarnings.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 space-y-1">
              <p className="font-black uppercase text-[10px] flex items-center gap-1">
                <ExclamationTriangleIcon className="w-3.5 h-3.5" /> Readiness Notes
              </p>
              <ul className="list-disc list-inside space-y-0.5">
                {liveBlueprint.readinessWarnings.slice(0, 3).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
