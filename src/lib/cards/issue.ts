import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessSchool } from '@/lib/cards/rbac';

type Db = ReturnType<typeof createAdminClient>;
type StaffCtx = { id: string; role: string; school_ids: string[] };

export type IssueResult =
  | { ok: true; card: any; reused?: false }
  | { ok: false; status: number; error: string; existingId?: string };

async function generateUniqueCode(db: Db, column: 'card_number' | 'verification_code', prefix: string) {
  for (let i = 0; i < 8; i++) {
    const code = `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { data } = await (db as any).from('identity_cards').select('id').eq(column, code).maybeSingle();
    if (!data?.id) return code;
  }
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 12).toUpperCase()}`;
}

// Everyone on a card belongs to a real school. Resolve a student's/teacher's school from
// their portal profile → class → school_name (in order of confidence). The Online School is
// NOT a fallback — it only applies to genuinely online students, who already carry its id.
export async function resolveSchoolIdForUser(db: Db, userId: string): Promise<string | null> {
  const { data: u } = await (db as any)
    .from('portal_users').select('school_id, school_name, class_id').eq('id', userId).maybeSingle();
  if (u?.school_id) return u.school_id as string;
  if (u?.class_id) {
    const { data: cls } = await (db as any).from('classes').select('school_id').eq('id', u.class_id).maybeSingle();
    if (cls?.school_id) return cls.school_id as string;
  }
  if (u?.school_name) {
    const { data: sch } = await (db as any).from('schools').select('id').ilike('name', u.school_name).maybeSingle();
    if (sch?.id) return sch.id as string;
  }
  return null;
}

// A parent inherits the school of their linked child (parent_student_links → students → the
// child's portal profile), falling back to the parent's own recorded school.
export async function resolveSchoolIdForParent(db: Db, parentId: string): Promise<string | null> {
  const { data: links } = await (db as any)
    .from('parent_student_links').select('student_id').eq('parent_id', parentId);
  for (const l of (links ?? [])) {
    const { data: st } = await (db as any)
      .from('students').select('user_id, school_name').eq('id', l.student_id).maybeSingle();
    if (st?.user_id) {
      const sid = await resolveSchoolIdForUser(db, st.user_id);
      if (sid) return sid;
    }
    if (st?.school_name) {
      const { data: sch } = await (db as any).from('schools').select('id').ilike('name', st.school_name).maybeSingle();
      if (sch?.id) return sch.id as string;
    }
  }
  return resolveSchoolIdForUser(db, parentId);
}

/**
 * Issue one identity card for a holder — the single source of truth used by both the
 * single-issue endpoint and the bulk "issue missing" endpoint. Resolves the holder's real
 * school, enforces scope, and skips holders who already have a live card.
 */
export async function createCardForHolder(
  db: Db,
  ctx: StaffCtx,
  input: {
    holder_type: 'student' | 'parent' | 'teacher';
    holder_id: string;
    school_id?: string | null;
    class_id?: string | null;
    template_type?: string;
    expires_at?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<IssueResult> {
  const { holder_type, holder_id, class_id = null, template_type = holder_type, expires_at = null, metadata = {} } = input;

  if (!['student', 'parent', 'teacher'].includes(holder_type)) {
    return { ok: false, status: 400, error: 'Invalid holder_type' };
  }
  if (holder_type === 'teacher' && ctx.role !== 'admin') {
    return { ok: false, status: 403, error: 'Teacher cards can only be issued by admin' };
  }

  let school_id: string | null = input.school_id ?? null;
  if (!school_id) {
    school_id = holder_type === 'parent'
      ? await resolveSchoolIdForParent(db, holder_id)
      : await resolveSchoolIdForUser(db, holder_id);
  }
  if (!school_id) {
    return { ok: false, status: 400, error: `No school is on record for this ${holder_type}. Assign them to a school first, then issue the card.` };
  }
  if (!canAccessSchool(ctx as any, school_id)) {
    return { ok: false, status: 403, error: 'Forbidden for this school scope' };
  }

  // Backfill the holder's own school_id only when it was un-denormalised (never overwrite,
  // never write the Online School as a guess).
  if (holder_type !== 'parent') {
    try { await (db as any).from('portal_users').update({ school_id }).eq('id', holder_id).is('school_id', null); } catch { /* non-fatal */ }
  }

  // Prevent duplicates — a live (non-revoked) card already exists.
  const { data: existing } = await (db as any)
    .from('identity_cards')
    .select('id, status')
    .eq('holder_type', holder_type)
    .eq('holder_id', holder_id)
    .not('status', 'eq', 'revoked')
    .maybeSingle();
  if (existing) return { ok: false, status: 409, error: 'A card has already been issued for this holder', existingId: existing.id };

  const card_number = await generateUniqueCode(db, 'card_number', 'CARD');
  const verification_code = await generateUniqueCode(db, 'verification_code', 'RC');
  const now = new Date().toISOString();

  const { data, error } = await (db as any)
    .from('identity_cards')
    .insert({
      holder_type, holder_id, school_id, class_id, card_number, verification_code, template_type,
      status: 'active', issued_at: now, expires_at, created_by: ctx.id, updated_by: ctx.id, metadata,
    })
    .select('*')
    .single();

  if (error) return { ok: false, status: 500, error: error.message };

  await (db as any).from('card_audit_logs').insert({
    card_id: data.id, actor_id: ctx.id, school_id, action: 'issue', entity: 'identity_card',
    details: { holder_type, holder_id },
  });

  return { ok: true, card: data };
}
