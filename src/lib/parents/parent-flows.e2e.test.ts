import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/portal/ensure-structure', () => ({
  preparePortalStructure: vi.fn(async (_admin: unknown, input: { schoolId?: string | null; schoolName?: string | null; role: string }) => ({
    role: input.role,
    schoolId: input.schoolId ?? null,
    schoolName: input.schoolName ?? null,
    classId: null,
    className: null,
    isActive: !!input.schoolId,
    error: input.schoolId ? null : 'school required',
    authMetadata: { role: input.role, school_id: input.schoolId },
  })),
}));

vi.mock('@/lib/credentials/archive-registration-result', () => ({
  archivePortalCredential: vi.fn(async () => undefined),
}));

vi.mock('@/lib/audit/log', () => ({
  logAudit: vi.fn(async () => undefined),
}));

vi.mock('@/lib/consent/lead-child-links', () => ({
  removeStudentFromParentLeadLinks: vi.fn(async () => undefined),
}));

vi.mock('@/lib/auth/list-all-users', () => ({
  findAuthUserIdByEmail: vi.fn(async () => null),
}));

vi.mock('@/lib/crm/auto-promote-parent', () => ({
  autoPromoteParentPipeline: vi.fn(async () => undefined),
}));

import {
  assertSingleParentLink,
  getParentLinkScope,
  getParentsForStudentPortalId,
  healParentEmailLinks,
  isParentLinkConflict,
  ParentLinkConflictError,
  reconcileStudentParentEmail,
  syncExplicitParentStudentLink,
  unlinkExplicitParentStudentLink,
} from './links';
import { ensureParentPortalAndLink, findOrCreateParentPortal } from './provision';
import { provisionParentAndLinkChild } from '@/lib/parent-claim/provision';

type Row = Record<string, any>;

