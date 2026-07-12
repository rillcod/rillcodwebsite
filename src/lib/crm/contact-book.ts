/**
 * Contact-book upsert + canonical CRM contact id resolution.
 * Book remains intake storage; CRM activity prefers portal_users when linked.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

type AnySupabase = SupabaseClient<any>;

export function normalizeCrmPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  return digits || null;
}

export function normalizeCrmEmail(email: string | null | undefined): string | null {
  const e = (email || '').trim().toLowerCase();
  return e || null;
}

/** Prefer enrolled portal parent; else book row. One contact_id for crm_* writes. */
export async function resolveCanonicalCrmContactId(
  sb: AnySupabase,
  opts: { email?: string | null; phone?: string | null; bookId?: string | null },
): Promise<{ contactId: string | null; kind: 'portal' | 'book' | null; bookId: string | null }> {
  const email = normalizeCrmEmail(opts.email);
  const phone = normalizeCrmPhone(opts.phone);
  let bookId = opts.bookId ?? null;

  if (email) {
    const { data: portal } = await sb
      .from('portal_users')
      .select('id')
      .eq('email', email)
      .eq('role', 'parent')
      .maybeSingle();
    if (portal?.id) {
      return { contactId: portal.id, kind: 'portal', bookId };
    }
  }

  if (!bookId && email) {
    const { data } = await sb.from('customer_contact_book').select('id').eq('email', email).maybeSingle();
    bookId = data?.id ?? null;
  }
  if (!bookId && phone) {
    const { data } = await sb.from('customer_contact_book').select('id').eq('phone', phone).maybeSingle();
    bookId = data?.id ?? null;
  }

  if (bookId) return { contactId: bookId, kind: 'book', bookId };
  return { contactId: null, kind: null, bookId: null };
}

export type UpsertBookParentParams = {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  schoolName?: string | null;
  className?: string | null;
  source?: string;
  lastChannel?: string;
  childEntry?: Record<string, unknown> | null;
  formId?: string | null;
  formTitle?: string | null;
  extraMeta?: Record<string, unknown>;
};

/** Find-or-create parent in customer_contact_book (intake SoT). */
export async function upsertBookParent(
  sb: AnySupabase,
  params: UpsertBookParentParams,
): Promise<string | null> {
  const now = new Date().toISOString();
  const email = normalizeCrmEmail(params.email);
  const phone = normalizeCrmPhone(params.phone);

  let existing: { id: string; metadata: Record<string, unknown> | null } | null = null;
  if (email) {
    const { data } = await sb.from('customer_contact_book').select('id, metadata').eq('email', email).maybeSingle();
    existing = data;
  }
  if (!existing && phone) {
    const { data } = await sb.from('customer_contact_book').select('id, metadata').eq('phone', phone).maybeSingle();
    existing = data;
  }

  if (existing) {
    const meta = (existing.metadata as Record<string, unknown>) ?? {};
    let children = Array.isArray(meta.children) ? [...(meta.children as Record<string, unknown>[])] : [];
    if (params.childEntry) {
      const name = String(params.childEntry.name ?? '').toLowerCase();
      const idx = children.findIndex((c) => String(c.name ?? '').toLowerCase() === name);
      if (idx >= 0) children[idx] = { ...children[idx], ...params.childEntry };
      else children.push(params.childEntry);
    }
    const formLeads = Array.isArray(meta.form_leads) ? [...(meta.form_leads as string[])] : [];
    if (params.formId && !formLeads.includes(params.formId)) formLeads.push(params.formId);

    await sb.from('customer_contact_book').update({
      full_name: params.fullName,
      phone: phone ?? undefined,
      email: email ?? undefined,
      school_name: params.schoolName ?? undefined,
      class_name: params.className ?? undefined,
      last_channel: params.lastChannel || 'consent_form',
      updated_at: now,
      metadata: {
        ...meta,
        ...params.extraMeta,
        children,
        form_leads: formLeads,
        ...(params.formTitle ? { last_form_title: params.formTitle } : {}),
        ...(params.formId ? { last_form_id: params.formId } : {}),
      },
    }).eq('id', existing.id);
    return existing.id;
  }

  const { data: created } = await sb.from('customer_contact_book').insert({
    full_name: params.fullName,
    email,
    phone,
    role: 'parent',
    source: params.source || 'consent_form',
    last_channel: params.lastChannel || 'consent_form',
    school_name: params.schoolName || null,
    class_name: params.className || null,
    metadata: {
      children: params.childEntry ? [params.childEntry] : [],
      form_leads: params.formId ? [params.formId] : [],
      ...(params.formTitle ? { last_form_title: params.formTitle } : {}),
      ...(params.formId ? { last_form_id: params.formId } : {}),
      ...params.extraMeta,
    },
    confirmed_at: now,
    created_at: now,
    updated_at: now,
  }).select('id').single();

  return created?.id ?? null;
}

/** Re-point polymorphic crm_* rows when merging/deduping book contacts. */
export async function repointCrmContactIds(
  sb: AnySupabase,
  fromId: string,
  toId: string,
) {
  if (!fromId || !toId || fromId === toId) return;
  const tables = ['crm_interactions', 'crm_tasks', 'crm_opportunities', 'crm_attachments'] as const;
  for (const table of tables) {
    await sb.from(table).update({ contact_id: toId }).eq('contact_id', fromId);
  }
  // Pipeline: keep survivor; drop duplicate source row if both exist.
  const { data: sourcePipe } = await sb.from('crm_pipeline').select('*').eq('contact_id', fromId).maybeSingle();
  const { data: targetPipe } = await sb.from('crm_pipeline').select('id, stage').eq('contact_id', toId).maybeSingle();
  if (sourcePipe && !targetPipe) {
    await sb.from('crm_pipeline').update({ contact_id: toId }).eq('contact_id', fromId);
  } else if (sourcePipe && targetPipe) {
    await sb.from('crm_pipeline').delete().eq('contact_id', fromId);
  }
}
