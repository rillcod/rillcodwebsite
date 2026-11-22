'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  SparklesIcon,
  AcademicCapIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from '@/lib/icons';
import {
  ACCEPTED_DOCUMENT_EXTENSIONS,
  analyzeExtractedDocument,
  buildCombinedSourceMaterial,
  classifyDocumentRole,
  extractDocumentText,
  type ExtractedSourceDocument,
} from '@/lib/files/extract-document-text';
import type { AiDocumentAnalysis } from '@/app/api/ai/analyze-document/route';
import CbtMarkdown from '@/components/cbt/CbtMarkdown';
import {
  buildAssessmentBlueprint,
  buildCurriculumAlignmentBrief,
  dedupeCbtQuestions,
  filterPremadeQuestions,
  parsePremadeQuestionsFromText,
  resolveMcqAnswerToOption,
  stripOptionPrefix,
  type AssessmentBlueprint,
  type CurriculumWeekItem,
  type PremadeQuestionItem,
} from '@/lib/cbt/question-bank-catalog';
import { enforceExactQuestionMix } from '@/lib/cbt/examiner-presets';
import { createClient } from '@/lib/supabase/client';
import { compressStudentImage } from '@/lib/files/compress-student-image';
import { toast } from 'sonner';

export interface StudioCourseLessonOption {
  id: string;
  title: string;
  session_number?: number | null;
  content?: string | null;
  lesson_materials?: Array<{
    id: string;
    title: string;
    file_url: string;
    file_type?: string | null;
  }>;
}

