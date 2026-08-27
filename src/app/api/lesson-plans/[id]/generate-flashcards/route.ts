import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffUser, canAccessLessonScope } from "@/app/api/lesson-plans/authz";
import { extractCronSecret, isValidCronSecret } from "@/lib/server/cron-auth";
import { getTeacherSchoolIds } from "@/lib/auth-utils";
import { validateLessonPlanForGeneration } from "@/lib/api-guards";
import { parseRequestSession, canonicalMeetingSession } from "@/lib/academic/session-identity";
import { keepPreparedMeetingContent, existingMeetingAsset } from "@/lib/academic/week-package";
import { generateAIContent } from "@/lib/ai/generate-core";
import { reuseWeekContent } from "@/lib/academic/content-reuse-server";

export const dynamic = "force-dynamic";

type AiGeneratedCard = {
  front?: string;
  back?: string;
  tags?: string[];
  difficulty?: string;
};

type MeetingLesson = {
  id: string;
  title: string;
  content_layout?: unknown;
  metadata?: unknown;
  curriculum_week_number?: unknown;
  session_number?: unknown;
};

type MeetingDeck = {
  id: string;
  title: string;
  content_stale_at?: unknown;
  curriculum_week_number?: unknown;
  session_number?: unknown;
  lesson_id?: string | null;
  metadata?: unknown;
};

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const sessionClient = await createServerClient();
  const cronSecret = extractCronSecret(req);
  const isCron = isValidCronSecret(cronSecret);
  const staff = isCron
    ? { id: "cron", role: "admin", school_id: null }
    : await requireStaffUser(sessionClient);
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const { data: plan, error: planErr } = await (db as any)
    .from("lesson_plans")
    .select(
      "*, courses(title), classes!lesson_plans_class_id_fkey(name,teacher_id), official_curriculum:academic_curriculum_releases!lesson_plans_curriculum_release_id_fkey(content), curriculum:course_curricula(content, version)"
    )
    .eq("id", id)
    .single();

  const validationError = validateLessonPlanForGeneration(planErr ? null : plan);
  if (validationError) {
    const { status, ...payload } = validationError;
    return NextResponse.json(payload, { status });
  }

  if (!isCron && staff.role !== "admin") {
    const klass = Array.isArray((plan as any)?.classes)
      ? (plan as any).classes[0]
      : (plan as any)?.classes;
    const teacherSchoolIds =
      staff.role === "teacher"
        ? await getTeacherSchoolIds(staff.id, staff.school_id)
        : [];
    const allowed = canAccessLessonScope(
      staff,
      {
        school_id: (plan as any)?.school_id ?? null,
        created_by: (plan as any)?.created_by ?? null,
        class_id: (plan as any)?.class_id ?? null,
        class_teacher_id: klass?.teacher_id ?? null,
      },
      teacherSchoolIds
    );
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const week = Number(body.week);
  if (!Number.isInteger(week) || week < 1) {
    return NextResponse.json({ error: "week must be a positive integer" }, { status: 400 });
  }
  const onlySession = parseRequestSession(body);

  const allWeekRows: Array<{ week?: number; session?: number; topic?: string }> =
    Array.isArray((plan as any)?.plan_data?.weeks)
      ? (plan as any).plan_data.weeks
      : [];
  const weekMetas = allWeekRows.filter((w) => {
    if (Number(w.week) !== week) return false;
    if (onlySession == null) return true;
    const s = Number(w.session ?? 0);
    return Number.isFinite(s) && s > 0
      ? Math.floor(s) === onlySession
      : onlySession === 1;
  });
  if (!weekMetas.length) {
    return NextResponse.json({ error: "That week is not in this teaching plan" }, { status: 422 });
  }

  // Hold for approval unless the caller explicitly asked to publish live.
  // DB default is also false; setting it here keeps auto_publish honest.
  const isPublic = body.auto_publish === true;

  // flashcard_decks.created_by is NOT NULL, while lessons and assignments
  // tolerate a null creator. So a plan whose creator was never recorded
  // generated four of the five parts and failed the fifth on a raw Postgres
  // constraint. The class teacher owns the week either way, so they are the
  // honest owner of its cards.
  const planClass = Array.isArray((plan as any).classes)
    ? (plan as any).classes[0]
    : (plan as any).classes;
  const deckOwner = isCron
    ? (plan as any).created_by ?? planClass?.teacher_id ?? null
    : staff.id;
  if (!deckOwner) {
    return NextResponse.json(
      {
        error:
          "This plan has no recorded owner, so its flashcards cannot be attributed.",
        detail:
          "Set a class teacher on the class, or regenerate from the plan page while signed in.",
      },
      { status: 422 }
    );
  }

  const weekLessons = ((await (db as any)
    .from("lessons")
    .select("id,title,content_layout,metadata,curriculum_week_number,session_number")
    .eq("lesson_plan_id", id)
    .eq("curriculum_week_number", week)
    .order("created_at", { ascending: false })
    .limit(20)).data ?? []) as MeetingLesson[];

  const existingDecks = ((await (db as any)
    .from("flashcard_decks")
    .select(
      "id,title,content_stale_at,curriculum_week_number,session_number,lesson_id,metadata",
    )
    .eq("lesson_plan_id", id)).data ?? []) as MeetingDeck[];

  let generated = 0;
  let skipped = 0;
  const results: Array<{ id: string; title: string }> = [];
  let lastError: string | null = null;

  for (const weekMeta of weekMetas) {
    const session = canonicalMeetingSession(weekMeta.session);
    const lesson = existingMeetingAsset(weekLessons, week, session);

    // "Already exists" is not the same as "still correct". A deck whose lesson
    // has since been corrected is marked stale by 20260929000046, and skipping
    // it would leave the class practising wording the lesson no longer uses —
    // with nothing on the row to say so. Stale decks are rebuilt: the old one
    // is removed so the copy below can take its place, and for every class
    // after the first that rebuild is a copy from the master, not an AI call.
    const keep = keepPreparedMeetingContent(existingDecks, week, session);
    const existing = existingMeetingAsset(existingDecks, week, session);
    if (keep?.id) {
      const { count } = await (db as any)
        .from("flashcard_cards")
        .select("id", { count: "exact", head: true })
        .eq("deck_id", keep.id);
      if (Number(count) > 0) {
        results.push(keep);
        skipped += 1;
        continue;
      }
      await (db as any).from("flashcard_cards").delete().eq("deck_id", keep.id);
      await (db as any).from("flashcard_decks").delete().eq("id", keep.id);
    } else if (existing?.id) {
      await (db as any).from("flashcard_cards").delete().eq("deck_id", existing.id);
      await (db as any).from("flashcard_decks").delete().eq("id", existing.id);
    }

    const sessionLabel =
      session != null && session > 0 ? ` · Session ${session}` : "";
    const title = `Week ${week}${sessionLabel}: ${(weekMeta.topic || "Flashcards").toString()}`;

    // Copy this week's deck from a class that already generated it.
    //
    // A deck is nothing without its cards, so they are copied in afterCopy —
    // and if that fails the deck row is removed rather than left behind. An
    // empty deck would satisfy the "already exists" checks above and this week
    // would never be generated again, leaving the class with no recall practice
    // and no way to notice.
    const reuse = await reuseWeekContent({
      db: db as never,
      table: "flashcard_decks",
      releaseId: (plan as any).curriculum_release_id ?? null,
      week,
      session: session ?? 1,
      targetPlanId: id,
      classId: (plan as any).class_id ?? null,
      scope: {
        schoolId: (plan as any).school_id ?? null,
        termId: (plan as any).term_id ?? null,
        courseId: (plan as any).course_id ?? null,
        createdBy: deckOwner,
        lessonId: lesson?.id ?? null,
        offeringId: (plan as any).academic_offering_id ?? null,
        periodId: (plan as any).offering_period_id ?? null,
      },
      overrides: { title, is_public: isPublic },
      afterCopy: async (copy, sourceId) => {
        const { data: sourceCards, error: readError } = await (db as any)
          .from("flashcard_cards")
          .select("front,back,tags,difficulty_level,template,position")
          .eq("deck_id", sourceId)
          .order("position", { ascending: true });
        if (readError) throw new Error(readError.message);
        if (!sourceCards?.length) throw new Error("source deck has no cards");

        const { error: writeError } = await (db as any)
          .from("flashcard_cards")
          .insert(
            sourceCards.map((card: Record<string, unknown>) => ({
              ...card,
              deck_id: copy.id,
            })),
          );
        if (writeError) throw new Error(writeError.message);
      },
    });

    if (reuse.copied) {
      results.push({ id: reuse.id, title });
      generated += 1;
      continue;
    }

    const { data: deck, error: deckError } = await (db as any)
      .from("flashcard_decks")
      .insert({
        title,
        lesson_id: lesson?.id ?? null,
        course_id: (plan as any).course_id ?? null,
        class_id: (plan as any).class_id ?? null,
        lesson_plan_id: id,
        curriculum_week_number: week,
        session_number: session ?? 1,
        is_public: isPublic,
        created_by: deckOwner,
        school_id: (plan as any).school_id ?? null,
        term_id: (plan as any).term_id ?? null,
        academic_offering_id: (plan as any).academic_offering_id ?? null,
        offering_period_id: (plan as any).offering_period_id ?? null,
        curriculum_release_id: (plan as any).curriculum_release_id ?? null,
      })
      .select("id,title")
      .single();
    if (deckError || !deck?.id) {
      lastError = deckError?.message || "Deck creation failed";
      skipped += 1;
      continue;
    }

    const contextText = Array.isArray(lesson?.content_layout)
      ? lesson.content_layout
          .map((b: any) => b?.content || b?.title || "")
          .filter(Boolean)
          .join("\n")
      : "";
    const removeEmptyDeck = async () => {
      await (db as any).from("flashcard_cards").delete().eq("deck_id", deck.id);
      await (db as any).from("flashcard_decks").delete().eq("id", deck.id);
    };
    let parsed: { cards?: AiGeneratedCard[] } = {};
    try {
      const aiResult = await generateAIContent({
        type: "flashcard",
        topic: String(weekMeta.topic || "This week"),
        courseName: (plan as any).courses?.title ?? undefined,
        questionCount: 15,
        sourceMaterial: contextText,
      });
      parsed = (aiResult.data ?? {}) as { cards?: AiGeneratedCard[] };
    } catch (error) {
      lastError =
        error instanceof Error ? error.message : "Flashcard generation failed";
      await removeEmptyDeck();
      skipped += 1;
      continue;
    }
    const cards = Array.isArray(parsed.cards) ? parsed.cards : [];
    const cardsToInsert = cards
      .map((card, index) => ({
        deck_id: deck.id,
        front: card.front?.trim() || "",
        back: card.back?.trim() || "",
        tags: Array.isArray(card.tags) ? card.tags : [],
        difficulty_level: card.difficulty || "medium",
        template: "classic",
        position: index + 1,
      }))
      .filter((card) => card.front && card.back);
    if (!cardsToInsert.length) {
      lastError = "No valid flashcards generated";
      await removeEmptyDeck();
      skipped += 1;
      continue;
    }

    const { data: inserted, error: insertError } = await (db as any)
      .from("flashcard_cards")
      .insert(cardsToInsert)
      .select("id");
    if (insertError) {
      lastError = insertError.message;
      await removeEmptyDeck();
      skipped += 1;
      continue;
    }

    results.push({ id: deck.id, title: deck.title });
    generated += inserted?.length ?? cardsToInsert.length;
  }

  if (generated === 0 && results.length === 0) {
    return NextResponse.json(
      { error: lastError || "Flashcard generation failed" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    data: results.length === 1 ? results[0] : results,
    generated,
    skipped,
    ...(generated === 0 ? { already_exists: true } : {}),
  });
}
