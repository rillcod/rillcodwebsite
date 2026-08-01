'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { OfficeProvider, useOffice } from '@/components/office/OfficeContext';
import { OfficeCommandBar } from '@/components/office/OfficeCommandBar';
import { OfficeNavigation } from '@/components/office/OfficeNavigation';
import {
  OFFICE_ZONES,
  SETTINGS_SECTIONS,
  officeZoneForWorkspace,
  type InboxSection,
  type SettingsSection,
} from '@/components/office/types';
import { OfficeDeskPanel } from '@/components/office/OfficeDeskPanel';
import { CasesPanel } from '@/components/office/CasesPanel';
import { DutyBoardPanel } from '@/components/office/DutyBoardPanel';
import { OfficeInboxPanel } from '@/components/office/OfficeInboxPanel';
import { OfficeFeedbackPanel } from '@/components/office/OfficeFeedbackPanel';
import { OfficeCrmPanel } from '@/components/office/OfficeCrmPanel';
import { OfficeNewslettersPanel } from '@/components/office/OfficeNewslettersPanel';
import { AutomationControlsPanel } from '@/components/office/AutomationControlsPanel';
import { CommunicationTemplatesPanel } from '@/components/office/CommunicationTemplatesPanel';
import { OperationsHealthPanel } from '@/components/office/OperationsHealthPanel';
import { OperationsPerformancePanel } from '@/components/office/OperationsPerformancePanel';

function ZoneIntro() {
  const { workspace } = useOffice();
  const zone = OFFICE_ZONES.find((item) => item.key === officeZoneForWorkspace(workspace));
  if (!zone) return null;
  return (
    <p className="mt-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
      {zone.intro}
    </p>
  );
}

