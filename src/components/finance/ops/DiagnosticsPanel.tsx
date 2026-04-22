'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  ShieldCheckIcon,
  EnvelopeIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
} from '@/lib/icons';

/**
 * Shape returned by GET /api/admin/billing-health.
 * Keep this in sync with src/app/api/admin/billing-health/route.ts.
 */
interface BillingHealthPayload {
  admin_ops_email_configured: boolean;
  default_registration_program_id: {
    set: boolean;
    valid_uuid: boolean;
    programme_exists: boolean;
  };
  programs_with_instalments_enabled: number;
  active_courses_without_priced_programme: number;
  hints: string[];
  error?: string;
}

type Severity = 'ok' | 'warn' | 'error';

interface DerivedIssue {
  severity: Severity;
  label: string;
  detail: string;
}

function deriveIssues(h: BillingHealthPayload): DerivedIssue[] {
  const issues: DerivedIssue[] = [];

  // Admin ops email
  issues.push({
    severity: h.admin_ops_email_configured ? 'ok' : 'warn',
    label: 'ADMIN_OPS_EMAIL',
    detail: h.admin_ops_email_configured
      ? 'Configured — payment alerts will land in ops inbox.'
      : 'Not set — registration payment alerts will not be delivered.',
  });

  // Default registration programme
  const reg = h.default_registration_program_id;
  if (!reg.set) {
    issues.push({
      severity: 'warn',
      label: 'default_registration_program_id',
      detail:
        'Not set. Registration will fall back to form-provided program_id — OK only if you always send program_id explicitly.',
    });
  } else if (!reg.valid_uuid) {
    issues.push({
      severity: 'error',
      label: 'default_registration_program_id',
      detail: 'Value is present but is not a valid UUID.',
    });
  } else if (!reg.programme_exists) {
    issues.push({
      severity: 'error',
      label: 'default_registration_program_id',
      detail: 'UUID set but the programme row was not found in programs table.',
    });
  } else {
    issues.push({
      severity: 'ok',
      label: 'default_registration_program_id',
      detail: 'Set and resolves to a live programme.',
    });
  }

  // Instalments
  issues.push({
    severity: 'ok',
    label: 'programs_with_instalments_enabled',
    detail: `${h.programs_with_instalments_enabled} programme(s) offer instalments.`,
  });

  // Active courses missing priced programme
  if (h.active_courses_without_priced_programme > 0) {
    issues.push({
      severity: 'error',
      label: 'active_courses_without_priced_programme',
      detail: `${h.active_courses_without_priced_programme} live course(s) have no priced programme. Unpublish or attach to a priced programme.`,
    });
  } else {
    issues.push({
      severity: 'ok',
      label: 'active_courses_without_priced_programme',
      detail: 'Every active course is attached to a priced programme.',
    });
  }

  return issues;
}

/**
 * DiagnosticsPanel — admin-only ops diagnostics.
 *
 * Wraps /api/admin/billing-health and /api/admin/test-email with a
 * severity-coded UI. Replaces the two diagnostic CTAs that used to live in
 * the legacy PaymentsHub's billing view — improved to surface issues as
 * categorised cards instead of raw JSON.
 */
