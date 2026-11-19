export type PremadeQuestionSource = 'cbt_past' | 'written_past' | 'lesson_quiz' | 'txt_pdf_import';

export type PremadeQuestionSection = 'objective' | 'subjective' | 'practical';

export type CognitiveLevel = 'foundation' | 'application' | 'reasoning';

export interface PremadeQuestionItem {
  id: string;
  source: PremadeQuestionSource;
  sourceLabel: string;
  track: string;
  courseId?: string | null;
  programId?: string | null;
  weekNumber?: number | null;
  difficulty: CognitiveLevel;
  question_text: string;
  question_type: 'multiple_choice' | 'true_false' | 'fill_blank' | 'short_answer' | 'essay';
  options: string[];
  correct_answer: string;
  marking_guide?: string;
  points: number;
  section: PremadeQuestionSection;
  explanation?: string;
  curriculumTag?: string;
  needsAiAnswer?: boolean;
}

export interface CurriculumWeekItem {
  week: number;
  title: string;
  objectives: string[];
  keyConcepts: string[];
  taught: boolean;
  lessonId?: string | null;
}

export interface AssessmentBlueprintTopicRow {
  topic: string;
  questionNumbers: number[];
  questionCount: number;
  points: number;
}

export interface AssessmentBlueprint {
  title: string;
  sourceSummary: string;
  alignmentScore: number;
  totalQuestions: number;
  totalPoints: number;
  estimatedMinutes: number;
  answeredCount: number;
  markingGuideCount: number;
  sections: {
    objective: { count: number; points: number; percent: number };
    subjective: { count: number; points: number; percent: number };
    practical: { count: number; points: number; percent: number };
  };
  cognitiveDistribution: {
    foundation: number;
    application: number;
    reasoning: number;
  };
  topicCoverage: AssessmentBlueprintTopicRow[];
  readinessWarnings: string[];
}

export interface PremadeQuestionFilter {
  search?: string;
  track?: string;
  source?: string;
  questionType?: string;
  section?: string;
  weekNumber?: number | null;
}

export function inferCognitiveLevel(questionText: string, questionType: string): CognitiveLevel {
  const lower = questionText.toLowerCase();
  if (
    questionType === 'essay' ||
    /\b(why|explain|design|debug|compare|analyze|analyse|evaluate|construct|algorithm|optimize|justify)\b/.test(lower)
  ) {
    return 'reasoning';
  }
  if (
    questionText.includes('```') ||
    /\b(output|trace|calculate|apply|predict|solve|implement|write a|complete the|given the)\b/.test(lower)
  ) {
    return 'application';
  }
  return 'foundation';
}

/**
 * Strips redundant leading option labels like "A) ", "A. ", "(a) ", "Option B: " from an option string.
 */
export function stripOptionPrefix(raw: string): string {
  return String(raw ?? '')
    .trim()
    .replace(/^(?:option\s+)?(?:\([A-Fa-f]\)|[A-Fa-f][\.\)\:\-])\s+/i, '')
    .trim();
}

