import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  normalizeLegacyPipelineStages,
  repointCrmContactIds,
} from '@/lib/crm/contact-book';

export const dynamic = 'force-dynamic';

function normaliseEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

function normalisePhone(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

type ContactRow = {
  id: string;
  email: string | null;
  phone: string | null;
  metadata: unknown;
  updated_at: string;
};

type ChildEntry = { name?: string; [key: string]: unknown };

function mergeChildren(survivorMeta: unknown, ...dupesMeta: unknown[]): unknown {
  const base = (survivorMeta && typeof survivorMeta === 'object' ? survivorMeta : {}) as Record<string, unknown>;
  const survivorChildren: ChildEntry[] = Array.isArray(base.children) ? (base.children as ChildEntry[]) : [];
  const seen = new Set(survivorChildren.map((c) => (c.name ?? '').trim().toLowerCase()));
  const merged = [...survivorChildren];

  for (const meta of dupesMeta) {
    if (!meta || typeof meta !== 'object') continue;
    const metaObj = meta as Record<string, unknown>;
    const children: ChildEntry[] = Array.isArray(metaObj.children) ? (metaObj.children as ChildEntry[]) : [];
    for (const child of children) {
      const key = (child.name ?? '').trim().toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        merged.push(child);
      }
    }
  }

  return { ...base, children: merged };
}

/**
 * POST /api/crm/dedup — admin only.
 * Merges duplicate customer_contact_book rows, re-points form_leads + crm_* activity,
 * and normalizes legacy pipeline stages to the UI vocabulary.
 */
export async function POST(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createAdminClient();
  const { data: profile } = await db
    .from('portal_users').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
  }

  const { data: allContacts, error: fetchErr } = await db
    .from('customer_contact_book')
    .select('id, email, phone, metadata, updated_at')
    .order('updated_at', { ascending: false });

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const contacts: ContactRow[] = (allContacts ?? []) as ContactRow[];

  const emailGroups = new Map<string, ContactRow[]>();
  for (const row of contacts) {
    const key = normaliseEmail(row.email);
    if (!key || !key.includes('@')) continue;
    const group = emailGroups.get(key) ?? [];
    group.push(row);
    emailGroups.set(key, group);
  }

  const phoneGroups = new Map<string, ContactRow[]>();
  for (const row of contacts) {
    const key = normalisePhone(row.phone);
    if (!key || key.length < 9) continue;
    const group = phoneGroups.get(key) ?? [];
    group.push(row);
    phoneGroups.set(key, group);
  }

  const survivorMap = new Map<string, string>();
  const stats = {
    merged: 0,
    deleted: 0,
    stages_normalized: 0,
    errors: [] as Array<{ ids: string[]; error: string }>,
  };

  async function processGroup(group: ContactRow[]) {
    if (group.length < 2) return;

    const sorted = [...group].sort((a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );

    const survivor = sorted[0];
    const dupes = sorted.slice(1);
    const effectiveDupes = dupes.filter((d) => !survivorMap.has(d.id) || survivorMap.get(d.id) === survivor.id);
    if (effectiveDupes.length === 0) return;

    try {
      const mergedMeta = mergeChildren(survivor.metadata, ...effectiveDupes.map((d) => d.metadata));

      const { error: updateErr } = await db
        .from('customer_contact_book')
        .update({ metadata: mergedMeta as any, updated_at: new Date().toISOString() })
        .eq('id', survivor.id);

      if (updateErr) {
        stats.errors.push({ ids: [survivor.id, ...effectiveDupes.map((d) => d.id)], error: updateErr.message });
        return;
      }

      for (const dupe of effectiveDupes) {
        await (db as any)
          .from('form_leads')
          .update({ contact_id: survivor.id })
          .eq('contact_id', dupe.id);

        await repointCrmContactIds(db, dupe.id, survivor.id);

        const { error: delErr } = await db
          .from('customer_contact_book')
          .delete()
          .eq('id', dupe.id);

        if (delErr) {
          stats.errors.push({ ids: [dupe.id], error: delErr.message });
        } else {
          survivorMap.set(dupe.id, survivor.id);
          stats.deleted++;
        }
      }

      stats.merged++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      stats.errors.push({ ids: [survivor.id, ...effectiveDupes.map((d) => d.id)], error: msg });
    }
  }

  for (const group of emailGroups.values()) {
    if (group.length >= 2) await processGroup(group);
  }
  for (const group of phoneGroups.values()) {
    if (group.length >= 2) await processGroup(group);
  }

  try {
    const { updated } = await normalizeLegacyPipelineStages(db);
    stats.stages_normalized = updated;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    stats.errors.push({ ids: [], error: `stage normalize: ${msg}` });
  }

  return NextResponse.json(stats);
}
