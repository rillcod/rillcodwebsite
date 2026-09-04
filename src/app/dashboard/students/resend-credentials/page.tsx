'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';
import {
  EnvelopeIcon, KeyIcon, ArrowPathIcon, CheckCircleIcon,
  XCircleIcon, MagnifyingGlassIcon, UserGroupIcon, BoltIcon,
  ClockIcon, BuildingOfficeIcon, ExclamationTriangleIcon,
  ChevronLeftIcon, FunnelIcon, ShieldCheckIcon, BanknotesIcon,
  DocumentTextIcon, EyeIcon, XMarkIcon, PaperAirplaneIcon, ChatBubbleLeftRightIcon,
} from '@/lib/icons';
import { isSpecialEnrollment, normalizeEnrollmentType } from '@/lib/registration/enrollment-types';
import { fetchActionJson } from '@/lib/async-timeout';
import { useSearchParams } from 'next/navigation';

interface CredentialStatus {
  status: string | null; // 'created' | 'sent' | 'failed'
  created_at: string | null;
}

interface StudentRow {
  id: string;
  full_name: string | null;
  student_email: string | null;
  parent_email: string | null;
  school_name: string | null;
  status: string | null;
  enrollment_type: string | null;
  user_id: string | null;
  created_at: string | null;
  credEmail?: CredentialStatus | null;
}

type FilterType = 'all' | 'not_activated' | 'activated';
type DispatchAction = 'activate' | 'resend' | 'whatsapp' | 'receipt' | 'balance';

interface DispatchModalState {
  isOpen: boolean;
  action: DispatchAction;
  student: StudentRow;
  result?: {
    success: boolean;
    message: string;
    studentEmail?: string;
    studentPassword?: string;
    parentEmail?: string;
    parentPassword?: string;
    destinationEmail?: string;
    via?: string;
    sentAt: string;
  } | null;
}

