'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRightIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from '@/lib/icons';
import { resolveResultCheckTarget, formatAccessCardCodeInput } from '@/lib/access-card-code';
import ResultCheckShell from '@/components/result-check/ResultCheckShell';

export default function ResultCheckEntryPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = resolveResultCheckTarget(code);
    if (!target) {
      setError('Enter the 8-character RC code printed on your child’s access card (e.g. RC-1234-5678).');
      return;
    }
    setBusy(true);
    router.push(`/result-check/${encodeURIComponent(target)}?via=typed`);
  }

  async function handlePasteFromClipboard() {
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip) return;
      const formatted = formatAccessCardCodeInput(clip);
      if (formatted) {
        setCode(formatted);
        setError('');
      }
    } catch {
      /* clipboard permission denied — user can long-press paste normally */
    }
  }

  return (
    <ResultCheckShell>
      <section className="mx-auto max-w-lg">
        <div className="rc-fade-up space-y-3 text-center">
          <p className="rc-display text-3xl font-extrabold tracking-tight text-foreground sm:text-5xl">
            RILLCOD
          </p>
          <h1 className="rc-display text-xl font-bold tracking-tight text-foreground sm:text-3xl">
            Check your child&apos;s result
          </h1>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
            Enter or paste the <span className="font-semibold text-foreground">8-character RC code</span> from your child&apos;s access card (or scan the QR code on the card).
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rc-fade-up-delay rc-panel mt-6 space-y-4 rounded-[1.75rem] p-5 sm:mt-8 sm:p-7"
        >
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="result-code" className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              RC student code
            </label>
            <button
              type="button"
              onClick={() => void handlePasteFromClipboard()}
              className="rounded-lg border border-border bg-card/80 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-muted transition-colors"
            >
              Paste code
            </button>
          </div>

          <div className="relative flex items-center overflow-hidden rounded-2xl border border-border bg-background focus-within:border-primary">
            <span className="pointer-events-none shrink-0 pl-4 text-lg font-black tracking-wider text-primary sm:text-xl">
              RC-
            </span>
            <input
              id="result-code"
              aria-describedby={error ? 'result-code-error result-code-help' : 'result-code-help'}
              aria-invalid={!!error}
              value={code}
              onChange={(event) => {
                setCode(formatAccessCardCodeInput(event.target.value));
                setError('');
              }}
              placeholder="1234-5678"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              autoFocus
              maxLength={16}
              className="rc-input w-full border-0 bg-transparent px-2 py-4 text-center text-xl font-bold tracking-[0.22em] outline-none transition placeholder:tracking-normal sm:text-2xl"
            />
            {code ? (
              <button
                type="button"
                onClick={() => {
                  setCode('');
                  setError('');
                }}
                aria-label="Clear code"
                className="mr-2 inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            ) : null}
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
            className="rc-cta rc-cta-pulse flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-bold tracking-wide disabled:opacity-70 sm:text-base"
          >
            {busy ? 'Opening…' : 'Open Result'}
            {!busy && <ArrowRightIcon className="h-5 w-5" />}
          </button>

          <p id="result-code-help" className="text-center text-xs leading-relaxed text-muted-foreground">
            Works with both numeric codes (<span className="font-mono font-semibold text-foreground">RC-1234-5678</span>) and older alphanumeric cards (<span className="font-mono font-semibold text-foreground">RC-AB12-CD34</span>). First-time parents will link their details on the next screen.
          </p>

          <div className="pt-3 border-t border-border/60 text-center">
            <Link
              href="/login?type=parent"
              className="inline-flex min-h-10 items-center justify-center text-xs font-bold text-primary hover:underline"
            >
              Already have a Parent or Student login? Sign in →
            </Link>
          </div>
        </form>
      </section>
    </ResultCheckShell>
  );
}