function createMemoryAdmin(seed?: {
  portal_users?: Row[];
  students?: Row[];
  parent_student_links?: Row[];
}) {
  const db: Record<string, Row[]> = {
    portal_users: [...(seed?.portal_users ?? [])],
    students: [...(seed?.students ?? [])],
    parent_student_links: [...(seed?.parent_student_links ?? [])],
  };
  const authUsers: Row[] = [];

  const match = (row: Row, filters: Array<{ col: string; op: string; val: any }>) =>
    filters.every((f) => {
      const v = row[f.col];
      if (f.op === 'eq') return v === f.val;
      if (f.op === 'neq') return v !== f.val;
      if (f.op === 'in') return Array.isArray(f.val) && f.val.includes(v);
      if (f.op === 'ilike') return String(v ?? '').toLowerCase() === String(f.val ?? '').toLowerCase();
      return true;
    });

  function from(table: string) {
    if (!db[table]) db[table] = [];
    const state: {
      filters: Array<{ col: string; op: string; val: any }>;
      payload: any;
      action: 'select' | 'update' | 'upsert' | 'delete' | 'insert';
      limitN?: number;
    } = { filters: [], payload: null, action: 'select' };

    const api: any = {
      select: (_cols?: string) => {
        state.action = 'select';
        return api;
      },
      insert: (payload: any) => {
        state.action = 'insert';
        state.payload = payload;
        return api;
      },
      update: (payload: any) => {
        state.action = 'update';
        state.payload = payload;
        return api;
      },
      upsert: (payload: any) => {
        state.action = 'upsert';
        state.payload = Array.isArray(payload) ? payload[0] : payload;
        return api;
      },
      delete: () => {
        state.action = 'delete';
        return api;
      },
      eq: (col: string, val: any) => {
        state.filters.push({ col, op: 'eq', val });
        return api;
      },
      neq: (col: string, val: any) => {
        state.filters.push({ col, op: 'neq', val });
        return api;
      },
      in: (col: string, val: any[]) => {
        state.filters.push({ col, op: 'in', val });
        return api;
      },
      ilike: (col: string, val: any) => {
        state.filters.push({ col, op: 'ilike', val });
        return api;
      },
      limit: (n: number) => {
        state.limitN = n;
        return api;
      },
      maybeSingle: async () => {
        const rows = db[table].filter((r) => match(r, state.filters));
        if (state.action === 'update') {
          for (const r of rows) Object.assign(r, state.payload);
          return { data: rows[0] ?? null, error: null };
        }
        if (state.action === 'upsert') {
          const existing = db[table].find((r) => r.id === state.payload.id);
          if (existing) Object.assign(existing, state.payload);
          else db[table].push({ ...state.payload });
          return { data: state.payload, error: null };
        }
        return { data: rows[0] ?? null, error: null };
      },
      single: async () => {
        const res = await api.maybeSingle();
        if (!res.data) return { data: null, error: { message: 'not found' } };
        return res;
      },
      then: undefined as any,
    };

    // Make thenable for `await query`
    api.then = (resolve: any, reject: any) => {
      return (async () => {
        try {
          let rows = db[table].filter((r) => match(r, state.filters));
          if (state.action === 'select') {
            if (state.limitN) rows = rows.slice(0, state.limitN);
            return resolve({ data: rows, error: null });
          }
          if (state.action === 'update') {
            for (const r of rows) Object.assign(r, state.payload);
            return resolve({ data: rows, error: null });
          }
          if (state.action === 'delete') {
            db[table] = db[table].filter((r) => !match(r, state.filters));
            return resolve({ data: null, error: null });
          }
          if (state.action === 'upsert') {
            const existingByPair = table === 'parent_student_links'
              ? db[table].find((r) => r.parent_id === state.payload.parent_id && r.student_id === state.payload.student_id)
              : db[table].find((r) => r.id === state.payload.id || (state.payload.user_id && r.user_id === state.payload.user_id));
            // Enforce one parent per student
            if (table === 'parent_student_links') {
              const other = db[table].find(
                (r) => r.student_id === state.payload.student_id && r.parent_id !== state.payload.parent_id,
              );
              if (other) {
                return resolve({ data: null, error: { code: '23505', message: 'duplicate' } });
              }
            }
            if (existingByPair) Object.assign(existingByPair, state.payload);
            else db[table].push({ id: crypto.randomUUID(), ...state.payload });
            return resolve({ data: state.payload, error: null });
          }
          if (state.action === 'insert') {
            const row = { id: crypto.randomUUID(), ...state.payload };
            db[table].push(row);
            return resolve({ data: row, error: null });
          }
          return resolve({ data: null, error: null });
        } catch (e) {
          return reject(e);
        }
      })();
    };

    return api;
  }

  return {
    from,
    auth: {
      admin: {
        createUser: async ({ email, password, user_metadata }: any) => {
          const existing = authUsers.find((u) => u.email === email);
          if (existing) return { data: null, error: { message: 'User already registered' } };
          const user = { id: crypto.randomUUID(), email, password, user_metadata };
          authUsers.push(user);
          return { data: { user }, error: null };
        },
        updateUserById: async (id: string, patch: any) => {
          const u = authUsers.find((x) => x.id === id);
          if (u) Object.assign(u, patch, { user_metadata: { ...u.user_metadata, ...patch.user_metadata } });
          // Also allow updating portal-only parents that were seeded without auth row
          if (!u) authUsers.push({ id, email: patch.email, password: patch.password, user_metadata: patch.user_metadata });
          return { data: { user: { id } }, error: null };
        },
        deleteUser: async () => ({ data: null, error: null }),
        listUsers: async () => ({ data: { users: authUsers }, error: null }),
      },
    },
    _db: db,
    _authUsers: authUsers,
  } as any;
}

describe('parent link invariant', () => {
  it('allows first link and same-parent idempotent link', () => {
    expect(() => assertSingleParentLink('s1', 'p1', null)).not.toThrow();
    expect(() => assertSingleParentLink('s1', 'p1', 'p1')).not.toThrow();
  });

  it('blocks second parent', () => {
    expect(() => assertSingleParentLink('s1', 'p2', 'p1')).toThrow(ParentLinkConflictError);
  });
});

