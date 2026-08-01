'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle, Loader2, ShieldAlert } from 'lucide-react';

export default function AccountDeletionPage() {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [reason, setReason] = useState('');
  const [website, setWebsite] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError('');
    try {
      const response = await fetch('/api/account-deletion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, fullName, reason, website }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to submit request.');
      setDone(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to submit request.'); }
    finally { setLoading(false); }
  }

  return <main className="min-h-dvh bg-background px-[max(1rem,var(--safe-area-left))] py-[max(2rem,var(--safe-area-top))] text-foreground public-page-root overflow-x-clip">
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/login" className="text-sm font-bold text-primary">← Back to Rillcod Academy</Link>
      <section className="rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-8">
        <div className="mb-6 flex items-start gap-4"><div className="rounded-xl bg-rose-500/10 p-3"><ShieldAlert className="h-6 w-6 text-rose-500" /></div><div><h1 className="text-2xl font-black">Request account deletion</h1><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Request deletion of your Rillcod Academy account and associated personal data. We verify requests to protect students and school records.</p></div></div>
        {done ? <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5"><CheckCircle className="mb-3 h-7 w-7 text-emerald-500" /><h2 className="font-black">Request received</h2><p className="mt-2 text-sm text-muted-foreground">We will verify the account, explain any legally required retention, and process the request as soon as reasonably possible. Contact privacy@rillcodacademy.com if you need help.</p></div> :
        <form onSubmit={submit} className="space-y-4">
          <div className="hidden"><label>Website<input value={website} onChange={e => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" /></label></div>
          <label className="block text-sm font-bold">Account email<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3" /></label>
          <label className="block text-sm font-bold">Full name<input autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3" /></label>
          <label className="block text-sm font-bold">Reason <span className="font-normal text-muted-foreground">(optional)</span><textarea value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} className="mt-2 min-h-28 w-full rounded-xl border border-border bg-background px-4 py-3" /></label>
          {error && <p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-sm font-bold text-rose-500">{error}</p>}
          <button disabled={loading} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-3 font-black text-white disabled:opacity-60">{loading && <Loader2 className="h-4 w-4 animate-spin" />}{loading ? 'Submitting…' : 'Submit deletion request'}</button>
        </form>}
      </section>
      <section className="rounded-2xl border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground"><h2 className="mb-2 font-black text-foreground">What happens next</h2><p>We confirm account ownership, identify associated personal data, and remove it unless limited information must be retained for security, fraud prevention, financial, safeguarding, or legal obligations. Any retained information and retention period will be explained.</p><p className="mt-3">Read the <Link href="/privacy-policy" className="font-bold text-primary underline">Privacy Policy</Link>.</p></section>
    </div>
  </main>;
}