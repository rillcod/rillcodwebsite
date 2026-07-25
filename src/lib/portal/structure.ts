/**
 * Portal structure helpers — every non-admin active account must belong to a school.
 * Active students must also belong to a class.
 */

export const PORTAL_ROLES = ['admin', 'teacher', 'school', 'parent', 'student'] as const;
export type KnownPortalRole = (typeof PORTAL_ROLES)[number];
export type StructureRole = KnownPortalRole | string;

export function isKnownPortalRole(role: string | null | undefined): role is KnownPortalRole {
  return !!role && (PORTAL_ROLES as readonly string[]).includes(role);
}

/** Roles teachers/CRM staff may create (never admin). */
export const STAFF_CREATABLE_ROLES = ['teacher', 'school', 'parent', 'student'] as const;

export function portalStructureError(
  role: StructureRole,
  opts: { schoolId?: string | null; classId?: string | null },
): string | null {
  if (!isKnownPortalRole(role)) {
    return `Unknown portal role "${role}". Allowed: ${PORTAL_ROLES.join(', ')}.`;
  }
  if (role === 'admin') return null;
  if (role === 'student') {
    if (!opts.schoolId) return 'Students must be assigned to a school before activation.';
    if (!opts.classId) return 'Students must be assigned to a class before activation.';
    return null;
  }
  if (role === 'parent' || role === 'teacher' || role === 'school') {
    if (!opts.schoolId) return `${role[0].toUpperCase()}${role.slice(1)} accounts must be assigned to a school.`;
    return null;
  }
  return null;
}

/** True when this profile may be marked is_active=true. */
export function canActivatePortalUser(
  role: StructureRole,
  opts: { schoolId?: string | null; classId?: string | null },
): boolean {
  return portalStructureError(role, opts) === null;
}