function SectionTabs({
  sections,
  current,
  onSelect,
  vertical = false,
}: {
  sections: Array<{ key: string; label: string; hint?: string }>;
  current: string;
  onSelect: (key: string) => void;
  vertical?: boolean;
}) {
  if (vertical) {
    return (
      <nav className="space-y-1">
        {sections.map(({ key, label, hint }) => (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors ${
              current === key ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50'
            }`}
          >
            <p className="text-sm font-bold">{label}</p>
            {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
          </button>
        ))}
      </nav>
    );
  }

  return (
    <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide touch-pan-x">
      {sections.map(({ key, label, hint }) => (
        <button
          key={key}
          type="button"
          title={hint}
          onClick={() => onSelect(key)}
          className={`min-h-11 shrink-0 touch-manipulation rounded-xl px-4 py-2 text-left text-sm font-bold ${
            current === key ? 'bg-muted text-foreground' : 'border border-border text-muted-foreground'
          }`}
        >
          <span>{label}</span>
          {hint ? <span className="mt-0.5 hidden text-[10px] font-normal sm:block">{hint}</span> : null}
        </button>
      ))}
    </div>
  );
}

function OfficeWorkspaceBody() {
  const { workspace, section, caseId, setWorkspace } = useOffice();

  if (workspace === 'desk') return <OfficeDeskPanel embedded />;
  if (workspace === 'cases') return <CasesPanel embedded initialCaseId={caseId} />;
  if (workspace === 'duty') return <DutyBoardPanel embedded />;
  if (workspace === 'inbox') {
    const inboxSection = (section as InboxSection) || 'chats';
    return <OfficeInboxPanel embedded section={inboxSection} />;
  }
  if (workspace === 'feedback') return <OfficeFeedbackPanel embedded mode="admin" />;
  if (workspace === 'crm') return <OfficeCrmPanel embedded />;
  if (workspace === 'newsletters') return <OfficeNewslettersPanel embedded />;
  if (workspace === 'settings') {
    const settingsSection = (section as SettingsSection) || 'automation';
    return (
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">Systems</p>
          <SectionTabs
            sections={SETTINGS_SECTIONS}
            current={settingsSection}
            onSelect={(key) => setWorkspace('settings', key as SettingsSection)}
            vertical
          />
        </aside>
        <div className="min-w-0">
          <div className="mb-4 lg:hidden">
            <SectionTabs
              sections={SETTINGS_SECTIONS}
              current={settingsSection}
              onSelect={(key) => setWorkspace('settings', key as SettingsSection)}
              vertical
            />
          </div>
          {settingsSection === 'automation' ? <AutomationControlsPanel embedded /> : null}
          {settingsSection === 'templates' ? <CommunicationTemplatesPanel embedded /> : null}
          {settingsSection === 'health' ? <OperationsHealthPanel embedded /> : null}
          {settingsSection === 'results' ? <OperationsPerformancePanel embedded /> : null}
        </div>
      </div>
    );
  }
  return null;
}

function OfficeCenterInner() {
  const { profile, loading: authLoading, profileLoading } = useAuth();
  const { workspace, summary, duty, snapshotMeta, setWorkspace } = useOffice();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const shortcuts: Record<string, () => void> = {
      '1': () => setWorkspace('desk'),
      '2': () => setWorkspace('cases'),
      '3': () => setWorkspace('inbox', 'chats'),
      '4': () => setWorkspace('duty'),
      '5': () => setWorkspace('feedback'),
      '6': () => setWorkspace('crm'),
      '7': () => setWorkspace('newsletters'),
      '8': () => setWorkspace('settings', 'health'),
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
        return;
      }
      shortcuts[event.key]?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setWorkspace]);

  if (authLoading || profileLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-background mobile-page-root">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 mobile-page-root">
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          <p className="font-bold text-foreground">Office Center is for administrators</p>
          <p className="mt-2">
            Use{' '}
            <Link className="font-semibold text-primary underline" href="/dashboard/cases">
              Help Requests
            </Link>{' '}
            or{' '}
            <Link className="font-semibold text-primary underline" href="/dashboard/inbox">
              WhatsApp Inbox
            </Link>{' '}
            for your role.
          </p>
          <Link href="/dashboard" className="mt-4 inline-block min-h-11 font-bold text-primary underline">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-y-contain bg-background [-webkit-overflow-scrolling:touch]">
      <div className="mx-auto w-full min-w-0 max-w-7xl px-3 py-4 sm:px-6 sm:py-8 mobile-page-root">
        <div className="mb-4">
          <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">Office Center</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            One calm place for daily work — start on <span className="font-bold text-foreground">Today</span>, then
            handle conversations, relationships, and operations when you need them.
          </p>
          {(duty || summary) && (
            <p className="mt-2 break-words text-xs text-muted-foreground">
              {duty ? (
                <>
                  On duty: <span className="font-bold text-foreground">{duty.primaryName || 'Admin review'}</span>
                  {' · '}
                  {duty.available}/{duty.totalEligible} available
                </>
              ) : null}
              {duty && summary ? ' · ' : null}
              {summary ? (
                <>
                  Needs attention {summary.needsAttention}
                  {summary.unassigned > 0 ? ` · Unassigned ${summary.unassigned}` : ''}
                  {summary.automationProblems > 0 ? ` · Check systems ${summary.automationProblems}` : ''}
                </>
              ) : null}
              {snapshotMeta?.stale ? (
                <>
                  {' · '}
                  <span className="font-bold text-amber-700 dark:text-amber-300">Counts may be stale</span>
                </>
              ) : snapshotMeta?.lastUpdatedAt ? (
                <>
                  {' · '}
                  Updated {new Date(snapshotMeta.lastUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </>
              ) : null}
              {' · '}
              <Link href="/dashboard/finance" className="font-bold text-primary underline-offset-2 hover:underline">
                Finance Center
              </Link>
            </p>
          )}
        </div>

        <div className="mb-3 flex items-center justify-between gap-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileNavOpen((open) => !open)}
            className="rounded-xl border border-border px-3 py-2 text-xs font-black"
          >
            {mobileNavOpen ? 'Hide menu' : 'Office menu'}
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className={mobileNavOpen ? 'block' : 'hidden lg:block'}>
            <OfficeNavigation mobileOpen onNavigate={() => setMobileNavOpen(false)} />
          </aside>

          <div className="min-w-0">
            <ZoneIntro />

            <div className="mt-4 pb-6">
              <OfficeWorkspaceBody />
            </div>
          </div>
        </div>
      </div>
      <OfficeCommandBar />
    </div>
  );
}

export default function OfficeCenterPage() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Suspense
        fallback={
          <div className="flex h-full min-h-[50vh] items-center justify-center mobile-page-root">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        }
      >
        <OfficeProvider>
          <OfficeCenterInner />
        </OfficeProvider>
      </Suspense>
    </div>
  );
}
