'use client';

import { useOffice } from './OfficeContext';
import {
  INBOX_SECTIONS,
  OFFICE_ZONES,
  SETTINGS_SECTIONS,
  defaultWorkspaceForZone,
  officeZoneForWorkspace,
  type InboxSection,
  type OfficeWorkspace,
  type SettingsSection,
} from './types';

const WORKSPACE_LABELS: Record<OfficeWorkspace, string> = {
  desk: 'Desk',
  cases: 'Help requests',
  duty: 'Duty roster',
  inbox: 'WhatsApp inbox',
  feedback: 'Feedback',
  crm: 'Retention',
  newsletters: 'Newsletters',
  settings: 'Settings',
};

type Props = {
  mobileOpen?: boolean;
  onNavigate?: () => void;
};

export function OfficeNavigation({ mobileOpen = true, onNavigate }: Props) {
  const { workspace, section, summary, setWorkspace, snapshotMeta } = useOffice();
  const activeZone = officeZoneForWorkspace(workspace);

  const workspaceBadge = (key: OfficeWorkspace) => {
    if (key === 'cases' && summary && summary.needsAttention > 0) return summary.needsAttention;
    if (key === 'inbox' && summary && summary.unassigned > 0) return summary.unassigned;
    return null;
  };

  const chooseWorkspace = (next: OfficeWorkspace, nextSection?: InboxSection | SettingsSection | null) => {
    setWorkspace(next, nextSection ?? null);
    onNavigate?.();
  };

  if (!mobileOpen) return null;

  return (
    <nav aria-label="Office Center" className="flex h-full min-h-0 flex-col gap-4">
      <div className="rounded-2xl border border-border bg-card p-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Office status</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {snapshotMeta?.stale ? (
            <span className="font-bold text-amber-700">Counts may be stale</span>
          ) : snapshotMeta?.lastUpdatedAt ? (
            <>Updated {new Date(snapshotMeta.lastUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>
          ) : snapshotMeta?.loading ? (
            'Loading summary…'
          ) : (
            'Summary not loaded'
          )}
        </p>
        {summary ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Attention {summary.needsAttention} · Unassigned {summary.unassigned}
          </p>
        ) : null}
      </div>

      {OFFICE_ZONES.map((group) => (
        <section key={group.key} aria-labelledby={`office-nav-${group.key}`}>
          <h2
            id={`office-nav-${group.key}`}
            className="px-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground"
          >
            {group.label}
          </h2>
          <ul className="mt-2 space-y-1">
            {group.workspaces.map((key) => {
              const active = workspace === key && activeZone === group.key;
              const badge = workspaceBadge(key);
              return (
                <li key={key}>
                  <button
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => chooseWorkspace(key)}
                    className={`flex min-h-10 w-full touch-manipulation items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-bold transition-colors ${
                      active ? 'bg-primary text-white shadow-sm' : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <span>{WORKSPACE_LABELS[key]}</span>
                    {badge ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                          active ? 'bg-white/20 text-white' : 'bg-amber-500/15 text-amber-700'
                        }`}
                      >
                        {badge}
                      </span>
                    ) : null}
                  </button>
                  {key === 'inbox' && workspace === 'inbox' ? (
                    <ul className="ml-3 mt-1 space-y-1 border-l border-border pl-3">
                      {INBOX_SECTIONS.map((item) => (
                        <li key={item.key}>
                          <button
                            type="button"
                            aria-current={section === item.key ? 'true' : undefined}
                            onClick={() => chooseWorkspace('inbox', item.key)}
                            className={`block w-full rounded-lg px-2 py-1.5 text-left text-xs font-bold ${
                              section === item.key ? 'bg-muted text-foreground' : 'text-muted-foreground'
                            }`}
                          >
                            {item.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {key === 'settings' && workspace === 'settings' ? (
                    <ul className="ml-3 mt-1 space-y-1 border-l border-border pl-3">
                      {SETTINGS_SECTIONS.map((item) => (
                        <li key={item.key}>
                          <button
                            type="button"
                            aria-current={section === item.key ? 'true' : undefined}
                            onClick={() => chooseWorkspace('settings', item.key)}
                            className={`block w-full rounded-lg px-2 py-1.5 text-left text-xs font-bold ${
                              section === item.key ? 'bg-muted text-foreground' : 'text-muted-foreground'
                            }`}
                          >
                            {item.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <button
        type="button"
        onClick={() => chooseWorkspace(defaultWorkspaceForZone('today'))}
        className="mt-auto rounded-xl border border-border px-3 py-2 text-xs font-black text-primary"
      >
        Back to Today
      </button>
    </nav>
  );
}
