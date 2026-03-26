'use client';

import {
  BuildingOfficeIcon, ShieldCheckIcon, AcademicCapIcon,
  UserGroupIcon, ChartBarIcon, BanknotesIcon, ArrowRightIcon,
  ArrowPathIcon
} from '@/lib/icons';
import Link from 'next/link';

interface AdminDashboardProps {
  stats: any[];
  activities: any[];
  schoolPayments: any[];
  dataLoading: boolean;
  onRefresh: () => void;
}

export default function AdminDashboard({ stats, activities, schoolPayments, dataLoading, onRefresh }: AdminDashboardProps) {
  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Admin Oversight</p>
        <button
          onClick={onRefresh}
          disabled={dataLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground bg-card shadow-sm hover:bg-muted border border-border rounded-none transition-all disabled:opacity-40"
        >
          <ArrowPathIcon className={`w-3.5 h-3.5 ${dataLoading ? 'animate-spin' : ''}`} />
          Refresh Registry
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-6">
        {dataLoading
          ? Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-card shadow-sm border border-border p-5 sm:p-6 animate-pulse">
              <div className="h-10 w-10 bg-muted rounded-none mb-4" />
              <div className="h-8 bg-muted rounded w-1/2 mb-2" />
              <div className="h-4 bg-card shadow-sm rounded w-2/3" />
            </div>
          ))
          : stats.map(({ label, value, icon: Icon, gradient }) => (
            <div key={label} className="bg-card shadow-sm border border-border p-5 sm:p-7 group relative overflow-hidden transition-all hover:bg-white/8">
              <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${gradient} opacity-[0.03] blur-2xl -mr-12 -mt-12 group-hover:scale-150 transition-transform`} />
              <div className="flex items-start justify-between mb-5 relative z-10">
                <div className={`w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br ${gradient} flex items-center justify-center shadow-xl`}>
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-foreground" />
                </div>
              </div>
              <p className="text-2xl sm:text-4xl font-black text-foreground tracking-tight tabular-nums relative z-10">{value}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground font-black uppercase tracking-widest mt-1.5 relative z-10">{label}</p>
            </div>
          ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Finance & Analytics */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card shadow-sm border border-border p-6 sm:p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-orange-500/5 blur-[80px] -mr-24 -mt-24 pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-[9px] font-black text-orange-500 uppercase tracking-[0.4em]">Resource Flow</p>
                  <h2 className="text-xl font-black text-foreground uppercase tracking-tight mt-0.5">Financial Monitoring</h2>
                </div>
                <Link href="/dashboard/payments" className="text-[10px] font-black text-muted-foreground hover:text-foreground uppercase tracking-widest flex items-center gap-1.5 transition-colors">
                  All Records <ArrowRightIcon className="w-3 h-3" />
                </Link>
              </div>

              {schoolPayments.length > 0 ? (
                <div className="divide-y divide-border border-t border-border">
                  {schoolPayments.map((inv) => (
                    <div key={inv.id} className="py-4 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-black text-foreground uppercase tracking-tight truncate">{inv.schools?.name || 'Rillcod Portal'}</p>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mt-0.5 truncate">{inv.invoice_number}</p>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-xs font-black text-foreground tabular-nums">₦{inv.amount.toLocaleString()}</p>
                          <p className={`text-[10px] font-black uppercase tracking-widest mt-0.5 ${inv.status === 'paid' ? 'text-emerald-400' : 'text-amber-400 animate-pulse'}`}>
                            {inv.status}
                          </p>
                        </div>
                        <Link href={`/dashboard/payments?invoice=${inv.id}`} className="p-2 hover:bg-muted rounded-none border border-border transition-colors">
                            <BanknotesIcon className="w-4 h-4 text-muted-foreground hover:text-orange-400" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 border border-dashed border-border text-center">
                  <BanknotesIcon className="w-10 h-10 mx-auto text-muted-foreground/20 mb-3" />
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">No recent school billing records</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-card shadow-sm border border-border p-6 sm:p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-[9px] font-black text-orange-500 uppercase tracking-[0.4em]">Internal Overview</p>
                <h2 className="text-xl font-black text-foreground uppercase tracking-tight mt-0.5">Management Quicklinks</h2>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'Schools', href: '/dashboard/schools', icon: BuildingOfficeIcon, count: stats[0]?.value || '…' },
                { label: 'Teachers', href: '/dashboard/teachers', icon: AcademicCapIcon, count: stats[2]?.value || '…' },
                { label: 'Students', href: '/dashboard/students', icon: UserGroupIcon, count: stats[3]?.value || '…' },
              ].map((item) => (
                <Link key={item.label} href={item.href} className="flex flex-col items-center gap-3 p-6 bg-background border border-border hover:border-orange-500/20 transition-all group">
                  <item.icon className="w-7 h-7 text-muted-foreground group-hover:text-orange-400" />
                  <div>
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest text-center">{item.label}</p>
                    <p className="text-sm font-black text-foreground text-center mt-0.5">{item.count}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Activity Feed */}
        <div className="bg-card shadow-sm border border-border p-6 sm:p-8 h-fit">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">System Registry</h3>
            <div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(251,146,60,0.8)]" />
          </div>

          <div className="space-y-8 relative before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-muted">
             {activities.map((act) => (
                <div key={act.id} className="relative flex items-start gap-4">
                   <div className={`w-8 h-8 ${act.color} flex items-center justify-center flex-shrink-0 z-10`}>
                      <act.icon className="w-4 h-4" />
                   </div>
                   <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-foreground uppercase tracking-tight truncate">{act.title}</p>
                      <p className="text-[10px] text-muted-foreground font-medium truncate mt-0.5">{act.desc}</p>
                      <p className="text-[9px] font-black text-orange-500/60 uppercase tracking-widest mt-1.5">{act.time}</p>
                   </div>
                </div>
             ))}
          </div>
        </div>
      </div>
    </div>
  );
}
