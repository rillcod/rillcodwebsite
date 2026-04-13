'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ExclamationTriangleIcon, ArrowPathIcon, BanknotesIcon, CogIcon } from '@/lib/icons';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';

type BillingNotice = {
  id: string;
  title: string;
  message: string;
  due_date: string | null;
  is_sticky: boolean;
  owner_type: 'school' | 'individual';
};

export default function BillingStickyNotices() {
  const { profile } = useAuth();
  const [items, setItems] = useState<BillingNotice[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin';
  const visibleForRole = useMemo(
    () => ['admin', 'school', 'teacher', 'parent', 'student'].includes(profile?.role ?? ''),
    [profile?.role],
  );

  async function load() {
    if (!visibleForRole) return;
    setLoading(true);
    try {
      const res = await fetch('/api/billing/notices', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load billing notices');
      setItems((json.data ?? []) as BillingNotice[]);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function resolveNotice(id: string) {
    if (!isAdmin) return;
    setResolvingId(id);
    try {
      const res = await fetch('/api/billing/notices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to resolve notice');
      toast.success('Billing notice resolved');
      setItems(prev => prev.filter(n => n.id !== id));
    } catch (err: any) {
      toast.error(err?.message || 'Could not resolve notice');
    } finally {
      setResolvingId(null);
    }
  }

  useEffect(() => { load(); }, [visibleForRole]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visibleForRole) return null;
  if (!loading && items.length === 0) return null;

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="border border-border bg-card p-4 rounded-none flex items-center gap-3">
          <ArrowPathIcon className="w-4 h-4 animate-spin text-orange-400" />
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Loading billing notices...</p>
        </div>
      ) : items.map((notice) => (
        <div key={notice.id} className="border border-amber-500/30 bg-amber-500/10 p-4 sm:p-5 rounded-none">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300 flex items-center gap-1.5">
                <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                Billing Notice (Sticky)
              </p>
              <h3 className="text-sm sm:text-base font-black text-foreground mt-1">{notice.title}</h3>
              <p className="text-xs text-muted-foreground mt-1">{notice.message}</p>
              <p className="text-[10px] font-bold text-amber-300/90 mt-2 uppercase tracking-wider">
                Due: {notice.due_date ? new Date(notice.due_date).toLocaleDateString('en-GB') : 'As soon as possible'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard/payments"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-wider border border-amber-500/30 text-amber-200 hover:bg-amber-500/10 rounded-none"
              >
                <BanknotesIcon className="w-3.5 h-3.5" />
                Pay Now
              </Link>
              <Link
                href="/dashboard/billing"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-wider border border-border text-muted-foreground hover:text-foreground hover:bg-card rounded-none"
              >
                <CogIcon className="w-3.5 h-3.5" />
                Billing Contact
              </Link>
              {isAdmin && (
                <button
                  onClick={() => resolveNotice(notice.id)}
                  disabled={resolvingId === notice.id}
                  className="px-3 py-2 text-[10px] font-black uppercase tracking-wider border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 rounded-none disabled:opacity-50"
                >
                  {resolvingId === notice.id ? 'Resolving...' : 'Resolve'}
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

