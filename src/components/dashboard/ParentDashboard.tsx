'use client';

import { useEffect, useState } from 'react';
import {
  UserGroupIcon, DocumentChartBarIcon, ClipboardDocumentCheckIcon,
  ArrowRightIcon, ArrowPathIcon, AcademicCapIcon, EnvelopeIcon,
  ClipboardDocumentListIcon, TrophyIcon, BanknotesIcon, BellIcon,
  ExclamationTriangleIcon, CheckCircleIcon,
} from '@/lib/icons';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface ChildSummary {
  id: string;
  full_name: string;
  school_name: string | null;
  grade_level: string | null;
  status: string;
}

interface ParentDashboardProps {
  profile: { id: string; full_name: string | null; email: string };
  children: ChildSummary[];
  dataLoading: boolean;
  onRefresh: () => void;
}

interface DashStats {
  outstandingBalance: number;
  currency: string;
  unreadNotifications: number;
  overdueinvoices: number;
}

const QUICK_ACTIONS = [
  { name: 'My Children',     href: '/dashboard/my-children',       icon: UserGroupIcon,              desc: 'View all linked children' },
  { name: 'Report Cards',    href: '/dashboard/parent-results',    icon: DocumentChartBarIcon,       desc: 'View academic progress' },
  { name: 'Attendance',      href: '/dashboard/parent-attendance', icon: ClipboardDocumentCheckIcon, desc: 'Check attendance records' },
  { name: 'Grades',          href: '/dashboard/parent-grades',     icon: ClipboardDocumentListIcon,  desc: 'View grades & assignments' },
  { name: 'Certificates',    href: '/dashboard/parent-certificates',icon: TrophyIcon,                desc: "View child's certificates" },
  { name: 'Invoices & Pay',  href: '/dashboard/parent-invoices',   icon: BanknotesIcon,              desc: 'Pay fees & view invoices' },
  { name: 'Messages',        href: '/dashboard/messages',          icon: EnvelopeIcon,               desc: 'Contact teachers & staff' },
];