export function DiagnosticsPanel() {
  const [health, setHealth] = useState<BillingHealthPayload | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);

  const runHealthCheck = async () => {
    setLoadingHealth(true);
    setHealth(null);
    try {
      const res = await fetch('/api/admin/billing-health');
      const j = (await res.json()) as BillingHealthPayload;
      if (!res.ok) throw new Error(j.error || 'Billing health check failed');
      setHealth(j);
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Billing health check failed');
    } finally {
      setLoadingHealth(false);
    }
  };

  const sendTestEmail = async () => {
    if (!confirm('Send two diagnostic emails via the transactional provider?')) return;
    setLoadingEmail(true);
    try {
      const res = await fetch('/api/admin/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const j = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof j.error === 'string' ? j.error : JSON.stringify(j.error) || 'Test email failed',
        );
      }
      const list = (j.sent as { to: string; subject: string }[] | undefined)
        ?.map((s) => `${s.to}`)
        .join(', ');
      toast.success(list ? `Delivered to ${list}` : 'Delivered.');
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Test email failed');
    } finally {
      setLoadingEmail(false);
    }
  };

  const issues = health ? deriveIssues(health) : [];
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warnCount = issues.filter((i) => i.severity === 'warn').length;
  const overallOk = !!health && errorCount === 0 && warnCount === 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-black text-foreground">Admin diagnostics</p>
            <p className="text-xs text-muted-foreground mt-1">
              Verify billing config and email delivery after migrations, gateway
              changes, or incidents. Not for everyday use.
            </p>
          </div>
        </div>
      </div>

      {/* Billing health */}
      <section className="rounded-2xl border border-border bg-card/50 p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 inline-flex items-center justify-center">
              <ShieldCheckIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-black text-foreground">Billing health</p>
              <p className="text-xs text-muted-foreground">
                Env, app_settings, programmes, active courses & instalment config.
              </p>
            </div>
          </div>
          <button
            onClick={runHealthCheck}
            disabled={loadingHealth}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest rounded-md"
          >
            {loadingHealth ? (
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
            ) : (
              <ShieldCheckIcon className="w-4 h-4" />
            )}
            Run check
          </button>
        </div>

        {health && (
          <div className="space-y-3">
            {/* Overall banner */}
            <div
              className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${
                overallOk
                  ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-300'
                  : errorCount > 0
                  ? 'border-rose-500/40 bg-rose-500/5 text-rose-300'
                  : 'border-amber-500/40 bg-amber-500/5 text-amber-300'
              }`}
            >
              {overallOk ? (
                <CheckCircleIcon className="w-5 h-5 mt-0.5" />
              ) : errorCount > 0 ? (
                <XCircleIcon className="w-5 h-5 mt-0.5" />
              ) : (
                <ExclamationTriangleIcon className="w-5 h-5 mt-0.5" />
              )}
              <p className="text-sm font-black">
                {overallOk
                  ? 'All systems go.'
                  : errorCount > 0
                  ? `${errorCount} issue${errorCount === 1 ? '' : 's'} require attention${
                      warnCount > 0 ? ` · ${warnCount} warning${warnCount === 1 ? '' : 's'}` : ''
                    }.`
                  : `${warnCount} warning${warnCount === 1 ? '' : 's'}.`}
              </p>
            </div>

            {/* Derived issue cards */}
            <ul className="space-y-2">
              {issues.map((issue, i) => (
                <li
                  key={i}
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    issue.severity === 'error'
                      ? 'border-rose-500/30 bg-rose-500/5 text-rose-200'
                      : issue.severity === 'warn'
                      ? 'border-amber-500/30 bg-amber-500/5 text-amber-200'
                      : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200'
                  }`}
                >
                  <p className="font-black uppercase tracking-widest text-[9px] opacity-70">
                    {issue.label}
                  </p>
                  <p className="mt-0.5">{issue.detail}</p>
                </li>
              ))}
            </ul>

            {/* Hints from the server */}
            {health.hints && health.hints.length > 0 && (
              <div className="rounded-lg border border-border bg-background/60 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                  Hints
                </p>
                <ul className="list-disc pl-4 space-y-1 text-xs text-muted-foreground">
                  {health.hints.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Test email */}
      <section className="rounded-2xl border border-border bg-card/50 p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 inline-flex items-center justify-center">
              <EnvelopeIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-black text-foreground">Email delivery test</p>
              <p className="text-xs text-muted-foreground">
                Sends two branded diagnostic emails via SendPulse (payment check +
                feedback layout).
              </p>
            </div>
          </div>
          <button
            onClick={sendTestEmail}
            disabled={loadingEmail}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest rounded-md"
          >
            {loadingEmail ? (
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
            ) : (
              <EnvelopeIcon className="w-4 h-4" />
            )}
            Send tests
          </button>
        </div>
      </section>
    </div>
  );
}

export default DiagnosticsPanel;
