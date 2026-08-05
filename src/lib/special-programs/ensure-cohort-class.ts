/**
 * Ensure a special-programme offering has an active cohort class for teaching.
 */
import { selectAutomaticClassTeacher } from '@/lib/classes/teacher-allocation';
import { cleanClassName } from '@/lib/classes/naming';
import type { CohortClassSummary } from '@/lib/special-programs/teaching-readiness';

type AnySupabase = any;

async function teacherName(
  db: AnySupabase,
  teacherId: string | null | undefined,
): Promise<string | null> {
  if (!teacherId) return null;
  const { data } = await db
    .from('portal_users')
    .select('full_name')
    .eq('id', teacherId)
    .maybeSingle();
  return data?.full_name ? String(data.full_name) : null;
}

export function toCohortSummary(
  row: {
    id: string;
    name?: string | null;
    status?: string | null;
    teacher_id?: string | null;
  },
  teacherNameValue: string | null,
): CohortClassSummary {
  return {
    id: String(row.id),
    name: String(row.name || 'Cohort class'),
    status: String(row.status || 'active'),
    teacher_id: row.teacher_id ? String(row.teacher_id) : null,
    teacher_name: teacherNameValue,
  };
}

/** Active class on the offering, else any class on the offering (newest first). */
export async function loadOfferingClasses(
  db: AnySupabase,
  offeringId: string,
): Promise<CohortClassSummary[]> {
  const { data } = await db
    .from('classes')
    .select('id,name,status,teacher_id,created_at')
    .eq('academic_offering_id', offeringId)
    .order('created_at', { ascending: false });

  const rows = (data ?? []) as Array<{
    id: string;
    name?: string | null;
    status?: string | null;
    teacher_id?: string | null;
  }>;

  const out: CohortClassSummary[] = [];
  for (const row of rows) {
    out.push(toCohortSummary(row, await teacherName(db, row.teacher_id)));
  }
  return out;
}

export function pickPrimaryCohort(classes: CohortClassSummary[]): CohortClassSummary | null {
  return classes.find((c) => c.status === 'active') ?? classes[0] ?? null;
}

/**
 * Stamp school + programme on the linked offering so prepare-teaching never
 * hits a half-linked offering. Also re-attach special_program_page_id if needed.
 */
