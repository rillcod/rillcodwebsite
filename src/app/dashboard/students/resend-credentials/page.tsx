'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  EnvelopeIcon, KeyIcon, ArrowPathIcon, CheckCircleIcon,
  XCircleIcon, MagnifyingGlassIcon, UserGroupIcon, BoltIcon,
  ClockIcon, BuildingOfficeIcon, ExclamationTriangleIcon,
  ChevronLeftIcon, FunnelIcon, ShieldCheckIcon, BanknotesIcon,
  DocumentTextIcon, EyeIcon,
} from '@/lib/icons';

interface CredentialStatus {
  status: string | null; // 'created' | 'sent' | 'failed'
  created_at: string | null;
  password?: string | null;
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
  parentCred?: CredentialStatus | null;
}

type FilterType = 'all' | 'not_activated' | 'activated';

export default function ResendCredentialsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [enrollType, setEnrollType] = useState<string>('all');
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [bulkRunning, setBulkRunning] = useState(false);
  const [sendingReceipt, setSendingReceipt] = useState<Record<string, boolean>>({});
  const [sendingBalance, setSendingBalance] = useState<Record<string, boolean>>({});
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

  const loadHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/onboarding-health');
      const data = await res.json();
      if (res.ok) setHealth(data.health);
    } catch { /* non-fatal */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const db = createClient();
    const { data, error } = await db
      .from('students')
      .select('id, full_name, student_email, parent_email, school_name, status, enrollment_type, user_id, created_at')
      .in('status', ['approved', 'paid', 'partially_paid'])
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load students: ' + error.message);
      setLoading(false);
      return;
    }

    const rows: StudentRow[] = data ?? [];

    // Enrich with latest credential status and passwords from registration_results
    const studentEmails = rows.map(s => s.student_email).filter(Boolean) as string[];
    const parentEmails = rows.map(s => s.parent_email).filter(Boolean) as string[];
    const allEmails = Array.from(new Set([...studentEmails, ...parentEmails]));
    
    if (allEmails.length > 0) {
      const { data: results } = await db
        .from('registration_results')
        .select('email, status, password, created_at')
        .in('email', allEmails)
        .order('created_at', { ascending: false });

      if (results) {
        // Results are ordered newest-first. Keep the LATEST status/date, but
        // BACKFILL the password from the most recent row that actually has one —
        // so a newer status-only / null-password row never makes the password
        // "disappear". Keys are lowercased to avoid case mismatches.
        const latestByEmail: Record<string, CredentialStatus> = {};
        for (const r of results) {
          const key = (r.email || '').trim().toLowerCase();
          if (!key) continue;
          if (!latestByEmail[key]) {
            latestByEmail[key] = { status: r.status, created_at: r.created_at, password: r.password ?? null };
          } else if (!latestByEmail[key].password && r.password) {
            latestByEmail[key].password = r.password;
          }
        }
        for (const row of rows) {
          const sKey = (row.student_email || '').trim().toLowerCase();
          const pKey = (row.parent_email || '').trim().toLowerCase();
          if (sKey && latestByEmail[sKey]) row.credEmail = latestByEmail[sKey];
          if (pKey && latestByEmail[pKey]) row.parentCred = latestByEmail[pKey];
        }
      }
    }

    setStudents(rows);
    setLoading(false);
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
      enrollType === 'all' || (s.enrollment_type ?? 'in_person') === enrollType;
    return matchesSearch && matchesFilter && matchesEnroll;
  });

  const notActivatedCount = students.filter(s => !s.user_id).length;
  const activatedCount = students.filter(s => !!s.user_id).length;

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
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ExclamationTriangleIcon className="w-12 h-12 text-rose-400" />
        <p className="text-foreground font-semibold text-lg">Admin or teacher access required</p>
        <Link href="/dashboard" className="text-violet-400 hover:underline text-sm">Back to dashboard</Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
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
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheckIcon className="w-4 h-4 text-emerald-400" />
            <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Onboarding Health</h2>
            {Object.values(health).reduce((a, b) => a + b, 0) === 0 && (
              <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px] font-bold"><CheckCircleIcon className="w-3.5 h-3.5" /> All clear</span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {([
              ['awaitingVerification', 'Awaiting verify'],
              ['unonboardedPaid', 'Paid, not onboarded'],
              ['failedEmails', 'Failed emails'],
              ['studentsNoClass', 'No class'],
              ['parentsZeroChildren', 'Parents 0 kids'],
              ['legacyCollisions', 'Legacy accounts'],
              ['paymentsNoReceipt', 'No receipt'],
            ] as [string, string][]).map(([key, label]) => {
              const v = health[key] ?? 0;
              return (
                <div key={key} className={`rounded-xl border p-3 text-center ${v > 0 ? 'border-amber-500/30 bg-amber-500/10' : 'border-border bg-muted/20'}`}>
                  <div className={`text-xl font-black ${v > 0 ? 'text-amber-400' : 'text-muted-foreground'}`}>{v}</div>
                  <div className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{label}</div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">"Paid, not onboarded" clears automatically via the scheduled sweep. Use "Repair Onboarding" and "Fix Legacy Parents" above for the rest.</p>
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-foreground">{students.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Total Approved</div>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-emerald-400">{activatedCount}</div>
          <div className="text-xs text-muted-foreground mt-1">Portal Accounts Created</div>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-amber-400">{notActivatedCount}</div>
          <div className="text-xs text-muted-foreground mt-1">Awaiting Activation</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-2xl p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
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
          <option value="in_person">In-Person</option>
          <option value="online">Online</option>
          <option value="summer_school">Summer School</option>
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
                    in_person: 'In-Person',
                    online: 'Online',
                    summer_school: 'Summer School',
                  };
                  return (
                    <tr key={s.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-foreground flex items-center gap-1.5 flex-wrap">
                          <span>{s.full_name}</span>
                          {s.status === 'paid' && (
                            <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">
                              Full Paid
                            </span>
                          )}
                          {s.status === 'partially_paid' && (
                            <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded">
                              Installment
                            </span>
                          )}
                          {s.status === 'approved' && (
                            <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded">
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
                            {s.credEmail?.password && (
                              <div className="text-[11px] text-violet-400 font-mono select-all mt-0.5">Password: {s.credEmail.password}</div>
                            )}
                          </div>
                          {(s.parent_email || (s as any).parentCred?.password) && (
                            <div>
                              <div className="text-[9px] uppercase font-bold text-muted-foreground/60 tracking-wider">Parent Login</div>
                              <div className="text-xs font-semibold text-foreground truncate max-w-[200px]">{s.parent_email || '—'}</div>
                              {(s as any).parentCred?.password && (
                                <div className="text-[11px] text-emerald-400 font-mono select-all mt-0.5">Password: {(s as any).parentCred.password}</div>
                              )}
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
                          s.enrollment_type === 'summer_school'
                            ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                            : s.enrollment_type === 'online'
                            ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                            : 'bg-violet-500/15 text-violet-400 border-violet-500/30'
                        }`}>
                          {enrollLabel[s.enrollment_type ?? 'in_person'] ?? (s.enrollment_type || 'In-Person')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isActivated ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-semibold">
                            <CheckCircleIcon className="w-4 h-4" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-400 text-xs font-semibold">
                            <ClockIcon className="w-4 h-4" /> Not activated
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {s.credEmail ? (
                          s.credEmail.status === 'sent' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-semibold">
                              <CheckCircleIcon className="w-3.5 h-3.5" /> Delivered
                            </span>
                          ) : s.credEmail.status === 'failed' ? (
                            <span className="inline-flex items-center gap-1 text-rose-400 text-xs font-semibold" title="Email delivery failed — resend below">
                              <XCircleIcon className="w-3.5 h-3.5" /> Failed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-400 text-xs font-semibold">
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
                          {s.enrollment_type === 'summer_school' && (
                            <button
                              onClick={() => handleSendReceipt(s.id)}
                              disabled={sendingReceipt[s.id]}
                              title="Resend payment receipt email"
                              className="inline-flex items-center justify-center p-1.5 bg-muted hover:bg-emerald-600/20 border border-border hover:border-emerald-500/40 text-muted-foreground hover:text-emerald-400 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {sendingReceipt[s.id] ? (
                                <ArrowPathIcon className="w-4.5 h-4.5 animate-spin" />
                              ) : (
                                <DocumentTextIcon className="w-4.5 h-4.5" />
                              )}
                            </button>
                          )}

                          {/* Outstanding Tuition Reminder Button */}
                          {s.enrollment_type === 'summer_school' && (
                            <button
                              onClick={() => handleSendBalance(s.id)}
                              disabled={sendingBalance[s.id]}
                              title="Send outstanding tuition balance reminder email"
                              className="inline-flex items-center justify-center p-1.5 bg-muted hover:bg-amber-600/20 border border-border hover:border-amber-500/40 text-muted-foreground hover:text-amber-400 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {sendingBalance[s.id] ? (
                                <ArrowPathIcon className="w-4.5 h-4.5 animate-spin" />
                              ) : (
                                <BanknotesIcon className="w-4.5 h-4.5" />
                              )}
                            </button>
                          )}

                          {/* Credentials Resend / Activate Button */}
                          {isActivated && (
                            <button
                              onClick={() => setLastCreatedCredentials({
                                studentId: s.id,
                                studentName: s.full_name || 'Student',
                                studentEmail: s.student_email || '',
                                studentPassword: s.credEmail?.password || undefined,
                                parentEmail: s.parent_email || undefined,
                                parentPassword: (s as any).parentCred?.password || undefined,
                              })}
                              title="View parent + student login details"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-muted/80 border border-border text-foreground rounded-lg text-xs font-semibold transition-colors"
                            >
                              <EyeIcon className="w-3.5 h-3.5" /> View
                            </button>
                          )}
                          {isDone ? (
                            <span className="text-xs text-emerald-400 font-semibold px-2">Sent</span>
                          ) : isActivated ? (
                            <button
                              onClick={() => handleSend(s.id, true)}
                              disabled={isSending}
                              title="Reset password and resend credentials email"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-violet-600/20 border border-border hover:border-violet-500/40 text-foreground rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                            >
                              {isSending ? (
                                <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <EnvelopeIcon className="w-3.5 h-3.5" />
                              )}
                              Resend
                            </button>
                          ) : (
                            <button
                              onClick={() => handleSend(s.id, false)}
                              disabled={isSending}
                              title="Create portal account and send login credentials"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                            >
                              {isSending ? (
                                <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <KeyIcon className="w-3.5 h-3.5" />
                              )}
                              Activate
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
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 text-sm text-blue-300">
        <strong className="text-blue-200">Which button shows depends on the student's state:</strong>{' '}
        <span className="text-muted-foreground">
          <strong className="text-emerald-400">Activate</strong> appears only for students with <em>no portal account yet</em> — it creates the <span className="text-foreground font-mono">@rillcod.com</span> login + temp password and emails it.{' '}
          Once a student is activated you'll instead see <strong className="text-foreground">View</strong> (see the parent + student logins anytime) and <strong className="text-foreground">Resend</strong> (reset the password &amp; re-email both logins).{' '}
          So if you don't see "Activate", that student is <strong className="text-blue-200">already activated</strong> — nothing is lacking; use View or Resend.{' '}
          The emailed credentials include <strong className="text-blue-200">both parent and student logins</strong>. Students are auto-assigned to a school + class if none is on record.{' '}
          "Activate All Unactivated" ({notActivatedCount}) processes every not-yet-activated student in one go.
        </span>
      </div>

      {/* Copyable Credentials Modal */}
      {lastCreatedCredentials && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-4 z-50 animate-fade-in">
          <div className="bg-[#141618] border border-border rounded-2xl max-w-md w-full p-4 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
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
              Parent & student logins. Copy or share below, or use "Resend" to email a fresh password to the parent.
            </p>

            <div className="space-y-3">
              <div className="bg-[#1c1e22] border border-border rounded-xl p-4 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-violet-400">🎓 Student Account Details</p>
                <div className="text-xs space-y-1">
                  <p className="text-muted-foreground"><strong>Username / Email:</strong></p>
                  <p className="font-mono text-foreground select-all bg-black/30 p-1.5 rounded break-all">{lastCreatedCredentials.studentEmail}</p>
                  <p className="text-muted-foreground mt-1"><strong>Temporary Password:</strong></p>
                  {lastCreatedCredentials.studentPassword ? (
                    <p className="font-mono text-yellow-500 select-all bg-black/30 p-1.5 rounded break-all">{lastCreatedCredentials.studentPassword}</p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground italic">Not stored — click "Resend" to reset &amp; reveal a fresh password.</p>
                  )}
                </div>
              </div>

              {lastCreatedCredentials.parentEmail && (
                <div className="bg-[#1c1e22] border border-border rounded-xl p-4 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">👨‍👩‍👧 Parent Account Details</p>
                  <div className="text-xs space-y-1">
                    <p className="text-muted-foreground"><strong>Username / Email:</strong></p>
                    <p className="font-mono text-foreground select-all bg-black/30 p-1.5 rounded break-all">{lastCreatedCredentials.parentEmail}</p>
                    {lastCreatedCredentials.parentPassword && (
                      <>
                        <p className="text-muted-foreground mt-1"><strong>Temporary Password:</strong></p>
                        <p className="font-mono text-yellow-500 select-all bg-black/30 p-1.5 rounded break-all">{lastCreatedCredentials.parentPassword}</p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {(() => {
              const lc = lastCreatedCredentials;
              const buildText = () => {
                let txt = `Rillcod Academy login details for ${lc.studentName}\n\n`;
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
                    className="px-4 py-2 bg-[#25D366] hover:brightness-110 text-white rounded-xl text-xs font-semibold transition-all"
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
    </div>
  );
}
