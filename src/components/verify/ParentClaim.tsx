'use client';

import { useState } from 'react';
import { suggestEmailFix } from '@/lib/email-typo';

// Self-service parent intake shown on the public verify page. A parent enters their
// details once and their account is created + linked to the scanned child (and any
// siblings on file) automatically — the login is sent to their email + WhatsApp.
export default function ParentClaim({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', relationship: 'Guardian' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ childName: string | null; accountCreated: boolean; siblingsLinked: number } | null>(null);

  const emailFix = suggestEmailFix(form.email);
  const field = 'w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary transition-colors';

  async function submit() {
    setError(null); setLoading(true);
    try {
      const res = await fetch('/api/parent-claim/intake', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, ...form }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error || 'Something went wrong'); return; }
      setDone({ childName: j.childName ?? null, accountCreated: !!j.accountCreated, siblingsLinked: j.siblingsLinked ?? 0 });
    } catch { setError('Network error — please try again.'); }
    finally { setLoading(false); }
  }

  const box = 'bg-card border border-border rounded-2xl p-6 space-y-4';

  if (done) {
    return (
      <div className={box}>
        <p className="text-sm font-black text-emerald-400">
          ✓ Done{done.childName ? ` — ${done.childName} is linked to your account` : ''}.
        </p>
        {done.siblingsLinked > 0 && (
          <p className="text-xs text-foreground">We also linked {done.siblingsLinked} sibling{done.siblingsLinked !== 1 ? 's' : ''} on record with your contact.</p>
        )}
        {done.accountCreated
          ? <p className="text-xs text-muted-foreground">Your parent login was sent to your email and WhatsApp — sign in anytime to manage results.</p>
          : <p className="text-xs text-muted-foreground">Your existing parent account is now linked. Sign in to see all your children.</p>}
      </div>
    );
  }

  if (!open) {
    return (
      <div className={box}>
        <div className="space-y-1">
          <p className="text-sm font-black text-foreground">Are you the parent / guardian?</p>
          <p className="text-xs text-muted-foreground">Enter your details once — we’ll create &amp; link your parent account automatically and text/email you the login.</p>
        </div>
        <button onClick={() => setOpen(true)} className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary/90 transition-all">
          Link this child to my account
        </button>
      </div>
    );
  }

  return (
    <div className={box}>
      <p className="text-sm font-black text-foreground">Your details</p>
      {error && <p className="text-xs text-rose-400 font-bold">{error}</p>}
      <input className={field} placeholder="Your full name" value={form.fullName}
        onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} />
      <div>
        <input className={field} type="email" placeholder="Your email" value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        {emailFix && (
          <button type="button" onClick={() => setForm(f => ({ ...f, email: emailFix }))}
            className="mt-1.5 text-[10px] font-bold text-amber-500 hover:text-amber-400">
            Did you mean <span className="underline">{emailFix}</span>? — tap to fix
          </button>
        )}
      </div>
      <input className={field} type="tel" placeholder="Your phone (WhatsApp)" value={form.phone}
        onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
      <select className={field} value={form.relationship}
        onChange={e => setForm(f => ({ ...f, relationship: e.target.value }))}>
        {['Guardian', 'Father', 'Mother', 'Other'].map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      <div className="flex gap-2">
        <button onClick={() => setOpen(false)} className="px-4 py-2.5 border border-border rounded-xl text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground">Back</button>
        <button onClick={submit} disabled={loading || !form.fullName || !form.email || !form.phone}
          className="flex-1 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary/90 transition-all disabled:opacity-50">
          {loading ? 'Linking…' : 'Create & link my account'}
        </button>
      </div>
    </div>
  );
}
