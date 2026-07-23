/**
 * Progressive form capture — save name / phone / email to Contact Book + CRM
 * as soon as the visitor provides enough to follow up (before payment).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { DROPPED_PAYMENT_SOURCE } from '@/lib/crm/sync-dropped-payer';
import { upsertBookAndCrmPipeline } from '@/lib/crm/upsert-book-crm';

type AnySupabase = SupabaseClient<any>;

export const FORM_CAPTURE_SOURCE = 'form_capture';

export type CaptureStage = 'partial' | 'submitted' | 'payment_started';

export type CaptureLeadInput = {
  /** Parent / guardian / primary contact name */
  fullName: string;
  email?: string | null;
  phone?: string | null;
  childName?: string | null;
  schoolName?: string | null;
  className?: string | null;
  formType: 'portal_registration' | 'special_program' | 'consent_form' | 'general';
  captureStage: CaptureStage;
  programSlug?: string | null;
  programTitle?: string | null;
  formId?: string | null;
  formTitle?: string | null;
  formSnapshot?: Record<string, unknown>;
};

export function canCaptureLead(input: Pick<CaptureLeadInput, 'fullName' | 'email' | 'phone'>): boolean {
  const name = (input.fullName || '').trim();
  const email = (input.email || '').trim();
  const phone = (input.phone || '').replace(/\D/g, '');
  return name.length >= 2 && (email.includes('@') || phone.length >= 10);
}

export async function captureLeadToContactBook(
  sb: AnySupabase,
  input: CaptureLeadInput,
): Promise<string | null> {
  if (!canCaptureLead(input)) return null;

  const now = new Date().toISOString();
  const source =
    input.captureStage === 'payment_started' || input.captureStage === 'submitted'
      ? DROPPED_PAYMENT_SOURCE
      : FORM_CAPTURE_SOURCE;

  const bookId = (await upsertBookAndCrmPipeline(sb, {
    fullName: input.fullName.trim(),
    contactName: input.fullName.trim(),
    email: input.email,
    phone: input.phone,
    schoolName: input.schoolName,
    className: input.className,
    role: 'external',
    source,
    lastChannel: input.formType,
    formId: input.formId ?? null,
    formTitle: input.formTitle ?? input.programTitle ?? null,
    childEntry: input.childName
      ? {
          name: input.childName,
          grade: input.className ?? null,
          program: input.programTitle ?? input.programSlug ?? null,
          school: input.schoolName ?? null,
        }
      : null,
    extraMeta: {
      is_dropped_payer: source === DROPPED_PAYMENT_SOURCE,
      is_form_capture: true,
      capture_stage: input.captureStage,
      form_type: input.formType,
      program_slug: input.programSlug ?? null,
      program_title: input.programTitle ?? null,
      form_snapshot: input.formSnapshot ?? {},
      last_captured_at: now,
      payment_status:
        input.captureStage === 'payment_started'
          ? 'paystack_pending'
          : input.captureStage === 'submitted'
            ? 'submitted_unpaid'
            : 'partial',
    },
  })).bookId;

  return bookId;
}
