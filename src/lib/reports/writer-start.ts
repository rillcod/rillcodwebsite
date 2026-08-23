/**
 * Writer localStorage seat (SYS-014).
 *
 * Class → programme → course already lives in the builder via
 * `resolveLinkedCourseForClass`. This file only stops persist from wiping that
 * seat on remount before restore has applied.
 */
export const WRITER_SESSION_STORAGE_PREFIX = 'rillcod_report_session_';

export type WriterSessionMeta = {
  _step?: string;
  _sessionDone?: boolean;
  _selectedStudentId?: string | null;
  _currentStudentIdx?: number;
  _courseConfirmationKey?: string;
  _periodUnlocked?: boolean;
  _programId?: string;
};

export type WriterSessionSnapshot = WriterSessionMeta & Record<string, unknown>;

export function writerSessionStorageKey(profileId: string): string {
  return `${WRITER_SESSION_STORAGE_PREFIX}${profileId}`;
}

/** Persist only after restore has applied for this same teacher. */
export function canPersistWriterSession(
  hydratedProfileId: string | null | undefined,
  profileId: string | null | undefined,
): boolean {
  return Boolean(profileId) && hydratedProfileId === profileId;
}

export function parseWriterSession(raw: string | null | undefined): {
  ok: boolean;
  snapshot: WriterSessionSnapshot | null;
  config: Record<string, unknown>;
  warning?: string;
} {
  if (!raw) return { ok: true, snapshot: null, config: {} };
  try {
    const parsed = JSON.parse(raw) as WriterSessionSnapshot;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, snapshot: null, config: {}, warning: 'unreadable' };
    }
    const {
      _step,
      _sessionDone,
      _selectedStudentId,
      _currentStudentIdx,
      _courseConfirmationKey,
      _periodUnlocked,
      _programId,
      ...config
    } = parsed;
    return { ok: true, snapshot: parsed, config };
  } catch {
    return {
      ok: false,
      snapshot: null,
      config: {},
      warning: 'Your previous position in the report writer could not be restored. Server-saved report drafts are unchanged.',
    };
  }
}

export function serializeWriterSession(snapshot: WriterSessionSnapshot): string {
  return JSON.stringify(snapshot);
}

/** Course options stay empty until a programme is chosen. */
export function coursesForProgramme<T extends { program_id?: string | null }>(
  courses: T[],
  programId: string | null | undefined,
): T[] {
  if (!programId) return [];
  return courses.filter((course) => course.program_id === programId);
}
