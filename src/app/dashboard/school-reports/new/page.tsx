'use client';

import Link from 'next/link';
import { SchoolReportSetupWizard } from '@/components/school-reports/SchoolReportSetupWizard';
import { useSchoolReportSetup } from '@/hooks/useSchoolReportSetup';

export default function NewSchoolReportPage() {
  const setup = useSchoolReportSetup();

  if (!setup.loading && !setup.canManage) {
    return (
      <div className="mx-auto max-w-3xl p-8 mobile-page-root">
        <p className="rounded-xl border border-border p-6 text-sm text-muted-foreground">
          Only authorised staff can create school report books.{' '}
          <Link href="/dashboard/school-reports" className="font-black text-primary underline">
            Back to reports
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7 p-4 md:p-8 mobile-page-root">
      <header>
        <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">New report book</p>
        <h1 className="mt-2 text-3xl font-black text-foreground">Generate school performance report</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Choose the school and term, then tick what was taught. Those ticks pull through into the draft — you do not have
          to open the editor first.
        </p>
      </header>

      {setup.error ? (
        <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-600 dark:text-rose-400">
          {setup.error}
        </p>
      ) : null}
      {setup.info ? (
        <p className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm text-primary">{setup.info}</p>
      ) : null}

      {setup.loading ? (
        <p className="rounded-2xl border border-border p-8 text-center text-muted-foreground">Loading setup…</p>
      ) : (
        <SchoolReportSetupWizard
          step={setup.step}
          onStepChange={setup.setStep}
          schools={setup.schools}
          terms={setup.terms}
          form={setup.form}
          setForm={setup.setForm}
          chooseSchool={setup.chooseSchool}
          chooseTerm={setup.chooseTerm}
          curriculumRangeHint={setup.curriculumRangeHint}
          curriculumDetectionError={setup.curriculumDetectionError}
          detectingRange={setup.detectingRange}
          detectCurriculumRange={setup.detectCurriculumRange}
          preflight={setup.preflight}
          preflightLoading={setup.preflightLoading}
          runPreflight={setup.runPreflight}
          working={setup.working}
          onGenerate={setup.generate}
          activeBooks={setup.activeBooks}
        />
      )}
    </div>
  );
}
