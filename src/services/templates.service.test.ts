import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient }));

import { TemplatesService } from './templates.service';

function chain(result: { data: any; error: any }) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
  };
  return query;
}

describe('TemplatesService governed lookup', () => {
  beforeEach(() => {
    createClient.mockReset();
  });

  it('prefers an approved tested communication template over the legacy store', async () => {
    const governed = chain({
      data: {
        name: 'Assignment Reminder',
        channel: 'email',
        required_variables: ['user_name'],
        current_version: { subject: 'Due soon', body: 'Hello {{user_name}}', test_status: 'passed' },
      },
      error: null,
    });
    const legacy = chain({ data: null, error: { message: 'not used' } });
    createClient.mockResolvedValue({
      from: vi.fn((table: string) => (table === 'communication_templates' ? governed : legacy)),
    });

    const service = new TemplatesService();
    const template = await service.getTemplate('Assignment Reminder', 'email');
    expect(template.source).toBe('communication_templates');
    expect(template.subject).toBe('Due soon');
    expect(legacy.single).not.toHaveBeenCalled();
  });

  it('falls back to the frozen legacy store only when the governed copy is not ready', async () => {
    const governed = chain({ data: null, error: null });
    const legacy = chain({
      data: { name: 'Assignment Reminder', type: 'email', subject: 'Legacy', content: 'Old copy', is_active: true },
      error: null,
    });
    createClient.mockResolvedValue({
      from: vi.fn((table: string) => (table === 'communication_templates' ? governed : legacy)),
    });

    const service = new TemplatesService();
    const template = await service.getTemplate('Assignment Reminder', 'email');
    expect(template.source).toBe('notification_templates');
    expect(template.subject).toBe('Legacy');
  });
});
