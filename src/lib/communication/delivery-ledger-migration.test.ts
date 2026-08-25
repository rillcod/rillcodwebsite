import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260929000118_complete_communication_delivery_ledger.sql'),
  'utf8',
).toLowerCase();

describe('complete communication delivery ledger migration', () => {
  it('links every queued WhatsApp job to one canonical delivery', () => {
    expect(sql).toContain('add column if not exists delivery_log_id uuid');
    expect(sql).toContain('function public.enqueue_whatsapp_delivery');
    expect(sql).toContain("v_delivery_key := 'whatsapp-outbox:'");
  });

  it('keeps immutable, idempotent provider receipt history', () => {
    expect(sql).toContain('create table if not exists public.communication_delivery_events');
    expect(sql).toContain('event_key text not null unique');
    expect(sql).toContain('on conflict (event_key) do nothing');
  });

  it('keeps delivered and read outcomes from regressing', () => {
    expect(sql).toContain("when v_current = 'read' then false");
    expect(sql).toContain("when v_current = 'delivered' and p_status not in ('read') then false");
  });

  it('automatically reconciles early callbacks', () => {
    expect(sql).toContain('reconcile_communication_delivery_events_trigger');
    expect(sql).toContain('where delivery_id is null');
  });
});