function normalizeForOptionMatch(raw: string): string {
  return stripOptionPrefix(raw)
    .replace(/^[`"'“”‘’]+|[`"'“”‘’]+$/g, '')
    .replace(/[.;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Resolves any answer format (exact text, letter "B", "Option B", "(c)", "B) 8",
 * "Answer: C", quoted/backticked text, or partial match) to the exact option string in `options`.
 */
export function resolveMcqAnswerToOption(rawAnswer: string, options: string[]): string {
  const clean = String(rawAnswer ?? '').trim();
  const validOptions = options.map((o) => String(o ?? '').trim());
  if (!clean || validOptions.length === 0) return clean;

  // 1. Direct case-insensitive exact match
  const exact = validOptions.find((opt) => opt.toLowerCase() === clean.toLowerCase());
  if (exact) return exact;

  // 2. Normalized match (ignores A)/B) prefix, quotes, backticks, trailing punctuation, extra spaces)
  const normAns = normalizeForOptionMatch(clean);
  if (normAns) {
    const normMatch = validOptions.find((opt) => normalizeForOptionMatch(opt) === normAns);
    if (normMatch) return normMatch;
  }

  // 3. Explicit letter match: "B", "(b)", "B)", "Option B", "Answer: B", "Correct answer is B"
  const letterMatch = clean.match(
    /^(?:(?:the\s+)?(?:correct\s+)?(?:answer|ans|option)\s*(?:is|[:\-])?\s*)?\(?([A-Fa-f])\)?(?:[\.\)\:\-\s]|$)/i,
  );
  if (letterMatch) {
    const idx = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
    if (validOptions[idx]) return validOptions[idx];
  }

  // 4. Numeric index ("0".."5" or 1-based if equals options.length)
  if (/^\d+$/.test(clean)) {
    const num = parseInt(clean, 10);
    if (num >= 0 && num < validOptions.length && validOptions[num]) return validOptions[num];
    if (num >= 1 && num <= validOptions.length && validOptions[num - 1]) return validOptions[num - 1];
  }

  // 5. Unique substring match (e.g. "B) Loops repeat code — because..." matching "Loops repeat code")
  if (normAns.length >= 3) {
    const containing = validOptions.filter((opt) => {
      const nOpt = normalizeForOptionMatch(opt);
      return nOpt.length >= 2 && (normAns.includes(nOpt) || nOpt.includes(normAns));
    });
    if (containing.length === 1) return containing[0];
  }

  return clean;
}

/**
 * Smart parser that extracts premade questions, answers, and marking guides from raw `.txt` / `.pdf` / pasted text.
 * Supports:
 * - Inline or multiline options (`A)`, `A.`, `(a)`, `*B)` for starred correct answers)
 * - Per-question `Answer:`, `Ans:`, `Marking Guide:`, `Rubric:`, `Model Answer:`, `Explanation:` lines
 * - End-of-document `ANSWER KEY` / `MARKING SCHEME` sections (e.g. `1. B`, `2. True`, `3. Award 5 marks for...`)
 */
export function parsePremadeQuestionsFromText(
  rawText: string,
  options?: {
    sourceName?: string;
    defaultTrack?: string;
  },
): PremadeQuestionItem[] {
  const normalized = String(rawText ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!normalized) return [];

  const sourceLabel = options?.sourceName?.trim()
    ? `Imported · ${options.sourceName.trim()}`
    : 'Imported · TXT / PDF Document';
  const defaultTrack = options?.defaultTrack?.trim() || 'Document Import';

  // 1. Check if there is a trailing ANSWER KEY / MARKING GUIDE section at the end of the document
  const answerKeyMap = new Map<number, { answer: string; guide?: string }>();
  let mainBody = normalized;

  const keyHeaderMatch = normalized.match(
    /\n(?:={2,}|\-{2,})?\s*(?:ANSWER\s+KEY|ANSWERS\s+AND\s+MARKING\s+GUIDE|MARKING\s+GUIDE|MARKING\s+SCHEME|SOLUTIONS|ANSWERS)\s*(?:\:|\n)/i,
  );
  if (keyHeaderMatch && keyHeaderMatch.index !== undefined && keyHeaderMatch.index > 20) {
    mainBody = normalized.slice(0, keyHeaderMatch.index).trim();
    const keySection = normalized.slice(keyHeaderMatch.index + keyHeaderMatch[0].length).trim();

    // Parse inline pairs like "1. B  2. A  3. C" or multiline "1. B - explanation"
    const keyLines = keySection.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const kLine of keyLines) {
      const inlinePairs = [...kLine.matchAll(/(?:Q(?:uestion)?\s*)?(\d+)[\.\)\:\-]\s*([A-Da-d]|True|False)\b(?:\s*[\-\–\:]\s*([^\d]+))?/gi)];
      if (inlinePairs.length >= 2) {
        for (const pair of inlinePairs) {
          const qNum = parseInt(pair[1], 10);
          answerKeyMap.set(qNum, {
            answer: pair[2].trim(),
            guide: pair[3]?.trim(),
          });
        }
        continue;
      }
      const lineMatch = kLine.match(/^(?:Q(?:uestion)?\s*)?(\d+)[\.\)\:\-]\s*(.+)$/i);
      if (lineMatch) {
        const qNum = parseInt(lineMatch[1], 10);
        const rest = lineMatch[2].trim();
        answerKeyMap.set(qNum, { answer: rest, guide: rest });
      }
    }
  }

  // 2. Track section headers (e.g. "SECTION A: OBJECTIVE", "SECTION B: THEORY / ESSAY") and split into question blocks
  const cleanedLines = mainBody.split('\n');
  const sectionTaggedBlocks: Array<{ block: string; sectionHint: 'objective' | 'subjective' | 'essay' | null }> = [];
  let currentSectionHint: 'objective' | 'subjective' | 'essay' | null = null;
  let currentChunk: string[] = [];

  const flushChunk = () => {
    const joined = currentChunk.join('\n').trim();
    if (joined) sectionTaggedBlocks.push({ block: joined, sectionHint: currentSectionHint });
    currentChunk = [];
  };

  for (const rawLine of cleanedLines) {
    const trimmed = rawLine.trim();
    const secMatch = trimmed.match(/^(?:SECTION|PART)\s+[A-Z0-9]+\s*[\:\-\–\.]?\s*(.*)$/i);
    if (secMatch && trimmed.length < 90) {
      flushChunk();
      const label = (secMatch[1] || trimmed).toLowerCase();
      if (/objective|mcq|multiple\s*choice|true\s*or\s*false/.test(label)) currentSectionHint = 'objective';
      else if (/essay|theory|long\s*answer|extended/.test(label)) currentSectionHint = 'essay';
      else if (/subjective|short\s*answer|fill|practical|coding/.test(label)) currentSectionHint = 'subjective';
      continue;
    }
    if (/^(?:Q(?:uestion)?\s*\d+(?:[\.\:\)]\s*|\s+)|\(\d+\)\s*|\d+[\.\)]\s*(?=\D)|\d+\s*[\-\–]\s+)/i.test(trimmed) && currentChunk.length > 0) {
      flushChunk();
    }
    currentChunk.push(rawLine);
  }
  flushChunk();

  const candidateEntries =
    sectionTaggedBlocks.length > 1
      ? sectionTaggedBlocks
      : mainBody
          .split(/\n{2,}/)
          .map((b) => b.trim())
          .filter(Boolean)
          .map((b) => ({ block: b, sectionHint: currentSectionHint }));

  const results: PremadeQuestionItem[] = [];

  candidateEntries.forEach(({ block, sectionHint }, idx) => {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    // Detect explicit question number if present
    const numMatch = lines[0].match(/^(?:Q(?:uestion)?\s*(\d+)(?:[\.\:\)]\s*|\s+)|\((\d+)\)\s*|(\d+)[\.\)]\s*(?=\D)|(\d+)\s*[\-\–]\s+)/i);
    const questionNumber = numMatch ? parseInt(numMatch[1] || numMatch[2] || numMatch[3] || numMatch[4], 10) : idx + 1;

    // Extract optional point marker e.g. [5 marks], (4 pts), (10 marks)
    let points = 5;
    const pointsMatch = block.match(/[\(\[]\s*(\d+)\s*(?:marks?|pts?|points?)\s*[\)\]]/i);
    if (pointsMatch) {
      points = Math.max(1, parseInt(pointsMatch[1], 10) || 5);
    }

    // Extract explicit Answer / Marking Guide / Rubric lines
    let answerHint = '';
    let markingGuideHint = '';
    let explanationHint = '';
    const contentLines: string[] = [];

    for (const line of lines) {
      const ansMatch = line.match(
        /^(?:correct\s+answer|model\s+answer|expected\s+answer|answer|ans)\s*[\:\-]\s*(.+)$/i,
      );
      if (ansMatch) {
        answerHint = ansMatch[1].trim();
        continue;
      }
      const guideMatch = line.match(
        /^(?:marking\s+guide|marking\s+scheme|scoring\s+guide|rubric|grading\s+guide)\s*[\:\-]\s*(.+)$/i,
      );
      if (guideMatch) {
        markingGuideHint = guideMatch[1].trim();
        continue;
      }
      const expMatch = line.match(/^(?:explanation|rationale|note)\s*[\:\-]\s*(.+)$/i);
      if (expMatch) {
        explanationHint = expMatch[1].trim();
        continue;
      }
      contentLines.push(line);
    }

    // Check trailing answerKeyMap if no inline answer was given
    const mappedKey = answerKeyMap.get(questionNumber) || answerKeyMap.get(idx + 1);
    if (!answerHint && mappedKey?.answer) {
      answerHint = mappedKey.answer;
    }
    if (!markingGuideHint && mappedKey?.guide) {
      markingGuideHint = mappedKey.guide;
    }

    if (contentLines.length === 0) return;

    // Extract options A-F if present (supports "(A) ...", "(a) ...", "A) ...", "A. ...", "a. ...", "*B) ...", inline or multiline)
    // Inside Theory / Essay / Coding sections, (a)/(b)/(c) are sub-questions, NOT MCQ choices.
    const isTheoryOrCodingSection = sectionHint === 'subjective';
    const hasCodingOrEssayCue = /\b(write\s+a\s+(?:python|javascript|html|css|sql|c\+\+|java|program|function|script|code|query)|explain\s+in\s+detail|discuss|compare\s+and\s+contrast|debug\s+the\s+following|design\s+an?\s+algorithm|write\s+an?\s+essay)\b/i.test(block);
    const extractedOptions: string[] = [];
    let starredOption = '';
    const stemLines: string[] = [];

    for (const line of contentLines) {
      if (isTheoryOrCodingSection) {
        stemLines.push(line);
        continue;
      }

      const inlineMatches = [
        ...line.matchAll(/(?:^|\s)(\*?)(?:\(([A-Fa-f])\)|([A-Fa-f])[\.\)\:])\s+([^\t]+?)(?=\s+\*?(?:\([A-Fa-f]\)|[A-Fa-f][\.\)\:])\s+|$)/g),
      ];
      if (inlineMatches.length >= 2 && !hasCodingOrEssayCue) {
        const firstIdx = inlineMatches[0].index ?? 0;
        const prefixStem = line.slice(0, firstIdx).trim();
        if (prefixStem) stemLines.push(prefixStem);
        for (const m of inlineMatches) {
          const rawOptText = (m[4] || '').trim();
          const optText = rawOptText.replace(/\s*(?:\[correct\]|\(correct\)|✓)\s*$/i, '').trim();
          const isMarked = m[1] === '*' || /(?:\[correct\]|\(correct\)|✓)/i.test(rawOptText);
          if (optText) {
            extractedOptions.push(optText);
            if (isMarked) starredOption = optText;
          }
        }
        continue;
      }

      const singleOptMatch = !hasCodingOrEssayCue
        ? line.match(/^(\*?)(?:\(([A-Fa-f])\)|([A-Fa-f])[\.\)\:\-])\s+(.+)$/)
        : null;
      if (singleOptMatch) {
        const rawOpt = singleOptMatch[4].trim();
        const isMarked = singleOptMatch[1] === '*' || /(?:\[correct\]|\(correct\)|✓)\s*$/i.test(rawOpt);
        const optText = rawOpt.replace(/\s*(?:\[correct\]|\(correct\)|✓)\s*$/i, '').trim();
        if (optText) {
          extractedOptions.push(optText);
          if (isMarked) starredOption = optText;
        }
      } else {
        stemLines.push(line);
      }
    }

    const questionStem = stemLines
      .join('\n')
      .replace(/^(?:Q(?:uestion)?\s*\d+(?:[\.\:\)]\s*|\s+)|\(\d+\)\s*|\d+[\.\)]\s*(?=\D)|\d+\s*[\-\–]\s+)/i, '')
      .replace(/[\(\[]\s*\d+\s*(?:marks?|pts?|points?)\s*[\)\]]/gi, '')
      .trim();

    if (!questionStem || questionStem.length < 4) return;

    let questionType: PremadeQuestionItem['question_type'] = 'multiple_choice';
    let finalOptions: string[] = [];
    let resolvedAnswer = answerHint || starredOption || markingGuideHint;
    let needsAiAnswer = false;

    if (extractedOptions.length >= 2) {
      questionType = 'multiple_choice';
      finalOptions = extractedOptions.slice(0, 6);
      if (resolvedAnswer) {
        resolvedAnswer = resolveMcqAnswerToOption(resolvedAnswer, finalOptions);
      } else {
        needsAiAnswer = true;
      }
    } else if (
      /^(true|false)$/i.test(resolvedAnswer) ||
      /\b(true\s*or\s*false|true\s*\/\s*false)\b/i.test(questionStem)
    ) {
      questionType = 'true_false';
      finalOptions = ['True', 'False'];
      if (resolvedAnswer) {
        resolvedAnswer = /^false$/i.test(resolvedAnswer) ? 'False' : 'True';
      } else {
        needsAiAnswer = true;
      }
    } else if (questionStem.includes('____') || /\bfill\s+in\s+the\s+blank/i.test(questionStem)) {
      questionType = 'fill_blank';
      finalOptions = [];
      if (!resolvedAnswer) needsAiAnswer = true;
    } else if (sectionHint === 'objective' && /\b(which|what|who|select|choose|identify)\b/i.test(questionStem)) {
      questionType = 'multiple_choice';
      finalOptions = [];
      needsAiAnswer = true;
    } else {
      questionType = 'essay';
      finalOptions = [];
      if (!pointsMatch) points = sectionHint === 'subjective' ? 5 : 10;
      if (!resolvedAnswer) needsAiAnswer = true;
    }

    const section: PremadeQuestionSection =
      questionType === 'essay' || questionType === 'fill_blank' ? 'subjective' : 'objective';

    const finalMarkingGuide =
      markingGuideHint ||
      explanationHint ||
      (questionType === 'essay' && resolvedAnswer ? resolvedAnswer : undefined);

    results.push({
      id: `parsed-${idx + 1}-${Date.now().toString(36)}`,
      source: 'txt_pdf_import',
      sourceLabel,
      track: defaultTrack,
      difficulty: inferCognitiveLevel(questionStem, questionType),
      question_text: questionStem,
      question_type: questionType,
      options: finalOptions,
      correct_answer: resolvedAnswer,
      marking_guide: finalMarkingGuide,
      points,
      section,
      explanation: explanationHint || markingGuideHint || undefined,
      curriculumTag: defaultTrack,
      needsAiAnswer,
    });
  });

  return results;
}