export async function syncOfferingLinks(
  db: AnySupabase,
  input: {
    pageId: string;
    offeringId: string | null;
    schoolId?: string | null;
    programmeId?: string | null;
  },
): Promise<string | null> {
  let offeringId = input.offeringId;
  if (!offeringId) {
    const { data: byPage } = await db
      .from('academic_offerings')
      .select('id')
      .eq('special_program_page_id', input.pageId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    offeringId = byPage?.id ? String(byPage.id) : null;
  }
  if (!offeringId) return null;

  const patch: Record<string, unknown> = {
    special_program_page_id: input.pageId,
    updated_at: new Date().toISOString(),
  };
  if (input.schoolId !== undefined) patch.school_id = input.schoolId || null;
  if (input.programmeId !== undefined) patch.programme_id = input.programmeId || null;

  // Unique on special_program_page_id — clear archived duplicates first.
  await db
    .from('academic_offerings')
    .update({ special_program_page_id: null, updated_at: new Date().toISOString() })
    .eq('special_program_page_id', input.pageId)
    .neq('id', offeringId);

  await db.from('academic_offerings').update(patch).eq('id', offeringId);

  const { data: page } = await db
    .from('special_program_pages')
    .select('academic_offering_id')
    .eq('id', input.pageId)
    .maybeSingle();
  if (page && page.academic_offering_id !== offeringId) {
    await db
      .from('special_program_pages')
      .update({ academic_offering_id: offeringId, updated_at: new Date().toISOString() })
      .eq('id', input.pageId);
  }

  return offeringId;
}

/**
 * Attach the class to this offering before the pathway RPC.
 * Preferred-offering lookup requires status=active; binding the class first
 * uses the existing-offering branch and works for draft pages too.
 */
async function bindClassToOffering(
  db: AnySupabase,
  input: {
    classId: string;
    offeringId: string;
    programmeId: string;
    actorId: string;
    teacherId?: string | null;
    activate?: boolean;
  },
): Promise<string | null> {
  const patch: Record<string, unknown> = {
    program_id: input.programmeId,
    academic_offering_id: input.offeringId,
    updated_at: new Date().toISOString(),
  };
  if (input.activate !== false) patch.status = 'active';
  if (input.teacherId) patch.teacher_id = input.teacherId;

  const { error: updateError } = await db.from('classes').update(patch).eq('id', input.classId);
  if (updateError) return updateError.message;

  const { error: pathwayError } = await db.rpc('ensure_class_academic_pathway', {
    p_class_id: input.classId,
    p_enrollment_type: 'special',
    p_preferred_offering_id: input.offeringId,
    p_actor_id: input.actorId,
  });
  return pathwayError?.message ?? null;
}

export async function ensureCohortClass(
  db: AnySupabase,
  input: {
    pageId: string;
    actorId: string;
    /** Prefer linking this existing class instead of creating. */
    linkClassId?: string | null;
  },
): Promise<{ cohort: CohortClassSummary | null; created: boolean; error?: string }> {
  const { data: page } = await db
    .from('special_program_pages')
    .select('id,title,program_id,academic_offering_id,starts_on,ends_on,is_published')
    .eq('id', input.pageId)
    .maybeSingle();
  if (!page) return { cohort: null, created: false, error: 'Page not found' };

  let offeringId = page.academic_offering_id ? String(page.academic_offering_id) : null;
  const { data: offering } = offeringId
    ? await db
        .from('academic_offerings')
        .select('id,school_id,programme_id,title,status')
        .eq('id', offeringId)
        .maybeSingle()
    : { data: null };

  if (!offering) {
    return {
      cohort: null,
      created: false,
      error: 'Save the page with a programme and school first so an offering exists.',
    };
  }

  const schoolId = offering.school_id ? String(offering.school_id) : null;
  const programmeId =
    (offering.programme_id as string | null) ||
    (page.program_id as string | null) ||
    null;

  if (!schoolId) {
    return { cohort: null, created: false, error: 'Link a school under Basics first.' };
  }
  if (!programmeId) {
    return { cohort: null, created: false, error: 'Link a programme under Basics first.' };
  }

  // Keep pathway RPC happy when the page is already live but offering stayed draft.
  if (page.is_published && offering.status !== 'active') {
    await db
      .from('academic_offerings')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', offeringId);
  }

  const existing = await loadOfferingClasses(db, offeringId!);
  const primary = pickPrimaryCohort(existing);
  if (primary?.status === 'active' && !input.linkClassId) {
    return { cohort: primary, created: false };
  }

  if (input.linkClassId) {
    const { data: klass } = await db
      .from('classes')
      .select('id,name,status,teacher_id,school_id')
      .eq('id', input.linkClassId)
      .maybeSingle();
    if (!klass) return { cohort: null, created: false, error: 'Class not found' };
    if (klass.school_id && String(klass.school_id) !== schoolId) {
      return { cohort: null, created: false, error: 'That class belongs to a different school.' };
    }

    const bindError = await bindClassToOffering(db, {
      classId: klass.id,
      offeringId: offeringId!,
      programmeId,
      actorId: input.actorId,
    });
    if (bindError) {
      return { cohort: null, created: false, error: bindError };
    }

    const name = await teacherName(db, klass.teacher_id);
    return {
      cohort: toCohortSummary({ ...klass, status: 'active' }, name),
      created: false,
    };
  }

  const teacher = await selectAutomaticClassTeacher(db, schoolId);
  if (!teacher?.id) {
    return {
      cohort: null,
      created: false,
      error: 'No teacher is assigned to this school yet. Assign a teacher, then create the cohort class.',
    };
  }

  const rawName = String(page.title || offering.title || 'Special programme cohort').trim();
  const name = cleanClassName(rawName) || 'Special programme cohort';

  const { data: nameClash } = await db
    .from('classes')
    .select('id,name,status,teacher_id')
    .eq('school_id', schoolId)
    .eq('name', name)
    .limit(1)
    .maybeSingle();

  if (nameClash) {
    const bindError = await bindClassToOffering(db, {
      classId: nameClash.id,
      offeringId: offeringId!,
      programmeId,
      actorId: input.actorId,
      teacherId: nameClash.teacher_id || teacher.id,
    });
    if (bindError) {
      return { cohort: null, created: false, error: bindError };
    }

    const tName = await teacherName(db, nameClash.teacher_id || teacher.id);
    return {
      cohort: toCohortSummary(
        { ...nameClash, status: 'active', teacher_id: nameClash.teacher_id || teacher.id },
        tName,
      ),
      created: false,
    };
  }

  const insertRow: Record<string, unknown> = {
    name,
    school_id: schoolId,
    program_id: programmeId,
    teacher_id: teacher.id,
    status: 'active',
    academic_offering_id: offeringId,
    current_students: 0,
    start_date: page.starts_on || null,
    end_date: page.ends_on || null,
    created_at: new Date().toISOString(),
  };

  const { data: created, error } = await db.from('classes').insert(insertRow).select('id,name,status,teacher_id').single();
  if (error || !created) {
    return { cohort: null, created: false, error: error?.message || 'Could not create cohort class' };
  }

  const { error: pathwayError } = await db.rpc('ensure_class_academic_pathway', {
    p_class_id: created.id,
    p_enrollment_type: 'special',
    p_preferred_offering_id: offeringId,
    p_actor_id: input.actorId,
  });
  if (pathwayError) {
    return {
      cohort: toCohortSummary(created, await teacherName(db, created.teacher_id)),
      created: true,
      error: `Class created but pathway link failed: ${pathwayError.message}`,
    };
  }

  return {
    cohort: toCohortSummary(created, await teacherName(db, created.teacher_id)),
    created: true,
  };
}

/** School classes that can be linked as the cohort (not already on another active offering). */
export async function loadLinkableSchoolClasses(
  db: AnySupabase,
  schoolId: string,
  offeringId: string,
): Promise<CohortClassSummary[]> {
  const { data } = await db
    .from('classes')
    .select('id,name,status,teacher_id,academic_offering_id')
    .eq('school_id', schoolId)
    .neq('status', 'completed')
    .order('name', { ascending: true })
    .limit(80);

  const rows = (data ?? []) as Array<{
    id: string;
    name?: string | null;
    status?: string | null;
    teacher_id?: string | null;
    academic_offering_id?: string | null;
  }>;

  const out: CohortClassSummary[] = [];
  for (const row of rows) {
    const oid = row.academic_offering_id ? String(row.academic_offering_id) : null;
    if (oid && oid !== offeringId) continue;
    out.push(toCohortSummary(row, await teacherName(db, row.teacher_id)));
  }
  return out;
}
