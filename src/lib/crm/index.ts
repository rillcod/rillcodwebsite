/**
 * CRM library — prefer these modules over reimplementing auth/scope/stages in routes.
 */

export * from '@/lib/crm/stages';
export * from '@/lib/crm/ui';
export * from '@/lib/crm/auth';
export * from '@/lib/crm/pipeline';
export * from '@/lib/crm/contact-book';
export {
  getCallerSchoolIds,
  getIsolatedTeacherContactIds,
  schoolNameNeedlesForCaller,
  rowMatchesSchoolNames,
  resolveSchoolIdsByName,
  assertCrmContactAccess,
  requireContactIdForNonAdmin,
  type CrmCaller,
  type ContactAccess,
} from '@/lib/crm/scope';