export function buildAssessmentBlueprint(
  questions: Array<{
    question_text: string;
    question_type: string;
    options?: string[] | null;
    correct_answer?: unknown;
    marking_guide?: string;
    explanation?: string | null;
    points?: number;
    section?: string;
    curriculumTag?: string;
    metadata?: Record<string, any> | null;
  }>,
  context?: {
    title?: string;
    courseTitle?: string | null;
    sourceName?: string | null;
    durationMinutes?: number;
  },
): AssessmentBlueprint {
  const validQuestions = questions.filter((q) => String(q.question_text ?? '').trim().length > 0);
  const totalQuestions = validQuestions.length;
  const totalPoints = validQuestions.reduce((sum, q) => sum + Math.max(1, Number(q.points) || 1), 0);

  const sections = {
    objective: { count: 0, points: 0, percent: 0 },
    subjective: { count: 0, points: 0, percent: 0 },
    practical: { count: 0, points: 0, percent: 0 },
  };

  const cognitiveDistribution = {
    foundation: 0,
    application: 0,
    reasoning: 0,
  };

  const topicMap = new Map<string, { questionNumbers: number[]; points: number }>();
  const readinessWarnings: string[] = [];
  const seenStems = new Set<string>();
  let alignedCount = 0;
  let answeredCount = 0;
  let markingGuideCount = 0;

  validQuestions.forEach((q, idx) => {
    const qNum = idx + 1;
    const pts = Math.max(1, Number(q.points) || 1);
    const qType = String(q.question_type || 'multiple_choice');
    const rawSec = q.section || q.metadata?.section;
    const sec: PremadeQuestionSection =
      rawSec === 'practical'
        ? 'practical'
        : rawSec === 'subjective' || ['essay', 'fill_blank', 'fill_in_blank', 'short_answer'].includes(qType)
          ? 'subjective'
          : 'objective';

    sections[sec].count += 1;
    sections[sec].points += pts;

    const cog: CognitiveLevel =
      q.metadata?.cognitive_level && ['foundation', 'application', 'reasoning'].includes(q.metadata.cognitive_level)
        ? q.metadata.cognitive_level
        : inferCognitiveLevel(q.question_text, qType);
    cognitiveDistribution[cog] += 1;

    const topicLabel =
      String(
        q.curriculumTag ||
          q.metadata?.curriculum_tag ||
          context?.sourceName ||
          context?.courseTitle ||
          'Core Assessment Scope',
      ).trim() || 'Core Assessment Scope';

    if (q.curriculumTag || q.metadata?.curriculum_tag || context?.sourceName || context?.courseTitle) {
      alignedCount += 1;
    }

    const currentTopic = topicMap.get(topicLabel) ?? { questionNumbers: [], points: 0 };
    currentTopic.questionNumbers.push(qNum);
    currentTopic.points += pts;
    topicMap.set(topicLabel, currentTopic);

    const hasAnswer = String(q.correct_answer ?? '').trim().length > 0;
    const hasGuide =
      Boolean(q.marking_guide?.trim()) ||
      Boolean(q.explanation?.trim()) ||
      Boolean(q.metadata?.marking_guide) ||
      hasAnswer;

    if (hasAnswer) answeredCount += 1;
    if (hasGuide) markingGuideCount += 1;

    const stemKey = q.question_text.trim().toLowerCase();
    if (seenStems.has(stemKey)) {
      readinessWarnings.push(`Q${qNum} has a duplicate question stem.`);
    }
    seenStems.add(stemKey);

    if (['multiple_choice', 'true_false'].includes(qType)) {
      const opts = Array.isArray(q.options) ? q.options.filter((o) => String(o ?? '').trim()) : [];
      if (opts.length < 2) {
        readinessWarnings.push(`Q${qNum} needs at least 2 answer options.`);
      }
      if (!hasAnswer) {
        readinessWarnings.push(`Q${qNum} is missing a verified correct answer.`);
      }
    } else if (!hasAnswer) {
      readinessWarnings.push(`Q${qNum} (${qType}) needs a marking guide or expected answer.`);
    }
  });

  if (totalPoints > 0) {
    sections.objective.percent = Math.round((sections.objective.points / totalPoints) * 100);
    sections.subjective.percent = Math.round((sections.subjective.points / totalPoints) * 100);
    sections.practical.percent = Math.max(
      0,
      100 - sections.objective.percent - sections.subjective.percent,
    );
  }

  const estimatedMinutes =
    context?.durationMinutes ||
    Math.max(15, sections.objective.count * 2 + (sections.subjective.count + sections.practical.count) * 6);

  const alignmentScore =
    totalQuestions === 0
      ? 0
      : Math.min(
          100,
          Math.round(
            (alignedCount / totalQuestions) * 70 +
              (answeredCount / totalQuestions) * 20 +
              (readinessWarnings.length === 0 ? 10 : Math.max(0, 10 - readinessWarnings.length * 3)),
          ),
        );

  const topicCoverage: AssessmentBlueprintTopicRow[] = Array.from(topicMap.entries()).map(
    ([topic, data]) => ({
      topic,
      questionNumbers: data.questionNumbers,
      questionCount: data.questionNumbers.length,
      points: data.points,
    }),
  );

  return {
    title: context?.title?.trim() || 'Assessment Blueprint',
    sourceSummary:
      context?.sourceName?.trim() ||
      context?.courseTitle?.trim() ||
      'Aligned to selected course & curriculum scope',
    alignmentScore,
    totalQuestions,
    totalPoints,
    estimatedMinutes,
    answeredCount,
    markingGuideCount,
    sections,
    cognitiveDistribution,
    topicCoverage,
    readinessWarnings,
  };
}

