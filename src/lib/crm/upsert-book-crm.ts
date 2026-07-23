/**
 * Shared CRM write after book upsert — respects known portal parents.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { promoteBookLeadToPortalIfLinked, upsertBookParent, type UpsertBookParentParams } from '@/lib/crm/contact-book';
import { upsertCrmPipeline } from '@/lib/crm/pipeline';
import { resolveParentCrmStatus } from '@/lib/crm/resolve-parent-stage';

type AnySupabase = SupabaseClient<any>;

export async function upsertBookAndCrmPipeline(
  sb: AnySupabase,
  params: UpsertBookParentParams & { contactName?: string },
): Promise<{ bookId: string | null; crmContactId: string | null }> {
  const parentStatus = await resolveParentCrmStatus(sb, {
    email: params.email,
    phone: params.phone,
  });

  const bookId = await upsertBookParent(sb, {
    ...params,
    role: parentStatus.isKnownParent ? parentStatus.bookRole : (params.role ?? 'external'),
    userId: parentStatus.portalParentId ?? params.userId ?? null,
    extraMeta: {
      ...(params.extraMeta ?? {}),
      is_known_parent: parentStatus.isKnownParent,
      linked_child_count: parentStatus.linkedChildCount,
      portal_parent_id: parentStatus.portalParentId,
    },
  });

  let crmContactId = parentStatus.portalParentId ?? bookId;
  const contactName = params.contactName || params.fullName;

  if (crmContactId) {
    await upsertCrmPipeline(sb, {
      contactId: crmContactId,
      contactName,
      contactType: parentStatus.contactType,
      stage: parentStatus.pipelineStage,
      promoteOnly: true,
    });
  }

  if (bookId && parentStatus.portalParentId) {
    try {
      const promo = await promoteBookLeadToPortalIfLinked(sb, {
        bookId,
        email: params.email,
        phone: params.phone,
      });
      if (promo.portalId) crmContactId = promo.portalId;
    } catch {
      /* non-fatal */
    }
  }

  return { bookId, crmContactId };
}