export default function ResendCredentialsPage() {
  const { profile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>(
    searchParams.get('filter') === 'not_activated' || searchParams.get('filter') === 'activated'
      ? searchParams.get('filter') as FilterType
      : 'all',
  );
  const [enrollType, setEnrollType] = useState<string>('all');
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [bulkRunning, setBulkRunning] = useState(false);
  const [sendingReceipt, setSendingReceipt] = useState<Record<string, boolean>>({});
  const [sendingBalance, setSendingBalance] = useState<Record<string, boolean>>({});
  const [sendingWa, setSendingWa] = useState<Record<string, boolean>>({});
  const [dispatchModal, setDispatchModal] = useState<DispatchModalState | null>(null);
  const [dispatching, setDispatching] = useState(false);

  // Ask the server to deliver existing credentials. Passwords never cross the
  // listing API or enter the page DOM; the server resolves the authorised student.
  const handleWhatsApp = async (s: StudentRow) => {
    setSendingWa(p => ({ ...p, [s.id]: true }));
    try {
      const res = await fetch('/api/students/send-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: s.id }),
      });
      const j = await res.json();
      if (!res.ok) { alert(j.error || 'Failed to send'); return; }
      const via = [j.whatsapp ? 'WhatsApp' : null, j.email ? 'Email' : null].filter(Boolean).join(' + ');
      alert(via ? `Login sent securely via ${via}.` : 'Login sent securely.');
    } catch { alert('Failed to send'); } finally {
      setSendingWa(p => ({ ...p, [s.id]: false }));
    }
  };
  const [lastCreatedCredentials, setLastCreatedCredentials] = useState<{
    studentId?: string;
    studentName: string;
    studentEmail: string;
    studentPassword?: string;
    parentEmail?: string;
    parentPassword?: string;
  } | null>(null);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';
  const isAdmin = profile?.role === 'admin';
  const [repairing, setRepairing] = useState(false);
  const [migratingParents, setMigratingParents] = useState(false);
  const [mergingDupes, setMergingDupes] = useState(false);
  const [health, setHealth] = useState<Record<string, number> | null>(null);
  const [healthError, setHealthError] = useState('');

  useEffect(() => {
    const requested = searchParams.get('filter');
    if (requested === 'not_activated' || requested === 'activated') setFilter(requested);
  }, [searchParams]);

  const loadHealth = useCallback(async () => {
    setHealthError('');
    try {
      const { response, data } = await fetchActionJson<{ health: Record<string, number>; error: string }>('/api/admin/onboarding-health');
      if (!response.ok || !data.health) throw new Error('Onboarding health is temporarily unavailable.');
      setHealth(data.health);
    } catch (error) {
      console.warn('[onboarding-health] dashboard load failed:', error);
      setHealthError('Onboarding health is temporarily unavailable. Retry to confirm there are no blocked families.');
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Scoped server API (service role, role-aware) — never depends on client-side RLS, and
      // it enriches + chunks server-side so the page can't hang on an oversized query.
      const res = await fetch('/api/students/credentials-list', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) {
        toast.error('Failed to load students: ' + (json.error || res.statusText));
        return;
      }
      setStudents((json.students ?? []) as StudentRow[]);
    } catch (e: any) {
      toast.error('Failed to load students: ' + (e?.message || 'unexpected error'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isStaff) load();
    if (!authLoading && isAdmin) loadHealth();
  }, [authLoading, isStaff, isAdmin, load, loadHealth]);

  const visibleStudents = students.filter(s => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      (s.full_name ?? '').toLowerCase().includes(q) ||
      (s.student_email ?? '').toLowerCase().includes(q) ||
      (s.parent_email ?? '').toLowerCase().includes(q) ||
      (s.school_name ?? '').toLowerCase().includes(q);
    const matchesFilter =
      filter === 'all' ||
      (filter === 'not_activated' && !s.user_id) ||
      (filter === 'activated' && !!s.user_id);
    const matchesEnroll =
      enrollType === 'all' ||
      normalizeEnrollmentType(s.enrollment_type) === enrollType;
    return matchesSearch && matchesFilter && matchesEnroll;
  });

  const notActivatedCount = students.filter(s => !s.user_id).length;
  const activatedCount = students.filter(s => !!s.user_id).length;

  async function executeDispatch(modalState: DispatchModalState) {
    const { action, student } = modalState;
    setDispatching(true);
    try {
      const destEmail = student.parent_email || student.student_email || 'recipient';
      if (action === 'activate' || action === 'resend') {
        const forceResend = action === 'resend';
        const res = await fetch('/api/students/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId: student.id, forceResend }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to dispatch credentials');
        
        const successMsg = data.message || (forceResend ? 'Credentials reset and delivered' : 'Account activated and credentials sent');
        toast.success(successMsg);
        setDone(p => ({ ...p, [student.id]: true }));
        
        setDispatchModal({
          ...modalState,
          result: {
            success: true,
            message: successMsg,
            studentEmail: data.email,
            studentPassword: data.tempPassword,
            parentEmail: data.parentLogin?.email,
            parentPassword: data.parentLogin?.password,
            destinationEmail: destEmail,
            sentAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        });
        await load();
      } else if (action === 'whatsapp') {
        const res = await fetch('/api/students/send-credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId: student.id }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || 'Failed to dispatch credentials');
        const via = [j.whatsapp ? 'WhatsApp' : null, j.email ? 'Email' : null].filter(Boolean).join(' + ') || 'Email';
        const successMsg = `Login sent securely via ${via}.`;
        toast.success(successMsg);
        setDone(p => ({ ...p, [student.id]: true }));
        setDispatchModal({
          ...modalState,
          result: {
            success: true,
            message: successMsg,
            destinationEmail: destEmail,
            via,
            sentAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        });
        await load();
      } else if (action === 'receipt') {
        const res = await fetch('/api/students/send-receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId: student.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to send receipt');
        const successMsg = data.message || 'Payment receipt sent successfully';
        toast.success(successMsg);
        setDispatchModal({
          ...modalState,
          result: {
            success: true,
            message: successMsg,
            destinationEmail: destEmail,
            sentAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        });
      } else if (action === 'balance') {
        const res = await fetch('/api/students/send-balance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId: student.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to send balance reminder');
        const successMsg = data.message || 'Outstanding balance reminder sent successfully';
        toast.success(successMsg);
        setDispatchModal({
          ...modalState,
          result: {
            success: true,
            message: successMsg,
            destinationEmail: destEmail,
            sentAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        });
      }
    } catch (err: any) {
      toast.error(err?.message || 'Something went wrong');
    } finally {
      setDispatching(false);
    }
  }

  async function handleSend(studentId: string, forceResend: boolean) {
    setSending(p => ({ ...p, [studentId]: true }));
    try {
      const sObj = students.find(s => s.id === studentId);
      const res = await fetch('/api/students/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, forceResend }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      
      setLastCreatedCredentials({
        studentId,
        studentName: sObj?.full_name || 'Student',
        studentEmail: data.email,
        studentPassword: data.tempPassword,
        parentEmail: data.parentLogin?.email,
        parentPassword: data.parentLogin?.password,
      });

      toast.success(data.message || (forceResend ? 'Credentials resent' : 'Account activated and credentials sent'));
      setDone(p => ({ ...p, [studentId]: true }));
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
    } finally {
      setSending(p => ({ ...p, [studentId]: false }));
    }
  }

  async function handleSendReceipt(studentId: string) {
    setSendingReceipt(p => ({ ...p, [studentId]: true }));
    try {
      const res = await fetch('/api/students/send-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send receipt');
      toast.success(data.message || 'Payment receipt sent successfully');
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
    } finally {
      setSendingReceipt(p => ({ ...p, [studentId]: false }));
    }
  }

  async function handleSendBalance(studentId: string) {
    setSendingBalance(p => ({ ...p, [studentId]: true }));
    try {
      const res = await fetch('/api/students/send-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send balance reminder');
      toast.success(data.message || 'Outstanding balance reminder sent successfully');
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
    } finally {
      setSendingBalance(p => ({ ...p, [studentId]: false }));
    }
  }

  async function handleBulkActivate() {
    const targets = visibleStudents.filter(s => !s.user_id);
    if (targets.length === 0) {
      toast.info('No unactivated students in current view');
      return;
    }
    if (!confirm(`Activate ${targets.length} student(s) and send login credentials?`)) return;
    setBulkRunning(true);
    let ok = 0;
    let fail = 0;
    for (const s of targets) {
      try {
        const res = await fetch('/api/students/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId: s.id, forceResend: false }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        ok++;
        setDone(p => ({ ...p, [s.id]: true }));
      } catch {
        fail++;
      }
    }
    setBulkRunning(false);
    toast.success(`Done — ${ok} activated${fail > 0 ? `, ${fail} failed (check individually)` : ''}`);
    await load();
  }

  async function handleRepair() {
    setRepairing(true);
    try {
      // 1. Dry run to preview the impact.
      const previewRes = await fetch('/api/admin/backfill-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      });
      const preview = await previewRes.json();
      if (!previewRes.ok) throw new Error(preview.error || 'Preview failed');

      const r = preview.report;
      const dupMoved = (r.duplicateSchoolsMerged ?? []).reduce(
        (acc: number, d: any) => acc + (d.studentsMoved || 0) + (d.usersMoved || 0), 0,
      );
      const confirmMsg =
        `Repair onboarding for existing records?\n\n` +
        `• Canonical school: ${preview.canonicalSchoolName}\n` +
        `• Duplicate online schools to merge: ${(r.duplicateSchoolsMerged ?? []).length} (${dupMoved} records repointed)\n` +
        `• School-less students to fix: ${r.schoollessStudentsFixed}\n` +
        `• Students to enrol into a learning path: ${r.studentsEnrolled}\n` +
        `• Summer students to assign a class: ${r.summerClassesAssigned}\n` +
        `• Parent accounts to create: ${r.parentAccountsCreated} · parent↔child links: ${r.parentLinksCreated}\n` +
        `${r.legacyCollisionsSkipped ? `• Legacy shared-email students skipped (need full re-onboard): ${r.legacyCollisionsSkipped}\n` : ''}` +
        `\nProceed?`;
      if (!confirm(confirmMsg)) { setRepairing(false); return; }

      // 2. Apply for real.
      const res = await fetch('/api/admin/backfill-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Repair failed');
      const dr = data.report;
      if (data.partial) {
        toast.error(
          `Repair partially completed. ${dr.errors?.length ?? 0} item(s) still need attention.`,
          { duration: 10000 },
        );
        await load();
        return;
      }
      toast.success(
        `Repair done — ${(dr.duplicateSchoolsMerged ?? []).length} school(s) merged, ` +
        `${dr.schoollessStudentsFixed} school-less fixed, ${dr.studentsEnrolled} enrolled, ` +
        `${dr.summerClassesAssigned} class(es) assigned, ${dr.parentLinksCreated} parent link(s).`,
        { duration: 7000 },
      );
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Repair failed');
    } finally {
      setRepairing(false);
    }
  }

  async function handleMigrateParents() {
    setMigratingParents(true);
    try {
      const previewRes = await fetch('/api/admin/migrate-legacy-parents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      });
      const preview = await previewRes.json();
      if (!previewRes.ok) throw new Error(preview.error || 'Preview failed');
      const n = preview.report?.candidates ?? 0;
      if (n === 0) { toast.info('No legacy single-account parents found.'); setMigratingParents(false); return; }
      if (!confirm(`Split ${n} legacy single-account record(s) into separate parent + student accounts?\n\nEach student keeps a new @rillcod.com login and a parent account is created on the original email, then linked. Proceed?`)) {
        setMigratingParents(false); return;
      }
      const res = await fetch('/api/admin/migrate-legacy-parents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Migration failed');
      if (data.partial) {
        toast.error(
          `Migrated ${data.report?.migrated ?? 0} pair(s), but ${data.report?.skipped ?? 0} record(s) still need attention.`,
          { duration: 10000 },
        );
        await load();
        await loadHealth();
        return;
      }
      toast.success(`Migrated ${data.report?.migrated ?? 0} parent/student pair(s)${data.report?.skipped ? `, ${data.report.skipped} skipped` : ''}.`, { duration: 7000 });
      await load();
      await loadHealth();
    } catch (err: any) {
      toast.error(err.message || 'Migration failed');
    } finally {
      setMigratingParents(false);
    }
  }

  async function handleMergeDuplicates() {
    setMergingDupes(true);
    try {
      const previewRes = await fetch('/api/admin/merge-duplicate-students', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      });
      const preview = await previewRes.json();
      if (!previewRes.ok) throw new Error(preview.error || 'Preview failed');
      if ((preview.duplicateGroups ?? 0) === 0) { toast.info('No duplicate students found — all clean.'); setMergingDupes(false); return; }
      if (!confirm(`Merge ${preview.duplicateRows} duplicate student record(s) across ${preview.duplicateGroups} child(ren)?\n\nThe oldest account is kept; submissions, attendance, grades and parent links are repointed onto it; extra logins are deactivated; duplicate rows are removed. Proceed?`)) {
        setMergingDupes(false); return;
      }
      const res = await fetch('/api/admin/merge-duplicate-students', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Merge failed');
      if (data.partial) {
        toast.error(
          `Merged ${data.merged ?? 0} duplicate(s), but ${data.errors?.length ?? 0} item(s) still need attention.`,
          { duration: 10000 },
        );
        await load();
        return;
      }
      toast.success(`Merged ${data.merged} duplicate(s) across ${data.duplicateGroups} child(ren); ${data.loginsDeactivated} extra login(s) deactivated.`, { duration: 7000 });
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Merge failed');
    } finally {
      setMergingDupes(false);
    }
  }

  if (authLoading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] mobile-page-root">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 mobile-page-root">
        <ExclamationTriangleIcon className="w-12 h-12 text-rose-600 dark:text-rose-400" />
        <p className="text-foreground font-semibold text-lg">Admin or teacher access required</p>
        <Link href="/dashboard" className="text-violet-600 dark:text-violet-400 hover:underline text-sm">Back to dashboard</Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6 mobile-page-root">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/dashboard/students" className="text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeftIcon className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl font-bold text-foreground">Resend Login Credentials</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Activate unactivated students or resend login credentials to those who didn't receive them.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <button
              onClick={handleRepair}
              disabled={repairing}
              title="Merge duplicate online schools, attach school-less students, and enrol students with no learning path"
              className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 border border-border disabled:opacity-50 text-foreground rounded-xl text-sm font-semibold transition-colors"
            >
              {repairing ? (
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
              ) : (
                <ShieldCheckIcon className="w-4 h-4" />
              )}
              Repair Onboarding
            </button>
          )}
          {isAdmin && (
            <button
              onClick={handleMigrateParents}
              disabled={migratingParents}
              title="Split legacy single-account records (login was the parent's email) into separate parent + student accounts and link them"
              className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 border border-border disabled:opacity-50 text-foreground rounded-xl text-sm font-semibold transition-colors"
            >
              {migratingParents ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <UserGroupIcon className="w-4 h-4" />}
              Fix Legacy Parents
            </button>
          )}
          {isAdmin && (
            <button
              onClick={handleMergeDuplicates}
              disabled={mergingDupes}
              title="Merge duplicate student records (same child appearing twice) into one, repointing all their data"
              className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 border border-border disabled:opacity-50 text-foreground rounded-xl text-sm font-semibold transition-colors"
            >
              {mergingDupes ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <UserGroupIcon className="w-4 h-4" />}
              Merge Duplicates
            </button>
          )}
          <button
            onClick={handleBulkActivate}
            disabled={bulkRunning || notActivatedCount === 0}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            {bulkRunning ? (
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
            ) : (
              <BoltIcon className="w-4 h-4" />
            )}
            Activate All Unactivated ({notActivatedCount})
          </button>
        </div>
      </div>

      {/* Onboarding Health worklist (admin) */}
      {isAdmin && health && (
        <div className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheckIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Onboarding Health</h2>
            {Object.values(health).reduce((a, b) => a + b, 0) === 0 && (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold"><CheckCircleIcon className="w-3.5 h-3.5" /> All clear</span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
            {([
              ['awaitingVerification', 'Awaiting verify', '/dashboard/prospective-students'],
              ['unonboardedPaid', 'Paid, not onboarded', '/dashboard/students/resend-credentials?filter=not_activated'],
              ['termPaidNotOnboarded', 'Term paid, pending', '/dashboard/students/resend-credentials?filter=not_activated'],
              ['failedEmails', 'Failed emails', '/dashboard/students/resend-credentials?filter=not_activated'],
              ['studentsNoClass', 'No class', '/dashboard/students'],
              ['consentPendingReview', 'Consent review', '/dashboard/consent-forms?view=needs_review'],
              ['claimDeliveryFailures24h', 'Code failed (24h)', '/dashboard/parent-claims?tab=audit&action=code_delivery_failed'],
              ['claimCompletionFailures24h', 'Claim failed (24h)', '/dashboard/parent-claims?tab=audit&action=completion_failed'],
              ['parentsZeroChildren', 'Parents 0 kids', '/dashboard/parent-claims?tab=unlinked'],
              ['legacyCollisions', 'Legacy accounts', '/dashboard/parent-claims?tab=links'],
              ['paymentsNoReceipt', 'No receipt', '/dashboard/finance?workspace=collections&ops=approvals'],
              ['duplicatePaymentInvoices', 'Duplicate invoices', '/dashboard/finance?workspace=invoices&ops=invoices'],
            ] as [string, string, string][]).map(([key, label, href]) => {
              const v = health[key] ?? 0;
              return (
                <Link
                  key={key}
                  href={href}
                  aria-label={`${label}: ${v}. Open worklist`}
                  className={`rounded-xl border p-3 text-center transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${v > 0 ? 'border-amber-500/30 bg-amber-500/10' : 'border-border bg-muted/20'}`}
                >
                  <div className={`text-xl font-black ${v > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>{v}</div>
                  <div className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{label}</div>
                </Link>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Paid onboarding and credential gaps are retried by the scheduled sweep. Consent reviews and recent claim failures remain visible for staff action instead of silently blocking families.</p>
        </div>
      )}

      {isAdmin && healthError && (
        <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <span>{healthError}</span>
          <button type="button" onClick={() => void loadHealth()} className="px-4 py-2 rounded-xl border border-rose-500/30 text-xs font-black uppercase tracking-widest hover:bg-rose-500/10">Retry health check</button>
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 shadow-xl text-center">
          <div className="text-2xl font-black text-foreground">{students.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Total Approved</div>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{activatedCount}</div>
          <div className="text-xs text-muted-foreground mt-1">Portal Accounts Created</div>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400">{notActivatedCount}</div>
          <div className="text-xs text-muted-foreground mt-1">Awaiting Activation</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 shadow-xl flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input aria-label="Search students"
            type="text"
            placeholder="Search name, email, school…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-violet-500"
          />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {(['all', 'not_activated', 'activated'] as FilterType[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                filter === f
                  ? 'bg-violet-600 text-white'
                  : 'bg-muted/40 text-muted-foreground hover:text-foreground border border-border'
              }`}
            >
              {f === 'not_activated' ? 'Not Activated' : f === 'activated' ? 'Activated' : 'All'}
            </button>
          ))}
        </div>
        <select
          value={enrollType}
          onChange={e => setEnrollType(e.target.value)}
          className="px-3 py-1.5 bg-card border border-border rounded-xl text-xs text-foreground focus:outline-none focus:border-violet-500"
        >
          <option value="all">All Types</option>
          <option value="school">Partner School</option>
          <option value="in_person">In-Person</option>
          <option value="online">Online</option>
          <option value="special">Special Programme</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : visibleStudents.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <UserGroupIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No students match your filters.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Student</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Parent Email (recipient)</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">School</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Portal</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email Delivery</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleStudents.map(s => {
                  const contactEmail = s.parent_email || s.student_email || '—';
                  const isActivated = !!s.user_id;
                  const isSending = sending[s.id];
                  const isDone = done[s.id];
                  const enrollLabel: Record<string, string> = {
                    school: 'Partner School',
                    in_person: 'In-Person',
                    online: 'Online',
                    special: 'Special Programme',
                    summer_school: 'Special Programme',
                    bootcamp: 'Special Programme',
                  };
                  return (
                    <tr key={s.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-foreground flex items-center gap-1.5 flex-wrap">
                          <span>{s.full_name}</span>
                          {s.status === 'paid' && (
                            <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded">
                              Full Paid
                            </span>
                          )}
                          {s.status === 'partially_paid' && (
                            <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded">
                              Installment
                            </span>
                          )}
                          {s.status === 'approved' && (
                            <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 rounded">
                              Approved
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {s.created_at ? new Date(s.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-2">
                          <div>
                            <div className="text-[9px] uppercase font-bold text-muted-foreground/60 tracking-wider">Student Login</div>
                            <div className="text-xs font-semibold text-foreground truncate max-w-[200px]">{s.student_email || '—'}</div>
                          </div>
                          {s.parent_email && (
                            <div>
                              <div className="text-[9px] uppercase font-bold text-muted-foreground/60 tracking-wider">Parent Login</div>
                              <div className="text-xs font-semibold text-foreground truncate max-w-[200px]">{s.parent_email || '—'}</div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                          <BuildingOfficeIcon className="w-3.5 h-3.5 flex-shrink-0" />
                          {s.school_name || 'Unassigned'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
                          isSpecialEnrollment(s.enrollment_type)
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                            : s.enrollment_type === 'online'
                            ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30'
                            : 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30'
                        }`}>
                          {enrollLabel[s.enrollment_type ?? 'in_person'] ?? (s.enrollment_type || 'In-Person')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isActivated ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                            <CheckCircleIcon className="w-4 h-4" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs font-semibold">
                            <ClockIcon className="w-4 h-4" /> Not activated
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {s.credEmail ? (
                          s.credEmail.status === 'sent' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                              <CheckCircleIcon className="w-3.5 h-3.5" /> Delivered
                            </span>
                          ) : s.credEmail.status === 'failed' ? (
                            <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 text-xs font-semibold" title="Email delivery failed — resend below">
                              <XCircleIcon className="w-3.5 h-3.5" /> Failed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs font-semibold">
                              <ClockIcon className="w-3.5 h-3.5" /> Pending
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Receipt Resend Button */}
                          {isSpecialEnrollment(s.enrollment_type) && (
                            <button
                              type="button"
                              onClick={() => setDispatchModal({ isOpen: true, action: 'receipt', student: s, result: null })}
                              title="Preview and send payment receipt email"
                              className="inline-flex items-center justify-center p-1.5 bg-muted hover:bg-emerald-600/20 border border-border hover:border-emerald-500/40 text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg transition-colors disabled:opacity-50"
                            >
                              <DocumentTextIcon className="w-4.5 h-4.5" />
                            </button>
                          )}

                          {/* Outstanding Tuition Reminder Button */}
                          {isSpecialEnrollment(s.enrollment_type) && (
                            <button
                              type="button"
                              onClick={() => setDispatchModal({ isOpen: true, action: 'balance', student: s, result: null })}
                              title="Preview and send tuition balance reminder email"
                              className="inline-flex items-center justify-center p-1.5 bg-muted hover:bg-amber-600/20 border border-border hover:border-amber-500/40 text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 rounded-lg transition-colors disabled:opacity-50"
                            >
                              <BanknotesIcon className="w-4.5 h-4.5" />
                            </button>
                          )}

                          {/* Credentials View Button */}
                          {isActivated && (
                            <button
                              type="button"
                              onClick={() => setLastCreatedCredentials({
                                studentId: s.id,
                                studentName: s.full_name || 'Student',
                                studentEmail: s.student_email || '',
                                parentEmail: s.parent_email || undefined,
                              })}
                              title="View parent and student account details"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-muted/80 border border-border text-foreground rounded-lg text-xs font-semibold transition-colors"
                            >
                              <EyeIcon className="w-3.5 h-3.5" /> View
                            </button>
                          )}
                          {isActivated && !!s.parent_email && (
                            <button
                              type="button"
                              onClick={() => setDispatchModal({ isOpen: true, action: 'whatsapp', student: s, result: null })}
                              title="Preview and securely send login by WhatsApp and email"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-emerald-600/20 border border-border hover:border-emerald-500/40 text-foreground rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                            >
                              <ChatBubbleLeftRightIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                              <span>WhatsApp</span>
                            </button>
                          )}
                          {isDone ? (
                            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold px-2">Sent</span>
                          ) : isActivated ? (
                            <button
                              type="button"
                              onClick={() => setDispatchModal({ isOpen: true, action: 'resend', student: s, result: null })}
                              title="Preview, reset password and resend credentials email"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-violet-600/20 border border-border hover:border-violet-500/40 text-foreground rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                            >
                              <EnvelopeIcon className="w-3.5 h-3.5" />
                              <span>Resend</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDispatchModal({ isOpen: true, action: 'activate', student: s, result: null })}
                              title="Preview, create portal account and send login credentials"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                            >
                              <KeyIcon className="w-3.5 h-3.5" />
                              <span>Activate</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
            Showing {visibleStudents.length} of {students.length} approved students
          </div>
        </div>
      )}

      {/* Help note */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 text-sm text-blue-700 dark:text-blue-300">
        <strong className="text-blue-800 dark:text-blue-200">Which button shows depends on the student's state:</strong>{' '}
        <span className="text-muted-foreground">
          <strong className="text-emerald-600 dark:text-emerald-400">Activate</strong> appears only for students with <em>no portal account yet</em> — it creates the <span className="text-foreground font-mono">@rillcod.com</span> login + temp password and emails it.{' '}
          Once a student is activated you'll instead see <strong className="text-foreground">View</strong> (see account usernames without exposing passwords) and <strong className="text-foreground">Resend</strong> (reset the password &amp; re-email both logins).{' '}
          So if you don't see "Activate", that student is <strong className="text-blue-800 dark:text-blue-200">already activated</strong> — nothing is lacking; use View or Resend.{' '}
          The emailed credentials include <strong className="text-blue-800 dark:text-blue-200">both parent and student logins</strong>. Students are auto-assigned to a school + class if none is on record.{' '}
          "Activate All Unactivated" ({notActivatedCount}) processes every not-yet-activated student in one go.
        </span>
      </div>

      {/* Copyable Credentials Modal */}
      {lastCreatedCredentials && (
        <div className="fixed inset-0 bg-foreground/35 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-4 z-50 animate-fade-in">
          <div role="dialog" aria-modal="true" className="bg-card border border-border rounded-2xl max-w-md w-full p-4 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto mobile-page-root">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-lg font-black text-foreground">Login Details — {lastCreatedCredentials.studentName}</h3>
              <button
                onClick={() => setLastCreatedCredentials(null)}
                className="text-muted-foreground hover:text-foreground text-sm font-semibold transition-colors"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Parent and student account details. Existing passwords are never displayed. Use "Resend" to issue and email a fresh temporary password.
            </p>

            <div className="space-y-3">
              <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-2 mobile-page-root">
                <p className="text-[10px] font-black uppercase tracking-widest text-violet-600 dark:text-violet-400">🎓 Student Account Details</p>
                <div className="text-xs space-y-1">
                  <p className="text-muted-foreground"><strong>Username / Email:</strong></p>
                  <p className="font-mono text-foreground select-all bg-background border border-border p-1.5 rounded break-all">{lastCreatedCredentials.studentEmail}</p>
                  <p className="text-muted-foreground mt-1"><strong>Temporary Password:</strong></p>
                  {lastCreatedCredentials.studentPassword ? (
                    <p className="font-mono text-amber-600 dark:text-amber-400 select-all bg-background border border-border p-1.5 rounded break-all">{lastCreatedCredentials.studentPassword}</p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground italic">Protected — use "Resend" to issue a fresh temporary password.</p>
                  )}
                </div>
              </div>

              {lastCreatedCredentials.parentEmail && (
                <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-2 mobile-page-root">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">👨‍👩‍👧 Parent Account Details</p>
                  <div className="text-xs space-y-1">
                    <p className="text-muted-foreground"><strong>Username / Email:</strong></p>
                    <p className="font-mono text-foreground select-all bg-background border border-border p-1.5 rounded break-all">{lastCreatedCredentials.parentEmail}</p>
                    <p className="text-muted-foreground mt-1"><strong>Temporary Password:</strong></p>
                    {lastCreatedCredentials.parentPassword ? (
                      <p className="font-mono text-amber-600 dark:text-amber-400 select-all bg-background border border-border p-1.5 rounded break-all">{lastCreatedCredentials.parentPassword}</p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground italic">Protected — use "Resend" to issue a fresh temporary password.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {(() => {
              const lc = lastCreatedCredentials;
              const buildText = () => {
                let txt = `Rillcod Technologies login details for ${lc.studentName}\n\n`;
                txt += `🎓 Student Portal:\nEmail: ${lc.studentEmail}${lc.studentPassword ? `\nPassword: ${lc.studentPassword}` : ''}\n\n`;
                if (lc.parentEmail) {
                  txt += `👨‍👩‍👧 Parent Portal:\nEmail: ${lc.parentEmail}${lc.parentPassword ? `\nPassword: ${lc.parentPassword}` : ''}\n`;
                }
                txt += `\nLog in: ${typeof window !== 'undefined' ? window.location.origin : 'https://www.rillcod.com'}/login`;
                return txt;
              };
              return (
                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(buildText())}`}
                    target="_blank" rel="noopener noreferrer"
                    className="px-4 py-2 bg-[#25D366] hover:brightness-110 text-foreground rounded-xl text-xs font-semibold transition-all"
                  >
                    Share on WhatsApp
                  </a>
                  <button
                    onClick={() => { navigator.clipboard.writeText(buildText()); toast.success('Login details copied'); }}
                    className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground border border-border rounded-xl text-xs font-semibold transition-colors"
                  >
                    Copy All
                  </button>
                  <button
                    onClick={() => { setLastCreatedCredentials(null); handleSend(lc.studentId ?? '', true); }}
                    disabled={!lc.studentId}
                    className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    Resend (reset & email)
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Interactive Dispatch & Preview Modal ── */}
      {dispatchModal && dispatchModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-4 z-50 animate-fade-in">
          <div role="dialog" aria-modal="true" className="bg-card border border-border rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-border pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl border ${
                  dispatchModal.action === 'activate' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' :
                  dispatchModal.action === 'resend' ? 'bg-violet-500/10 border-violet-500/30 text-violet-600 dark:text-violet-400' :
                  dispatchModal.action === 'whatsapp' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' :
                  dispatchModal.action === 'receipt' ? 'bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400' :
                  'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                }`}>
                  {dispatchModal.action === 'activate' ? <KeyIcon className="w-5 h-5" /> :
                   dispatchModal.action === 'resend' ? <ArrowPathIcon className="w-5 h-5" /> :
                   dispatchModal.action === 'whatsapp' ? <ChatBubbleLeftRightIcon className="w-5 h-5" /> :
                   dispatchModal.action === 'receipt' ? <DocumentTextIcon className="w-5 h-5" /> :
                   <BanknotesIcon className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-foreground">
                    {dispatchModal.action === 'activate' ? 'Activate Student & Send Login' :
                     dispatchModal.action === 'resend' ? 'Reset Password & Resend Login' :
                     dispatchModal.action === 'whatsapp' ? 'Dispatch Login via WhatsApp & Email' :
                     dispatchModal.action === 'receipt' ? 'Send Official Payment Receipt' :
                     'Send Tuition Balance Reminder'}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {dispatchModal.student.full_name} · {dispatchModal.student.school_name || 'Rillcod Academy'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDispatchModal(null)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Close"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Success state if already sent */}
            {dispatchModal.result ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircleIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-sm font-bold">{dispatchModal.result.message}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Delivered to <strong className="text-foreground">{dispatchModal.result.destinationEmail}</strong> at {dispatchModal.result.sentAt}.
                  </p>
                </div>

                {/* If credentials were generated, show copyable credentials */}
                {dispatchModal.result.studentEmail && (
                  <div className="bg-muted/30 border border-border rounded-xl p-3.5 space-y-2 text-xs">
                    <p className="text-[10px] font-black uppercase tracking-wider text-violet-600 dark:text-violet-400">Issued Login Credentials</p>
                    <div className="space-y-1">
                      <p className="text-muted-foreground">Student Login: <span className="font-mono font-bold text-foreground select-all">{dispatchModal.result.studentEmail}</span></p>
                      {dispatchModal.result.studentPassword && (
                        <p className="text-muted-foreground">Temporary Password: <span className="font-mono font-bold text-amber-600 dark:text-amber-400 select-all">{dispatchModal.result.studentPassword}</span></p>
                      )}
                      {dispatchModal.result.parentEmail && (
                        <p className="text-muted-foreground">Parent Login: <span className="font-mono font-bold text-foreground select-all">{dispatchModal.result.parentEmail}</span></p>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  {dispatchModal.result.studentEmail && (
                    <button
                      type="button"
                      onClick={() => {
                        const r = dispatchModal.result!;
                        let txt = `Rillcod Technologies login details for ${dispatchModal.student.full_name}\n\n`;
                        txt += `🎓 Student Portal:\nEmail: ${r.studentEmail}${r.studentPassword ? `\nPassword: ${r.studentPassword}` : ''}\n\n`;
                        if (r.parentEmail) {
                          txt += `👨‍👩‍👧 Parent Portal:\nEmail: ${r.parentEmail}${r.parentPassword ? `\nPassword: ${r.parentPassword}` : ''}\n`;
                        }
                        txt += `\nLog in: ${typeof window !== 'undefined' ? window.location.origin : 'https://www.rillcod.com'}/login`;
                        navigator.clipboard.writeText(txt);
                        toast.success('Login details copied to clipboard');
                      }}
                      className="px-3.5 py-2 rounded-xl border border-border bg-muted/40 hover:bg-muted text-xs font-bold text-foreground transition-colors"
                    >
                      Copy All Details
                    </button>
                  )}
                  {dispatchModal.result.studentEmail && (
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(
                        `Rillcod Technologies login details for ${dispatchModal.student.full_name}\n\n🎓 Student Portal:\nEmail: ${dispatchModal.result.studentEmail}${dispatchModal.result.studentPassword ? `\nPassword: ${dispatchModal.result.studentPassword}` : ''}\n\nLog in: https://www.rillcod.com/login`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-xl bg-[#25D366] hover:brightness-110 text-foreground text-xs font-bold transition-all inline-flex items-center gap-1.5"
                    >
                      Share on WhatsApp
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setDispatchModal(null)}
                    className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              /* Pre-send confirmation & live preview */
              <div className="space-y-3.5">
                {/* Routing info */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl border border-border bg-muted/20">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Recipient</p>
                    <p className="font-bold text-foreground truncate">{dispatchModal.student.full_name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{dispatchModal.student.school_name || 'School not set'}</p>
                  </div>
                  <div className="p-2.5 rounded-xl border border-border bg-muted/20">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Destination Email</p>
                    <p className="font-bold text-foreground truncate font-mono text-[11px]">
                      {dispatchModal.student.parent_email || dispatchModal.student.student_email || 'No email on file'}
                    </p>
                    <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-primary/10 text-primary">
                      {dispatchModal.student.parent_email ? 'Parent Inbox' : 'Student Inbox'}
                    </span>
                  </div>
                </div>

                {/* Impact Notice */}
                {dispatchModal.action === 'resend' && (
                  <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-300 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold">
                      <ExclamationTriangleIcon className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <span>Password Reset Confirmation</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Confirming will generate a <strong>fresh temporary password</strong>, update the database record, and deliver the new login details to the parent. Any previous password will be invalidated.
                    </p>
                  </div>
                )}
                {dispatchModal.action === 'activate' && (
                  <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-300 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold">
                      <BoltIcon className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span>New Account Creation</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      This will create a new <code className="text-foreground">@rillcod.com</code> portal account, link it to the parent profile, issue a digital student ID card, and email initial login credentials.
                    </p>
                  </div>
                )}

                {/* Email Live Preview Container */}
                <div className="border border-border rounded-xl overflow-hidden bg-background">
                  <div className="px-3.5 py-2 border-b border-border bg-muted/30 flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <EnvelopeIcon className="w-3.5 h-3.5 text-primary" />
                      <span>Live Message Preview</span>
                    </div>
                    <span className="text-[10px] font-bold text-muted-foreground/60 uppercase">support@rillcod.com</span>
                  </div>
                  <div className="p-3.5 space-y-2 text-xs">
                    <div className="border-b border-border/40 pb-2">
                      <p className="text-[11px] text-muted-foreground">
                        <strong className="text-foreground">Subject: </strong>
                        {dispatchModal.action === 'activate'
                          ? 'Your Rillcod Technologies Parent & Student Login Details'
                          : dispatchModal.action === 'resend'
                          ? 'Your Rillcod Technologies Parent & Student Login Details (Password Reset)'
                          : dispatchModal.action === 'whatsapp'
                          ? 'Your Rillcod Technologies Login Credentials'
                          : dispatchModal.action === 'receipt'
                          ? 'Payment Receipt — Rillcod Technologies'
                          : 'Outstanding Tuition Balance Reminder — Rillcod Technologies'}
                      </p>
                    </div>

                    <div className="space-y-1.5 text-muted-foreground text-[11px]">
                      <p>Dear Parent / Guardian of <strong className="text-foreground">{dispatchModal.student.full_name}</strong>,</p>
                      {dispatchModal.action === 'receipt' ? (
                        <p>Thank you for your confirmed payment. An official receipt has been issued and linked to your student's profile.</p>
                      ) : dispatchModal.action === 'balance' ? (
                        <p>This is a friendly reminder regarding the outstanding tuition balance for {dispatchModal.student.full_name}. Please check your parent portal to complete payment.</p>
                      ) : (
                        <>
                          <p>Below are the portal login details to access lessons, class materials, and track academic progress:</p>
                          <div className="p-2 rounded-lg bg-muted/40 border border-border space-y-1 font-mono text-[10px]">
                            <p>🎓 Student: <span className="text-foreground font-bold">{dispatchModal.student.student_email || 'student@rillcod.com'}</span></p>
                            <p>🔑 Password: <span className="text-amber-600 dark:text-amber-400 font-bold">[Generated temporary password]</span></p>
                            {dispatchModal.student.parent_email && (
                              <p>👨‍👩‍👧 Parent: <span className="text-foreground font-bold">{dispatchModal.student.parent_email}</span></p>
                            )}
                            <p>🌐 Login: <span className="text-primary font-bold">https://www.rillcod.com/login</span></p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                  <button
                    type="button"
                    disabled={dispatching}
                    onClick={() => setDispatchModal(null)}
                    className="px-4 py-2 rounded-xl border border-border bg-muted/30 hover:bg-muted text-xs font-bold text-foreground transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={dispatching}
                    onClick={() => executeDispatch(dispatchModal)}
                    className={`px-4 py-2 rounded-xl text-xs font-black transition-colors shadow-sm disabled:opacity-50 inline-flex items-center gap-1.5 ${
                      dispatchModal.action === 'activate'
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : dispatchModal.action === 'resend'
                        ? 'bg-violet-600 hover:bg-violet-500 text-white'
                        : dispatchModal.action === 'whatsapp'
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : 'bg-primary hover:bg-primary/90 text-primary-foreground'
                    }`}
                  >
                    {dispatching ? (
                      <>
                        <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <PaperAirplaneIcon className="w-3.5 h-3.5" />
                        <span>
                          {dispatchModal.action === 'activate' ? 'Confirm & Activate' :
                           dispatchModal.action === 'resend' ? 'Confirm & Resend' :
                           dispatchModal.action === 'whatsapp' ? 'Confirm & Send' :
                           'Confirm & Send Email'}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
