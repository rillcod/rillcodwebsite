import type { StudentRosterInput } from '@/lib/cards/exportRoster';

/** Minimal shape shared by Card Studio records and portal_users exports. */
export type RosterSourceRecord = {
  id: string;
  name: string;
  gradeLevel?: string | null;
  sectionClass?: string | null;
  roleLabel?: string;
};

/** Normalise card records or portal_users rows into roster export input. */
export function mapRecordsToRosterInput(records: RosterSourceRecord[]): StudentRosterInput[] {
  return records.map((record) => ({
    id: record.id,
    name: record.name.trim() || 'Student',
    gradeLevel: record.gradeLevel?.trim() || null,
    sectionClass: record.sectionClass?.trim() || null,
    roleLabel: record.roleLabel,
  }));
}

/** Map school-report portal_users rows to roster export input. */
export function mapPortalStudentsToRosterInput(
  rows: Array<{
    id: string;
    full_name: string | null;
    grade?: string | null;
    section_class?: string | null;
    class_arm?: string | null;
  }>,
  classNameById?: Map<string, string>,
  classIdByStudent?: Map<string, string | null>,
): StudentRosterInput[] {
  return rows.map((row) => {
    const classId = classIdByStudent?.get(row.id) ?? null;
    const sectionFromClass = classId && classNameById ? classNameById.get(classId) ?? null : null;
    return {
      id: row.id,
      name: (row.full_name || 'Student').trim(),
      gradeLevel: row.grade?.trim() || null,
      sectionClass: row.section_class?.trim() || sectionFromClass || row.class_arm?.trim() || null,
      roleLabel: 'Student',
    };
  });
}
