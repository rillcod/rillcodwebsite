import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanClassName } from '@/lib/classes/naming';

type AnySupabase = SupabaseClient<any>;

export type ResolvedClass = {
  id: string | null;
  name: string | null;
  error?: string;
};

/**
 * Resolve an existing class by id or name for a school, or auto-create when missing.
 * Shared by activate, bulk-register, and consent placement flows.
 */
export async function resolveClassForStudent(
  admin: AnySupabase,
  schoolId: string | null,
  classId: string | null,
  classNames: Array<string | null | undefined>,
): Promise<ResolvedClass> {
  if (classId) {
    const { data: cls } = await admin
      .from('classes')
      .select('id, name, school_id')
      .eq('id', classId)
      .maybeSingle();
    if (!cls) return { id: null, name: null, error: 'Class not found' };
    if (schoolId && cls.school_id && cls.school_id !== schoolId) {
      return { id: null, name: null, error: 'Selected class belongs to a different school' };
    }
    return { id: cls.id, name: cls.name };
  }

  const names = Array.from(
    new Set(
      classNames
        .map((name) => cleanClassName(name) || name?.trim() || '')
        .filter(Boolean),
    ),
  ) as string[];
  if (!schoolId || names.length === 0) return { id: null, name: names[0] ?? null };

  const { data: cls } = await admin
    .from('classes')
    .select('id, name')
    .eq('school_id', schoolId)
    .in('name', names)
    .limit(1)
    .maybeSingle();

  if (cls) {
    return { id: cls.id, name: cls.name };
  }

  const className = names[0];
  let tutorId: string | null = null;

  const { data: globalClass } = await admin
    .from('classes')
    .select('teacher_id')
    .eq('name', className)
    .not('teacher_id', 'is', null)
    .limit(1)
    .maybeSingle();
  if (globalClass?.teacher_id) tutorId = globalClass.teacher_id;

  if (!tutorId) {
    const { data: ts } = await admin
      .from('teacher_schools')
      .select('teacher_id')
      .eq('school_id', schoolId)
      .limit(1)
      .maybeSingle();
    tutorId = ts?.teacher_id ?? null;
  }

  if (!tutorId) {
    const { data: t } = await admin
      .from('portal_users')
      .select('id')
      .eq('role', 'teacher')
      .eq('school_id', schoolId)
      .limit(1)
      .maybeSingle();
    tutorId = t?.id ?? null;
  }

  if (!tutorId) {
    const { data: tGlobal } = await admin
      .from('portal_users')
      .select('id')
      .eq('role', 'teacher')
      .limit(1)
      .maybeSingle();
    tutorId = tGlobal?.id ?? null;
  }

  if (tutorId && schoolId) {
    const { data: hasLink } = await admin
      .from('teacher_schools')
      .select('teacher_id')
      .eq('teacher_id', tutorId)
      .eq('school_id', schoolId)
      .maybeSingle();
    if (!hasLink) {
      await admin.from('teacher_schools').insert({
        teacher_id: tutorId,
        school_id: schoolId,
      });
    }
  }

  if (!tutorId) {
    console.error(`[resolveClassForStudent] Cannot create class "${className}": no teacher is available.`);
    return {
      id: null,
      name: className,
      error: 'No teacher is available to own the automatically created class',
    };
  }

  const { data: newCls, error: createErr } = await admin
    .from('classes')
    .insert({
      name: className,
      school_id: schoolId,
      teacher_id: tutorId,
      status: 'active',
      description: `Automatically created class for ${className}`,
    })
    .select('id, name')
    .single();

  if (createErr) {
    console.error(`[resolveClassForStudent] Auto-creation of class "${className}" failed:`, createErr.message);
    return { id: null, name: className };
  }

  return { id: newCls.id, name: newCls.name };
}
