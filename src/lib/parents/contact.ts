/** Shared parent contact rules — Google may help name/email only; other form fields stay required. */

export const PARENT_PHONE_REQUIRED_MSG =
  'A valid phone number is required (at least 10 digits).';

export const PARENT_NAME_REQUIRED_MSG = 'Parent full name is required.';

export const PARENT_RELATIONSHIP_REQUIRED_MSG =
  'Relationship to the student is required (e.g. Mother, Father, Guardian).';

export const PARENT_RELATIONSHIPS = [
  'Guardian',
  'Father',
  'Mother',
  'Sibling',
  'Uncle',
  'Aunt',
  'Other',
] as const;

export function isValidParentPhone(phone: string | null | undefined): boolean {
  return (phone ?? '').replace(/\D/g, '').length >= 10;
}

export function isValidParentName(name: string | null | undefined): boolean {
  return (name ?? '').trim().length >= 2;
}

export function isValidParentRelationship(value: string | null | undefined): boolean {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return false;
  return (PARENT_RELATIONSHIPS as readonly string[]).includes(trimmed)
    || trimmed.length >= 2;
}

/** Portal fields Google must not invent — phone + real name still required after OAuth. */
export function parentPortalContactGaps(portal: {
  full_name?: string | null;
  phone?: string | null;
}): string[] {
  const gaps: string[] = [];
  if (!isValidParentName(portal.full_name)) gaps.push('full_name');
  if (!isValidParentPhone(portal.phone)) gaps.push('phone');
  return gaps;
}

/** After Google (or any login) when required contact fields are still missing. */
export function parentContactCompletionPath(next = '/dashboard'): string {
  const params = new URLSearchParams({ complete: 'contact' });
  if (next && next !== '/dashboard') params.set('next', next);
  return `/dashboard/profile?${params.toString()}`;
}