export default function ParentDashboard({ profile, children, dataLoading, onRefresh }: ParentDashboardProps) {
  const firstName = profile.full_name?.split(' ')[0] ?? 'Parent';
  const [stats, setStats] = useState<DashStats | null>(null);

  useEffect(() => {
    if (!profile?.id || children.length === 0) return;
    const supabase = createClient();
    const childUserIds = children.map(c => (c as any).user_id).filter(Boolean);

    Promise.all([
      // Outstanding + overdue invoices for all children
      childUserIds.length > 0
        ? supabase
            .from('invoices')
            .select('amount, currency, status')
            .in('portal_user_id', childUserIds)
            .in('status', ['pending', 'overdue'])
        : Promise.resolve({ data: [] }),

      // Unread notifications
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('is_read', false),
    ]).then(([invRes, notifRes]) => {
      const invoices = (invRes as any).data ?? [];
      const total = invoices.reduce((sum: number, inv: any) => sum + Number(inv.amount), 0);
      const overdue = invoices.filter((inv: any) => inv.status === 'overdue').length;
      const currency = invoices[0]?.currency ?? 'NGN';
      setStats({
        outstandingBalance: total,
        currency,
        unreadNotifications: (notifRes as any).count ?? 0,
        overdueinvoices: overdue,
      });
    });
  }, [profile?.id, children.length]); // eslint-disable-line

  const formatCurrency = (amount: number, currency: string) =>
    new Intl.NumberFormat('en-NG', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount);

  return (
    <div className="space-y-6">

      {/* Welcome Banner */}
      <div className="bg-card border border-border rounded-none p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-orange-600 to-orange-400 opacity-[0.04] blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-orange-500 mb-1">Parent Portal</p>
            <h1 className="text-2xl font-black text-foreground tracking-tight">Welcome back, {firstName}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {children.length > 0
                ? `You have ${children.length} child${children.length > 1 ? 'ren' : ''} enrolled.`
                : 'No children linked yet. Contact admin to link your child.'}
            </p>
          </div>
          <button onClick={onRefresh} disabled={dataLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground bg-muted border border-border transition-all disabled:opacity-40 flex-shrink-0">
            <ArrowPathIcon className={`w-3.5 h-3.5 ${dataLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Alert bar — overdue invoices */}
        {stats && stats.overdueinvoices > 0 && (
          <div className="relative z-10 mt-4 flex items-center gap-3 px-4 py-2.5 bg-rose-500/10 border border-rose-500/30">
            <ExclamationTriangleIcon className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span className="text-xs text-rose-400 font-bold">
              {stats.overdueinvoices} overdue invoice{stats.overdueinvoices > 1 ? 's' : ''} —
            </span>
            <Link href="/dashboard/parent-invoices" className="text-xs font-black text-rose-400 hover:text-rose-300 underline underline-offset-2">
              Pay Now
            </Link>
          </div>
        )}
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-card border border-border p-4">
            <p className={`text-xl font-black ${stats.outstandingBalance > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {stats.outstandingBalance > 0 ? formatCurrency(stats.outstandingBalance, stats.currency) : 'All Clear'}
            </p>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">Outstanding Balance</p>
          </div>
          <div className="bg-card border border-border p-4">
            <p className="text-xl font-black text-foreground">{children.length}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">Children Enrolled</p>
          </div>
          <div className="bg-card border border-border p-4 col-span-2 sm:col-span-1">
            <Link href="/dashboard/messages" className="flex items-start gap-2 group">
              <div>
                <p className={`text-xl font-black ${stats.unreadNotifications > 0 ? 'text-orange-400' : 'text-foreground'}`}>
                  {stats.unreadNotifications}
                </p>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">Unread Notifications</p>
              </div>
              {stats.unreadNotifications > 0 && (
                <BellIcon className="w-4 h-4 text-orange-400 mt-1 animate-pulse" />
              )}
            </Link>
          </div>
        </div>
      )}

      {/* Children Cards */}
      {!dataLoading && children.length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">My Children</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {children.map(child => (
              <div key={child.id} className="bg-card border border-border p-5 hover:bg-white/5 transition-all group relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-orange-600 to-orange-400 opacity-[0.03] blur-2xl -mr-12 -mt-12 group-hover:scale-150 transition-transform pointer-events-none" />

                <div className="flex items-start gap-3 relative z-10">
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-600 to-orange-400 flex items-center justify-center flex-shrink-0">
                    <AcademicCapIcon className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-foreground text-sm truncate">{child.full_name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{child.school_name ?? '—'}</p>
                    {child.grade_level && (
                      <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wider mt-0.5">{child.grade_level}</p>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between relative z-10">
                  <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 border ${
                    child.status === 'approved'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  }`}>
                    {child.status}
                  </span>
                  <Link href={`/dashboard/parent-results?student=${child.id}`}
                    className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-orange-500 hover:text-orange-400 transition-colors">
                    Progress <ArrowRightIcon className="w-3 h-3" />
                  </Link>
                </div>

                {/* Per-child quick links */}
                <div className="mt-3 pt-3 border-t border-border grid grid-cols-3 gap-1.5 relative z-10">
                  {[
                    { label: 'Attendance', href: `/dashboard/parent-attendance?student=${child.id}`, icon: ClipboardDocumentCheckIcon },
                    { label: 'Grades', href: `/dashboard/parent-grades?student=${child.id}`, icon: ClipboardDocumentListIcon },
                    { label: 'Invoices', href: `/dashboard/parent-invoices?student=${child.id}`, icon: BanknotesIcon },
                  ].map(({ label, href, icon: Icon }) => (
                    <Link key={label} href={href}
                      className="flex flex-col items-center gap-1 py-2 bg-muted hover:bg-orange-500/10 hover:border-orange-500/20 border border-transparent transition-all text-center">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">{label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {dataLoading && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">My Children</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="bg-card border border-border p-5 animate-pulse">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-muted" />
                  <div className="flex-1">
                    <div className="h-4 bg-muted rounded w-2/3 mb-2" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Quick Access</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {QUICK_ACTIONS.map(({ name, href, icon: Icon, desc }) => (
            <Link key={name} href={href}
              className="bg-card border border-border p-4 hover:bg-white/5 hover:border-orange-500/30 transition-all group flex flex-col gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-orange-600 to-orange-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Icon className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-xs font-black text-foreground uppercase tracking-wider leading-tight">{name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
