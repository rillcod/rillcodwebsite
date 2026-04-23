import type { SupabaseClient } from '@supabase/supabase-js';

type AnySupabase = SupabaseClient<any>;

export type ParentLinkScope = {
  studentIds: string[];
  studentUserIds: string[];
};

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export async function getParentLinkScope(
  admin: AnySupabase,
  parent: { id: string; email?: string | null },
): Promise<ParentLinkScope> {
  const normalizedEmail = parent.email?.trim().toLowerCase() || '';

  let explicitStudentIds: string[] = [];
  try {
    const { data } = await admin
      .from('parent_student_links')
      .select('student_id')
      .eq('parent_id', parent.id);
    explicitStudentIds = unique((data ?? []).map((row: any) => row.student_id));
  } catch {
    explicitStudentIds = [];
  }

  let explicitRows: Array<{ id: string; user_id: string | null }> = [];
  if (explicitStudentIds.length > 0) {
    const { data } = await admin
      .from('students')
      .select('id, user_id')
      .in('id', explicitStudentIds);
    explicitRows = data ?? [];
  }

  let legacyRows: Array<{ id: string; user_id: string | null }> = [];
  if (normalizedEmail) {
    const { data } = await admin
      .from('students')
      .select('id, user_id')
      .ilike('parent_email', normalizedEmail);
    legacyRows = data ?? [];
  }

  return {
    studentIds: unique([
      ...explicitStudentIds,
      ...explicitRows.map((row) => row.id),
      ...legacyRows.map((row) => row.id),
    ]),
    studentUserIds: unique([
      ...explicitRows.map((row) => row.user_id),
      ...legacyRows.map((row) => row.user_id),
    ]),
  };
}

export async function syncExplicitParentStudentLink(
  admin: AnySupabase,
  parentId: string,
  studentId: string,
) {
  try {
    await admin
      .from('parent_student_links')
      .upsert(
        {
          parent_id: parentId,
          student_id: studentId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'parent_id,student_id' },
      );
  } catch {
    // Mixed-schema environments may not have parent_student_links yet.
  }
}
