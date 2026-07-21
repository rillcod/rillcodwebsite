'use client';

import Link from 'next/link';
import { ArrowPathIcon, SparklesIcon } from '@/lib/icons';
import type { ReportPreflightResult } from '@/lib/school-reports/preflight';
import type { SuggestedCurriculumRange } from '@/lib/school-reports/curriculum-range';
import { SETUP_WORKFLOW_STEPS, type SetupWorkflowStep } from '@/lib/school-reports/ui/workflow-steps';
import type { AcademicTerm, ReportSetupForm, SchoolOption } from '@/lib/school-reports/ui/types';

function PreflightPanel({
  preflight,
  preflightLoading,
  runPreflight,
  form,
}: {
  preflight: ReportPreflightResult | null;
  preflightLoading: boolean;
  runPreflight: () => Promise<void>;
  form: ReportSetupForm;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-black">Data readiness preflight</h3>
          <p className="text-[11px] text-muted-foreground">Checks source health before generating the report book.</p>
        </div>
        <button
          type="button"
          disabled={preflightLoading || !form.schoolId || !form.academicTermId}
          onClick={() => void runPreflight()}
          className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-black disabled:opacity-50"
        >
          {preflightLoading ? 'Checking…' : 'Re-run preflight'}
        </button>
      </div>
      {preflight ? (
        <div className="mt-4 space-y-3">
          <p className="text-[11px] font-bold text-muted-foreground">
            {preflight.blocking
              ? 'Blocking issues found — resolve before publishing later.'
              : preflight.readyToGenerate
                ? 'Ready to generate draft.'
                : 'Review warnings before generating.'}
            {preflight.checkedAt
              ? ` · checked ${new Date(preflight.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : ''}
          </p>
          <ul className="grid gap-2 md:grid-cols-2">
            {preflight.checks.map((check) => (
              <li
                key={check.key}
                className={`rounded-lg border px-3 py-2 text-[11px] ${
                  check.status === 'pass'
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : check.status === 'warn'
                      ? 'border-amber-500/30 bg-amber-500/5'
                      : 'border-destructive/30 bg-destructive/5'
                }`}
              >
                <p className="font-black">{check.label}</p>
                <p className="mt-1 text-muted-foreground">{check.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : preflightLoading ? (
        <p className="mt-3 text-[11px] text-muted-foreground">Running preflight checks…</p>
      ) : (
        <p className="mt-3 text-[11px] text-muted-foreground">Choose a school and term to run data readiness checks.</p>
      )}
    </div>
  );
}

export function SchoolReportSetupWizard({
  step,
  onStepChange,
  schools,
  terms,
  form,
  setForm,
  chooseTerm,
  curriculumRangeHint,
  curriculumDetectionError,
  detectingRange,
  detectCurriculumRange,
  preflight,
  preflightLoading,
  runPreflight,
  working,
  onGenerate,
}: {
  step: SetupWorkflowStep;
  onStepChange: (step: SetupWorkflowStep) => void;
  schools: SchoolOption[];
  terms: AcademicTerm[];
  form: ReportSetupForm;
  setForm: (value: ReportSetupForm | ((prev: ReportSetupForm) => ReportSetupForm)) => void;
  chooseTerm: (id: string) => void;
  curriculumRangeHint: SuggestedCurriculumRange | null;
  curriculumDetectionError: string | null;
  detectingRange: boolean;
  detectCurriculumRange: (schoolId: string, academicTermId: string) => Promise<void>;
  preflight: ReportPreflightResult | null;
  preflightLoading: boolean;
  runPreflight: () => Promise<void>;
  working: string;
  onGenerate: () => Promise<void>;
}) {
  const scopeReady = Boolean(form.schoolId && form.academicTermId && form.title.trim().length >= 3);

  return (
    <section className="rounded-3xl border border-border bg-card p-5 md:p-7">
      <div className="flex items-center gap-3">
        <span className="rounded-xl bg-primary/10 p-3 text-primary">
          <SparklesIcon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-xl font-black">New school report book</h2>
          <p className="text-sm text-muted-foreground">Five guided steps before the shared draft is created.</p>
        </div>
      </div>

      <ol className="mt-6 grid gap-2 sm:grid-cols-5">
        {SETUP_WORKFLOW_STEPS.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onStepChange(item.id as SetupWorkflowStep)}
              aria-current={step === item.id ? 'step' : undefined}
              className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                step === item.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
              }`}
            >
              <p className="text-[10px] font-black uppercase text-muted-foreground">Step {item.id}</p>
              <p className="text-xs font-black">{item.label}</p>
            </button>
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-black uppercase text-muted-foreground">School</span>
            <select
              value={form.schoolId}
              onChange={(e) => setForm({ ...form, schoolId: e.target.value })}
              className="w-full rounded-xl border border-border bg-background p-3"
            >
              <option value="">Choose school</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-black uppercase text-muted-foreground">Academic term and year</span>
            <select
              value={form.academicTermId}
              onChange={(e) => chooseTerm(e.target.value)}
              className="w-full rounded-xl border border-border bg-background p-3"
            >
              <option value="">Choose term and year</option>
              {terms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.term_label} - {term.academic_year}
                  {term.is_current ? ' (current)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-black uppercase text-muted-foreground">Report title</span>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-xl border border-border bg-background p-3"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-muted-foreground">From date</span>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              className="w-full rounded-xl border border-border bg-background p-3"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-muted-foreground">To date</span>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              className="w-full rounded-xl border border-border bg-background p-3"
            />
          </label>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="mt-6">
          <PreflightPanel preflight={preflight} preflightLoading={preflightLoading} runPreflight={runPreflight} form={form} />
        </div>
      ) : null}

      {step === 3 ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="space-y-1 md:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-black uppercase text-muted-foreground">Delivery range</span>
              <button
                type="button"
                disabled={detectingRange || !form.schoolId || !form.academicTermId}
                onClick={() => void detectCurriculumRange(form.schoolId, form.academicTermId)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] font-black text-primary disabled:opacity-50"
              >
                <ArrowPathIcon className={`h-3.5 w-3.5 ${detectingRange ? 'animate-spin' : ''}`} />
                {detectingRange ? 'Detecting…' : 'Detect from delivery'}
              </button>
            </div>
            {curriculumDetectionError ? (
              <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
                {curriculumDetectionError}
              </p>
            ) : null}
            {curriculumRangeHint ? (
              <p
                className={`rounded-lg border px-3 py-2 text-[11px] ${
                  curriculumRangeHint.status === 'detected' || curriculumRangeHint.source === 'delivery_tracking'
                    ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-900'
                    : curriculumRangeHint.status === 'query_failed' || curriculumRangeHint.status === 'migration_missing'
                      ? 'border-destructive/30 bg-destructive/5 text-destructive'
                      : 'border-amber-500/30 bg-amber-500/5 text-amber-900'
                }`}
              >
                {curriculumRangeHint.hint}
              </p>
            ) : null}
          </label>
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-muted-foreground">Range starts (term · week)</span>
            <div className="flex gap-2">
              <input type="number" min="1" value={form.curriculumStartTerm} onChange={(e) => setForm({ ...form, curriculumStartTerm: Number(e.target.value) })} className="w-1/2 rounded-xl border border-border bg-background p-3" />
              <input type="number" min="1" value={form.curriculumStartWeek} onChange={(e) => setForm({ ...form, curriculumStartWeek: Number(e.target.value) })} className="w-1/2 rounded-xl border border-border bg-background p-3" />
            </div>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-muted-foreground">Range ends (term · week)</span>
            <div className="flex gap-2">
              <input type="number" min="1" value={form.curriculumEndTerm} onChange={(e) => setForm({ ...form, curriculumEndTerm: Number(e.target.value) })} className="w-1/2 rounded-xl border border-border bg-background p-3" />
              <input type="number" min="1" value={form.curriculumEndWeek} onChange={(e) => setForm({ ...form, curriculumEndWeek: Number(e.target.value) })} className="w-1/2 rounded-xl border border-border bg-background p-3" />
            </div>
          </label>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="mt-6 space-y-4">
          {preflight?.invoiceMatchCount ? (
            <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-900">
              {preflight.invoiceMatchCount} matching invoice(s) found for this term.
            </p>
          ) : (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-900">
              No matching invoice yet. You can still generate the draft, but publication will require a term invoice.
            </p>
          )}
          {preflight?.invoiceDiagnostics?.nearMisses?.length ? (
            <ul className="space-y-2">
              {preflight.invoiceDiagnostics.nearMisses.map((miss) => (
                <li key={miss.id} className="rounded-lg border border-border px-3 py-2 text-[11px]">
                  <p className="font-black">{miss.invoiceNumber}</p>
                  <p className="text-muted-foreground">{miss.reasons.join(' · ')}</p>
                  {miss.editHref ? (
                    <Link href={miss.editHref} className="mt-1 inline-block font-black text-primary underline">
                      Open invoice
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {step === 5 ? (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Ready to create or reopen the shared book for{' '}
            <span className="font-black text-foreground">{schools.find((s) => s.id === form.schoolId)?.name || 'the school'}</span>
            {' '}and{' '}
            <span className="font-black text-foreground">
              {terms.find((t) => t.id === form.academicTermId)?.term_label || 'the selected term'}
            </span>
            .
          </p>
          <PreflightPanel preflight={preflight} preflightLoading={preflightLoading} runPreflight={runPreflight} form={form} />
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {step > 1 ? (
            <button type="button" onClick={() => onStepChange((step - 1) as SetupWorkflowStep)} className="rounded-xl border border-border px-4 py-2 text-sm font-black">
              Back
            </button>
          ) : (
            <Link href="/dashboard/school-reports" className="rounded-xl border border-border px-4 py-2 text-sm font-black">
              Cancel
            </Link>
          )}
          {step < 5 ? (
            <button
              type="button"
              disabled={step === 1 && !scopeReady}
              onClick={() => onStepChange((step + 1) as SetupWorkflowStep)}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-black text-white disabled:opacity-50"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={() => void onGenerate()}
              disabled={working === 'generate' || !scopeReady}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-black text-white disabled:opacity-50"
            >
              <SparklesIcon className="h-4 w-4" />
              {working === 'generate' ? 'Gathering data and writing draft...' : 'Generate report draft'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
