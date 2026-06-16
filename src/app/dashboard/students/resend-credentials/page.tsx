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
  ChevronLeftIcon, FunnelIcon, ShieldCheckIcon,
} from '@/lib/icons';

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

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';
  const isAdmin = profile?.role === 'admin';
  const [repairing, setRepairing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const db = createClient();
    const { data, error } = await db
      .from('students')
      .select('id, full_name, student_email, parent_email, school_name, status, enrollment_type, user_id, created_at')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load students: ' + error.message);
      setLoading(false);
      return;
    }

    const rows: StudentRow[] = data ?? [];

    // Enrich with latest credential email status from registration_results
    const emails = rows.map(s => s.student_email).filter(Boolean) as string[];
    if (emails.length > 0) {
      const { data: results } = await db
        .from('registration_results')
        .select('email, status, created_at')
        .in('email', emails)
        .order('created_at', { ascending: false });

      if (results) {
        const latestByEmail: Record<string, CredentialStatus> = {};
        for (const r of results) {
          if (r.email && !latestByEmail[r.email]) {
            latestByEmail[r.email] = { status: r.status, created_at: r.created_at };
          }
        }
        for (const row of rows) {
          if (row.student_email && latestByEmail[row.student_email]) {
            row.credEmail = latestByEmail[row.student_email];
          }
        }
      }
    }

    setStudents(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authLoading && isStaff) load();
  }, [authLoading, isStaff, load]);

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
      const res = await fetch('/api/students/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, forceResend }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(data.message || (forceResend ? 'Credentials resent' : 'Account activated and credentials sent'));
      setDone(p => ({ ...p, [studentId]: true }));
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
    } finally {
      setSending(p => ({ ...p, [studentId]: false }));
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
                        <div className="font-semibold text-foreground">{s.full_name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {s.created_at ? new Date(s.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <EnvelopeIcon className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="text-xs truncate max-w-[180px]">{contactEmail}</span>
                        </div>
                        {s.student_email && s.student_email.endsWith('@rillcod.com') && (
                          <div className="mt-0.5 text-xs text-violet-400 font-mono truncate max-w-[200px]">
                            Student login: {s.student_email}
                          </div>
                        )}
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
                        {isDone ? (
                          <span className="text-xs text-emerald-400 font-semibold">Sent</span>
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
        <strong className="text-blue-200">How this works:</strong>{' '}
        <span className="text-muted-foreground">
          "Activate" creates the student <span className="text-foreground font-mono">@rillcod.com</span> login + temp password and emails it to the parent's registration email.{' '}
          "Resend" resets the password and re-emails the credentials.{' '}
          When the student has a linked <strong className="text-blue-200">parent portal account</strong> (summer-school registrations), the email includes <strong className="text-blue-200">both the parent and student logins</strong>, and the parent password is reset so it's valid.{' '}
          Students are auto-assigned to <em>Rillcod Online School</em> (and their class) if none is on record.{' '}
          "Activate All Unactivated" processes every visible unactivated student in sequence.
        </span>
      </div>
    </div>
  );
}
