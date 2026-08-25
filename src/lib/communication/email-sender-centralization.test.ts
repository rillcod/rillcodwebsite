import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe('outbound email transport ownership', () => {
  it('keeps provider HTTP calls inside the canonical notification service', () => {
    const root = join(process.cwd(), 'src');
    const providerCallers = sourceFiles(root)
      .filter((file) => /api\.resend\.com|api\.sendpulse\.com\/smtp\/emails/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(process.cwd(), file).replace(/\\/g, '/'));
    expect(providerCallers).toEqual(['src/services/notifications.service.ts']);
  });

  it('keeps both provider webhooks on the append-only ledger boundary', () => {
    const emailWebhook = readFileSync(join(process.cwd(), 'src/app/api/webhooks/email-status/route.ts'), 'utf8');
    const whatsappWebhook = readFileSync(join(process.cwd(), 'src/app/api/webhooks/whatsapp/route.ts'), 'utf8');
    for (const source of [emailWebhook, whatsappWebhook]) {
      expect(source).toContain('recordCommunicationDeliveryEvent');
      expect(source).toContain('recordUnmatchedDeliveryEvent');
    }
  });

  it('does not hide partial ledger or unmatched-receipt states from operators', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/admin/email-log/route.ts'), 'utf8');
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/email-log/page.tsx'), 'utf8');
    expect(route).toContain('ledger_ready: operatorDataReady');
    expect(route).toContain('unmatched_receipts: unmatchedResult.count');
    expect(page).toContain('Lifecycle detail needs a refresh');
    expect(page).toContain('awaiting a message link');
  });

  it('keeps template editing, preview and reversible retirement in the governed workspace', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/admin/communication-templates/route.ts'), 'utf8');
    const panel = readFileSync(join(process.cwd(), 'src/components/office/CommunicationTemplatesPanel.tsx'), 'utf8');
    expect(route).toContain("action === 'restore'");
    expect(route).toContain('Roll back incomplete communication template version');
    expect(panel).toContain('Rendered test preview');
    expect(panel).toContain('Search message templates');
  });
});
