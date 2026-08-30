import { getTeacherSchoolIds } from '@/lib/auth-utils';
import {
  resolveStudentProgramScope,
  type StudentProgramScope,
} from '@/lib/assignments/visibility';

export type FlashcardCaller = {
  id: string;
  role: string;
  school_id: string | null;
  class_id?: string | null;
};

export type FlashcardDeckScope = {
  id: string;
  created_by: string | null;
  school_id: string | null;
  class_id?: string | null;
  course_id: string | null;
  /** false + lesson_plan_id = held for teacher approval; null/true = student-visible. */
  is_public?: boolean | null;
  lesson_plan_id?: string | null;
  program_id?: string | null;
  courses?: { program_id?: string | null } | null;
  lesson_plans?: { class_id?: string | null } | null;
};

export async function getFlashcardCaller(db: any, userId: string): Promise<FlashcardCaller | null> {
  const { data, error } = await db
    .from('portal_users')
    .select('id, role, school_id, class_id')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? data as FlashcardCaller : null;
}

export function flashcardDeckVisibleToStudent(
  caller: FlashcardCaller,
  deck: FlashcardDeckScope,
  scope: StudentProgramScope,
): boolean {
  // Plan-generated content stays private until the teacher shares it.
  if (deck.is_public === false && deck.lesson_plan_id) return false;
  if (caller.school_id && deck.school_id && deck.school_id !== caller.school_id) return false;
  if (!caller.school_id && deck.school_id) return false;

  // New class packages write class_id directly. The joined plan recovers the
  // same boundary for older decks created before class_id was consistently set.
  const deckClassId = deck.class_id ?? deck.lesson_plans?.class_id ?? null;
  if (deckClassId && deckClassId !== caller.class_id) return false;

  const programId = deck.program_id ?? deck.courses?.program_id ?? null;
  if (programId) return scope.programIds.has(programId);
  if (deck.course_id) return scope.courseIds.has(deck.course_id);
  if (deckClassId) return deckClassId === caller.class_id;
  return !!deck.school_id && !!caller.school_id && deck.school_id === caller.school_id;
}

/** Resolve shared visibility context once, then apply it to every deck. */
export async function filterReadableFlashcardDecks(
  db: any,
  caller: FlashcardCaller,
  decks: readonly FlashcardDeckScope[],
): Promise<FlashcardDeckScope[]> {
  if (caller.role === 'admin') return [...decks];
  if (caller.role === 'teacher') {
    const scopedIds = await getTeacherSchoolIds(caller.id, caller.school_id);
    return decks.filter(
      (deck) =>
        deck.created_by === caller.id ||
        (!!deck.school_id && scopedIds.includes(deck.school_id)),
    );
  }
  if (caller.role === 'school') {
    return decks.filter(
      (deck) =>
        !!caller.school_id &&
        !!deck.school_id &&
        deck.school_id === caller.school_id,
    );
  }

  if (caller.role === 'student') {
    const scope = await resolveStudentProgramScope(db, caller.id, caller.class_id ?? null);
    return decks.filter((deck) => flashcardDeckVisibleToStudent(caller, deck, scope));
  }

  return [];
}

export async function canReadFlashcardDeck(db: any, caller: FlashcardCaller, deck: FlashcardDeckScope): Promise<boolean> {
  return (await filterReadableFlashcardDecks(db, caller, [deck])).length === 1;
}

export async function canManageFlashcardDeck(db: any, caller: FlashcardCaller, deck: FlashcardDeckScope): Promise<boolean> {
  if (caller.role === 'admin') return true;
  if (caller.role === 'teacher') {
    if (deck.created_by === caller.id) return true;
    if (!deck.school_id) return false;
    const scopedIds = await getTeacherSchoolIds(caller.id, caller.school_id);
    return scopedIds.includes(deck.school_id);
  }
  if (caller.role === 'school') {
    return !!caller.school_id && !!deck.school_id && deck.school_id === caller.school_id;
  }
  return false;
}

export async function loadFlashcardDeckForRead(db: any, caller: FlashcardCaller, deckId: string) {
  const { data: deck, error } = await db
    .from('flashcard_decks')
    .select('*, courses(program_id), lesson_plans(class_id)')
    .eq('id', deckId)
    .maybeSingle();
  if (error || !deck) return { deck: null, error };
  const allowed = await canReadFlashcardDeck(db, caller, deck as FlashcardDeckScope);
  return { deck: allowed ? deck : null, error: allowed ? null : { message: 'Forbidden' } };
}

export async function loadFlashcardDeckForManage(db: any, caller: FlashcardCaller, deckId: string) {
  const { data: deck, error } = await db
    .from('flashcard_decks')
    .select('*, courses(program_id)')
    .eq('id', deckId)
    .maybeSingle();
  if (error || !deck) return { deck: null, error };
  const allowed = await canManageFlashcardDeck(db, caller, deck as FlashcardDeckScope);
  return { deck: allowed ? deck : null, error: allowed ? null : { message: 'Forbidden' } };
}
