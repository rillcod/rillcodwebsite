'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowPathIcon, SparklesIcon } from '@/lib/icons';
import {
  endWeekForReportWindow,
  normalizeReportingWeeks,
  REPORT_WINDOW_WEEK_OPTIONS,
} from '@/lib/school-reports/delivery-declaration';
import type { ReportPreflightResult } from '@/lib/school-reports/preflight';
import type { SuggestedCurriculumRange } from '@/lib/school-reports/curriculum-range';
import { needsCurriculumOverrideReason } from '@/lib/school-reports/curriculum-override';
import { SETUP_WORKFLOW_STEPS, type SetupWorkflowStep } from '@/lib/school-reports/ui/workflow-steps';
import type { AcademicTerm, ReportSetupForm, SchoolOption } from '@/lib/school-reports/ui/types';
import { SetupDeliveryTopicsPanel } from '@/components/school-reports/SetupDeliveryTopicsPanel';

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
  activeBooks = [],
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
  activeBooks?: Array<{
    id: string;
    school_id: string;
    academic_term_id: string;
    status: string;
    term_label: string;
    academic_year: string;
    title?: string;
  }>;
}) {
  const [stepHint, setStepHint] = useState<string>('');
  const scopeReady = Boolean(form.schoolId && form.academicTermId && form.title.trim().length >= 3);
  const overrideRequired = needsCurriculumOverrideReason(form, curriculumRangeHint);
  const overrideReady = !overrideRequired || form.curriculumOverrideReason.trim().length >= 8;
  const deliveryReady = form.selectedTopicKeys.length > 0;
  const curriculumStepReady = overrideReady;
  const preflightReady = Boolean(preflight);
  const existingBook = activeBooks.find(
    (book) => book.school_id === form.schoolId && book.academic_term_id === form.academicTermId,
  );
  const expressReady =
    scopeReady && overrideReady && Boolean(preflight?.readyToGenerate) && !preflight?.blocking;

  function canEnterStep(target: SetupWorkflowStep): boolean {
    if (target <= 1) return true;
    if (!scopeReady) return false;
    if (target === 2) return true;
    if (!preflightReady) return false;
    if (target === 3) return true;
    if (target === 4) return curriculumStepReady;
    if (target === 5) return curriculumStepReady;
    return true;
  }

  function stepGuardMessage(target: SetupWorkflowStep): string {
    if (target > 1 && !scopeReady) {
      return 'Complete Step 1 first: school, term/year, and report title.';
    }
    if (target > 2 && !preflightReady) {
      return 'Run Step 2 preflight first so readiness checks can complete.';
    }
    if (target > 3 && !curriculumStepReady) {
      return 'Provide the curriculum override reason before continuing.';
    }
    return '';
  }

  function goToStep(target: SetupWorkflowStep) {
    if (canEnterStep(target)) {
      setStepHint('');
      onStepChange(target);
      return;
    }
    setStepHint(stepGuardMessage(target));
  }

  function handleContinue() {
    const target = Math.min(5, step + 1) as SetupWorkflowStep;
    goToStep(target);
  }

  return (
    <section className="rounded-3xl border border-border bg-card p-4 sm:p-5 md:p-7">
      <div className="flex items-start gap-3">
        <span className="shrink-0 rounded-xl bg-primary/10 p-2.5 text-primary sm:p-3">
          <SparklesIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-black sm:text-xl">New school report book</h2>
          <p className="text-sm text-muted-foreground">Five guided steps before the shared draft is created.</p>
        </div>
      </div>

      <div className="relative mt-6 -mx-1">
        <ol className="flex gap-2 overflow-x-auto overscroll-x-contain pb-2 snap-x snap-mandatory sm:grid sm:grid-cols-5 sm:gap-2 sm:overflow-visible sm:pb-0">
          {SETUP_WORKFLOW_STEPS.map((item) => (
            <li key={item.id} className="min-w-[72%] shrink-0 snap-start sm:min-w-0">
              <button
                type="button"
                onClick={() => goToStep(item.id as SetupWorkflowStep)}
                disabled={!canEnterStep(item.id as SetupWorkflowStep)}
                aria-current={step === item.id ? 'step' : undefined}
                className={`flex min-h-14 w-full flex-col justify-center rounded-xl border px-3 py-2.5 text-left transition ${
                  step === item.id
                    ? 'border-primary bg-primary/5'
                    : !canEnterStep(item.id as SetupWorkflowStep)
                      ? 'border-border/60 bg-muted/20 opacity-60'
                      : 'border-border hover:border-primary/30'
                }`}
              >
                <p className="text-[10px] font-black uppercase text-muted-foreground">Step {item.id}</p>
                <p className="text-xs font-black leading-snug break-words">{item.label}</p>
              </button>
            </li>
          ))}
        </ol>
      </div>

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
          <div className="md:col-span-2">
            <PreflightPanel preflight={preflight} preflightLoading={preflightLoading} runPreflight={runPreflight} form={form} />
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="mt-6">
          <p className="mb-3 rounded-lg border border-border bg-background/50 px-3 py-2 text-[11px] text-muted-foreground">
            Step 2 validates core data before curriculum delivery decisions. Re-run this whenever school/term changes.
          </p>
          <PreflightPanel preflight={preflight} preflightLoading={preflightLoading} runPreflight={runPreflight} form={form} />
        </div>
      ) : null}

      {step === 3 ? (
        <>
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
                    ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-900 dark:text-emerald-200 dark:bg-emerald-500/10'
                    : curriculumRangeHint.status === 'query_failed' || curriculumRangeHint.status === 'migration_missing'
                      ? 'border-destructive/30 bg-destructive/5 text-destructive dark:text-rose-300'
                      : 'border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-200 dark:bg-amber-500/10'
                }`}
              >
                {curriculumRangeHint.hint}
              </p>
            ) : null}
            {curriculumRangeHint?.schoolCourses?.length ? (
              <div className="mt-4 rounded-xl border border-border bg-background/60 p-3">
                <p className="text-[11px] font-black uppercase text-muted-foreground">Programmes at this school</p>
                <ul className="mt-2 space-y-2">
                  {curriculumRangeHint.schoolCourses.map((item) => (
                    <li
                      key={`${item.programme}-${item.course}`}
                      className={`rounded-lg border px-3 py-2 text-[11px] ${
                        item.inReportRange
                          ? 'border-emerald-500/30 bg-emerald-500/5'
                          : 'border-amber-500/30 bg-amber-500/5'
                      }`}
                    >
                      <p className="font-black">
                        {item.programme} · {item.course}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {item.enrolledStudents} enrolled
                        {item.hasSyllabus ? ' · syllabus found' : ' · no syllabus yet'}
                        {item.trackedWeeks > 0 ? ` · ${item.trackedWeeks} week(s) ticked` : ' · no delivery ticks in range'}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </label>
          <div className="md:col-span-2 space-y-2">
            <span className="text-xs font-black uppercase text-muted-foreground">Term window length</span>
            <div className="flex flex-wrap gap-2">
              {REPORT_WINDOW_WEEK_OPTIONS.map((weeks) => {
                const currentWeeks = normalizeReportingWeeks(
                  form.curriculumEndWeek - form.curriculumStartWeek + 1,
                );
                const active = currentWeeks === weeks;
                return (
                  <button
                    key={weeks}
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        curriculumStartWeek: 1,
                        curriculumEndTerm: form.curriculumStartTerm,
                        curriculumEndWeek: endWeekForReportWindow(1, weeks),
                      })
                    }
                    className={`min-h-11 min-w-[4.5rem] flex-1 rounded-xl border px-4 py-2.5 text-xs font-black transition sm:flex-none ${
                      active
                        ? 'border-primary bg-primary text-white'
                        : 'border-border bg-background hover:border-primary/40'
                    }`}
                  >
                    {weeks} weeks
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Pick 8, 10, or 14 weeks for this term&apos;s delivery window — topics and manual delivery span across your selection.
            </p>
          </div>
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-muted-foreground">Range starts (term · week)</span>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" min="1" value={form.curriculumStartTerm} onChange={(e) => setForm({ ...form, curriculumStartTerm: Number(e.target.value) })} className="min-h-11 w-full rounded-xl border border-border bg-background p-3 text-base sm:text-sm" />
              <input type="number" min="1" value={form.curriculumStartWeek} onChange={(e) => setForm({ ...form, curriculumStartWeek: Number(e.target.value) })} className="min-h-11 w-full rounded-xl border border-border bg-background p-3 text-base sm:text-sm" />
            </div>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-muted-foreground">Range ends (term · week)</span>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" min="1" value={form.curriculumEndTerm} onChange={(e) => setForm({ ...form, curriculumEndTerm: Number(e.target.value) })} className="min-h-11 w-full rounded-xl border border-border bg-background p-3 text-base sm:text-sm" />
              <input
                type="number"
                min="1"
                value={form.curriculumEndWeek}
                onChange={(e) => {
                  const endWeek = Number(e.target.value);
                  const windowWeeks = normalizeReportingWeeks(endWeek - form.curriculumStartWeek + 1);
                  setForm({
                    ...form,
                    curriculumEndWeek: endWeekForReportWindow(form.curriculumStartWeek, windowWeeks),
                  });
                }}
                className="min-h-11 w-full rounded-xl border border-border bg-background p-3 text-base sm:text-sm"
              />
            </div>
          </label>
          {overrideRequired ? (
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-black uppercase text-muted-foreground">Why override the detected range?</span>
              <textarea
                value={form.curriculumOverrideReason}
                onChange={(e) => setForm({ ...form, curriculumOverrideReason: e.target.value })}
                rows={3}
                placeholder="Explain why the delivery range differs from detected weeks (required for audit)."
                className="w-full rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Manual curriculum ranges are saved in the report snapshot and audit log.
              </p>
            </label>
          ) : null}
        </div>
        <SetupDeliveryTopicsPanel
          form={form}
          schoolName={schools.find((s) => s.id === form.schoolId)?.name || ''}
          termLabel={terms.find((t) => t.id === form.academicTermId)?.term_label || ''}
          selectedTopicKeys={form.selectedTopicKeys}
          onSelectedTopicKeysChange={(keys) =>
            setForm((prev) => {
              const same =
                prev.selectedTopicKeys.length === keys.length &&
                prev.selectedTopicKeys.every((key, index) => key === keys[index]);
              return same ? prev : { ...prev, selectedTopicKeys: keys };
            })
          }
          disabled={working === 'generate'}
        />
        </>
      ) : null}

      {step === 4 ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl border border-slate-500/30 bg-slate-500/5 p-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={form.excludeBilling}
                disabled={working === 'generate'}
                onChange={(e) =>
                  setForm({
                    ...form,
                    excludeBilling: e.target.checked,
                    excludeBillingReason: e.target.checked ? form.excludeBillingReason : '',
                  })
                }
                className="mt-1 rounded border-border"
              />
              <div>
                <p className="text-sm font-black">Exclude billing from this report book</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Skip the term-invoice requirement and hide invoice appendices — useful for pilots, pro bono terms, or
                  books that should not carry finance. You can change this later in Layout &amp; PDF.
                </p>
              </div>
            </label>
            {form.excludeBilling ? (
              <label className="mt-3 block space-y-1">
                <span className="text-xs font-black uppercase text-muted-foreground">Reason (optional, for audit)</span>
                <textarea
                  value={form.excludeBillingReason}
                  disabled={working === 'generate'}
                  onChange={(e) => setForm({ ...form, excludeBillingReason: e.target.value })}
                  rows={2}
                  placeholder="e.g. Pilot partnership — no fee this term"
                  className="w-full rounded-xl border border-border bg-background p-3 text-sm"
                />
              </label>
            ) : null}
          </div>
          {form.excludeBilling ? (
            <p className="rounded-xl border border-slate-500/30 bg-slate-500/5 p-4 text-sm text-slate-900 dark:text-slate-200 dark:bg-slate-500/10">
              Billing excluded — you can generate the draft without a matching invoice. Invoice appendices stay hidden
              unless you turn billing back on.
            </p>
          ) : preflight?.matchedInvoices?.length ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/10 p-4">
              <p className="text-sm font-black text-emerald-900 dark:text-emerald-200">
                {preflight.matchedInvoices.length} matching invoice{preflight.matchedInvoices.length === 1 ? '' : 's'} for this term
              </p>
              <ul className="mt-3 space-y-2">
                {preflight.matchedInvoices.map((invoice) => (
                  <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <span className="font-black text-foreground">{invoice.invoiceNumber}</span>
                    <Link href={invoice.editHref} className="font-black text-primary underline">
                      Open invoice
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : preflight?.invoiceMatchCount ? (
            <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/10 p-4 text-sm text-emerald-900 dark:text-emerald-200">
              {preflight.invoiceMatchCount} matching invoice(s) found for this term.
            </p>
          ) : (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
              No matching invoice yet. You can still generate the draft, but publication will require a term invoice.
            </p>
          )}
          {!form.excludeBilling && preflight?.billingHref ? (
            <Link
              href={preflight.billingHref}
              className="inline-flex rounded-xl border border-border px-4 py-2 text-sm font-black hover:border-primary/40"
            >
              Open school billing
            </Link>
          ) : null}
          {!form.excludeBilling && preflight?.invoiceDiagnostics?.nearMisses?.length ? (
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
          {existingBook ? (
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm">
              <p className="font-black text-primary">Shared book already exists</p>
              <p className="mt-1 text-muted-foreground">
                {existingBook.title || 'Report book'} is already {existingBook.status} for this school and term. Generating
                will reopen that shared book instead of creating a duplicate.
              </p>
              <Link
                href={`/dashboard/school-reports/${existingBook.id}`}
                className="mt-3 inline-block text-xs font-black text-primary underline"
              >
                Open existing book
              </Link>
            </div>
          ) : null}
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

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => onStepChange((step - 1) as SetupWorkflowStep)}
              className="min-h-11 w-full rounded-xl border border-border px-4 py-2.5 text-sm font-black sm:w-auto"
            >
              Back
            </button>
          ) : (
            <Link
              href="/dashboard/school-reports"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border px-4 py-2.5 text-sm font-black sm:w-auto"
            >
              Cancel
            </Link>
          )}
          {step < 5 ? (
            <>
              {step === 1 && expressReady ? (
                <button
                  type="button"
                  disabled={working === 'generate'}
                  onClick={() => void onGenerate()}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-600 bg-emerald-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50 sm:w-auto"
                  title="Skip wizard steps — uses detected delivery range and creates draft with auto-delivery"
                >
                  <SparklesIcon className="h-4 w-4" />
                  {working === 'generate' ? 'Creating…' : 'Express setup'}
                </button>
              ) : null}
              <button
                type="button"
                disabled={!canEnterStep(Math.min(5, step + 1) as SetupWorkflowStep)}
                onClick={handleContinue}
                className="min-h-11 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-white disabled:opacity-50 sm:w-auto"
              >
                Continue
              </button>
            </>
          ) : (
            <button
              onClick={() => void onGenerate()}
              disabled={working === 'generate' || !scopeReady || !curriculumStepReady}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-black text-white disabled:opacity-50 sm:w-auto"
            >
              <SparklesIcon className="h-4 w-4" />
              {working === 'generate' ? 'Gathering data and writing draft...' : 'Generate report draft'}
            </button>
          )}
        </div>
        {stepHint ? (
          <p className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-200 sm:w-auto">
            {stepHint}
          </p>
        ) : null}
      </div>
    </section>
  );
}