export function filterPremadeQuestions(
  items: PremadeQuestionItem[],
  filter: PremadeQuestionFilter,
): PremadeQuestionItem[] {
  const q = (filter.search ?? '').trim().toLowerCase();
  return items.filter((item) => {
    if (filter.track && filter.track !== 'all' && item.track !== filter.track) {
      return false;
    }
    if (filter.source && filter.source !== 'all' && item.source !== filter.source) {
      return false;
    }
    if (filter.questionType && filter.questionType !== 'all' && item.question_type !== filter.questionType) {
      return false;
    }
    if (filter.section && filter.section !== 'all' && item.section !== filter.section) {
      return false;
    }
    if (filter.weekNumber != null && item.weekNumber !== filter.weekNumber) {
      return false;
    }
    if (q) {
      const hay = [
        item.question_text,
        item.track,
        item.sourceLabel,
        item.curriculumTag ?? '',
        item.explanation ?? '',
        item.marking_guide ?? '',
        ...(item.options ?? []),
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function buildCurriculumAlignmentBrief(
  weeks: CurriculumWeekItem[],
  courseTitle?: string | null,
): {
  topicSummary: string;
  sourceMaterial: string;
  weekNumbers: number[];
} {
  const ordered = [...weeks].sort((a, b) => a.week - b.week);
  const weekNumbers = ordered.map((w) => w.week);
  const prefix = courseTitle?.trim() ? `${courseTitle.trim()} — ` : '';
  const topicSummary =
    ordered.length === 0
      ? courseTitle?.trim() || ''
      : ordered.length <= 3
        ? `${prefix}${ordered.map((w) => `Week ${w.week}: ${w.title}`).join('; ')}`
        : `${prefix}Weeks ${ordered[0].week}–${ordered[ordered.length - 1].week} (${ordered.map((w) => w.title).slice(0, 3).join(', ')}…)`;

  const lines = ordered.map((w) => {
    const obj = w.objectives.length > 0 ? `\n  Objectives: ${w.objectives.join('; ')}` : '';
    const concepts = w.keyConcepts.length > 0 ? `\n  Key concepts: ${w.keyConcepts.join(', ')}` : '';
    return `• Week ${w.week}: ${w.title}${w.taught ? ' [TAUGHT]' : ''}${obj}${concepts}`;
  });

  const sourceMaterial =
    ordered.length > 0
      ? `Generate and align assessment questions strictly to the following curriculum weeks and learning objectives:\n\n${lines.join('\n\n')}`
      : '';

  return {
    topicSummary,
    sourceMaterial,
    weekNumbers,
  };
}

export function convertPremadeToCbtQuestion(item: PremadeQuestionItem): {
  question_text: string;
  question_type: 'multiple_choice' | 'true_false' | 'fill_blank' | 'essay';
  options: string[];
  correct_answer: string;
  points: number;
  section: 'objective' | 'subjective' | 'practical';
  metadata: Record<string, unknown>;
} {
  const cbtType: 'multiple_choice' | 'true_false' | 'fill_blank' | 'essay' =
    item.question_type === 'short_answer'
      ? 'fill_blank'
      : item.question_type;

  const options =
    cbtType === 'true_false'
      ? ['True', 'False']
      : cbtType === 'multiple_choice'
        ? item.options.length >= 2
          ? [...item.options]
          : ['', '', '', '']
        : ['', '', '', ''];

  const resolvedCorrect =
    cbtType === 'multiple_choice'
      ? resolveMcqAnswerToOption(item.correct_answer, options)
      : item.correct_answer || item.marking_guide || '';

  return {
    question_text: item.question_text,
    question_type: cbtType,
    options,
    correct_answer: resolvedCorrect,
    points: Math.max(1, Number(item.points) || 5),
    section: item.section || (['essay', 'fill_blank'].includes(cbtType) ? 'subjective' : 'objective'),
    metadata: {
      section: item.section || (['essay', 'fill_blank'].includes(cbtType) ? 'subjective' : 'objective'),
      cognitive_level: item.difficulty,
      ...(item.marking_guide ? { marking_guide: item.marking_guide } : {}),
      ...(item.explanation ? { explanation: item.explanation } : {}),
      ...(item.curriculumTag ? { curriculum_tag: item.curriculumTag } : {}),
      ...(item.weekNumber ? { week_number: item.weekNumber } : {}),
      source_bank_id: item.id,
    },
  };
}

export function convertPremadeToWrittenQuestion(item: PremadeQuestionItem): {
  question_text: string;
  question_type: 'multiple_choice' | 'true_false' | 'short_answer' | 'essay' | 'fill_in_blank';
  points: number;
  options: string[] | null;
  correct_answer: string;
  explanation: string | null;
} {
  const writtenType: 'multiple_choice' | 'true_false' | 'short_answer' | 'essay' | 'fill_in_blank' =
    item.question_type === 'fill_blank' ? 'fill_in_blank' : item.question_type;

  let options: string[] | null = null;
  let correctAnswer = item.correct_answer || item.marking_guide || '';

  if (writtenType === 'true_false') {
    options = ['True', 'False'];
    correctAnswer = /^false$/i.test(correctAnswer) ? 'False' : 'True';
  } else if (writtenType === 'multiple_choice') {
    options = item.options.filter(Boolean);
    const resolvedText = resolveMcqAnswerToOption(correctAnswer, options);
    const matchIndex = options.findIndex(
      (opt) => opt.trim().toLowerCase() === resolvedText.trim().toLowerCase(),
    );
    if (matchIndex >= 0) {
      correctAnswer = String(matchIndex);
    }
  }

  return {
    question_text: item.question_text,
    question_type: writtenType,
    points: Math.max(1, Number(item.points) || 5),
    options,
    correct_answer: correctAnswer,
    explanation: item.marking_guide || item.explanation || item.curriculumTag || null,
  };
}
