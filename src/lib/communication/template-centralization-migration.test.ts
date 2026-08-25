import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260929000114_centralize_communication_templates.sql'),
  'utf8',
).toLowerCase();

describe('communication template centralization', () => {
  it('preserves active legacy wording in the governed version registry', () => {
    expect(sql).toContain('from public.notification_templates');
    expect(sql).toContain('insert into public.communication_templates');
    expect(sql).toContain('insert into public.communication_template_versions');
    expect(sql).toContain("test_status, test_notes");
  });

  it('freezes the competing legacy editor without deleting content', () => {
    expect(sql).toContain('revoke insert, update, delete on table public.notification_templates');
    expect(sql).not.toContain('drop table public.notification_templates');
    expect(sql).not.toContain('delete from public.notification_templates');
  });

  it('requires an active administrator for canonical changes', () => {
    expect(sql).toContain('public.is_active_admin()');
  });

  it('gives email the unsuffixed key and does not grant browser writes', () => {
    expect(sql).toContain("case when type = 'email' then 0 else 1 end");
    expect(sql).toContain('revoke insert, update, delete on table public.communication_templates');
    expect(sql).toContain('revoke insert, update, delete on table public.communication_template_versions');
  });

  it('does not keep a second Meta HTTP client', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/whatsapp/send-message.ts'), 'utf8');
    expect(source).toContain("from './send'");
    expect(source).not.toContain('graph.facebook.com');
    expect(source).not.toContain('fetch(');
  });

  it('keeps the operator editor on the governed Office API', () => {
    const settingsPanel = readFileSync(
      join(process.cwd(), 'src/app/dashboard/settings/panel.tsx'),
      'utf8',
    );
    const officePanel = readFileSync(
      join(process.cwd(), 'src/components/office/CommunicationTemplatesPanel.tsx'),
      'utf8',
    );
    expect(settingsPanel).not.toContain('.from("notification_templates")');
    expect(settingsPanel).not.toContain(".from('notification_templates')");
    expect(officePanel).toContain('/api/admin/communication-templates');
    expect(officePanel).toContain('Failed-message recovery');
  });
});
