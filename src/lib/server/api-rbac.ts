/**
 * App-layer authorization for Route Handlers when using the service-role client.
 * No database migrations — enforce business rules in API code.
 */

import { isPlatformStaffRole, isPartnerSchoolRole, isStaffRole } from '@/lib/dashboard/route-access';

export { isPlatformStaffRole, isPartnerSchoolRole, isStaffRole };

/** CRM and similar cross-tenant tools: admin + teacher only (not partner `school`). */
export function isCrmPlatformRole(role: string | undefined | null): boolean {
  return isPlatformStaffRole(role);
}
