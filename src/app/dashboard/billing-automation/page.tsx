'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import {
  BoltIcon, CheckCircleIcon, ExclamationTriangleIcon,
  ClockIcon, BellIcon, EnvelopeIcon, ArrowPathIcon,
  ChevronRightIcon, InformationCircleIcon,
} from '@/lib/icons';

interface BillingAutomationConfig {
  invoice_reminders_enabled: boolean;
  reminder_1_days_after_issue: number;
  reminder_2_days_before_due: number;
  reminder_3_days_after_due: number;
  auto_overdue_enabled: boolean;
  notify_email: boolean;
  notify_in_app: boolean;
}

interface AutomationLog {
  id: string;
  triggered_by: string;
  invoices_scanned: number;
  reminders_sent: number;
  overdue_marked: number;
  errors: number;
  created_at: string;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${checked ? 'bg-violet-600' : 'bg-white/10'}`}
      aria-pressed={checked}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-md transition-transform duration-200 ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function DayInput({ value, onChange, min = 0, max = 30 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={e => onChange(Math.max(min, Math.min(max, Number(e.target.value))))}
      className="w-20 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white text-center font-black focus:outline-none focus:border-violet-500 transition-colors"
    />
  );
}

export default function BillingAutomationPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [config, setConfig] = useState<BillingAutomationConfig>({
    invoice_reminders_enabled: true,
    reminder_1_days_after_issue: 1,
    reminder_2_days_before_due: 3,
    reminder_3_days_after_due: 1,
    auto_overdue_enabled: true,
    notify_email: true,
    notify_in_app: true,
  });
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [runResult, setRunResult] = useState<any>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRes, logRes] = await Promise.all([
        fetch('/api/billing/automation'),
        fetch('/api/billing/automation/logs'),
      ]);
      if (cfgRes.ok) {
        const data = await cfgRes.json();
        setConfig(data.config);
      }
      if (logRes.ok) {
        const data = await logRes.json();
        setLogs(data.logs || []);
      }
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && profile) {
      if (profile.role !== 'admin') { router.replace('/dashboard'); return; }
      loadData();
    }
  }, [authLoading, profile, loadData, router]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/billing/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        showToast('success', 'Automation settings saved successfully.');
      } else {
        showToast('error', 'Failed to save settings.');
      }
    } catch {
      showToast('error', 'Network error.');
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch('/api/cron/invoice-reminders', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setRunResult(data);
        showToast('success', `Done — ${data.reminders_sent ?? 0} reminder(s) sent, ${data.overdue_marked ?? 0} marked overdue.`);
        loadData(); // refresh logs
      } else {
        showToast('error', data.error || 'Run failed.');
      }
    } catch {
      showToast('error', 'Network error.');
    } finally {
      setRunning(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile || profile.role !== 'admin') return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border text-sm font-bold transition-all ${
          toast.type === 'success'
            ? 'bg-emerald-950 border-emerald-500/30 text-emerald-300'
            : 'bg-rose-950 border-rose-500/30 text-rose-300'
        }`}>
          {toast.type === 'success' ? <CheckCircleIcon className="w-5 h-5" /> : <ExclamationTriangleIcon className="w-5 h-5" />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-[10px] font-black text-violet-400 uppercase tracking-[0.4em] mb-1">Admin Panel</p>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Billing Automation</h1>
          <p className="text-sm text-white/40 mt-1">Configure automated invoice reminders and overdue detection.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={runNow}
            disabled={running}
            className="flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-white/10 hover:border-violet-500/40 rounded-xl text-sm font-black text-white/70 hover:text-white transition-all disabled:opacity-50"
          >
            <ArrowPathIcon className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Running…' : 'Run Now'}
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-black text-white transition-all disabled:opacity-50 shadow-lg"
          >
            {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckCircleIcon className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Master toggle */}
      <div className="bg-white/3 border border-white/8 rounded-2xl p-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-violet-500/20 text-violet-400 rounded-xl">
            <BoltIcon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-base font-black text-white">Invoice Reminder Automation</p>
            <p className="text-xs text-white/40 mt-0.5">Automatically send reminders at configurable intervals.</p>
          </div>
        </div>
        <Toggle
          checked={config.invoice_reminders_enabled}
          onChange={v => setConfig(c => ({ ...c, invoice_reminders_enabled: v }))}
        />
      </div>

      {/* Reminder schedule */}
      <div className={`space-y-4 transition-opacity ${config.invoice_reminders_enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
        <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em] flex items-center gap-2">
          <ClockIcon className="w-3.5 h-3.5" />
          Reminder Schedule
        </p>

        {/* Reminder 1 */}
        <div className="bg-white/3 border border-white/8 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-[11px] font-black text-blue-400">R1</div>
            <div>
              <p className="text-sm font-black text-white">Initial Invoice Notice</p>
              <p className="text-xs text-white/40">Sent after invoice is created</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <DayInput value={config.reminder_1_days_after_issue} onChange={v => setConfig(c => ({ ...c, reminder_1_days_after_issue: v }))} />
            <span className="text-xs text-white/40 font-medium">days after issue</span>
          </div>
        </div>

        {/* Reminder 2 */}
        <div className="bg-white/3 border border-white/8 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-[11px] font-black text-amber-400">R2</div>
            <div>
              <p className="text-sm font-black text-white">Due Date Reminder</p>
              <p className="text-xs text-white/40">Friendly reminder before payment is due</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <DayInput value={config.reminder_2_days_before_due} onChange={v => setConfig(c => ({ ...c, reminder_2_days_before_due: v }))} />
            <span className="text-xs text-white/40 font-medium">days before due date</span>
          </div>
        </div>

        {/* Reminder 3 */}
        <div className="bg-white/3 border border-white/8 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-[11px] font-black text-rose-400">R3</div>
            <div>
              <p className="text-sm font-black text-white">Final Overdue Warning</p>
              <p className="text-xs text-white/40">Final notice after due date passes</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <DayInput value={config.reminder_3_days_after_due} onChange={v => setConfig(c => ({ ...c, reminder_3_days_after_due: v }))} />
            <span className="text-xs text-white/40 font-medium">days after due date</span>
          </div>
        </div>
      </div>

      {/* Auto-overdue + notification channels */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white/3 border border-white/8 rounded-2xl p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-500/20 text-rose-400 rounded-lg">
              <ExclamationTriangleIcon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-black text-white">Auto-Overdue</p>
              <p className="text-[10px] text-white/40">Mark overdue on R3</p>
            </div>
          </div>
          <Toggle checked={config.auto_overdue_enabled} onChange={v => setConfig(c => ({ ...c, auto_overdue_enabled: v }))} />
        </div>

        <div className="bg-white/3 border border-white/8 rounded-2xl p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg">
              <EnvelopeIcon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-black text-white">Email</p>
              <p className="text-[10px] text-white/40">Send via email</p>
            </div>
          </div>
          <Toggle checked={config.notify_email} onChange={v => setConfig(c => ({ ...c, notify_email: v }))} />
        </div>

        <div className="bg-white/3 border border-white/8 rounded-2xl p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-500/20 text-violet-400 rounded-lg">
              <BellIcon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-black text-white">In-App</p>
              <p className="text-[10px] text-white/40">Dashboard bell</p>
            </div>
          </div>
          <Toggle checked={config.notify_in_app} onChange={v => setConfig(c => ({ ...c, notify_in_app: v }))} />
        </div>
      </div>

      {/* Cron info banner */}
      <div className="flex items-start gap-4 p-4 bg-indigo-500/5 border border-indigo-500/15 rounded-xl">
        <InformationCircleIcon className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-xs text-white/40 leading-relaxed space-y-1">
          <p><span className="font-black text-white/60">Cron endpoint:</span> <code className="bg-white/5 px-1.5 py-0.5 rounded font-mono">/api/cron/invoice-reminders</code> — called daily at 8:00 AM by Vercel Cron.</p>
          <p>Add <code className="bg-white/5 px-1.5 py-0.5 rounded font-mono">BILLING_CRON_SECRET</code> to your environment and the matching schedule to <code className="bg-white/5 px-1.5 py-0.5 rounded font-mono">vercel.json</code> to activate automated runs.</p>
        </div>
      </div>

      {/* Last run result */}
      {runResult && (
        <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-2xl p-5 space-y-3">
          <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.4em]">Last Manual Run Result</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Scanned', value: runResult.invoices_scanned ?? 0, color: 'text-white' },
              { label: 'Reminders Sent', value: runResult.reminders_sent ?? 0, color: 'text-emerald-400' },
              { label: 'Overdue Marked', value: runResult.overdue_marked ?? 0, color: 'text-amber-400' },
              { label: 'Errors', value: runResult.errors ?? 0, color: 'text-rose-400' },
            ].map(stat => (
              <div key={stat.label} className="text-center p-3 bg-white/3 rounded-xl border border-white/5">
                <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Automation log history */}
      <div className="space-y-3">
        <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em]">Automation Run History</p>
        {logs.length === 0 ? (
          <div className="text-center py-10 text-white/20 text-sm font-medium">No runs recorded yet.</div>
        ) : (
          <div className="divide-y divide-white/5 border border-white/8 rounded-2xl overflow-hidden">
            {logs.slice(0, 15).map(log => (
              <div key={log.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 px-5 py-3 hover:bg-white/3 transition-colors">
                <div className="shrink-0">
                  <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded ${
                    log.triggered_by === 'cron'
                      ? 'bg-indigo-500/15 text-indigo-400'
                      : 'bg-violet-500/15 text-violet-400'
                  }`}>
                    {log.triggered_by}
                  </span>
                </div>
                <div className="text-[10px] text-white/30 font-medium shrink-0">
                  {new Date(log.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="flex items-center gap-4 text-xs font-black flex-1">
                  <span className="text-white/50">{log.invoices_scanned} scanned</span>
                  <ChevronRightIcon className="w-3 h-3 text-white/20" />
                  <span className="text-emerald-400">{log.reminders_sent} sent</span>
                  <span className="text-amber-400">{log.overdue_marked} overdue</span>
                  {log.errors > 0 && <span className="text-rose-400">{log.errors} errors</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
