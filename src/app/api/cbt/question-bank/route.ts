import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import {
  inferCognitiveLevel,
  type CurriculumWeekItem,
  type PremadeQuestionItem,
  type PremadeQuestionSection,
} from '@/lib/cbt/question-bank-catalog';

export const dynamic = 'force-dynamic';

function normalizeSection(type: string, rawSection?: unknown): PremadeQuestionSection {
  if (rawSection === 'objective' || rawSection === 'subjective' || rawSection === 'practical') {
    return rawSection;
  }
  return ['essay', 'fill_blank', 'fill_in_blank', 'short_answer'].includes(type) ? 'subjective' : 'objective';
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = createAdminClient() as any;
    const { data: caller } = await db
      .from('portal_users')
      .select('id, role, school_id, is_active, is_deleted')
      .eq('id', user.id)
      .maybeSingle();

    if (!caller?.is_active || caller.is_deleted || !['admin', 'teacher', 'school'].includes(caller.role ?? '')) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('course_id') || null;
    const programId = searchParams.get('program_id') || null;
    const classId = searchParams.get('class_id') || null;

    const allowedSchoolIds =
      caller.role === 'admin'
        ? null
        : caller.role === 'teacher'
          ? await getTeacherSchoolIds(caller.id, caller.school_id ?? null)
          : caller.school_id
            ? [caller.school_id]
            : [];

    // 1. Fetch past CBT questions from the database
    let cbtExamQuery = db
      .from('cbt_exams')
      .select('id, title, course_id, program_id, school_id, created_by, courses(title), programs(name)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (caller.role === 'teacher') {
      if (allowedSchoolIds && allowedSchoolIds.length > 0) {
        cbtExamQuery = cbtExamQuery.or(
          `created_by.eq.${caller.id},school_id.in.(${allowedSchoolIds.join(',')})`,
        );
      } else {
        cbtExamQuery = cbtExamQuery.eq('created_by', caller.id);
      }
    } else if (caller.role === 'school' && caller.school_id) {
      cbtExamQuery = cbtExamQuery.eq('school_id', caller.school_id);
    }

    // 2. Fetch past Written Exams from the database
    const writtenExamQuery = db
      .from('exams')
      .select('id, title, course_id, program_id, created_by, courses(title, school_id)')
      .order('created_at', { ascending: false })
      .limit(50);

    const [{ data: cbtExams }, { data: writtenExams }] = await Promise.all([
      cbtExamQuery,
      writtenExamQuery,
    ]);

    const cbtExamMap = new Map<string, any>();
    for (const ex of cbtExams ?? []) {
      cbtExamMap.set(ex.id, ex);
    }

    const writtenExamMap = new Map<string, any>();
    for (const ex of writtenExams ?? []) {
      const exSchoolId = ex.courses?.school_id ?? null;
      if (
        caller.role === 'admin' ||
        ex.created_by === caller.id ||
        (exSchoolId && allowedSchoolIds?.includes(exSchoolId))
      ) {
        writtenExamMap.set(ex.id, ex);
      }
    }

    const cbtExamIds = Array.from(cbtExamMap.keys());
    const writtenExamIds = Array.from(writtenExamMap.keys());

    const [{ data: cbtQuestions }, { data: writtenQuestions }] = await Promise.all([
      cbtExamIds.length > 0
        ? db
            .from('cbt_questions')
            .select('id, exam_id, question_text, question_type, options, correct_answer, points, metadata')
            .in('exam_id', cbtExamIds)
            .limit(250)
        : Promise.resolve({ data: [] as any[] }),
      writtenExamIds.length > 0
        ? db
            .from('exam_questions')
            .select('id, exam_id, question_text, question_type, options, correct_answer, points, explanation')
            .in('exam_id', writtenExamIds)
            .limit(250)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const bankItems: PremadeQuestionItem[] = [];
    const seenTextSet = new Set<string>();

    for (const q of cbtQuestions ?? []) {
      const text = String(q.question_text ?? '').trim();
      if (!text) continue;
      const dedupeKey = text.toLowerCase();
      if (seenTextSet.has(dedupeKey)) continue;
      seenTextSet.add(dedupeKey);

      const exam = cbtExamMap.get(q.exam_id);
      const courseTitle = exam?.courses?.title || exam?.programs?.name || 'Past CBT Assessment';
      const rawType = String(q.question_type ?? 'multiple_choice');
      const normalizedType: PremadeQuestionItem['question_type'] =
        rawType === 'true_false' || rawType === 'fill_blank' || rawType === 'essay'
          ? rawType
          : 'multiple_choice';

      bankItems.push({
        id: `cbt-${q.id}`,
        source: 'cbt_past',
        sourceLabel: `Past CBT · ${exam?.title || 'Assessment'}`,
        track: courseTitle,
        courseId: exam?.course_id ?? null,
        programId: exam?.program_id ?? null,
        weekNumber: Number(q.metadata?.week_number) || null,
        difficulty: inferCognitiveLevel(text, normalizedType),
        question_text: text,
        question_type: normalizedType,
        options: Array.isArray(q.options) ? q.options.map(String) : [],
        correct_answer: String(q.correct_answer ?? ''),
        points: Number(q.points) || 5,
        section: normalizeSection(normalizedType, q.metadata?.section),
        curriculumTag: q.metadata?.curriculum_tag ? String(q.metadata.curriculum_tag) : courseTitle,
      });
    }

    for (const q of writtenQuestions ?? []) {
      const text = String(q.question_text ?? '').trim();
      if (!text) continue;
      const dedupeKey = text.toLowerCase();
      if (seenTextSet.has(dedupeKey)) continue;
      seenTextSet.add(dedupeKey);

      const exam = writtenExamMap.get(q.exam_id);
      const courseTitle = exam?.courses?.title || 'Past Written Exam';
      const rawType = String(q.question_type ?? 'multiple_choice');
      const normalizedType: PremadeQuestionItem['question_type'] =
        rawType === 'fill_in_blank'
          ? 'fill_blank'
          : rawType === 'true_false' || rawType === 'short_answer' || rawType === 'essay'
            ? rawType
            : 'multiple_choice';

      const opts = Array.isArray(q.options) ? q.options.map(String) : [];
      let resolvedCorrect = String(q.correct_answer ?? '');
      if (normalizedType === 'multiple_choice' && opts.length > 0 && /^\d+$/.test(resolvedCorrect)) {
        const idx = Number(resolvedCorrect);
        if (opts[idx]) resolvedCorrect = opts[idx];
      }

      bankItems.push({
        id: `written-${q.id}`,
        source: 'written_past',
        sourceLabel: `Past Written · ${exam?.title || 'Exam'}`,
        track: courseTitle,
        courseId: exam?.course_id ?? null,
        programId: exam?.program_id ?? null,
        difficulty: inferCognitiveLevel(text, normalizedType),
        question_text: text,
        question_type: normalizedType,
        options: opts,
        correct_answer: resolvedCorrect,
        points: Number(q.points) || 5,
        section: normalizeSection(normalizedType),
        explanation: q.explanation ? String(q.explanation) : undefined,
        curriculumTag: courseTitle,
      });
    }

    // 3. Load Curriculum Weeks & Lessons for the selected class / course / programme
    const curriculumWeeks: CurriculumWeekItem[] = [];
    const seenWeeks = new Set<number>();

    if (classId || courseId || programId) {
      let planQuery = db
        .from('lesson_plans')
        .select('id, class_id, course_id, term_id, plan_data, status')
        .neq('status', 'archived')
        .limit(5);
      if (classId) planQuery = planQuery.eq('class_id', classId);
      else if (courseId) planQuery = planQuery.eq('course_id', courseId);

      const { data: plans } = await planQuery;
      const planIds = (plans ?? []).map((p: any) => p.id);

      let lessonQuery = db
        .from('lessons')
        .select('id, title, description, week_number, status, content, course_id, class_id')
        .order('week_number', { ascending: true })
        .limit(30);
      if (classId) {
        lessonQuery = lessonQuery.eq('class_id', classId);
      } else if (planIds.length > 0) {
        lessonQuery = lessonQuery.in('lesson_plan_id', planIds);
      } else if (courseId) {
        lessonQuery = lessonQuery.eq('course_id', courseId);
      }

      const { data: lessons } = await lessonQuery;

      for (const lesson of lessons ?? []) {
        const wk = Number(lesson.week_number) || curriculumWeeks.length + 1;
        if (seenWeeks.has(wk)) continue;
        seenWeeks.add(wk);

        const contentObj =
          lesson.content && typeof lesson.content === 'object' ? lesson.content : {};
        const objectives = Array.isArray(contentObj.objectives)
          ? contentObj.objectives.map(String)
          : lesson.description
            ? [String(lesson.description)]
            : [];
        const keyConcepts = Array.isArray(contentObj.key_concepts)
          ? contentObj.key_concepts.map(String)
          : [];
        const isTaught = ['taught', 'completed', 'published', 'active'].includes(
          String(lesson.status ?? '').toLowerCase(),
        );

        // Also extract any embedded lesson quiz blocks into bankItems
        const blocks = Array.isArray(contentObj.blocks) ? contentObj.blocks : [];
        blocks.forEach((b: any, bIdx: number) => {
          if (b?.type === 'quiz' && typeof b.question === 'string' && b.question.trim()) {
            const qText = b.question.trim();
            const key = qText.toLowerCase();
            if (!seenTextSet.has(key)) {
              seenTextSet.add(key);
              const opts = Array.isArray(b.options) ? b.options.map(String) : [];
              const ansIdx = Number(b.correctAnswer ?? 0);
              bankItems.push({
                id: `lesson-${lesson.id}-${bIdx}`,
                source: 'lesson_quiz',
                sourceLabel: `Week ${wk} Lesson Quiz · ${lesson.title}`,
                track: String(lesson.title || `Week ${wk}`),
                courseId: lesson.course_id ?? courseId,
                weekNumber: wk,
                difficulty: inferCognitiveLevel(qText, 'multiple_choice'),
                question_text: qText,
                question_type: 'multiple_choice',
                options: opts,
                correct_answer: opts[ansIdx] ?? opts[0] ?? '',
                points: 5,
                section: 'objective',
                curriculumTag: `Week ${wk}: ${lesson.title}`,
              });
            }
          }
        });

        curriculumWeeks.push({
          week: wk,
          title: String(lesson.title || `Week ${wk} Lesson`),
          objectives,
          keyConcepts,
          taught: isTaught,
          lessonId: lesson.id,
        });
      }

      if (curriculumWeeks.length === 0 && Array.isArray(plans) && plans.length > 0) {
        for (const p of plans) {
          const weeksArr = Array.isArray(p.plan_data?.weeks) ? p.plan_data.weeks : [];
          for (const w of weeksArr) {
            const wk = Number(w.week ?? w.week_number) || curriculumWeeks.length + 1;
            if (seenWeeks.has(wk)) continue;
            seenWeeks.add(wk);
            curriculumWeeks.push({
              week: wk,
              title: String(w.topic || w.title || `Week ${wk}`),
              objectives: Array.isArray(w.objectives) ? w.objectives.map(String) : [],
              keyConcepts: Array.isArray(w.key_concepts) ? w.key_concepts.map(String) : [],
              taught: Boolean(w.taught ?? w.is_taught ?? true),
            });
          }
        }
      }
    }

    return NextResponse.json({
      data: {
        questions: bankItems,
        curriculumWeeks: curriculumWeeks.sort((a, b) => a.week - b.week),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to load question bank' },
      { status: 500 },
    );
  }
}
