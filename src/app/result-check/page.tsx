'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRightIcon,
  ExclamationTriangleIcon,
  QrCodeIcon,
} from '@/lib/icons';
import { normalizeAccessCardCode, formatAccessCardCodeInput } from '@/lib/access-card-code';
import ResultCheckShell from '@/components/result-check/ResultCheckShell';

export default function ResultCheckEntryPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeAccessCardCode(code);
    const fallback = code.trim().toUpperCase().replace(/\s+/g, '');
    const target = normalized || (fallback.length >= 6 ? fallback : '');
    if (!target) {
      setError('Enter the RC code printed on the child access card.');
      return;
    }
    setBusy(true);
    router.push(`/result-check/${encodeURIComponent(target)}`);
  }

  return (
    <ResultCheckShell>
      <section className="mx-auto max-w-xl">
        <div className="rc-fade-up space-y-5 text-center sm:space-y-6">
          <p className="rc-display text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl md:text-6xl">
            RILLCOD
          </p>
          <div className="space-y-2">
            <h1 className="rc-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Check your child&apos;s result
            </h1>
            <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
              Enter the RC code under the QR on the access card to open the official report.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rc-fade-up-delay rc-panel mt-8 space-y-4 rounded-[1.75rem] p-5 sm:mt-10 sm:p-7"
        >
          <label htmlFor="result-code" className="block text-left text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Access card code
          </label>
          <div className="relative">
            <QrCodeIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary/50" />
            <input
              id="result-code"
              aria-describedby={error ? 'result-code-error result-code-help' : 'result-code-help'}
              aria-invalid={!!error}
              value={code}
              onChange={(event) => {
                setCode(formatAccessCardCodeInput(event.target.value));
                setError('');
              }}
              placeholder="RC then 8 characters"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={32}
              className="rc-input w-full rounded-2xl px-4 py-4 pl-12 text-base font-bold uppercase tracking-[0.18em] outline-none transition placeholder:tracking-normal sm:text-lg"
            />
          </div>

          {error && (
            <div
              id="result-code-error"
              role="alert"
              className="flex items-start gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-left text-sm text-rose-600 dark:text-rose-300"
            >
              <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="rc-cta rc-cta-pulse flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-sm font-bold tracking-wide disabled:opacity-70 sm:text-base"
          >
            {busy ? 'Opening…' : 'Verify & open report'}
            {!busy && <ArrowRightIcon className="h-5 w-5" />}
          </button>

          <p id="result-code-help" className="text-center text-xs leading-relaxed text-muted-foreground">
            Type <span className="font-semibold text-foreground">RC</span> then the 8 characters — the dash is added for you.
            <span className="mt-1 block text-[11px] opacity-80">Example: RCAB12CD34 → RC-AB12CD34</span>
          </p>
        </form>

        <p className="rc-fade-up-late mt-8 text-center text-[11px] text-muted-foreground">
          Secured by Rillcod Technologies · Parent verified access
        </p>
      </section>
    </ResultCheckShell>
  );
}
