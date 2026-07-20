'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { OfficeProvider, useOffice } from '@/components/office/OfficeContext';
import {
  INBOX_SECTIONS,
  OFFICE_WORKSPACES,
  SETTINGS_SECTIONS,
  type InboxSection,
  type OfficeWorkspace,
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

function WorkspaceTabs() {
  const { workspace, setWorkspace, summary } = useOffice();

  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-border bg-background/95 px-4 pb-2 pt-1 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:mx-0 sm:rounded-none sm:px-0">
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide touch-pan-x">
        {OFFICE_WORKSPACES.map(({ key, label, short }) => {
          const badge =
            key === 'cases' && summary && summary.needsAttention > 0
              ? summary.needsAttention
              : key === 'settings' && summary && summary.automationProblems > 0
                ? summary.automationProblems
                : null;
          const active = workspace === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setWorkspace(key as OfficeWorkspace)}
              className={`relative flex min-h-11 shrink-0 touch-manipulation items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors sm:px-4 ${
                active
                  ? 'bg-primary text-white shadow-lg shadow-primary/25'
                  : 'text-muted-foreground active:bg-muted/70'
              }`}
            >
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{label}</span>
              {badge ? (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                    active ? 'bg-white/20 text-white' : 'bg-amber-500/15 text-amber-700'
                  }`}
                >
                  {badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SectionTabs({
  sections,
  current,
  onSelect,
}: {
  sections: Array<{ key: string; label: string }>;
  current: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide touch-pan-x">
      {sections.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          className={`min-h-11 shrink-0 touch-manipulation rounded-xl px-4 py-2 text-sm font-bold ${
            current === key ? 'bg-muted text-foreground' : 'border border-border text-muted-foreground'
          }`}
        >
          {label}
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
    return (
      <div className="space-y-4">
        <SectionTabs
          sections={INBOX_SECTIONS}
          current={inboxSection}
          onSelect={(key) => setWorkspace('inbox', key as InboxSection)}
        />
        <OfficeInboxPanel embedded section={inboxSection} />
      </div>
    );
  }
  if (workspace === 'feedback') return <OfficeFeedbackPanel embedded mode="admin" />;
  if (workspace === 'crm') return <OfficeCrmPanel embedded />;
  if (workspace === 'newsletters') return <OfficeNewslettersPanel embedded />;
  if (workspace === 'settings') {
    const settingsSection = (section as SettingsSection) || 'automation';
    return (
      <div className="space-y-4">
        <SectionTabs
          sections={SETTINGS_SECTIONS}
          current={settingsSection}
          onSelect={(key) => setWorkspace('settings', key as SettingsSection)}
        />
        {settingsSection === 'automation' ? <AutomationControlsPanel embedded /> : null}
        {settingsSection === 'templates' ? <CommunicationTemplatesPanel embedded /> : null}
        {settingsSection === 'health' ? <OperationsHealthPanel embedded /> : null}
        {settingsSection === 'results' ? <OperationsPerformancePanel embedded /> : null}
      </div>
    );
  }
  return null;
}

function OfficeCenterInner() {
  const { profile, loading: authLoading, profileLoading } = useAuth();
  const { workspace, summary, duty } = useOffice();
  const wide = workspace === 'inbox' || workspace === 'crm';

  if (authLoading || profileLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
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
    <div className="min-h-dvh bg-background pb-[max(1.5rem,var(--safe-area-bottom))]">
      <div className={`mx-auto ${wide ? 'max-w-7xl px-2 py-3 sm:px-4 sm:py-4' : 'max-w-6xl px-4 py-6 sm:px-6 sm:py-8'}`}>
        <div className={wide ? 'mb-2' : 'mb-4'}>
          <h1 className={`font-black tracking-tight text-foreground ${wide ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'}`}>
            Office Center
          </h1>
          {!wide ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Shared live office — Desk, Cases, Duty, Inbox, and Settings update each other when work changes.
            </p>
          ) : null}
          {(duty || summary) && (
            <p className={`text-xs text-muted-foreground ${wide ? 'mt-1' : 'mt-2'}`}>
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
                  Attention {summary.needsAttention}
                  {summary.unassigned > 0 ? ` · Unassigned ${summary.unassigned}` : ''}
                  {summary.automationProblems > 0 ? ` · Automation issues ${summary.automationProblems}` : ''}
                </>
              ) : null}
            </p>
          )}
        </div>

        <WorkspaceTabs />

        <div className={`min-h-[400px] ${wide ? 'mt-3' : 'mt-6'}`}>
          <OfficeWorkspaceBody />
        </div>
      </div>
    </div>
  );
}

export default function OfficeCenterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      }
    >
      <OfficeProvider>
        <OfficeCenterInner />
      </OfficeProvider>
    </Suspense>
  );
}
