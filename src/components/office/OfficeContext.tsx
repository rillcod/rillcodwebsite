'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  parseInboxSection,
  parseOfficeWorkspace,
  parseSettingsSection,
  resolveOfficeTarget,
  type DeskSummary,
  type DutySnapshot,
  type InboxSection,
  type OfficeChangeDomain,
  type OfficeSnapshotMeta,
  type OfficeWorkspace,
  type SettingsSection,
} from './types';
import type { OfficeDeskPayload } from '@/lib/operations/office-desk-types';

type OfficeContextValue = {
  workspace: OfficeWorkspace;
  section: InboxSection | SettingsSection | null;
  caseId: string | null;
  feedbackId: string | null;
  summary: DeskSummary | null;
  duty: DutySnapshot | null;
  deskPayload: OfficeDeskPayload | null;
  snapshotMeta: OfficeSnapshotMeta;
  /** Increments when any workspace mutates shared office data — panels should reload. */
  revision: number;
  /** Most recent change domain (panels can ignore unrelated revisions). */
  lastChange: OfficeChangeDomain | null;
  setSummary: (summary: DeskSummary | null) => void;
  setDuty: (duty: DutySnapshot | null) => void;
  refreshSnapshot: () => Promise<void>;
  notifyOfficeChange: (domain: OfficeChangeDomain) => void;
  setWorkspace: (workspace: OfficeWorkspace, section?: InboxSection | SettingsSection | null) => void;
  openCase: (caseId: string) => void;
  openFeedback: (feedbackId: string) => void;
  clearCase: () => void;
  clearFeedback: () => void;
  /** Follow a dashboard link inside Office Center when possible; returns true if handled. */
  followOfficeLink: (href: string | null | undefined) => boolean;
};

const OfficeContext = createContext<OfficeContextValue | null>(null);

const EMPTY_SNAPSHOT_META: OfficeSnapshotMeta = {
  loading: true,
  refreshing: false,
  lastUpdatedAt: null,
  stale: false,
  error: null,
};

function buildOfficeUrl(
  workspace: OfficeWorkspace,
  section: InboxSection | SettingsSection | null,
  caseId: string | null,
  feedbackId: string | null,
  conversationId: string | null = null,
) {
  const params = new URLSearchParams();
  params.set('workspace', workspace);
  if (workspace === 'inbox') {
    params.set('section', section === 'groups' ? 'groups' : 'chats');
    if (conversationId) params.set('conversation', conversationId);
  } else if (workspace === 'settings') {
    params.set('section', parseSettingsSection(section));
  }
  if (workspace === 'cases' && caseId) params.set('id', caseId);
  if (workspace === 'feedback' && feedbackId) params.set('feedbackId', feedbackId);
  return `/dashboard/office?${params.toString()}`;
}

