import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/portal/ensure-structure', () => ({
  preparePortalStructure: vi.fn(async (_admin: unknown, input: { schoolId?: string | null; schoolName?: string | null; role: string; classId?: string | null }) => ({
    role: input.role,
    schoolId: input.schoolId ?? null,
    schoolName: input.schoolName ?? null,
    classId: input.classId ?? 'class-1',
    className: 'Alpha',
    isActive: !!input.schoolId,
    error: input.schoolId ? null : 'school required',
    authMetadata: { role: input.role, school_id: input.schoolId, class_id: input.classId },
  })),
}));

vi.mock('@/lib/credentials/archive-registration-result', () => ({
  archivePortalCredential: vi.fn(async () => undefined),
}));

vi.mock('@/lib/auth/list-all-users', () => ({
  findAuthUserIdByEmail: vi.fn(async () => null),
}));

vi.mock('@/lib/students/clean-name', () => ({
  cleanStudentName: (n: string) => n.trim(),
}));

import { findOrCreateStudentPortal } from './provision';

type Row = Record<string, any>;

function createMemoryAdmin(seed?: { portal_users?: Row[] }) {
  const db: Record<string, Row[]> = {
    portal_users: [...(seed?.portal_users ?? [])],
  };
  const authUsers: Row[] = [];

  const match = (row: Row, filters: Array<{ col: string; op: string; val: any }>) =>
    filters.every((f) => {
      const v = row[f.col];
      if (f.op === 'eq') return v === f.val;
      if (f.op === 'neq') return v !== f.val;
      return true;
    });

  function from(table: string) {
    if (!db[table]) db[table] = [];
    const state: { filters: Array<{ col: string; op: string; val: any }>; payload: any; action: string } = {
      filters: [],
      payload: null,
      action: 'select',
    };
    const api: any = {
      select: () => api,
      update: (payload: any) => {
        state.action = 'update';
        state.payload = payload;
        return api;
      },
      upsert: (payload: any) => {
        state.action = 'upsert';
        state.payload = payload;
        return api;
      },
      eq: (col: string, val: any) => {
        state.filters.push({ col, op: 'eq', val });
        return api;
      },
      maybeSingle: async () => {
        const rows = db[table].filter((r) => match(r, state.filters));
        if (state.action === 'update') {
          for (const r of rows) Object.assign(r, state.payload);
          return { data: rows[0] ?? null, error: null };
        }
        return { data: rows[0] ?? null, error: null };
      },
      then: (resolve: any, reject: any) =>
        (async () => {
          try {
            const rows = db[table].filter((r) => match(r, state.filters));
            if (state.action === 'upsert') {
              const existing = db[table].find((r) => r.id === state.payload.id);
              if (existing) Object.assign(existing, state.payload);
              else db[table].push({ ...state.payload });
              return resolve({ data: state.payload, error: null });
            }
            if (state.action === 'update') {
              for (const r of rows) Object.assign(r, state.payload);
              return resolve({ data: rows, error: null });
            }
            return resolve({ data: rows, error: null });
          } catch (e) {
            return reject(e);
          }
        })(),
    };
    return api;
  }

  return {
    from,
    auth: {
      admin: {
        createUser: async ({ email, password }: any) => {
          if (authUsers.some((u) => u.email === email)) {
            return { data: null, error: { message: 'User already registered' } };
          }
          const user = { id: crypto.randomUUID(), email, password };
          authUsers.push(user);
          return { data: { user }, error: null };
        },
        updateUserById: async () => ({ data: { user: {} }, error: null }),
        deleteUser: async () => ({ data: null, error: null }),
      },
    },
    _db: db,
  } as any;
}

describe('findOrCreateStudentPortal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a new student portal', async () => {
    const admin = createMemoryAdmin();
    const result = await findOrCreateStudentPortal(admin, {
      email: 'mike1@rillcod.com',
      fullName: 'Mike Student',
      schoolId: 'school-1',
      schoolName: 'Demo',
      classId: 'class-1',
      sectionClass: 'Alpha',
      grade: 'JSS 1',
      passwordPolicy: 'set',
      archiveCredentials: false,
    });
    expect(result.ok).toBe(true);
    expect(result.created).toBe(true);
    expect(result.studentId).toBeTruthy();
    expect(result.password).toBeTruthy();
    expect(admin._db.portal_users[0].role).toBe('student');
  });

  it('reuses existing student without resetting password when policy is keep', async () => {
    const admin = createMemoryAdmin({
      portal_users: [{
        id: 'stu-1',
        role: 'student',
        email: 'mike1@rillcod.com',
        full_name: 'Mike',
        school_id: 'school-1',
        phone: null,
      }],
    });
    const result = await findOrCreateStudentPortal(admin, {
      email: 'mike1@rillcod.com',
      fullName: 'Mike Student',
      schoolId: 'school-1',
      existingUserId: 'stu-1',
      passwordPolicy: 'keep',
      archiveCredentials: false,
    });
    expect(result.ok).toBe(true);
    expect(result.created).toBe(false);
    expect(result.password).toBeNull();
    expect(result.studentId).toBe('stu-1');
  });

  it('rejects email owned by a non-student role', async () => {
    const admin = createMemoryAdmin({
      portal_users: [{ id: 't1', role: 'teacher', email: 't@x.com', full_name: 'T', school_id: 's1' }],
    });
    const result = await findOrCreateStudentPortal(admin, {
      email: 't@x.com',
      fullName: 'Nope',
      schoolId: 's1',
      archiveCredentials: false,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
  });
});

describe('centralization smoke', () => {
  it('exports the shared kernels for student/auth/consent/school scope', async () => {
    const student = await import('./provision');
    const authList = await import('@/lib/auth/list-all-users');
    const school = await import('@/lib/auth/school-scope');
    const consent = await import('@/lib/consent/attach-parent');
    const archive = await import('@/lib/credentials/archive-registration-result');
    const wipe = await import('@/lib/students/permanent-wipe');

    expect(typeof student.findOrCreateStudentPortal).toBe('function');
    expect(typeof authList.findAuthUserIdByEmail).toBe('function');
    expect(typeof school.canAccessSchool).toBe('function');
    expect(typeof school.getCallerSchoolIds).toBe('function');
    expect(typeof consent.attachConsentParentToLead).toBe('function');
    expect(typeof archive.archivePortalCredential).toBe('function');
    expect(typeof wipe.wipePortalUserCascade).toBe('function');
  });
});