export interface StudioGeneratedQuestion {
  question_text: string;
  question_type: 'multiple_choice' | 'true_false' | 'fill_blank' | 'short_answer' | 'essay' | 'coding_blocks';
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
  /** Incrementing nonce from parent Examiner Blueprint presets to force-sync counts even after prior edits. */
  presetSyncVersion?: number;
  /** Optional list of course lessons & their uploaded study materials for 1-click pull & publish. */
  courseLessons?: StudioCourseLessonOption[];
  /** Optional default lesson ID when publishing an uploaded file to student study materials. */
  defaultTargetLessonId?: string | null;
  /** Called when the teacher pulls or publishes a lesson material so the exam can auto-reference & lock it. */
  onReferenceLessonMaterial?: (
    lessonId: string,
    newMaterial?: { id: string; title: string; file_url: string; file_type?: string | null },
  ) => void;
  /** Called when the teacher unshares/deletes a lesson material from the studio so parent state stays synced. */
  onRemoveLessonMaterial?: (lessonId: string, materialId: string) => void;
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
  presetSyncVersion = 0,
  courseLessons: propCourseLessons,
  defaultTargetLessonId = null,
  onReferenceLessonMaterial,
  onRemoveLessonMaterial,
  minQuestions = 1,
  maxQuestions = 100,
  disabled = false,
}: QuestionAuthoringStudioProps) {
  // Clean segmented studio modes
  const [activeTab, setActiveTab] = useState<'generate' | 'premade' | 'bank' | 'blueprint'>('generate');

  // Scoped data from /api/cbt/question-bank
  const [bankQuestions, setBankQuestions] = useState<PremadeQuestionItem[]>([]);
  const [curriculumWeeks, setCurriculumWeeks] = useState<CurriculumWeekItem[]>([]);
  const [loadingBank, setLoadingBank] = useState(false);
  const [selectedWeeks, setSelectedWeeks] = useState<Set<number>>(new Set());

  // AI Question Bar state
  const [aiTopic, setAiTopic] = useState(initialTopic);
  const [sourceText, setSourceText] = useState(initialSourceText);
  const [sourceName, setSourceName] = useState(initialSourceName);
  const [uploadedDocs, setUploadedDocs] = useState<ExtractedSourceDocument[]>([]);
  const [strictFileOnly, setStrictFileOnly] = useState(true);
  const [isWeekDerivedSource, setIsWeekDerivedSource] = useState(false);
  const [mcqCount, setMcqCount] = useState(String(defaultMcqCount));
  const [theoryCount, setTheoryCount] = useState(String(defaultTheoryCount));
  const [importBehavior, setImportBehavior] = useState<'append' | 'replace'>('replace');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiSolvingPremade, setAiSolvingPremade] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuccessMsg, setAiSuccessMsg] = useState<string | null>(null);
  const [extractingFile, setExtractingFile] = useState(false);
  const [extractMsg, setExtractMsg] = useState('');
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [showDocPreview, setShowDocPreview] = useState(false);
  const [showAiAnalysisDetails, setShowAiAnalysisDetails] = useState(false);
  const [aiDocAnalysis, setAiDocAnalysis] = useState<AiDocumentAnalysis | null>(null);
  const [analyzingDocs, setAnalyzingDocs] = useState(false);
  const [selectedFocusConcepts, setSelectedFocusConcepts] = useState<Set<string>>(new Set());
  const [articleUrl, setArticleUrl] = useState('');
  const [fetchingArticle, setFetchingArticle] = useState(false);
  const [lastAiBlueprint, setLastAiBlueprint] = useState<AssessmentBlueprint | null>(null);

  // Study Materials Library (Pull existing lesson materials + 1-click publish uploaded files to students)
  const [loadedCourseLessons, setLoadedCourseLessons] = useState<StudioCourseLessonOption[]>([]);
  const [allLessonsCache, setAllLessonsCache] = useState<StudioCourseLessonOption[]>([]);
  const [loadingAllLessons, setLoadingAllLessons] = useState(false);
  const [materialsScope, setMaterialsScope] = useState<'course' | 'all'>('course');
  const [showMaterialsLibrary, setShowMaterialsLibrary] = useState(false);
  const [materialsSearch, setMaterialsSearch] = useState('');
  const [selectedMaterialKeys, setSelectedMaterialKeys] = useState<Set<string>>(new Set());
  const [pullingMaterialId, setPullingMaterialId] = useState<string | null>(null);
  const [bulkPulling, setBulkPulling] = useState(false);
  const [publishingDocId, setPublishingDocId] = useState<string | null>(null);
  const [bulkPublishing, setBulkPublishing] = useState(false);
  const [publishedDocIds, setPublishedDocIds] = useState<Set<string>>(new Set());
  const [publishedMaterialByDocId, setPublishedMaterialByDocId] = useState<Record<string, { lessonId: string; materialId: string; title: string }>>({});
  const [unsharingKey, setUnsharingKey] = useState<string | null>(null);
  const [shareNotice, setShareNotice] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [publishLessonId, setPublishLessonId] = useState<string>(defaultTargetLessonId || '');
  const [autoPublishToStudents, setAutoPublishToStudents] = useState(false);
  const rawFilesRef = useRef<Map<string, File>>(new Map());

  const courseScopedLessons = useMemo(
    () => (propCourseLessons && propCourseLessons.length > 0 ? propCourseLessons : loadedCourseLessons),
    [propCourseLessons, loadedCourseLessons],
  );

  const availableLessons = useMemo(
    () => (materialsScope === 'all' && allLessonsCache.length > 0 ? allLessonsCache : courseScopedLessons),
    [materialsScope, allLessonsCache, courseScopedLessons],
  );

  // Lazy-load across all lessons when teacher switches to "All Lessons" search scope
  useEffect(() => {
    if (materialsScope !== 'all' || allLessonsCache.length > 0) return;
    let cancelled = false;
    setLoadingAllLessons(true);
    const db = createClient();
    db.from('lessons')
      .select('id, title, session_number, content, lesson_materials(id, title, file_url, file_type)')
      .order('created_at', { ascending: false })
      .limit(80)
      .then(({ data }) => {
        if (cancelled) return;
        setAllLessonsCache((data ?? []) as StudioCourseLessonOption[]);
        setLoadingAllLessons(false);
      });
    return () => { cancelled = true; };
  }, [materialsScope, allLessonsCache.length]);

  // Keep default target lesson synced for 1-click "Share to Students"
  useEffect(() => {
    if (defaultTargetLessonId) {
      setPublishLessonId(defaultTargetLessonId);
    } else if (!publishLessonId && availableLessons.length > 0) {
      setPublishLessonId(availableLessons[0].id);
    }
  }, [defaultTargetLessonId, availableLessons, publishLessonId]);

  // Self-load course lessons & study materials when parent didn't pass them (e.g., CBT edit / Written exams)
  useEffect(() => {
    if (propCourseLessons && propCourseLessons.length > 0) return;
    if (!courseId) {
      setLoadedCourseLessons([]);
      return;
    }
    let cancelled = false;
    const db = createClient();
    db.from('lessons')
      .select('id, title, session_number, content, lesson_materials(id, title, file_url, file_type)')
      .eq('course_id', courseId)
      .order('session_number', { ascending: true })
      .limit(40)
      .then(({ data }) => {
        if (cancelled) return;
        setLoadedCourseLessons((data ?? []) as StudioCourseLessonOption[]);
      });
    return () => { cancelled = true; };
  }, [courseId, propCourseLessons]);

  // Track manual edits to prevent stale bleed while still updating dynamically on context switches
  const userEditedTopicRef = useRef(false);
  const userEditedCountsRef = useRef(false);
  const lastScopeKeyRef = useRef(`${classId || ''}:${courseId || ''}:${programId || ''}`);
  const aiAbortRef = useRef<AbortController | null>(null);
  const aiUserCancelledRef = useRef(false);

  const cancelAiGeneration = () => {
    aiUserCancelledRef.current = true;
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    setAiGenerating(false);
    setAiSolvingPremade(false);
  };

  useEffect(() => {
    return () => {
      aiAbortRef.current?.abort();
    };
  }, []);

  // Premade Bank filters
  const [searchQuery, setSearchQuery] = useState('');
  const [trackFilter, setTrackFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sectionFilter, setSectionFilter] = useState<'all' | 'objective' | 'subjective'>('all');
  const [selectedBankIds, setSelectedBankIds] = useState<Set<string>>(new Set());

  // Dynamic sync when parent changes Exam Type (Examination <-> Evaluation)
  useEffect(() => {
    if (!userEditedCountsRef.current) {
      setMcqCount(String(defaultMcqCount));
      setTheoryCount(String(defaultTheoryCount));
    }
  }, [defaultMcqCount, defaultTheoryCount, examType]);

  // Explicit Examiner Blueprint preset click from parent always updates counts,
  // even after the first generation or prior manual edits.
  useEffect(() => {
    if (presetSyncVersion > 0) {
      userEditedCountsRef.current = false;
      setMcqCount(String(defaultMcqCount));
      setTheoryCount(String(defaultTheoryCount));
    }
  }, [presetSyncVersion, defaultMcqCount, defaultTheoryCount]);

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

  // Detect premade questions inside uploaded Question Paper + Answer Key file(s) OR pasted text
  const detectedPremadeFromSource = useMemo(() => {
    const selectedQuestionDocs = uploadedDocs.filter(
      (d) => d.selected && (d.role === 'question_paper' || d.role === 'answer_key'),
    );
    const hasUploadedQuestionPaper = selectedQuestionDocs.some((d) => d.role === 'question_paper');
    const pasted = !isWeekDerivedSource ? sourceText.trim() : '';
    const textToParse = hasUploadedQuestionPaper
      ? buildCombinedSourceMaterial(selectedQuestionDocs, pasted, 24_000).combinedText
      : pasted;
    if (!textToParse.trim()) return [];
    return parsePremadeQuestionsFromText(textToParse, {
      sourceName: sourceName || 'Uploaded Document',
      defaultTrack: courseTitle || programName || aiTopic || 'Course Alignment',
    });
  }, [uploadedDocs, sourceText, sourceName, courseTitle, programName, aiTopic, isWeekDerivedSource]);

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

  const premadeSegmentation = useMemo(() => {
    const objective = detectedPremadeFromSource.filter(
      (q) => q.question_type === 'multiple_choice' || q.question_type === 'true_false',
    ).length;
    const fillBlank = detectedPremadeFromSource.filter((q) => q.question_type === 'fill_blank').length;
    const essay = detectedPremadeFromSource.filter((q) => q.question_type === 'essay').length;
    const needsAi = detectedPremadeFromSource.filter(
      (q) => q.needsAiAnswer || !q.correct_answer?.trim() || !q.marking_guide?.trim(),
    ).length;
    return { objective, fillBlank, essay, needsAi };
  }, [detectedPremadeFromSource]);

  const filteredBankQuestions = useMemo(
    () =>
      filterPremadeQuestions(combinedBankQuestions, {
        search: searchQuery,
        track: trackFilter,
        source: sourceFilter,
        questionType: typeFilter,
        weekNumber: null,
      }).filter((item) => {
        if (sectionFilter === 'all') return true;
        const isObj = item.question_type === 'multiple_choice' || item.question_type === 'true_false';
        return sectionFilter === 'objective' ? isObj : !isObj;
      }),
    [combinedBankQuestions, searchQuery, trackFilter, sourceFilter, typeFilter, sectionFilter],
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

  const selectedUploadedDocs = useMemo(
    () => uploadedDocs.filter((d) => d.selected && d.text.trim().length > 0),
    [uploadedDocs],
  );

  const runAiDocumentAnalysis = async (docsToAnalyze: ExtractedSourceDocument[]) => {
    const active = docsToAnalyze.filter((d) => d.selected && d.text.trim().length > 0);
    if (active.length === 0) {
      setAiDocAnalysis(null);
      setSelectedFocusConcepts(new Set());
      return;
    }
    const combined = buildCombinedSourceMaterial(active, '', 22_000).combinedText;
    if (combined.length < 30) return;
    setAnalyzingDocs(true);
    try {
      const res = await fetch('/api/ai/analyze-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          combinedText: combined,
          fileNames: active.map((d) => d.name),
          totalSections: active.reduce((sum, d) => sum + d.sectionCount, 0),
          totalWords: active.reduce((sum, d) => sum + d.wordCount, 0),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.data) {
        const analysis = json.data as AiDocumentAnalysis;
        setAiDocAnalysis(analysis);
        setSelectedFocusConcepts(new Set(analysis.keyConcepts ?? []));
        if (!userEditedTopicRef.current && analysis.subject && analysis.subject !== 'General Studies') {
          setAiTopic(analysis.subject);
        }
        // Never silently overwrite the teacher's selected Objective/Theory counts;
        // surface analysis.recommendedMix as an explicit 1-click "Apply Mix" pill instead.
      }
    } catch {
      // Non-blocking: local extraction & analysis still works seamlessly
    } finally {
      setAnalyzingDocs(false);
    }
  };

  const handleFilesUpload = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(Boolean);
    if (files.length === 0) return;

    setExtractingFile(true);
    setAiError(null);
    setAiSuccessMsg(null);

    const added: ExtractedSourceDocument[] = [];
    const failedNames: string[] = [];

    try {
      setExtractMsg(files.length > 1 ? `Reading ${files.length} files in parallel…` : `Reading ${files[0].name}…`);
      const settled = await Promise.all(
        files.map(async (file, idx) => {
          try {
            const { kind, text } = await extractDocumentText(file, 28_000, (msg) => {
              if (files.length === 1) setExtractMsg(msg);
            });
            if (!text || text.trim().length < 15) return { ok: false as const, name: file.name };
            const clean = text.trim();
            const words = clean.split(/\s+/).filter(Boolean).length;
            const role = classifyDocumentRole(file.name, clean);
            const analysis = analyzeExtractedDocument(clean);
            const docId = `${Date.now()}-${idx}-${file.name}`;
            rawFilesRef.current.set(docId, file);
            const docItem: ExtractedSourceDocument = {
              id: docId,
              name: file.name,
              kind,
              role,
              text: clean,
              charCount: clean.length,
              wordCount: words,
              sectionCount: analysis.sectionCount,
              detectedTopics: analysis.detectedTopics,
              hasCode: analysis.hasCode,
              detectedQuestionCount: analysis.detectedQuestionCount,
              qualityLevel: analysis.qualityLevel,
              selected: true,
            };
            return { ok: true as const, doc: docItem };
          } catch {
            return { ok: false as const, name: file.name };
          }
        }),
      );

      for (const item of settled) {
        if (item.ok) added.push(item.doc);
        else failedNames.push(item.name);
      }

      if (added.length > 0) {
        const byName = new Map(uploadedDocs.map((d) => [d.name.toLowerCase(), d]));
        for (const item of added) {
          byName.set(item.name.toLowerCase(), item);
        }
        const mergedDocs = Array.from(byName.values());
        const { summaryLabel } = buildCombinedSourceMaterial(mergedDocs);

        setUploadedDocs(mergedDocs);
        setSourceName(summaryLabel);
        setIsWeekDerivedSource(false);

        if (!aiTopic.trim()) {
          const baseName = added[0].name
            .replace(/\.(pdf|pptx?|docx?|txt|md|csv|rtf|png|jpe?g|webp)$/i, '')
            .replace(/[_-]+/g, ' ')
            .trim();
          if (baseName) setAiTopic(baseName);
        }

        setAiSuccessMsg(
          added.length === 1
            ? `Extracted "${added[0].name}" (${added[0].wordCount.toLocaleString()} words) — running fast AI analysis…`
            : `Extracted ${added.length} files (${added.reduce((s, d) => s + d.wordCount, 0).toLocaleString()} words) — running fast AI analysis…`,
        );
        void runAiDocumentAnalysis(mergedDocs);
        if (autoPublishToStudents && (publishLessonId || availableLessons[0]?.id)) {
          void (async () => {
            for (const docItem of added) {
              await handlePublishDocToStudents(docItem);
            }
          })();
        }
      }

      if (failedNames.length > 0) {
        setAiError(
          `Could not read readable text from: ${failedNames.join(', ')}. Make sure slides/docs contain text (or try .pptx, .docx, .pdf, or .txt).`,
        );
      }
    } finally {
      setExtractingFile(false);
      setExtractMsg('');
    }
  };

  const handlePullStudyMaterial = async (
    lesson: StudioCourseLessonOption,
    material?: { id: string; title: string; file_url: string; file_type?: string | null },
  ) => {
    const busyKey = material ? `mat:${material.id}` : `lesson:${lesson.id}`;
    setPullingMaterialId(busyKey);
    setAiError(null);
    setAiSuccessMsg(null);
    try {
      let docItem: ExtractedSourceDocument;
      if (material) {
        const cleanTitle = material.title.replace(/^\[PRIORITY\]\s*/i, '').trim() || 'Study Material';
        const res = await fetch(material.file_url);
        if (!res.ok) throw new Error(`Could not load "${cleanTitle}" (${res.status}).`);
        const blob = await res.blob();
        const ext = (material.file_type || material.file_url.split('.').pop()?.split('?')[0] || 'pdf').toLowerCase();
        const fileName = cleanTitle.toLowerCase().endsWith(`.${ext}`) ? cleanTitle : `${cleanTitle}.${ext}`;
        const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
        const { kind, text } = await extractDocumentText(file, 28_000);
        if (!text || text.trim().length < 15) {
          throw new Error(`No readable text could be extracted from "${cleanTitle}".`);
        }
        const clean = text.trim();
        const words = clean.split(/\s+/).filter(Boolean).length;
        const analysis = analyzeExtractedDocument(clean);
        docItem = {
          id: `study-${material.id}`,
          name: cleanTitle,
          kind,
          role: classifyDocumentRole(cleanTitle, clean),
          text: clean,
          charCount: clean.length,
          wordCount: words,
          sectionCount: analysis.sectionCount,
          detectedTopics: analysis.detectedTopics,
          hasCode: analysis.hasCode,
          detectedQuestionCount: analysis.detectedQuestionCount,
          qualityLevel: analysis.qualityLevel,
          selected: true,
        };
      } else {
        const rawNotes = String(lesson.content || '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (rawNotes.length < 20) {
          throw new Error(`Lesson "${lesson.title}" has no written notes yet.`);
        }
        const words = rawNotes.split(/\s+/).filter(Boolean).length;
        const analysis = analyzeExtractedDocument(rawNotes);
        docItem = {
          id: `lesson-note-${lesson.id}`,
          name: `Lesson: ${lesson.title}`,
          kind: 'txt',
          role: classifyDocumentRole(lesson.title, rawNotes),
          text: rawNotes.slice(0, 28_000),
          charCount: Math.min(rawNotes.length, 28_000),
          wordCount: words,
          sectionCount: analysis.sectionCount,
          detectedTopics: analysis.detectedTopics,
          hasCode: analysis.hasCode,
          detectedQuestionCount: analysis.detectedQuestionCount,
          qualityLevel: analysis.qualityLevel,
          selected: true,
        };
      }

      const byName = new Map(uploadedDocs.map((d) => [d.name.toLowerCase(), d]));
      byName.set(docItem.name.toLowerCase(), docItem);
      const mergedDocs = Array.from(byName.values());
      const { summaryLabel } = buildCombinedSourceMaterial(mergedDocs);
      setUploadedDocs(mergedDocs);
      setSourceName(summaryLabel);
      setIsWeekDerivedSource(false);
      setPublishedDocIds((prev) => new Set(prev).add(docItem.id));
      onReferenceLessonMaterial?.(lesson.id);
      if (!userEditedTopicRef.current && !aiTopic.trim()) {
        setAiTopic(lesson.title);
      }
      setAiSuccessMsg(`Pulled "${docItem.name}" (${docItem.wordCount.toLocaleString()} words) & auto-linked for exam lockdown.`);
      void runAiDocumentAnalysis(mergedDocs);
    } catch (err: any) {
      setAiError(err?.message || 'Could not pull that study material.');
    } finally {
      setPullingMaterialId(null);
    }
  };

  const normalizeMaterialKey = (raw: string) =>
    raw
      .replace(/^\[PRIORITY\]\s*/i, '')
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  const handleUnshareStudyMaterial = async (lessonId: string, materialId: string, title: string, docId?: string) => {
    const busyKey = docId || `mat:${materialId}`;
    setUnsharingKey(busyKey);
    setShareNotice(null);
    try {
      const res = await fetch(`/api/lessons/${lessonId}/materials/${materialId}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Could not delete this study material.');
      setLoadedCourseLessons((prev) =>
        prev.map((l) =>
          l.id === lessonId
            ? { ...l, lesson_materials: (l.lesson_materials ?? []).filter((m) => m.id !== materialId) }
            : l,
        ),
      );
      setAllLessonsCache((prev) =>
        prev.map((l) =>
          l.id === lessonId
            ? { ...l, lesson_materials: (l.lesson_materials ?? []).filter((m) => m.id !== materialId) }
            : l,
        ),
      );
      onRemoveLessonMaterial?.(lessonId, materialId);
      if (docId) {
        setPublishedDocIds((prev) => {
          const next = new Set(prev);
          next.delete(docId);
          return next;
        });
        setPublishedMaterialByDocId((prev) => {
          const next = { ...prev };
          delete next[docId];
          return next;
        });
      }
      const msg = `Unshared & deleted "${title}" from Student Study Materials.`;
      setShareNotice({ type: 'info', text: msg });
      toast.success(msg);
    } catch (err: any) {
      const msg = err?.message || 'Could not unshare study material.';
      setShareNotice({ type: 'error', text: msg });
      toast.error(msg);
    } finally {
      setUnsharingKey(null);
    }
  };

  const handlePublishDocToStudents = async (doc: ExtractedSourceDocument) => {
    const rawFile = rawFilesRef.current.get(doc.id);
    const targetLessonId = publishLessonId || availableLessons[0]?.id;
    if (!rawFile) {
      const msg = 'This item is already text-only or already stored in Study Materials.';
      setShareNotice({ type: 'info', text: msg });
      toast.info(msg);
      return;
    }
    if (!targetLessonId) {
      const msg = 'Select a course with at least one lesson first so students know where to read this material.';
      setShareNotice({ type: 'error', text: msg });
      toast.error(msg);
      return;
    }

    const cleanTitle = doc.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || doc.name;
    const targetLesson = availableLessons.find((l) => l.id === targetLessonId);
    const lessonTitle = targetLesson?.title || 'the lesson';

    // Duplicate prevention: check if this material title already exists on the target lesson
    const existingDuplicate = (targetLesson?.lesson_materials ?? []).find(
      (m) => normalizeMaterialKey(m.title) === normalizeMaterialKey(cleanTitle),
    );
    if (existingDuplicate) {
      setPublishedDocIds((prev) => new Set(prev).add(doc.id));
      setPublishedMaterialByDocId((prev) => ({
        ...prev,
        [doc.id]: { lessonId: targetLessonId, materialId: existingDuplicate.id, title: cleanTitle },
      }));
      onReferenceLessonMaterial?.(targetLessonId);
      const msg = `"${cleanTitle}" is already shared in "${lessonTitle}" — linked without duplicating! Click Unshare to remove it.`;
      setShareNotice({ type: 'info', text: msg });
      toast.info(msg);
      return;
    }

    setPublishingDocId(doc.id);
    setAiError(null);
    setShareNotice(null);
    try {
      const uploadable = await compressStudentImage(rawFile, {
        maxDimension: 1440,
        targetBytes: 240 * 1024,
      });
      const fd = new FormData();
      fd.append('file', uploadable);
      const upRes = await fetch('/api/files/upload', { method: 'POST', body: fd });
      const upJson = await upRes.json().catch(() => ({}));
      if (!upRes.ok) throw new Error(upJson?.error || `Upload failed for "${doc.name}"`);
      const fileUrl = upJson?.data?.public_url || upJson?.data?.url || upJson?.data?.receipt?.url;
      if (!fileUrl) throw new Error('No file URL returned from storage.');

      const ext = (doc.name.split('.').pop() || 'file').toLowerCase();
      const matRes = await fetch(`/api/lessons/${targetLessonId}/materials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `[PRIORITY] ${cleanTitle}`,
          file_url: fileUrl,
          file_type: ext,
        }),
      });
      const matJson = await matRes.json().catch(() => ({}));
      if (!matRes.ok || !matJson?.data) {
        throw new Error(matJson?.error || 'Could not publish material to lesson.');
      }
      setPublishedDocIds((prev) => new Set(prev).add(doc.id));
      setPublishedMaterialByDocId((prev) => ({
        ...prev,
        [doc.id]: { lessonId: targetLessonId, materialId: matJson.data.id, title: cleanTitle },
      }));
      const createdMaterial = {
        id: matJson.data.id,
        title: matJson.data.title,
        file_url: matJson.data.file_url,
        file_type: matJson.data.file_type ?? ext,
      };
      setLoadedCourseLessons((prev) =>
        prev.map((l) =>
          l.id === targetLessonId
            ? { ...l, lesson_materials: [createdMaterial, ...(l.lesson_materials ?? [])] }
            : l,
        ),
      );
      setAllLessonsCache((prev) =>
        prev.map((l) =>
          l.id === targetLessonId
            ? { ...l, lesson_materials: [createdMaterial, ...(l.lesson_materials ?? [])] }
            : l,
        ),
      );
      onReferenceLessonMaterial?.(targetLessonId, createdMaterial);
      const msg = `Shared "${cleanTitle}" to students in "${lessonTitle}" as a Priority Material (auto-locked during exam).`;
      setShareNotice({ type: 'success', text: msg });
      toast.success(msg);
    } catch (err: any) {
      const msg = err?.message || 'Could not publish to Student Study Materials.';
      setShareNotice({ type: 'error', text: msg });
      toast.error(msg);
    } finally {
      setPublishingDocId(null);
    }
  };

  const handlePullSelectedMaterials = async () => {
    if (selectedMaterialKeys.size === 0) return;
    setBulkPulling(true);
    setAiError(null);
    setAiSuccessMsg(null);
    try {
      const tasks: Array<Promise<{ doc: ExtractedSourceDocument; lessonId: string } | null>> = [];
      for (const key of selectedMaterialKeys) {
        if (key.startsWith('note:')) {
          const lessonId = key.slice(5);
          const lesson = availableLessons.find((l) => l.id === lessonId);
          if (!lesson) continue;
          tasks.push(
            (async () => {
              const rawNotes = String(lesson.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
              if (rawNotes.length < 20) return null;
              const words = rawNotes.split(/\s+/).filter(Boolean).length;
              const analysis = analyzeExtractedDocument(rawNotes);
              return {
                lessonId: lesson.id,
                doc: {
                  id: `lesson-note-${lesson.id}`,
                  name: `Lesson: ${lesson.title}`,
                  kind: 'txt' as const,
                  role: classifyDocumentRole(lesson.title, rawNotes),
                  text: rawNotes.slice(0, 28_000),
                  charCount: Math.min(rawNotes.length, 28_000),
                  wordCount: words,
                  sectionCount: analysis.sectionCount,
                  detectedTopics: analysis.detectedTopics,
                  hasCode: analysis.hasCode,
                  detectedQuestionCount: analysis.detectedQuestionCount,
                  qualityLevel: analysis.qualityLevel,
                  selected: true,
                },
              };
            })(),
          );
        } else if (key.startsWith('mat:')) {
          const [, lessonId, matId] = key.split(':');
          const lesson = availableLessons.find((l) => l.id === lessonId);
          const material = lesson?.lesson_materials?.find((m) => m.id === matId);
          if (!lesson || !material) continue;
          tasks.push(
            (async () => {
              try {
                const cleanTitle = material.title.replace(/^\[PRIORITY\]\s*/i, '').trim() || 'Study Material';
                const res = await fetch(material.file_url);
                if (!res.ok) return null;
                const blob = await res.blob();
                const ext = (material.file_type || material.file_url.split('.').pop()?.split('?')[0] || 'pdf').toLowerCase();
                const fileName = cleanTitle.toLowerCase().endsWith(`.${ext}`) ? cleanTitle : `${cleanTitle}.${ext}`;
                const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
                const { kind, text } = await extractDocumentText(file, 28_000);
                if (!text || text.trim().length < 15) return null;
                const clean = text.trim();
                const words = clean.split(/\s+/).filter(Boolean).length;
                const analysis = analyzeExtractedDocument(clean);
                return {
                  lessonId: lesson.id,
                  doc: {
                    id: `study-${material.id}`,
                    name: cleanTitle,
                    kind,
                    role: classifyDocumentRole(cleanTitle, clean),
                    text: clean,
                    charCount: clean.length,
                    wordCount: words,
                    sectionCount: analysis.sectionCount,
                    detectedTopics: analysis.detectedTopics,
                    hasCode: analysis.hasCode,
                    detectedQuestionCount: analysis.detectedQuestionCount,
                    qualityLevel: analysis.qualityLevel,
                    selected: true,
                  },
                };
              } catch {
                return null;
              }
            })(),
          );
        }
      }

      const settled = (await Promise.all(tasks)).filter((x): x is { doc: ExtractedSourceDocument; lessonId: string } => Boolean(x));
      if (settled.length === 0) {
        setAiError('Could not extract readable text from the ticked study materials.');
        return;
      }
      const byName = new Map(uploadedDocs.map((d) => [d.name.toLowerCase(), d]));
      const nextPub = new Set(publishedDocIds);
      for (const item of settled) {
        byName.set(item.doc.name.toLowerCase(), item.doc);
        nextPub.add(item.doc.id);
        onReferenceLessonMaterial?.(item.lessonId);
      }
      const mergedDocs = Array.from(byName.values());
      const { summaryLabel } = buildCombinedSourceMaterial(mergedDocs);
      setUploadedDocs(mergedDocs);
      setSourceName(summaryLabel);
      setIsWeekDerivedSource(false);
      setPublishedDocIds(nextPub);
      setSelectedMaterialKeys(new Set());
      setShowMaterialsLibrary(false);
      setAiSuccessMsg(
        `Pulled ${settled.length} study material${settled.length === 1 ? '' : 's'} at once & auto-linked for exam lockdown.`,
      );
      void runAiDocumentAnalysis(mergedDocs);
    } finally {
      setBulkPulling(false);
    }
  };

  const handlePublishAllDocsToStudents = async () => {
    const unshared = uploadedDocs.filter((d) => rawFilesRef.current.has(d.id) && !publishedDocIds.has(d.id));
    if (unshared.length === 0) return;
    setBulkPublishing(true);
    try {
      for (const doc of unshared) {
        await handlePublishDocToStudents(doc);
      }
    } finally {
      setBulkPublishing(false);
    }
  };

  const handleImportArticleUrl = async () => {
    const trimmed = articleUrl.trim();
    if (!trimmed) return;
    setFetchingArticle(true);
    setAiError(null);
    setAiSuccessMsg(null);
    try {
      const res = await fetch('/api/ai/extract-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.data?.text) {
        throw new Error(json?.error || 'Could not extract readable text from that URL.');
      }
      const clean = String(json.data.text).trim();
      const title = String(json.data.title || 'Web Article').trim();
      const analysis = analyzeExtractedDocument(clean);
      const docItem: ExtractedSourceDocument = {
        id: `url-${Date.now()}`,
        name: `${title.slice(0, 60)} (Article)`,
        kind: 'txt',
        role: 'study_material',
        text: clean,
        charCount: clean.length,
        wordCount: Number(json.data.wordCount) || clean.split(/\s+/).filter(Boolean).length,
        sectionCount: analysis.sectionCount,
        detectedTopics: analysis.detectedTopics,
        hasCode: analysis.hasCode,
        detectedQuestionCount: analysis.detectedQuestionCount,
        qualityLevel: analysis.qualityLevel,
        selected: true,
      };
      const mergedDocs = [...uploadedDocs, docItem];
      const { summaryLabel } = buildCombinedSourceMaterial(mergedDocs);
      setUploadedDocs(mergedDocs);
      setSourceName(summaryLabel);
      setIsWeekDerivedSource(false);
      if (!aiTopic.trim()) setAiTopic(title.slice(0, 80));
      setArticleUrl('');
      setAiSuccessMsg(`Imported article "${title}" (${docItem.wordCount.toLocaleString()} words) — running AI analysis…`);
      void runAiDocumentAnalysis(mergedDocs);
    } catch (err: any) {
      setAiError(err?.message || 'Could not extract article URL.');
    } finally {
      setFetchingArticle(false);
    }
  };

  const toggleUploadedDoc = (docId: string) => {
    const next = uploadedDocs.map((d) => (d.id === docId ? { ...d, selected: !d.selected } : d));
    const { summaryLabel } = buildCombinedSourceMaterial(next);
    setUploadedDocs(next);
    setSourceName(summaryLabel);
    setAiDocAnalysis(null);
    setSelectedFocusConcepts(new Set());
  };

  const removeUploadedDoc = (docId: string) => {
    const next = uploadedDocs.filter((d) => d.id !== docId);
    const { summaryLabel } = buildCombinedSourceMaterial(next);
    setUploadedDocs(next);
    setSourceName(summaryLabel);
    setAiDocAnalysis(null);
    setSelectedFocusConcepts(new Set());
  };

  const selectOnlyUploadedDoc = (docId: string) => {
    const next = uploadedDocs.map((d) => ({ ...d, selected: d.id === docId }));
    const { summaryLabel } = buildCombinedSourceMaterial(next);
    setUploadedDocs(next);
    setSourceName(summaryLabel);
    setAiDocAnalysis(null);
    setSelectedFocusConcepts(new Set());
  };

  const mapApiQuestionsToStudio = (rawList: any[], fallbackTag: string): StudioGeneratedQuestion[] => {
    return (rawList ?? [])
      .map((q: any) => {
        const rawType = String(q.question_type || '').trim().toLowerCase();
        const rawOpts: string[] = Array.isArray(q.options)
          ? q.options.map((o: unknown) => stripOptionPrefix(String(o ?? ''))).filter(Boolean)
          : [];

        let qType: StudioGeneratedQuestion['question_type'];
        if (rawType === 'true_false' || rawType === 'boolean') {
          qType = 'true_false';
        } else if (rawType === 'coding_blocks') {
          qType = 'coding_blocks';
        } else if (
          rawType === 'essay'
          || rawType === 'long_answer'
          || rawType === 'theory'
          || rawType === 'coding'
          || rawType === 'practical'
          || rawType === 'open_ended'
        ) {
          qType = 'essay';
        } else if (
          rawType === 'fill_blank'
          || rawType === 'fill_in_blank'
          || rawType === 'short_answer'
          || rawType === 'subjective'
        ) {
          qType = 'fill_blank';
        } else if (rawOpts.length >= 2) {
          qType = 'multiple_choice';
        } else {
          // Never force an open-ended / theory / coding question without options into broken empty MCQ
          qType = 'essay';
        }

        const opts: string[] =
          qType === 'true_false'
            ? ['True', 'False']
            : qType === 'multiple_choice'
              ? rawOpts.length >= 2
                ? rawOpts
                : ['', '', '', '']
              : [];
        const rawCorrect = String(
          q.correct_answer ?? q.answer ?? q.marking_guide ?? q.metadata?.marking_guide ?? q.explanation ?? '',
        ).trim();
        let resolvedCorrect = rawCorrect;
        if (qType === 'multiple_choice') {
          const direct = resolveMcqAnswerToOption(rawCorrect, opts);
          const matchedDirect = opts.find((o) => o === direct);
          if (matchedDirect) {
            resolvedCorrect = matchedDirect;
          } else {
            const fromGuide = resolveMcqAnswerToOption(String(q.explanation ?? q.marking_guide ?? ''), opts);
            // NEVER silently fall back to opts[0] (Option A) when unmatched — leave blank so it's flagged clearly
            resolvedCorrect = opts.find((o) => o === fromGuide) || '';
          }
        } else if (qType === 'true_false') {
          resolvedCorrect = /^false$/i.test(rawCorrect) ? 'False' : 'True';
        }
        const markingGuide =
          String(
            q.marking_guide ??
              q.metadata?.marking_guide ??
              q.explanation ??
              (qType === 'essay' || qType === 'fill_blank' || qType === 'coding_blocks' ? resolvedCorrect : ''),
          ).trim() || undefined;

        return {
          question_text: String(q.question_text || '').trim(),
          question_type: qType,
          options: opts,
          correct_answer: resolvedCorrect,
          marking_guide: markingGuide,
          points: Number(q.points) || (qType === 'essay' || qType === 'coding_blocks' ? 10 : 5),
          section: (q.section ||
            q.metadata?.section ||
            (['essay', 'fill_blank', 'short_answer', 'coding_blocks'].includes(qType)
              ? 'subjective'
              : 'objective')) as StudioGeneratedQuestion['section'],
          explanation: markingGuide || (q.explanation ? String(q.explanation) : undefined),
          curriculumTag: q.metadata?.curriculum_tag || fallbackTag,
          cognitiveLevel: q.metadata?.cognitive_level || undefined,
          metadata: q.metadata ?? null,
        };
      })
      .filter((q: StudioGeneratedQuestion) => {
        if (q.question_text.length < 6) return false;
        if (q.question_type === 'multiple_choice' && q.options.filter((o) => o.trim().length > 0).length < 2) {
          return false;
        }
        return true;
      });
  };

  const handleAiGenerate = async () => {
    // Build combined source text from selected uploaded file(s) (PPTX/PDF/DOCX/TXT/Image) + any extra notes.
    // ALWAYS generate the teacher's exact requested MCQ + Theory count (never silently hijack into raw text copy!).
    const combinedFromFiles = buildCombinedSourceMaterial(
      uploadedDocs,
      !isWeekDerivedSource ? sourceText : '',
      22_000,
    );

    let effectiveSourceText = combinedFromFiles.combinedText;
    let effectiveSourceName = combinedFromFiles.summaryLabel || sourceName.trim();
    const useStrictFileOnly = combinedFromFiles.selectedCount > 0 && strictFileOnly;

    // Prepend AI Attachment Intelligence Brief + Teacher's chosen Focus Concepts so generation is laser-focused
    if (aiDocAnalysis && combinedFromFiles.selectedCount > 0) {
      const activeConcepts = selectedFocusConcepts.size > 0
        ? Array.from(selectedFocusConcepts)
        : aiDocAnalysis.keyConcepts;
      const briefHeader = [
        '=== AI ATTACHMENT INTELLIGENCE BRIEF ===',
        `Subject: ${aiDocAnalysis.subject}${aiDocAnalysis.gradeLevel ? ` (${aiDocAnalysis.gradeLevel})` : ''}`,
        `Summary: ${aiDocAnalysis.summary}`,
        activeConcepts.length > 0 ? `Priority Testable Concepts to Cover: ${activeConcepts.join(', ')}` : '',
        aiDocAnalysis.learningObjectives.length > 0 ? `Learning Objectives:\n- ${aiDocAnalysis.learningObjectives.join('\n- ')}` : '',
        '=== SOURCE MATERIAL ===',
      ].filter(Boolean).join('\n');
      effectiveSourceText = `${briefHeader}\n${effectiveSourceText}`.slice(0, 26_000);
    }

    // Only auto-attach taught weeks if NOT in strict uploaded-files-only mode and no custom source is set
    if (!useStrictFileOnly && !effectiveSourceText && selectedWeeks.size > 0 && curriculumWeeks.length > 0) {
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
      setAiError('Enter a topic, select a course/week, or upload PPT / PDF / DOC / TXT file(s) first.');
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

    const isRefiningExistingPaper = hasPaperQuestions && importBehavior === 'replace';
    const refinementInstruction = isRefiningExistingPaper
      ? `\n\n[CHIEF EXAMINER REFINEMENT PASS]\nYou are upgrading an existing ${mcq} Objective + ${theory} Theory draft. Produce a SIGNIFICANTLY HIGHER-QUALITY replacement set of EXACTLY ${mcq} Objective (multiple_choice) and ${theory} Theory (essay/short_answer) questions (${total} total). Improve clarity, scenario realism, distractor plausibility, curriculum depth, and step-by-step marking guides. Do NOT repeat weak stems from the previous draft.`
      : '';
    const requestSourceMaterial = effectiveSourceText
      ? `${effectiveSourceText}${refinementInstruction}`
      : refinementInstruction.trim() || undefined;

    setAiGenerating(true);
    setAiError(null);
    setAiSuccessMsg(null);
    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;
    aiUserCancelledRef.current = false;
    const timeoutId = window.setTimeout(() => controller.abort(), 65_000);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          type: 'cbt',
          cbtMode: 'generate',
          topic: effectiveTopic || 'Document Assessment',
          questionCount: total,
          mcqCount: mcq,
          theoryCount: theory,
          courseName: useStrictFileOnly ? undefined : (courseTitle || undefined),
          subject: useStrictFileOnly ? undefined : (courseTitle || undefined),
          programName: useStrictFileOnly ? undefined : (programName || undefined),
          className: className || undefined,
          examType,
          sourceName: effectiveSourceName || undefined,
          strictSourceOnly: useStrictFileOnly,
          sourceFileCount: combinedFromFiles.selectedCount,
          existingQuestions:
            importBehavior === 'append' || isRefiningExistingPaper
              ? existingQuestionTexts.filter(Boolean).slice(-60)
              : undefined,
          ...(requestSourceMaterial ? { sourceMaterial: requestSourceMaterial } : {}),
        }),
      });
      const result = await res.json().catch(() => ({}));
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
        throw new Error('No valid questions with options/answers were returned. Please try again or refine your source.');
      }

      // Automatic Gap-Fill Pass: ONLY top up whichever section (Objective or Theory) came back short,
      // then strictly cap to the exact requested Objective + Theory counts so we NEVER overshoot.
      const firstDedupe = dedupeCbtQuestions(
        generatedList,
        importBehavior === 'append' ? existingQuestionTexts : [],
      ).unique;
      let combinedGenerated = [...firstDedupe];
      const gotMcq = combinedGenerated.filter((q) => q.question_type === 'multiple_choice' || q.question_type === 'true_false').length;
      const gotTheory = combinedGenerated.length - gotMcq;
      const missingMcq = Math.max(0, mcq - gotMcq);
      const missingTheory = Math.max(0, theory - gotTheory);
      if (missingMcq + missingTheory >= 1) {
        try {
          const topUpRes = await fetch('/api/ai/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              type: 'cbt',
              cbtMode: 'generate',
              topic: effectiveTopic || 'Document Assessment',
              questionCount: missingMcq + missingTheory,
              mcqCount: missingMcq,
              theoryCount: missingTheory,
              courseName: useStrictFileOnly ? undefined : (courseTitle || undefined),
              subject: useStrictFileOnly ? undefined : (courseTitle || undefined),
              programName: useStrictFileOnly ? undefined : (programName || undefined),
              className: className || undefined,
              examType,
              sourceName: effectiveSourceName || undefined,
              sourceMaterial: effectiveSourceText || undefined,
              sourceDocumentCount: combinedFromFiles.selectedCount || undefined,
              strictSourceOnly: useStrictFileOnly,
              existingQuestions: [
                ...(importBehavior === 'append' ? existingQuestionTexts : []),
                ...combinedGenerated.map((q) => q.question_text),
              ].slice(0, 80),
            }),
          });
          const topUpJson = await topUpRes.json().catch(() => ({}));
          if (topUpRes.ok && Array.isArray(topUpJson?.data?.questions)) {
            const extra = mapApiQuestionsToStudio(
              topUpJson.data.questions,
              effectiveSourceName || effectiveTopic || 'Aligned Blueprint',
            );
            combinedGenerated = [...combinedGenerated, ...extra];
          }
        } catch {
          // Keep the first pass questions if top-up times out
        }
      }

      const { unique: dedupedList, skippedCount } = dedupeCbtQuestions(
        combinedGenerated,
        importBehavior === 'append' ? existingQuestionTexts : [],
      );
      const exactMix = enforceExactQuestionMix(dedupedList, mcq, theory);
      if (exactMix.questions.length === 0) {
        setAiSuccessMsg('All generated questions were already on your paper — try switching to Replace or choosing a different subtopic.');
      } else {
        onImportQuestions(exactMix.questions, importBehavior);
        setAiSuccessMsg(
          `${isRefiningExistingPaper ? 'Refined & upgraded' : 'Generated'} ${exactMix.mcqCount} Objective + ${exactMix.theoryCount} Theory (${exactMix.questions.length} exact total) with verified answers & marking guides${skippedCount > 0 ? ` (${skippedCount} duplicate${skippedCount === 1 ? '' : 's'} skipped)` : ''}.`,
        );
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        if (aiUserCancelledRef.current) {
          setAiError('Generation cancelled.');
        } else {
          setAiError('AI took too long to respond (65s). Please click Generate again or reduce question count slightly.');
        }
      } else {
        setAiError(err?.message || 'Could not generate questions right now.');
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (aiAbortRef.current === controller) {
        aiAbortRef.current = null;
      }
      setAiGenerating(false);
    }
  };

  const handleAiAlignAndSolvePremade = async (fromCurrentPaper = false) => {
    const combinedUploaded = buildCombinedSourceMaterial(
      uploadedDocs,
      !isWeekDerivedSource ? sourceText : '',
      24_000,
    ).combinedText;

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
      : combinedUploaded.trim();

    if (!serializedCurrent) {
      setAiError('Upload PPT / PDF / DOC / TXT file(s) or paste premade questions first.');
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
    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;
    aiUserCancelledRef.current = false;
    const timeoutId = window.setTimeout(() => controller.abort(), 65_000);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
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
      const result = await res.json().catch(() => ({}));
      if (!res.ok || result.error) {
        throw new Error(
          result.error
            || 'AI could not solve and align those questions right now. Click retry or use Generate Questions instead.',
        );
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
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        if (aiUserCancelledRef.current) {
          setAiError('AI alignment cancelled.');
        } else if (localParsed.length > 0) {
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
          setAiSuccessMsg(`AI timed out — imported ${localParsed.length} parsed questions directly.`);
        } else {
          setAiError('AI took too long to respond (65s). Please try again.');
        }
      } else {
        setAiError(err?.message || 'Failed to solve premade questions.');
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (aiAbortRef.current === controller) {
        aiAbortRef.current = null;
      }
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

  const handleImportSelectedPremade = (targetMode: 'append' | 'replace' = 'append') => {
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
      targetMode,
    );
    setSelectedBankIds(new Set());
    setAiSuccessMsg(
      targetMode === 'replace'
        ? `Replaced paper with ${chosen.length} selected past question${chosen.length === 1 ? '' : 's'}.`
        : `Added ${chosen.length} past question${chosen.length === 1 ? '' : 's'} to the paper.`,
    );
  };

  if (disabled) return null;

  const targetTotal = (parseInt(mcqCount, 10) || 0) + (parseInt(theoryCount, 10) || 0);
  const hasPaperQuestions = currentQuestions.some((q) => String(q.question_text ?? '').trim().length > 0);
  const missingAnswersCount = currentQuestions.filter((q) => {
    if (!String(q.question_text ?? '').trim()) return false;
    const ans = String(q.correct_answer ?? '').trim();
    if (!ans) return true;
    if (q.question_type === 'multiple_choice' && Array.isArray(q.options) && q.options.length > 0) {
      const resolved = resolveMcqAnswerToOption(ans, q.options);
      return !q.options.some((o) => String(o ?? '').trim() !== '' && (o === ans || o === resolved));
    }
    return false;
  }).length;

  const studioTabs: Array<{
    id: 'generate' | 'premade' | 'bank' | 'blueprint';
    label: string;
    badge?: string | number;
  }> = [
    { id: 'generate', label: 'AI Generate' },
    {
      id: 'premade',
      label: 'Paste / Upload & Solve',
      badge: detectedPremadeFromSource.length > 0 ? detectedPremadeFromSource.length : undefined,
    },
    { id: 'bank', label: 'Past Questions', badge: combinedBankQuestions.length },
    {
      id: 'blueprint',
      label: 'Blueprint & Audit',
      badge: hasPaperQuestions ? `${liveBlueprint.alignmentScore}%` : undefined,
    },
  ];

  return (
    <section
      aria-label="AI Question Assistant and Assessment Studio"
      className="rounded-2xl border border-emerald-500/25 bg-card shadow-sm overflow-hidden"
    >
      {/* Header + Segmented Mode Bar */}
      <div className="border-b border-border/70 bg-muted/20 px-4 py-3.5 sm:px-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-700 dark:text-emerald-400 shrink-0">
              <SparklesIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-foreground tracking-tight flex flex-wrap items-center gap-2">
                AI Question Assistant
                {courseTitle && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                    {courseTitle}
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Segmented workflow: generate from curriculum, solve &amp; import pasted papers, reuse past questions, or audit readiness.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasPaperQuestions && missingAnswersCount > 0 && (
              <button
                type="button"
                onClick={() => handleAiAlignAndSolvePremade(true)}
                disabled={aiSolvingPremade}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-500/35 hover:bg-amber-500/25 transition-all disabled:opacity-50"
              >
                {aiSolvingPremade ? (
                  <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <SparklesIcon className="w-3.5 h-3.5" />
                )}
                Solve {missingAnswersCount} Missing Answer{missingAnswersCount === 1 ? '' : 's'}
              </button>
            )}

            {hasPaperQuestions && (
              <div
                role="group"
                aria-label="Import mode"
                className="inline-flex items-center rounded-xl border border-border bg-background p-0.5 text-[11px] font-bold"
              >
                <button
                  type="button"
                  aria-pressed={importBehavior === 'replace'}
                  onClick={() => setImportBehavior('replace')}
                  className={`px-2.5 py-1 rounded-lg transition-colors ${
                    importBehavior === 'replace'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Replace
                </button>
                <button
                  type="button"
                  aria-pressed={importBehavior === 'append'}
                  onClick={() => setImportBehavior('append')}
                  className={`px-2.5 py-1 rounded-lg transition-colors ${
                    importBehavior === 'append'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Append
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Accessible Segmented Tab Strip */}
        <div
          role="tablist"
          aria-label="Question assistant modes"
          className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 rounded-xl bg-background/90 border border-border p-1"
        >
          {studioTabs.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`cbt-studio-tab-${tab.id}`}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls={`cbt-studio-panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  selected
                    ? 'bg-emerald-700 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                }`}
              >
                <span className="truncate">{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-black leading-none ${
                      selected
                        ? 'bg-white/20 text-white'
                        : 'bg-muted text-foreground'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Status Alerts (Always visible regardless of active segment) */}
      {(aiError || aiSuccessMsg) && (
        <div className="px-4 sm:px-5 pt-3.5 space-y-2">
          {aiError && (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2"
            >
              <span>{aiError}</span>
              <button
                type="button"
                aria-label="Dismiss AI error"
                onClick={() => setAiError(null)}
                className="text-rose-700 dark:text-rose-300 hover:opacity-80"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          )}
          {aiSuccessMsg && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-2"
            >
              <span className="flex items-center gap-1.5">
                <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />
                {aiSuccessMsg}
              </span>
              <button
                type="button"
                aria-label="Dismiss success notice"
                onClick={() => setAiSuccessMsg(null)}
                className="text-emerald-800 dark:text-emerald-300 hover:opacity-80"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 1: AI GENERATE */}
      {activeTab === 'generate' && (
        <div
          id="cbt-studio-panel-generate"
          role="tabpanel"
          aria-labelledby="cbt-studio-tab-generate"
          className="p-4 sm:p-5 space-y-4"
        >
          {curriculumWeeks.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <AcademicCapIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  Align to Taught Weeks
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const taught = new Set(curriculumWeeks.filter((w) => w.taught).map((w) => w.week));
                    const target = taught.size > 0 ? taught : new Set(curriculumWeeks.map((w) => w.week));
                    setSelectedWeeks(target);
                    applyWeekAlignmentToAi(target);
                  }}
                  className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/20"
                >
                  Select All Taught
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {curriculumWeeks.map((w) => {
                  const active = selectedWeeks.has(w.week);
                  return (
                    <button
                      key={w.week}
                      type="button"
                      aria-pressed={active}
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
            </div>
          )}

          {/* Unified Smart Multi-File Uploader & Combiner (PPT / PDF / DOC / TXT) */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDraggingFiles(true); }}
            onDragLeave={() => setIsDraggingFiles(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingFiles(false);
              if (e.dataTransfer?.files?.length) {
                void handleFilesUpload(e.dataTransfer.files);
              }
            }}
            className={`rounded-2xl border-2 border-dashed p-3.5 transition-all space-y-2.5 ${
              isDraggingFiles
                ? 'border-emerald-500 bg-emerald-500/10'
                : uploadedDocs.length > 0
                  ? 'border-emerald-500/35 bg-emerald-500/[0.03]'
                  : 'border-primary/30 bg-primary/[0.02] hover:border-primary/50'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <DocumentTextIcon className="w-3.5 h-3.5 text-primary" />
                  Upload Slides, Docs, Images or Import Article URL
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Upload PDF, PPTX, DOCX, TXT, or photos/screenshots — or paste any web article URL below.
                </p>
                {availableLessons.length > 0 && (
                  <label className="mt-1 inline-flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                    <input
                      type="checkbox"
                      checked={autoPublishToStudents}
                      onChange={(e) => setAutoPublishToStudents(e.target.checked)}
                      className="h-3.5 w-3.5 rounded accent-emerald-600 cursor-pointer"
                    />
                    <span>Also save uploaded file(s) as Priority Study Material for this exam (auto-locked during exam)</span>
                  </label>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (availableLessons.length === 0) setMaterialsScope('all');
                    setShowMaterialsLibrary((v) => !v);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-black transition-colors ${
                    showMaterialsLibrary
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'border-border bg-card hover:bg-muted text-foreground'
                  }`}
                >
                  <AcademicCapIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>From Study Materials</span>
                  {availableLessons.length > 0 && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-black text-muted-foreground">
                      {availableLessons.reduce(
                        (sum, l) => sum + ((l.lesson_materials ?? []).filter((m) => m.file_type !== 'slide-deck').length || 0) + (l.content && l.content.trim().length >= 20 ? 1 : 0),
                        0,
                      ) || availableLessons.length}
                    </span>
                  )}
                </button>
                {uploadedDocs.length > 1 && selectedUploadedDocs.length < uploadedDocs.length && (
                  <button
                    type="button"
                    onClick={() => setUploadedDocs((prev) => prev.map((d) => ({ ...d, selected: true })))}
                    className="text-[11px] font-bold text-primary hover:underline"
                  >
                    Select All
                  </button>
                )}
                {shareNotice && (
              <div
                role="status"
                className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[11px] font-bold ${
                  shareNotice.type === 'success'
                    ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                    : shareNotice.type === 'error'
                      ? 'border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                      : 'border-primary/35 bg-primary/10 text-primary'
                }`}
              >
                <span>{shareNotice.text}</span>
                <button
                  type="button"
                  onClick={() => setShareNotice(null)}
                  aria-label="Dismiss share notice"
                  className="shrink-0 opacity-75 hover:opacity-100"
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {uploadedDocs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setUploadedDocs([]);
                      setSourceName('');
                      setAiDocAnalysis(null);
                      setSelectedFocusConcepts(new Set());
                      setShowAiAnalysisDetails(false);
                      rawFilesRef.current.clear();
                    }}
                    className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline"
                  >
                    Clear All
                  </button>
                )}
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer text-xs font-black shadow-sm transition-colors">
                  <PlusIcon className="w-3.5 h-3.5" />
                  <span>{extractingFile ? extractMsg || 'Reading…' : uploadedDocs.length > 0 ? 'Add More' : 'Upload Files'}</span>
                  <input
                    type="file"
                    multiple
                    accept={ACCEPTED_DOCUMENT_EXTENSIONS}
                    className="sr-only"
                    disabled={extractingFile}
                    onChange={async (e) => {
                      const files = e.currentTarget.files;
                      if (!files || files.length === 0) return;
                      const copy = Array.from(files);
                      e.currentTarget.value = '';
                      await handleFilesUpload(copy);
                    }}
                  />
                </label>
              </div>
            </div>

            {/* Inline Pull from Course Study Materials Drawer (Smart Search + Multi-Tick Bulk Migration) */}
            {showMaterialsLibrary && (
              <div className="rounded-xl border border-emerald-500/30 bg-card p-3 space-y-2.5">
                {(() => {
                  const q = materialsSearch.trim().toLowerCase();
                  const filteredLessons = availableLessons.filter((l) => {
                    if (!q) return true;
                    if (l.title.toLowerCase().includes(q)) return true;
                    return (l.lesson_materials ?? []).some((m) => m.title.toLowerCase().includes(q));
                  });
                  const visibleKeys: string[] = [];
                  filteredLessons.forEach((lesson) => {
                    if (lesson.content && lesson.content.replace(/<[^>]+>/g, '').trim().length >= 20) {
                      visibleKeys.push(`note:${lesson.id}`);
                    }
                    (lesson.lesson_materials ?? [])
                      .filter((m) => m.file_type !== 'slide-deck')
                      .forEach((m) => visibleKeys.push(`mat:${lesson.id}:${m.id}`));
                  });
                  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selectedMaterialKeys.has(k));
                  return (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5 text-[10px] font-black">
                            <button
                              type="button"
                              onClick={() => setMaterialsScope('course')}
                              className={`px-2 py-0.5 rounded-md transition-colors ${
                                materialsScope === 'course' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              This Course
                            </button>
                            <button
                              type="button"
                              onClick={() => setMaterialsScope('all')}
                              className={`px-2 py-0.5 rounded-md transition-colors ${
                                materialsScope === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              All Lessons
                            </button>
                          </div>
                          {visibleKeys.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedMaterialKeys((prev) => {
                                  const next = new Set(prev);
                                  if (allVisibleSelected) visibleKeys.forEach((k) => next.delete(k));
                                  else visibleKeys.forEach((k) => next.add(k));
                                  return next;
                                });
                              }}
                              className="rounded-lg border border-border bg-background hover:bg-muted px-2 py-1 text-[10px] font-black text-foreground transition-colors"
                            >
                              {allVisibleSelected ? 'Untick Visible' : `Tick All (${visibleKeys.length})`}
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-1 sm:flex-initial justify-end">
                          <div className="relative flex-1 sm:w-52">
                            <MagnifyingGlassIcon className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                              type="search"
                              value={materialsSearch}
                              onChange={(e) => setMaterialsSearch(e.target.value)}
                              aria-label="Search study materials and lessons"
                              placeholder="Search lessons or files…"
                              className="h-8 w-full rounded-lg border border-border bg-background pl-7 pr-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                            />
                          </div>
                          {selectedMaterialKeys.size > 0 && (
                            <button
                              type="button"
                              disabled={bulkPulling}
                              onClick={() => void handlePullSelectedMaterials()}
                              className="shrink-0 h-8 rounded-lg bg-emerald-700 hover:bg-emerald-800 px-3 text-[11px] font-black text-white shadow-xs transition-colors disabled:opacity-50"
                            >
                              {bulkPulling ? 'Pulling…' : `Pull Selected (${selectedMaterialKeys.size})`}
                            </button>
                          )}
                        </div>
                      </div>

                      {loadingAllLessons ? (
                        <p className="py-4 text-center text-xs text-muted-foreground">Loading lessons…</p>
                      ) : filteredLessons.length === 0 ? (
                        <p className="py-4 text-center text-xs text-muted-foreground">No matching study materials found.</p>
                      ) : (
                        <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                          {filteredLessons.map((lesson) => {
                            const mats = (lesson.lesson_materials ?? []).filter((m) => m.file_type !== 'slide-deck');
                            const hasNotes = Boolean(lesson.content && lesson.content.replace(/<[^>]+>/g, '').trim().length >= 20);
                            const noteKey = `note:${lesson.id}`;
                            const noteTicked = selectedMaterialKeys.has(noteKey);
                            return (
                              <div key={lesson.id} className="rounded-lg border border-border/80 bg-muted/20 px-2.5 py-2 space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-bold text-foreground truncate">
                                    {lesson.session_number ? `L${lesson.session_number}: ` : ''}{lesson.title}
                                  </span>
                                  {hasNotes && (
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <label className="inline-flex items-center gap-1 cursor-pointer text-[10px] font-bold text-foreground">
                                        <input
                                          type="checkbox"
                                          checked={noteTicked}
                                          onChange={() =>
                                            setSelectedMaterialKeys((prev) => {
                                              const next = new Set(prev);
                                              if (next.has(noteKey)) next.delete(noteKey);
                                              else next.add(noteKey);
                                              return next;
                                            })
                                          }
                                          className="h-3.5 w-3.5 rounded accent-emerald-600"
                                        />
                                        <span>Notes</span>
                                      </label>
                                      <button
                                        type="button"
                                        disabled={pullingMaterialId === `lesson:${lesson.id}`}
                                        onClick={() => void handlePullStudyMaterial(lesson)}
                                        className="rounded-md border border-primary/35 bg-primary/10 hover:bg-primary/20 px-1.5 py-0.5 text-[10px] font-black text-primary transition-colors disabled:opacity-50"
                                      >
                                        {pullingMaterialId === `lesson:${lesson.id}` ? '…' : '+ Pull'}
                                      </button>
                                    </div>
                                  )}
                                </div>
                                {mats.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {mats.map((m) => {
                                      const cleanTitle = m.title.replace(/^\[PRIORITY\]\s*/i, '').trim() || 'Material';
                                      const isPriority = m.title.trim().startsWith('[PRIORITY]');
                                      const busy = pullingMaterialId === `mat:${m.id}`;
                                      const matKey = `mat:${lesson.id}:${m.id}`;
                                      const ticked = selectedMaterialKeys.has(matKey);
                                      return (
                                        <div
                                          key={m.id}
                                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[10px] font-bold transition-colors ${
                                            ticked
                                              ? 'border-emerald-500 bg-emerald-500/20 text-emerald-900 dark:text-emerald-100'
                                              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                                          }`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={ticked}
                                            aria-label={`Select ${cleanTitle}`}
                                            onChange={() =>
                                              setSelectedMaterialKeys((prev) => {
                                                const next = new Set(prev);
                                                if (next.has(matKey)) next.delete(matKey);
                                                else next.add(matKey);
                                                return next;
                                              })
                                            }
                                            className="h-3.5 w-3.5 rounded accent-emerald-600 cursor-pointer"
                                          />
                                          {isPriority && <span className="text-[9px] font-black uppercase">★</span>}
                                          <span className="truncate max-w-[150px]">{cleanTitle}</span>
                                          <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => void handlePullStudyMaterial(lesson, m)}
                                            className="font-black text-emerald-700 dark:text-emerald-300 hover:underline disabled:opacity-50"
                                          >
                                            {busy ? '…' : 'Pull'}
                                          </button>
                                          <button
                                            type="button"
                                            disabled={unsharingKey === `mat:${m.id}`}
                                            onClick={() => void handleUnshareStudyMaterial(lesson.id, m.id, cleanTitle)}
                                            aria-label={`Delete ${cleanTitle} from study materials`}
                                            title="Unshare & delete from Student Study Materials"
                                            className="text-rose-600 dark:text-rose-400 hover:opacity-80 disabled:opacity-40"
                                          >
                                            ×
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                                {!hasNotes && mats.length === 0 && (
                                  <p className="text-[10px] text-muted-foreground">No attached files yet — upload a file above and click “Share to Students”.</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* Paste Article URL Importer */}
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <input
                type="url"
                aria-label="Paste educational article URL to extract"
                value={articleUrl}
                onChange={(e) => setArticleUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && articleUrl.trim() && !fetchingArticle) {
                    e.preventDefault();
                    void handleImportArticleUrl();
                  }
                }}
                placeholder="Or paste an article URL (e.g. Wikipedia, MDN, W3Schools…) to extract & analyze"
                className="min-h-10 flex-1 rounded-xl border border-border bg-card px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
              <button
                type="button"
                disabled={fetchingArticle || !articleUrl.trim()}
                onClick={() => void handleImportArticleUrl()}
                className="min-h-10 shrink-0 rounded-xl border border-primary/35 bg-primary/10 hover:bg-primary/20 px-3.5 text-xs font-black text-primary disabled:opacity-40 transition-colors"
              >
                {fetchingArticle ? 'Reading Article…' : 'Import Article'}
              </button>
            </div>

            {shareNotice && (
              <div
                role="status"
                className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[11px] font-bold ${
                  shareNotice.type === 'success'
                    ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                    : shareNotice.type === 'error'
                      ? 'border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                      : 'border-primary/35 bg-primary/10 text-primary'
                }`}
              >
                <span>{shareNotice.text}</span>
                <button
                  type="button"
                  onClick={() => setShareNotice(null)}
                  aria-label="Dismiss share notice"
                  className="shrink-0 opacity-75 hover:opacity-100"
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {uploadedDocs.length > 0 && (
              <div className="space-y-2 pt-1">
                {/* Compact scrollable file chips so multiple attachments never stretch or break the layout */}
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                  {uploadedDocs.map((doc) => {
                    const hasRawFile = rawFilesRef.current.has(doc.id);
                    const isPublished = publishedDocIds.has(doc.id);
                    const isPublishing = publishingDocId === doc.id;
                    return (
                      <div
                        key={doc.id}
                        className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] transition-all ${
                          doc.selected
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-foreground'
                            : 'border-border bg-card text-muted-foreground opacity-70'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={doc.selected}
                          onChange={() => toggleUploadedDoc(doc.id)}
                          aria-label={`Include ${doc.name}`}
                          className="h-3.5 w-3.5 rounded accent-emerald-600 cursor-pointer shrink-0"
                        />
                        <span className="rounded bg-primary/15 px-1 py-0.5 text-[9px] font-black uppercase text-primary shrink-0">
                          {doc.kind}
                        </span>
                        <span className="font-bold truncate max-w-[140px] sm:max-w-[190px]" title={doc.name}>
                          {doc.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {doc.wordCount.toLocaleString()}w
                        </span>
                        {hasRawFile && availableLessons.length > 0 && (
                          isPublished && publishedMaterialByDocId[doc.id] ? (
                            <span className="inline-flex items-center gap-1 shrink-0">
                              <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-black text-emerald-700 dark:text-emerald-300">
                                ✓ Shared
                              </span>
                              <button
                                type="button"
                                disabled={unsharingKey === doc.id}
                                onClick={() => {
                                  const ref = publishedMaterialByDocId[doc.id];
                                  if (ref) void handleUnshareStudyMaterial(ref.lessonId, ref.materialId, ref.title, doc.id);
                                }}
                                title="Unshare & delete from Student Study Materials"
                                className="rounded border border-rose-500/35 bg-rose-500/10 hover:bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-black text-rose-700 dark:text-rose-300 transition-colors disabled:opacity-50"
                              >
                                {unsharingKey === doc.id ? 'Removing…' : 'Unshare'}
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={isPublishing || isPublished}
                              onClick={() => void handlePublishDocToStudents(doc)}
                              title="Publish to Students as a pinned Priority Study Material (view-only & auto-locked during exam)"
                              className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black transition-colors ${
                                isPublished
                                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
                              }`}
                            >
                              {isPublishing ? 'Sharing…' : isPublished ? '✓ Shared' : 'Share to Students'}
                            </button>
                          )
                        )}
                        {uploadedDocs.length > 1 && (
                          <button
                            type="button"
                            onClick={() => selectOnlyUploadedDoc(doc.id)}
                            title="Use only this file"
                            className="shrink-0 rounded px-1 py-0.5 text-[9px] font-black uppercase bg-background border border-border hover:border-primary/50 text-foreground"
                          >
                            Only
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            rawFilesRef.current.delete(doc.id);
                            removeUploadedDoc(doc.id);
                          }}
                          aria-label={`Remove ${doc.name}`}
                          className="shrink-0 text-rose-600 dark:text-rose-400 hover:opacity-80"
                        >
                          <XMarkIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Compact Target Lesson selector & bulk Share All when local files can be shared to students */}
                {availableLessons.length > 0 && (() => {
                  const unsharedCount = uploadedDocs.filter((d) => rawFilesRef.current.has(d.id) && !publishedDocIds.has(d.id)).length;
                  if (unsharedCount === 0) return null;
                  return (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold">Share target lesson:</span>
                        <select
                          aria-label="Lesson to share uploaded files to"
                          value={publishLessonId}
                          onChange={(e) => setPublishLessonId(e.target.value)}
                          className="h-7 rounded-lg border border-border bg-card px-2 text-[11px] font-bold text-foreground focus:border-primary focus:outline-none"
                        >
                          {availableLessons.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.session_number ? `L${l.session_number}: ` : ''}{l.title}
                            </option>
                          ))}
                        </select>
                      </div>
                      {unsharedCount > 1 && (
                        <button
                          type="button"
                          disabled={bulkPublishing}
                          onClick={() => void handlePublishAllDocsToStudents()}
                          className="rounded-lg bg-primary hover:bg-primary/90 px-2.5 py-1 text-[10px] font-black text-primary-foreground transition-colors disabled:opacity-50"
                        >
                          {bulkPublishing ? 'Sharing All…' : `Share All (${unsharedCount}) to Students`}
                        </button>
                      )}
                    </div>
                  );
                })()}

                {/* Compact single toolbar row */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-border/60 text-[11px]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-emerald-700 dark:text-emerald-300">
                      {selectedUploadedDocs.length === 0
                        ? 'Check at least one file'
                        : `${selectedUploadedDocs.length} file${selectedUploadedDocs.length === 1 ? '' : 's'} · ${selectedUploadedDocs.reduce((s, d) => s + d.wordCount, 0).toLocaleString()} words`}
                    </span>
                    {selectedUploadedDocs.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setShowDocPreview((v) => !v)}
                          className="rounded-lg border border-border bg-card hover:bg-muted px-2 py-0.5 text-[10px] font-bold text-foreground transition-colors"
                        >
                          {showDocPreview ? 'Hide Text' : 'Inspect Text'}
                        </button>
                        <button
                          type="button"
                          disabled={analyzingDocs}
                          onClick={() => void runAiDocumentAnalysis(selectedUploadedDocs)}
                          className="rounded-lg border border-primary/30 bg-primary/10 hover:bg-primary/20 px-2 py-0.5 text-[10px] font-black text-primary transition-colors disabled:opacity-50"
                        >
                          {analyzingDocs ? 'Analyzing…' : '✨ Re-Analyze'}
                        </button>
                      </>
                    )}
                  </div>
                  <div className="inline-flex items-center rounded-lg border border-border bg-card p-0.5">
                    <button
                      type="button"
                      onClick={() => setStrictFileOnly(true)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-black transition-colors ${
                        strictFileOnly ? 'bg-emerald-700 text-white' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Solely from file(s)
                    </button>
                    <button
                      type="button"
                      onClick={() => setStrictFileOnly(false)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-black transition-colors ${
                        !strictFileOnly ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Blend with topic
                    </button>
                  </div>
                </div>

                {/* ✨ Compact Collapsible AI Attachment Intelligence Strip (never bloats layout!) */}
                {selectedUploadedDocs.length > 0 && (analyzingDocs || aiDocAnalysis) && (
                  <div className="rounded-xl border border-primary/25 bg-primary/[0.04] px-3 py-2 space-y-2 text-[11px]">
                    {analyzingDocs ? (
                      <div className="flex items-center gap-2 text-primary font-bold">
                        <ArrowPathIcon className="h-3.5 w-3.5 animate-spin shrink-0" />
                        <span>Analyzing attachment(s)…</span>
                      </div>
                    ) : aiDocAnalysis ? (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                            <span className="inline-flex items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary shrink-0">
                              <SparklesIcon className="h-3 w-3" /> AI Ready
                            </span>
                            <span className="font-black text-foreground truncate max-w-[180px]">{aiDocAnalysis.subject}</span>
                            <span className={`rounded border px-1.5 py-0.5 text-[9px] font-black shrink-0 ${
                              aiDocAnalysis.qualityLevel === 'high'
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                : aiDocAnalysis.qualityLevel === 'medium'
                                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                                  : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                            }`}>
                              {aiDocAnalysis.qualityLevel === 'high' ? '✓ Crisp' : aiDocAnalysis.qualityLevel === 'medium' ? '⚠ Fair' : '⚠ Low Text'}
                            </span>
                            {aiDocAnalysis.keyConcepts.length > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                · {selectedFocusConcepts.size}/{aiDocAnalysis.keyConcepts.length} concepts
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setShowAiAnalysisDetails((v) => !v)}
                              className="rounded-lg border border-border bg-card hover:bg-muted px-2 py-0.5 text-[10px] font-bold text-foreground transition-colors"
                            >
                              {showAiAnalysisDetails ? 'Hide Details' : 'Details'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                userEditedCountsRef.current = true;
                                setMcqCount(String(aiDocAnalysis.recommendedMix.mcq));
                                setTheoryCount(String(aiDocAnalysis.recommendedMix.theory));
                                onQuestionMixChange?.(aiDocAnalysis.recommendedMix.mcq, aiDocAnalysis.recommendedMix.theory);
                                setAiSuccessMsg(`Applied AI recommended mix: ${aiDocAnalysis.recommendedMix.mcq} MCQ + ${aiDocAnalysis.recommendedMix.theory} Theory (${aiDocAnalysis.recommendedMix.difficulty}).`);
                              }}
                              className="rounded-lg bg-emerald-700 hover:bg-emerald-800 px-2 py-0.5 text-[10px] font-black text-white transition-colors"
                            >
                              Apply AI Mix ({aiDocAnalysis.recommendedMix.mcq}+{aiDocAnalysis.recommendedMix.theory})
                            </button>
                          </div>
                        </div>

                        {showAiAnalysisDetails && (
                          <div className="space-y-2 pt-1.5 border-t border-border/50">
                            <p className="text-xs leading-relaxed text-foreground/90">{aiDocAnalysis.summary}</p>
                            {aiDocAnalysis.qualityNote && (
                              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-900 dark:text-amber-200">
                                ⚠ {aiDocAnalysis.qualityNote}
                              </p>
                            )}
                            {aiDocAnalysis.keyConcepts.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                                  Focus Concepts (click to include/exclude):
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {aiDocAnalysis.keyConcepts.map((concept) => {
                                    const active = selectedFocusConcepts.has(concept);
                                    return (
                                      <button
                                        key={concept}
                                        type="button"
                                        onClick={() =>
                                          setSelectedFocusConcepts((prev) => {
                                            const next = new Set(prev);
                                            if (next.has(concept)) next.delete(concept);
                                            else next.add(concept);
                                            return next;
                                          })
                                        }
                                        className={`rounded-md border px-2 py-0.5 text-[10px] font-bold transition-colors ${
                                          active
                                            ? 'border-primary bg-primary/15 text-primary'
                                            : 'border-border bg-card text-muted-foreground line-through opacity-60 hover:opacity-100'
                                        }`}
                                      >
                                        {active ? '✓ ' : ''}{concept}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            {aiDocAnalysis.learningObjectives.length > 0 && (
                              <div className="pt-1 border-t border-border/50 text-[11px] text-muted-foreground">
                                <span className="font-black text-foreground">Objectives: </span>
                                {aiDocAnalysis.learningObjectives.join(' · ')}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                )}

                {/* Live Document Analysis & Extracted Text Preview */}
                {showDocPreview && selectedUploadedDocs.length > 0 && (
                  <div className="rounded-xl border border-border bg-card p-3 space-y-2 text-[11px]">
                    {(() => {
                      const allTopics = Array.from(
                        new Set(selectedUploadedDocs.flatMap((d) => d.detectedTopics)),
                      ).slice(0, 8);
                      const hasAnyCode = selectedUploadedDocs.some((d) => d.hasCode);
                      const previewText = buildCombinedSourceMaterial(selectedUploadedDocs, '', 28_000).combinedText;
                      return (
                        <>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-black uppercase tracking-wider text-[10px] text-muted-foreground">
                              Detected Concepts:
                            </span>
                            {allTopics.length > 0 ? allTopics.map((t) => (
                              <span key={t} className="rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                                {t}
                              </span>
                            )) : (
                              <span className="text-muted-foreground">General prose extracted cleanly</span>
                            )}
                            {hasAnyCode && (
                              <span className="rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:text-emerald-300">
                                Code Snippets Detected
                              </span>
                            )}
                          </div>
                          <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-2.5 font-mono text-[10px] leading-relaxed text-foreground">
                            {previewText.slice(0, 3500)}{previewText.length > 3500 ? '\n… (full extracted content will be sent to AI)' : ''}
                          </pre>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-5">
              <label
                htmlFor="cbt-ai-topic"
                className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1"
              >
                Topic or Assessment Focus
              </label>
              <input
                id="cbt-ai-topic"
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
                className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 sm:col-span-3">
              <div>
                <label
                  htmlFor="cbt-ai-mcq-count"
                  className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1"
                >
                  Sec A: MCQ
                </label>
                <input
                  id="cbt-ai-mcq-count"
                  type="number"
                  min={0}
                  max={maxQuestions}
                  value={mcqCount}
                  onChange={(e) => {
                    userEditedCountsRef.current = true;
                    setMcqCount(e.target.value);
                    onQuestionMixChange?.(parseInt(e.target.value, 10) || 0, parseInt(theoryCount, 10) || 0);
                  }}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                />
              </div>
              <div>
                <label
                  htmlFor="cbt-ai-theory-count"
                  className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1"
                >
                  Sec B: Theory
                </label>
                <input
                  id="cbt-ai-theory-count"
                  type="number"
                  min={0}
                  max={maxQuestions}
                  value={theoryCount}
                  onChange={(e) => {
                    userEditedCountsRef.current = true;
                    setTheoryCount(e.target.value);
                    onQuestionMixChange?.(parseInt(mcqCount, 10) || 0, parseInt(e.target.value, 10) || 0);
                  }}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="sm:col-span-4 space-y-1.5">
              {/* Prominent, always-visible Replace Entire Paper vs Add to Paper selector */}
              <div
                role="group"
                aria-label="Paper update mode"
                className="grid grid-cols-2 rounded-xl border border-border bg-muted/40 p-0.5 text-[11px] font-black"
              >
                <button
                  type="button"
                  aria-pressed={importBehavior === 'replace'}
                  onClick={() => setImportBehavior('replace')}
                  className={`py-1 px-2 rounded-lg transition-colors ${
                    importBehavior === 'replace'
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Replace Entire Paper
                </button>
                <button
                  type="button"
                  aria-pressed={importBehavior === 'append'}
                  onClick={() => setImportBehavior('append')}
                  className={`py-1 px-2 rounded-lg transition-colors ${
                    importBehavior === 'append'
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Add to Paper
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAiGenerate}
                  disabled={aiGenerating || aiSolvingPremade}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all disabled:opacity-50"
                >
                  {aiGenerating || aiSolvingPremade ? (
                    <>
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                      {detectedPremadeFromSource.length > 0 ? 'Solving Answers & Guide…' : 'Generating…'}
                    </>
                  ) : detectedPremadeFromSource.length > 0 ? (
                    <>
                      <SparklesIcon className="w-4 h-4" />
                      Solve &amp; {importBehavior === 'replace' ? 'Replace' : 'Add'} {detectedPremadeFromSource.length} Qs
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="w-4 h-4" />
                      {importBehavior === 'append'
                        ? `Add +${parseInt(mcqCount, 10) || 0} Obj + ${parseInt(theoryCount, 10) || 0} Theory`
                        : hasPaperQuestions
                          ? `Replace Paper (${parseInt(mcqCount, 10) || 0} Obj + ${parseInt(theoryCount, 10) || 0} Theory)`
                          : `Generate ${parseInt(mcqCount, 10) || 0} Obj + ${parseInt(theoryCount, 10) || 0} Theory`}
                    </>
                  )}
                </button>
                {(aiGenerating || aiSolvingPremade) && (
                  <button
                    type="button"
                    onClick={cancelAiGeneration}
                    className="shrink-0 px-3 py-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs font-black hover:bg-rose-500/20 transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Quick Section Mix Presets */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
            <span className="font-bold text-muted-foreground mr-1">Quick mix:</span>
            {[
              { label: '10 MCQ + 2 Theory', mcq: 10, theory: 2 },
              { label: '20 MCQ + 5 Theory', mcq: 20, theory: 5 },
              { label: '15 MCQ Only', mcq: 15, theory: 0 },
              { label: '5 Theory / Essay', mcq: 0, theory: 5 },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  userEditedCountsRef.current = true;
                  setMcqCount(String(preset.mcq));
                  setTheoryCount(String(preset.theory));
                  onQuestionMixChange?.(preset.mcq, preset.theory);
                }}
                className="px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted font-bold text-foreground transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: PASTE / UPLOAD & SOLVE */}
      {activeTab === 'premade' && (
        <div
          id="cbt-studio-panel-premade"
          role="tabpanel"
          aria-labelledby="cbt-studio-tab-premade"
          className="p-4 sm:p-5 space-y-3.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <label
                htmlFor="cbt-premade-paste"
                className="text-xs font-black uppercase tracking-wider text-foreground block"
              >
                Paste Exam Questions or Lesson Notes
              </label>
              <p className="text-[11px] text-muted-foreground">
                Paste premade questions to auto-solve answers &amp; marking guides, or paste notes/code to generate fresh MCQ, Theory &amp; Coding questions.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('generate')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background hover:bg-muted px-3 py-1.5 text-[11px] font-bold text-primary transition-colors"
            >
              <DocumentTextIcon className="w-3.5 h-3.5" />
              {uploadedDocs.length > 0 ? `Manage ${uploadedDocs.length} Uploaded File${uploadedDocs.length === 1 ? '' : 's'}` : 'Upload PPT / PDF / DOC →'}
            </button>
          </div>

          <textarea
            id="cbt-premade-paste"
            rows={6}
            value={isWeekDerivedSource ? '' : sourceText}
            onChange={(e) => {
              setIsWeekDerivedSource(false);
              setSourceText(e.target.value);
              if (!sourceName && e.target.value.trim()) {
                setSourceName('Pasted Script');
              }
            }}
            placeholder={`Paste questions or notes here, e.g.:\nSECTION A: OBJECTIVE\n1. What is the output of print(7 // 2)?\nA) 3.5  B) 3  C) 1  D) 14\n\nSECTION B: THEORY\n2. Explain two uses of loops in Python. [10 marks]`}
            className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 resize-y"
          />

          {/* Smart Generate Bar when teacher pastes notes, theory, or coding material (not numbered MCQs) */}
          {!isWeekDerivedSource && sourceText.trim().length > 0 && detectedPremadeFromSource.length === 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3">
              <div className="min-w-0">
                <p className="text-xs font-black text-foreground">
                  Notes / Theory / Coding Material Ready
                </p>
                <p className="text-[11px] text-muted-foreground">
                  AI will intelligently generate Objective (MCQ), Theory/Essay, and Coding questions from your pasted text.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-foreground">
                  <span>MCQ:</span>
                  <input
                    type="number"
                    aria-label="Number of MCQ questions from pasted text"
                    min={0}
                    max={maxQuestions}
                    value={mcqCount}
                    onChange={(e) => {
                      userEditedCountsRef.current = true;
                      setMcqCount(e.target.value);
                      onQuestionMixChange?.(parseInt(e.target.value, 10) || 0, parseInt(theoryCount, 10) || 0);
                    }}
                    className="w-14 rounded-lg border border-border bg-card px-2 py-1 text-xs font-bold text-foreground"
                  />
                </label>
                <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-foreground">
                  <span>Theory/Coding:</span>
                  <input
                    type="number"
                    aria-label="Number of theory, essay, or coding questions from pasted text"
                    min={0}
                    max={maxQuestions}
                    value={theoryCount}
                    onChange={(e) => {
                      userEditedCountsRef.current = true;
                      setTheoryCount(e.target.value);
                      onQuestionMixChange?.(parseInt(mcqCount, 10) || 0, parseInt(e.target.value, 10) || 0);
                    }}
                    className="w-14 rounded-lg border border-border bg-card px-2 py-1 text-xs font-bold text-foreground"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleAiGenerate}
                  disabled={aiGenerating}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-3.5 py-2 text-xs font-black text-white shadow-sm disabled:opacity-50"
                >
                  {aiGenerating ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <SparklesIcon className="w-3.5 h-3.5" />}
                  {aiGenerating ? 'Generating…' : `Generate ${Math.max(minQuestions, targetTotal)} Questions`}
                </button>
                {aiGenerating && (
                  <button
                    type="button"
                    onClick={cancelAiGeneration}
                    className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-black text-rose-700 dark:text-rose-300"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Live Section Segmentation Preview */}
          {detectedPremadeFromSource.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-black text-emerald-900 dark:text-emerald-200">
                  Detected {detectedPremadeFromSource.length} Qs:
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-card border border-border font-bold text-foreground">
                  Sec A Objective: {premadeSegmentation.objective}
                </span>
                {premadeSegmentation.fillBlank > 0 && (
                  <span className="px-2 py-0.5 rounded-lg bg-card border border-border font-bold text-foreground">
                    Subjective: {premadeSegmentation.fillBlank}
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-lg bg-card border border-border font-bold text-foreground">
                  Sec B Theory/Essay: {premadeSegmentation.essay}
                </span>
                {premadeSegmentation.needsAi > 0 && (
                  <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-900 dark:text-amber-200 font-bold">
                    {premadeSegmentation.needsAi} need AI answer/guide
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
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
                    setAiSuccessMsg(`Imported ${detectedPremadeFromSource.length} questions directly.`);
                  }}
                  className="px-3 py-1.5 rounded-xl border border-border bg-card hover:bg-muted text-xs font-bold text-foreground transition-colors"
                >
                  Import Without AI
                </button>
                <button
                  type="button"
                  onClick={() => handleAiAlignAndSolvePremade(false)}
                  disabled={aiSolvingPremade}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black transition-all disabled:opacity-50"
                >
                  {aiSolvingPremade ? (
                    <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <SparklesIcon className="w-3.5 h-3.5" />
                  )}
                  {aiSolvingPremade ? 'Solving & Aligning…' : `Solve Answers & Import (${detectedPremadeFromSource.length})`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PAST QUESTIONS BANK */}
      {activeTab === 'bank' && (
        <div
          id="cbt-studio-panel-bank"
          role="tabpanel"
          aria-labelledby="cbt-studio-tab-bank"
          className="p-4 sm:p-5 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
              Reuse Past Exam &amp; Lesson Questions
            </h3>
            <div role="group" aria-label="Filter bank by section" className="flex items-center gap-1 text-[11px]">
              {(['all', 'objective', 'subjective'] as const).map((sec) => (
                <button
                  key={sec}
                  type="button"
                  aria-pressed={sectionFilter === sec}
                  onClick={() => setSectionFilter(sec)}
                  className={`px-2.5 py-1 rounded-lg font-bold capitalize border transition-colors ${
                    sectionFilter === sec
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {sec === 'all' ? 'All Sections' : sec === 'objective' ? 'Sec A: Objective' : 'Sec B: Theory'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <div className="sm:col-span-2 relative">
              <MagnifyingGlassIcon className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search past questions"
                placeholder="Search questions…"
                className="w-full pl-8 pr-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <select
              value={trackFilter}
              onChange={(e) => setTrackFilter(e.target.value)}
              aria-label="Filter by course"
              className="px-3 py-2 bg-background border border-border rounded-xl text-xs font-bold text-foreground"
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
              className="px-3 py-2 bg-background border border-border rounded-xl text-xs font-bold text-foreground"
            >
              <option value="all">All Types</option>
              <option value="multiple_choice">MCQ</option>
              <option value="true_false">True / False</option>
              <option value="fill_blank">Fill Blank</option>
              <option value="essay">Theory / Essay</option>
            </select>
          </div>

          {/* Quick Tick-All + Bulk Adopt / Replace Bar for Swift Migration */}
          {filteredBankQuestions.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const visibleIds = filteredBankQuestions.slice(0, 40).map((q) => q.id);
                  const allVisibleTicked = visibleIds.length > 0 && visibleIds.every((id) => selectedBankIds.has(id));
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBankIds((prev) => {
                          const next = new Set(prev);
                          if (allVisibleTicked) visibleIds.forEach((id) => next.delete(id));
                          else visibleIds.forEach((id) => next.add(id));
                          return next;
                        });
                      }}
                      className="rounded-lg border border-border bg-card hover:bg-muted px-2.5 py-1 text-[11px] font-black text-foreground transition-colors"
                    >
                      {allVisibleTicked ? 'Untick Visible' : `Tick All Visible (${visibleIds.length})`}
                    </button>
                  );
                })()}
                <span className="text-xs font-bold text-muted-foreground">
                  {selectedBankIds.size > 0
                    ? `${selectedBankIds.size} ticked ready to migrate`
                    : `${filteredBankQuestions.length} matching question${filteredBankQuestions.length === 1 ? '' : 's'}`}
                </span>
              </div>
              {selectedBankIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedBankIds(new Set())}
                    className="px-2 py-1 text-xs font-bold text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => handleImportSelectedPremade('append')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black transition-colors"
                  >
                    + Add Selected ({selectedBankIds.size})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleImportSelectedPremade('replace')}
                    className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black transition-colors"
                  >
                    Replace Paper ({selectedBankIds.size})
                  </button>
                </div>
              )}
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
                    className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background p-3 text-xs"
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
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-primary/10 text-primary">
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

      {/* TAB 4: BLUEPRINT & READINESS AUDIT */}
      {activeTab === 'blueprint' && (
        <div
          id="cbt-studio-panel-blueprint"
          role="tabpanel"
          aria-labelledby="cbt-studio-tab-blueprint"
          className="p-4 sm:p-5 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
                Paper Blueprint &amp; Readiness ({liveBlueprint.alignmentScore}% Aligned)
              </h3>
              <p className="text-[11px] text-muted-foreground">{liveBlueprint.sourceSummary}</p>
            </div>
            {hasPaperQuestions && (
              <button
                type="button"
                onClick={() => handleAiAlignAndSolvePremade(true)}
                disabled={aiSolvingPremade}
                className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black disabled:opacity-50"
              >
                {aiSolvingPremade ? 'Solving…' : '✨ Auto-Fill Missing Answers & Guides'}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="rounded-xl border border-border bg-background p-3">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">Questions &amp; Marks</span>
              <p className="text-sm font-black text-foreground mt-0.5">
                {liveBlueprint.totalQuestions} Qs · {liveBlueprint.totalPoints} pts
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background p-3">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">Answers Ready</span>
              <p className="text-sm font-black text-emerald-700 dark:text-emerald-400 mt-0.5">
                {liveBlueprint.answeredCount} / {liveBlueprint.totalQuestions}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background p-3">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">Marking Guides</span>
              <p className="text-sm font-black text-emerald-700 dark:text-emerald-400 mt-0.5">
                {liveBlueprint.markingGuideCount} / {liveBlueprint.totalQuestions}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background p-3">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">Section Mix</span>
              <p className="text-sm font-black text-foreground mt-0.5">
                {liveBlueprint.sections.objective.count} Obj · {liveBlueprint.sections.subjective.count} Theory
              </p>
            </div>
          </div>

          {/* Live Question Quality Audit (Duplicates & Weak Distractor Guard) */}
          {(() => {
            const paperQs = currentQuestions ?? [];
            const dedupeCheck = dedupeCbtQuestions(paperQs, []);
            const weakDistractorCount = paperQs.filter((q) =>
              q.question_type === 'multiple_choice'
              && Array.isArray(q.options)
              && q.options.some((opt) => /^(?:all|none)\s+of\s+the\s+above\b/i.test(String(opt || '').trim())),
            ).length;
            const incompleteMcqCount = paperQs.filter((q) =>
              q.question_type === 'multiple_choice'
              && (!Array.isArray(q.options) || q.options.filter((o) => String(o || '').trim()).length < 4),
            ).length;
            if (dedupeCheck.skippedCount === 0 && weakDistractorCount === 0 && incompleteMcqCount === 0) return null;
            return (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-foreground">
                  <span className="text-primary font-black uppercase text-[10px]">Quality Audit:</span>
                  {dedupeCheck.skippedCount > 0 && (
                    <span className="rounded-md bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-rose-700 dark:text-rose-300">
                      {dedupeCheck.skippedCount} duplicate{dedupeCheck.skippedCount === 1 ? '' : 's'}
                    </span>
                  )}
                  {weakDistractorCount > 0 && (
                    <span className="rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-amber-800 dark:text-amber-300">
                      {weakDistractorCount} &ldquo;All/None of above&rdquo; option{weakDistractorCount === 1 ? '' : 's'}
                    </span>
                  )}
                  {incompleteMcqCount > 0 && (
                    <span className="rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-amber-800 dark:text-amber-300">
                      {incompleteMcqCount} MCQ under 4 options
                    </span>
                  )}
                </div>
                {dedupeCheck.skippedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const uniqueNormalized: StudioGeneratedQuestion[] = (dedupeCheck.unique as typeof paperQs).map((q) => ({
                        question_text: q.question_text,
                        question_type: (q.question_type || 'multiple_choice') as StudioGeneratedQuestion['question_type'],
                        options: Array.isArray(q.options) ? q.options : [],
                        correct_answer: String(q.correct_answer ?? ''),
                        points: Number(q.points) || 5,
                        section: (q.section === 'subjective' ? 'subjective' : 'objective') as StudioGeneratedQuestion['section'],
                        explanation: q.explanation ?? undefined,
                        metadata: q.metadata ?? null,
                      }));
                      onImportQuestions(uniqueNormalized, 'replace');
                      setAiSuccessMsg(`Removed ${dedupeCheck.skippedCount} duplicate question${dedupeCheck.skippedCount === 1 ? '' : 's'}.`);
                    }}
                    className="rounded-lg bg-rose-700 hover:bg-rose-800 px-2.5 py-1 text-[10px] font-black text-white"
                  >
                    Clean {dedupeCheck.skippedCount} Duplicate{dedupeCheck.skippedCount === 1 ? '' : 's'}
                  </button>
                )}
              </div>
            );
          })()}

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