describe('end-to-end parent flows (in-memory)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registration-style: provision parent and link student by students.id', async () => {
    const admin = createMemoryAdmin({
      students: [{ id: 'stu-row-1', user_id: 'stu-portal-1', full_name: 'Chidi', parent_email: null }],
    });

    const result = await ensureParentPortalAndLink(admin, {
      email: 'mom@example.com',
      fullName: 'Ada Mom',
      phone: '+2348011111111',
      schoolId: 'school-1',
      schoolName: 'Demo School',
      studentId: 'stu-row-1',
      passwordPolicy: 'set',
      archiveCredentials: false,
      source: 'test.registration',
    });

    expect(result.ok).toBe(true);
    expect(result.linked).toBe(true);
    expect(result.parentId).toBeTruthy();
    expect(admin._db.parent_student_links).toHaveLength(1);
    expect(admin._db.parent_student_links[0].student_id).toBe('stu-row-1');
    expect(admin._db.students[0].parent_email).toBe('mom@example.com');
  });

  it('claim-style: provisionParentAndLinkChild links portal student id via resolve', async () => {
    const admin = createMemoryAdmin({
      portal_users: [
        { id: 'stu-portal-1', role: 'student', full_name: 'Chidi', school_id: 'school-1', school_name: 'Demo', email: 'chidi@rillcod.com' },
      ],
      students: [{ id: 'stu-row-1', user_id: 'stu-portal-1', full_name: 'Chidi', parent_email: null }],
    });

    const result = await provisionParentAndLinkChild(admin, {
      email: 'dad@example.com',
      phone: '+2348022222222',
      fullName: 'Bello Dad',
      relationship: 'Father',
      studentId: 'stu-portal-1',
    });

    expect(result.ok).toBe(true);
    expect(result.parentId).toBeTruthy();
    expect(admin._db.parent_student_links[0]).toMatchObject({
      parent_id: result.parentId,
      student_id: 'stu-row-1',
    });
  });

  it('claim conflict: second parent cannot steal an already-linked child', async () => {
    const admin = createMemoryAdmin({
      portal_users: [
        { id: 'parent-a', role: 'parent', email: 'a@x.com', full_name: 'A', school_id: 'school-1' },
        { id: 'stu-portal-1', role: 'student', full_name: 'Chidi', school_id: 'school-1', school_name: 'Demo', email: 'c@rillcod.com' },
      ],
      students: [{ id: 'stu-row-1', user_id: 'stu-portal-1', full_name: 'Chidi', parent_email: 'a@x.com' }],
      parent_student_links: [{ parent_id: 'parent-a', student_id: 'stu-row-1' }],
    });

    const result = await provisionParentAndLinkChild(admin, {
      email: 'b@x.com',
      phone: '+2348033333333',
      fullName: 'Other Parent',
      studentId: 'stu-portal-1',
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(isParentLinkConflict({ code: 'STUDENT_ALREADY_LINKED' })).toBe(true);
  });

  it('summer/consent style: getParentLinkScope skips email matches owned by another parent', async () => {
    const admin = createMemoryAdmin({
      portal_users: [
        { id: 'parent-me', role: 'parent', email: 'shared@x.com', full_name: 'Me' },
        { id: 'parent-other', role: 'parent', email: 'other@x.com', full_name: 'Other' },
      ],
      students: [
        { id: 'mine', user_id: 'u1', parent_email: 'shared@x.com' },
        { id: 'stolen-looking', user_id: 'u2', parent_email: 'shared@x.com' },
      ],
      parent_student_links: [
        { parent_id: 'parent-other', student_id: 'stolen-looking' },
      ],
    });

    const scope = await getParentLinkScope(admin, { id: 'parent-me', email: 'shared@x.com' });
    expect(scope.studentIds).toContain('mine');
    expect(scope.studentIds).not.toContain('stolen-looking');
  });

  it('healParentEmailLinks only claims unowned email matches', async () => {
    const admin = createMemoryAdmin({
      portal_users: [
        { id: 'parent-me', role: 'parent', email: 'heal@x.com', full_name: 'Me', phone: null },
        { id: 'parent-other', role: 'parent', email: 'o@x.com', full_name: 'O', phone: null },
      ],
      students: [
        { id: 'free', user_id: 'u1', parent_email: 'heal@x.com' },
        { id: 'taken', user_id: 'u2', parent_email: 'heal@x.com' },
      ],
      parent_student_links: [{ parent_id: 'parent-other', student_id: 'taken' }],
    });

    const linked = await healParentEmailLinks(admin, { id: 'parent-me', email: 'heal@x.com' });
    expect(linked).toBe(1);
    expect(admin._db.parent_student_links.some((l) => l.parent_id === 'parent-me' && l.student_id === 'free')).toBe(true);
    expect(admin._db.parent_student_links.some((l) => l.parent_id === 'parent-me' && l.student_id === 'taken')).toBe(false);
  });

  it('reconcileStudentParentEmail moves junction when staff changes parent_email', async () => {
    const admin = createMemoryAdmin({
      portal_users: [
        { id: 'old-p', role: 'parent', email: 'old@x.com', full_name: 'Old', phone: null },
        { id: 'new-p', role: 'parent', email: 'new@x.com', full_name: 'New', phone: null },
      ],
      students: [{ id: 'stu', user_id: 'u1', parent_email: 'old@x.com' }],
      parent_student_links: [{ parent_id: 'old-p', student_id: 'stu' }],
    });

    await reconcileStudentParentEmail(admin, 'stu', 'new@x.com', { source: 'test' });
    expect(admin._db.parent_student_links).toHaveLength(1);
    expect(admin._db.parent_student_links[0].parent_id).toBe('new-p');
  });

  it('getParentsForStudentPortalId resolves portal id → students.id', async () => {
    const admin = createMemoryAdmin({
      portal_users: [
        { id: 'parent-1', role: 'parent', email: 'p@x.com', full_name: 'Parent', phone: '080' },
        { id: 'stu-portal', role: 'student', email: 's@rillcod.com', full_name: 'Kid' },
      ],
      students: [{ id: 'stu-row', user_id: 'stu-portal', parent_email: 'p@x.com' }],
      parent_student_links: [{ parent_id: 'parent-1', student_id: 'stu-row' }],
    });

    // Wrong ID space historically queried student_id = portal id and found nothing
    const parents = await getParentsForStudentPortalId(admin, 'stu-portal');
    expect(parents).toHaveLength(1);
    expect(parents[0].email).toBe('p@x.com');
  });

  it('findOrCreateParentPortal rejects non-parent role collision', async () => {
    const admin = createMemoryAdmin({
      portal_users: [{ id: 't1', role: 'teacher', email: 't@x.com', full_name: 'T', school_id: 's1' }],
    });
    const result = await findOrCreateParentPortal(admin, {
      email: 't@x.com',
      fullName: 'Nope',
      schoolId: 's1',
      archiveCredentials: false,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
  });

  it('unlink clears denorm mirror fields', async () => {
    const admin = createMemoryAdmin({
      portal_users: [{ id: 'p1', role: 'parent', email: 'p@x.com', full_name: 'P', phone: '1' }],
      students: [{ id: 's1', user_id: 'u1', parent_email: 'p@x.com', parent_name: 'P', parent_phone: '1' }],
      parent_student_links: [{ parent_id: 'p1', student_id: 's1' }],
    });
    await unlinkExplicitParentStudentLink(admin, 'p1', 's1');
    expect(admin._db.parent_student_links).toHaveLength(0);
    expect(admin._db.students[0].parent_email).toBeNull();
  });

  it('syncExplicitParentStudentLink is idempotent for same parent', async () => {
    const admin = createMemoryAdmin({
      portal_users: [{ id: 'p1', role: 'parent', email: 'p@x.com', full_name: 'P', phone: null }],
      students: [{ id: 's1', user_id: 'u1', parent_email: null }],
    });
    await syncExplicitParentStudentLink(admin, 'p1', 's1', { source: 'test' });
    await syncExplicitParentStudentLink(admin, 'p1', 's1', { source: 'test' });
    expect(admin._db.parent_student_links).toHaveLength(1);
  });
});

describe('entry-point wiring smoke', () => {
  it('shared modules export the canonical APIs used by claim/summer/consent/registration', async () => {
    const links = await import('./links');
    const provision = await import('./provision');
    const ensure = await import('./ensure-parent-portal-account');
    const claim = await import('@/lib/parent-claim/provision');
    const finalize = await import('@/lib/students/finalize-student-onboard');

    expect(typeof links.syncExplicitParentStudentLink).toBe('function');
    expect(typeof links.healParentEmailLinks).toBe('function');
    expect(typeof links.reconcileStudentParentEmail).toBe('function');
    expect(typeof links.getParentsForStudentPortalId).toBe('function');
    expect(typeof provision.findOrCreateParentPortal).toBe('function');
    expect(typeof provision.ensureParentPortalAndLink).toBe('function');
    expect(typeof ensure.ensureParentPortalForStudent).toBe('function');
    expect(typeof claim.provisionParentAndLinkChild).toBe('function');
    expect(typeof finalize.finalizeStudentOnboard).toBe('function');
  });
});
