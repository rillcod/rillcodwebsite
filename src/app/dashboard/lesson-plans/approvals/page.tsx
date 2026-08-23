'use client';

/**
 * Publish teaching plans in bulk.
 *
 * A plan is created as a draft on purpose — draft → published → archived is the
 * Academic Office's gate, and it should stay one. But the only way to pass that
 * gate was a small button near the bottom of a single plan's own page. With
 * four plans that was fine. Thirty-two arrived at once and it became thirty-two
 * page visits, hunting the same button each time.
 *
 * The existing Teaching Approvals screen does not help: it releases generated
 * week content to learners, which is a different gate on a different object,
 * and its presence makes the missing one harder to notice rather than easier.
 *
 * This is the same list-and-select shape as that screen, pointed at plan status.
 * It calls the same PATCH the per-plan button calls, one plan at a time, so
 * there is no new write path to get wrong — only a faster way to reach the one
 * that already exists.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { ArrowPathIcon, CheckIcon, DocumentTextIcon } from '@/lib/icons';
import { ApprovalGateNav } from '@/components/academic/ApprovalGateNav';

type DraftPlan = {
  id: string;
  version: number | null;
  class_name: string | null;
  school_name: string | null;
  course_title: string | null;
  weeks: number;
};

export default function PlanApprovalsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [plans, setPlans] = useState<DraftPlan[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const canApprove = profile?.role === 'admin' || profile?.role === 'teacher';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const db = createClient();
      const { data, error } = await db
        .from('lesson_plans')
        // The class embed names its foreign key. lesson_plans has exactly one
        // route to classes today, so PostgREST resolves it either way — but the
        // moment a second is added the unhinted form stops being ambiguous in
        // theory and starts returning an error in production, on a page that
        // only staff open. audit:supabase-embeds fails the build on the
        // unhinted form for that reason, and has been failing it since before
        // this page existed.
        .select('id, version, plan_data, classes!lesson_plans_class_id_fkey(name), schools(name), courses(title)')
        .eq('status', 'draft')
        .order('created_at', { ascending: false });
      if (error) throw error;

      setPlans(
        (data ?? []).map((row: any) => {
          const one = (v: any) => (Array.isArray(v) ? v[0] : v);
          const weeks = Array.isArray(row.plan_data?.weeks) ? row.plan_data.weeks.length : 0;
          return {
            id: row.id,
            version: row.version,
            class_name: one(row.classes)?.name ?? null,
            school_name: one(row.schools)?.name ?? null,
            course_title: one(row.courses)?.title ?? null,
            weeks,
          };
        }),
      );
    } catch {
      toast.error('Could not load draft plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => (prev.size === plans.length ? new Set() : new Set(plans.map((p) => p.id))));

  /**
   * Published one at a time through the same endpoint the single-plan button
   * uses. Slower than one bulk call and deliberately so: a partial failure
   * leaves the plans that succeeded published and names the ones that did not,
   * rather than rolling back work the Academic Office meant to approve.
   */
  async function publishSelected() {
    const ids = plans.filter((p) => selected.has(p.id));
    if (ids.length === 0) return;
    setBusy(true);
    let ok = 0;
    const failed: string[] = [];

    for (const plan of ids) {
      try {
        const res = await fetch(`/api/lesson-plans/${plan.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'published', version: (plan.version ?? 1) + 1 }),
        });
        if (!res.ok) throw new Error();
        ok += 1;
      } catch {
        failed.push(plan.class_name ?? plan.id);
      }
    }

    setBusy(false);
    setSelected(new Set());
    if (ok) toast.success(`${ok} plan${ok === 1 ? '' : 's'} published`);
    if (failed.length) toast.error(`Could not publish: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''}`);
    void load();
  }

  if (authLoading) {
    return <div className="p-6"><div className="h-32 rounded-2xl border border-border bg-card/40 animate-pulse" /></div>;
  }

  if (!canApprove) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-6 text-sm text-muted-foreground">
          Only an administrator or teacher can publish teaching plans.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Approvals</p>
          <h1 className="text-lg font-black tracking-tight text-foreground">Approve teaching plans</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            A class can only generate its weeks once its plan is published. Review, then publish.
          </p>
          <div className="mt-3">
            <ApprovalGateNav current="plans" />
          </div>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading || busy}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-[11px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <ArrowPathIcon className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="h-40 rounded-2xl border border-border bg-card/40 animate-pulse" />
      ) : plans.length === 0 ? (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-6 text-sm text-emerald-700 dark:text-emerald-400">
          No plans are waiting. Every class with a teaching plan is published.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2">
            <button onClick={toggleAll} className="text-xs font-bold text-muted-foreground hover:text-foreground">
              {selected.size === plans.length ? 'Clear selection' : `Select all ${plans.length}`}
            </button>
            <span className="ml-auto text-[11px] text-muted-foreground">{selected.size} selected</span>
            <button
              onClick={() => void publishSelected()}
              disabled={busy || selected.size === 0}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 text-[11px] font-black uppercase tracking-widest text-emerald-700 transition-colors hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-300"
            >
              {busy ? <><ArrowPathIcon className="h-3.5 w-3.5 animate-spin" /> Publishing…</> : <><CheckIcon className="h-3.5 w-3.5" /> Publish selected ({selected.size})</>}
            </button>
          </div>

          <ul className="space-y-1.5">
            {plans.map((plan) => (
              <li
                key={plan.id}
                className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                  selected.has(plan.id) ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border bg-card'
                }`}
              >
                <button
                  onClick={() => toggle(plan.id)}
                  aria-label={`Select ${plan.class_name ?? 'plan'}`}
                  className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                    selected.has(plan.id) ? 'border-emerald-500 bg-emerald-500' : 'border-border'
                  }`}
                >
                  {selected.has(plan.id) && <CheckIcon className="h-3 w-3 text-white" />}
                </button>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-foreground">{plan.class_name ?? '(class not named)'}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {plan.school_name ?? 'no school'}
                    {plan.course_title ? ` · ${plan.course_title}` : ''}
                    {' · '}
                    {plan.weeks} week{plan.weeks === 1 ? '' : 's'}
                  </p>
                </div>

                {/* Reviewing before approving is the point of the gate, so the
                    plan itself is one click away rather than buried. */}
                <Link
                  href={`/dashboard/lesson-plans/${plan.id}`}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] font-bold text-muted-foreground hover:text-foreground"
                >
                  <DocumentTextIcon className="h-3.5 w-3.5" /> Review
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
