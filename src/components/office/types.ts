export type OfficeWorkspace =
  | 'desk'
  | 'cases'
  | 'duty'
  | 'inbox'
  | 'feedback'
  | 'crm'
  | 'newsletters'
  | 'settings';

export type InboxSection = 'chats' | 'groups';
export type SettingsSection = 'automation' | 'templates' | 'health' | 'results';

export type OfficeSection = InboxSection | SettingsSection | null;

export type OfficeChangeDomain =
  | 'cases'
  | 'duty'
  | 'feedback'
  | 'inbox'
  | 'crm'
  | 'newsletters'
  | 'settings'
  | 'health'
  | 'desk';

export type DeskSummary = {
  needsAttention: number;
  unassigned: number;
  failedMessages: number;
  successfulMessages: number;
  automationProblems: number;
  automationHealthy: number;
};

export type DutySnapshot = {
  primaryName: string | null;
  primaryId: string | null;
  available: number;
  totalEligible: number;
};

export const OFFICE_WORKSPACES: Array<{ key: OfficeWorkspace; label: string; short: string }> = [
  { key: 'desk', label: 'Desk', short: 'Desk' },
  { key: 'cases', label: 'Help requests', short: 'Help' },
  { key: 'duty', label: 'Duty roster', short: 'Duty' },
  { key: 'inbox', label: 'WhatsApp inbox', short: 'Inbox' },
  { key: 'feedback', label: 'Feedback', short: 'Feedback' },
  { key: 'crm', label: 'Retention', short: 'CRM' },
  { key: 'newsletters', label: 'Newsletters', short: 'Mail' },
  { key: 'settings', label: 'Settings', short: 'Setup' },
];

export type OfficeZone = 'today' | 'customers' | 'growth' | 'systems';

export const OFFICE_ZONES: Array<{
  key: OfficeZone;
  label: string;
  hint: string;
  intro: string;
  workspaces: OfficeWorkspace[];
}> = [
  {
    key: 'today',
    label: 'Today',
    hint: 'Start here — who needs you right now',
    intro: 'Your morning home base: what needs a person, who is on duty, and what the office sent overnight.',
    workspaces: ['desk', 'duty'],
  },
  {
    key: 'customers',
    label: 'Customer work',
    hint: 'Help requests, WhatsApp, and feedback',
    intro: 'Every conversation in one place — assign an owner, reply, and close the loop without losing context.',
    workspaces: ['cases', 'inbox', 'feedback'],
  },
  {
    key: 'growth',
    label: 'Growth',
    hint: 'Keep families engaged and coming back',
    intro: 'Follow up with families, nurture retention, and share official newsletters when you are ready.',
    workspaces: ['crm', 'newsletters'],
  },
  {
    key: 'systems',
    label: 'Systems',
    hint: 'Automations, templates, health, and results',
    intro: 'Tune what runs automatically, fix failed jobs, and review how the office is performing.',
    workspaces: ['settings'],
  },
];

export function officeZoneForWorkspace(workspace: OfficeWorkspace): OfficeZone {
  for (const zone of OFFICE_ZONES) {
    if (zone.workspaces.includes(workspace)) return zone.key;
  }
  return 'today';
}

export function defaultWorkspaceForZone(zone: OfficeZone): OfficeWorkspace {
  return OFFICE_ZONES.find((item) => item.key === zone)?.workspaces[0] ?? 'desk';
}

export const INBOX_SECTIONS: Array<{ key: InboxSection; label: string; hint: string }> = [
  { key: 'chats', label: 'Chats', hint: 'One-to-one and support threads' },
  { key: 'groups', label: 'Groups', hint: 'Class and school WhatsApp groups' },
];

export const SETTINGS_SECTIONS: Array<{ key: SettingsSection; label: string; hint: string }> = [
  { key: 'automation', label: 'Automations', hint: 'What runs automatically' },
  { key: 'templates', label: 'Message templates', hint: 'Wording your office sends' },
  { key: 'health', label: 'Scheduled jobs', hint: 'Cron health and failed runs' },
  { key: 'results', label: 'Results', hint: 'How the office is performing' },
];

export const OFFICE_WORKSPACE_KEYS = new Set<string>(OFFICE_WORKSPACES.map((w) => w.key));

export function parseOfficeWorkspace(value: string | null | undefined): OfficeWorkspace {
  if (value && OFFICE_WORKSPACE_KEYS.has(value)) return value as OfficeWorkspace;
  return 'desk';
}

export function parseInboxSection(value: string | null | undefined): InboxSection {
  return value === 'groups' ? 'groups' : 'chats';
}

export function parseSettingsSection(value: string | null | undefined): SettingsSection {
  if (value === 'templates' || value === 'health' || value === 'results') return value;
  return 'automation';
}

/** Map legacy / external dashboard URLs into Office Center workspace targets. */
export function resolveOfficeTarget(href: string | null | undefined): {
  workspace: OfficeWorkspace;
  section?: InboxSection | SettingsSection;
  caseId?: string;
  feedbackId?: string;
  conversationId?: string;
} | null {
  if (!href) return null;
  try {
    const url = href.startsWith('http') ? new URL(href) : new URL(href, 'https://local.invalid');
    const path = url.pathname;
    const id = url.searchParams.get('id');
    const conversationId = url.searchParams.get('conversation') || undefined;

    if (path.startsWith('/dashboard/office')) {
      return {
        workspace: parseOfficeWorkspace(url.searchParams.get('workspace')),
        section:
          url.searchParams.get('workspace') === 'inbox'
            ? parseInboxSection(url.searchParams.get('section'))
            : url.searchParams.get('workspace') === 'settings'
              ? parseSettingsSection(url.searchParams.get('section'))
              : undefined,
        caseId: url.searchParams.get('id') || undefined,
        feedbackId: url.searchParams.get('feedbackId') || undefined,
        conversationId,
      };
    }
    if (path.startsWith('/dashboard/cases')) {
      return { workspace: 'cases', caseId: id || undefined };
    }
    if (path.startsWith('/dashboard/feedback/')) {
      return { workspace: 'feedback', feedbackId: path.split('/').pop() || undefined };
    }
    if (path === '/dashboard/feedback') return { workspace: 'feedback' };
    if (path === '/dashboard/inbox') {
      return { workspace: 'inbox', section: 'chats', conversationId };
    }
    if (path === '/dashboard/whatsapp-groups') return { workspace: 'inbox', section: 'groups' };
    if (path === '/dashboard/crm') return { workspace: 'crm' };
    if (path === '/dashboard/newsletters') return { workspace: 'newsletters' };
    if (path.includes('operations-duty') || path.includes('office-desk')) {
      return { workspace: path.includes('duty') ? 'duty' : 'desk' };
    }
    if (path.includes('operations-health')) return { workspace: 'settings', section: 'health' };
    if (path.includes('operations-performance')) return { workspace: 'settings', section: 'results' };
    if (path.includes('communication-templates')) return { workspace: 'settings', section: 'templates' };
    if (path.includes('automation-controls')) return { workspace: 'settings', section: 'automation' };
  } catch {
    return null;
  }
  return null;
}