export function OfficeProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [summary, setSummary] = useState<DeskSummary | null>(null);
  const [duty, setDuty] = useState<DutySnapshot | null>(null);
  const [deskPayload, setDeskPayload] = useState<OfficeDeskPayload | null>(null);
  const [snapshotMeta, setSnapshotMeta] = useState<OfficeSnapshotMeta>(EMPTY_SNAPSHOT_META);
  const [revision, setRevision] = useState(0);
  const [lastChange, setLastChange] = useState<OfficeChangeDomain | null>(null);
  const refreshing = useRef(false);
  const hadSummary = useRef(false);

  const workspace = parseOfficeWorkspace(searchParams.get('workspace'));
  const rawSection = searchParams.get('section');
  const caseId = workspace === 'cases' ? searchParams.get('id') : null;
  const feedbackId = workspace === 'feedback' ? searchParams.get('feedbackId') : null;
  const conversationId = workspace === 'inbox' ? searchParams.get('conversation') : null;

  const section = useMemo(() => {
    if (workspace === 'inbox') return parseInboxSection(rawSection);
    if (workspace === 'settings') return parseSettingsSection(rawSection);
    return null;
  }, [workspace, rawSection]);

  const navigate = useCallback(
    (
      nextWorkspace: OfficeWorkspace,
      nextSection: InboxSection | SettingsSection | null,
      nextCaseId: string | null,
      nextFeedbackId: string | null,
      nextConversationId: string | null = null,
    ) => {
      router.replace(
        buildOfficeUrl(nextWorkspace, nextSection, nextCaseId, nextFeedbackId, nextConversationId),
        { scroll: false },
      );
    },
    [router],
  );

  const refreshSnapshot = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    setSnapshotMeta((prev) => ({ ...prev, refreshing: true }));
    let deskOk = false;
    let dutyOk = false;
    try {
      const [deskRes, dutyRes] = await Promise.all([
        fetch('/api/admin/office-desk', { cache: 'no-store' }),
        fetch('/api/admin/operations-duty', { cache: 'no-store' }),
      ]);
      if (deskRes.ok) {
        const json = await deskRes.json();
        if (json.summary) {
          setSummary(json.summary);
          hadSummary.current = true;
        }
        if (json.summary && Array.isArray(json.attention) && Array.isArray(json.activity)) {
          setDeskPayload({
            summary: json.summary,
            attention: json.attention,
            activity: json.activity,
            viewerId: json.viewerId ?? null,
          });
        }
        deskOk = true;
      }
      if (dutyRes.ok) {
        const json = await dutyRes.json();
        const board = json.data;
        setDuty({
          primaryName: board?.selected?.fullName ?? null,
          primaryId: board?.selected?.id ?? null,
          available: Number(board?.available ?? 0),
          totalEligible: Number(board?.totalEligible ?? 0),
        });
        dutyOk = true;
      }

      const refreshedAt = new Date().toISOString();
      if (deskOk || dutyOk) {
        setSnapshotMeta({
          loading: false,
          refreshing: false,
          lastUpdatedAt: refreshedAt,
          stale: !deskOk && hadSummary.current,
          error: !deskOk && hadSummary.current ? 'Desk summary could not be refreshed.' : null,
        });
      } else if (hadSummary.current) {
        setSnapshotMeta((prev) => ({
          ...prev,
          loading: false,
          refreshing: false,
          stale: true,
          error: 'Office summary refresh failed — counts may be outdated.',
        }));
      } else {
        setSnapshotMeta({
          loading: false,
          refreshing: false,
          lastUpdatedAt: null,
          stale: false,
          error: 'Office summary could not be loaded.',
        });
      }
    } catch {
      setSnapshotMeta((prev) => ({
        ...prev,
        loading: false,
        refreshing: false,
        stale: hadSummary.current,
        error: hadSummary.current
          ? 'Office summary refresh failed — counts may be outdated.'
          : 'Office summary could not be loaded.',
      }));
    } finally {
      refreshing.current = false;
    }
  }, []);

  useEffect(() => {
    void refreshSnapshot();
  }, [refreshSnapshot]);

  const notifyOfficeChange = useCallback(
    (domain: OfficeChangeDomain) => {
      setLastChange(domain);
      setRevision((n) => n + 1);
      if (
        domain === 'cases' ||
        domain === 'duty' ||
        domain === 'health' ||
        domain === 'settings' ||
        domain === 'desk' ||
        domain === 'feedback' ||
        domain === 'inbox'
      ) {
        void refreshSnapshot();
      }
    },
    [refreshSnapshot],
  );

  const setWorkspace = useCallback(
    (next: OfficeWorkspace, nextSection: InboxSection | SettingsSection | null = null) => {
      let resolved: InboxSection | SettingsSection | null = null;
      if (next === 'inbox') resolved = parseInboxSection(nextSection);
      else if (next === 'settings') resolved = parseSettingsSection(nextSection);
      navigate(
        next,
        resolved,
        next === 'cases' ? caseId : null,
        next === 'feedback' ? feedbackId : null,
        next === 'inbox' ? conversationId : null,
      );
    },
    [navigate, caseId, feedbackId, conversationId],
  );

  const openCase = useCallback(
    (id: string) => {
      navigate('cases', null, id, null);
    },
    [navigate],
  );

  const openFeedback = useCallback(
    (id: string) => {
      navigate('feedback', null, null, id);
    },
    [navigate],
  );

  const clearCase = useCallback(() => {
    navigate('cases', null, null, null);
  }, [navigate]);

  const clearFeedback = useCallback(() => {
    navigate('feedback', null, null, null);
  }, [navigate]);

  const followOfficeLink = useCallback(
    (href: string | null | undefined) => {
      const target = resolveOfficeTarget(href);
      if (!target) return false;
      if (target.caseId) {
        openCase(target.caseId);
        return true;
      }
      if (target.feedbackId) {
        openFeedback(target.feedbackId);
        return true;
      }
      if (target.workspace === 'inbox' && target.conversationId) {
        navigate('inbox', target.section ?? 'chats', null, null, target.conversationId);
        return true;
      }
      setWorkspace(target.workspace, target.section ?? null);
      return true;
    },
    [navigate, openCase, openFeedback, setWorkspace],
  );

  const value = useMemo(
    () => ({
      workspace,
      section,
      caseId,
      feedbackId,
      summary,
      duty,
      deskPayload,
      snapshotMeta,
      revision,
      lastChange,
      setSummary,
      setDuty,
      refreshSnapshot,
      notifyOfficeChange,
      setWorkspace,
      openCase,
      openFeedback,
      clearCase,
      clearFeedback,
      followOfficeLink,
    }),
    [
      workspace,
      section,
      caseId,
      feedbackId,
      summary,
      duty,
      deskPayload,
      snapshotMeta,
      revision,
      lastChange,
      refreshSnapshot,
      notifyOfficeChange,
      setWorkspace,
      openCase,
      openFeedback,
      clearCase,
      clearFeedback,
      followOfficeLink,
    ],
  );

  return <OfficeContext.Provider value={value}>{children}</OfficeContext.Provider>;
}

export function useOffice() {
  const ctx = useContext(OfficeContext);
  if (!ctx) throw new Error('useOffice must be used inside OfficeProvider');
  return ctx;
}

/** Safe optional hook for panels that may also render outside the shell. */
export function useOfficeOptional() {
  return useContext(OfficeContext);
}
