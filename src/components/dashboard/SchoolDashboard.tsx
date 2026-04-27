'use client';

import {
  UserGroupIcon, AcademicCapIcon, ChartBarIcon,
  ClipboardDocumentListIcon, TrophyIcon, DocumentTextIcon,
  ArrowRightIcon, ArrowPathIcon, CogIcon
} from '@/lib/icons';
import Link from 'next/link';
import { SparkCard, RadialRing, CHART_COLORS } from '@/components/charts';

interface DashStats { label: string; value: string | number; icon: any; gradient: string }
interface Activity { id: string; title: string; desc: string; time: string; icon: any; color: string }
interface QuickAction { name: string; href: string; icon: any; desc: string }
interface Slot { id: string; start_time: string; subject: string; room: string | null; school_name?: string }

interface SchoolDashboardProps {
  profile: { full_name: string | null; email: string };
  stats: DashStats[];
  activities: Activity[];
  upcomingSlots: Slot[];
  quickActions: QuickAction[];
  dataLoading: boolean;
  onRefresh: () => void;
}

export default function SchoolDashboard({ profile, stats, activities, upcomingSlots, quickActions, dataLoading, onRefresh }: SchoolDashboardProps) {
  return (
    <div className="space-y-6">

      {/* Stats Grid */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Live Stats</p>
          <button onClick={onRefresh} disabled={dataLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground bg-card shadow-sm hover:bg-muted border border-border rounded-xl transition-all disabled:opacity-40">
            <ArrowPathIcon className={`w-3.5 h-3.5 ${dataLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          {dataLoading
            ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card shadow-sm border border-border rounded-xl p-5 sm:p-6 animate-pulse">
                <div className="h-10 w-10 bg-muted rounded-xl mb-4" />
                <div className="h-8 bg-muted rounded w-1/2 mb-2" />
                <div className="h-4 bg-card shadow-sm rounded w-2/3" />
              </div>
            ))
            : stats.map(({ label, value, icon: Icon, gradient }) => (
              <div key={label} className="bg-card shadow-sm border border-border border-t-2 border-t-brand-red-600 rounded-xl p-5 sm:p-7 hover:bg-white/8 transition-all group relative overflow-hidden">
                <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${gradient} opacity-[0.03] blur-2xl -mr-12 -mt-12 group-hover:scale-150 transition-transform`} />
                <div className="flex items-start justify-between mb-5 relative z-10">
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform`}>
                    <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-foreground" />
                  </div>
                  <span className="text-[8px] sm:text-[10px] font-black text-brand-red-600 uppercase tracking-[0.2em] bg-brand-red-600/5 px-2 py-0.5 rounded-full border border-brand-red-600/20">Live</span>
                </div>
                <p className="text-2xl sm:text-4xl font-black text-foreground tracking-tight tabular-nums relative z-10">{value}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground font-black uppercase tracking-widest mt-1.5 relative z-10">{label}</p>
              </div>
            ))}
        </div>
      </div>


      {/* Main Grid: Quick Actions + Activity + Sidebar */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Left: Quick Actions + Recent Activity */}
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-card shadow-sm border border-border rounded-xl p-6">
            <h2 className="text-lg font-bold text-foreground mb-5">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {quickActions.map(({ name, href, icon: Icon, desc }) => (
                <Link key={name} href={href}
                  className="group flex items-start gap-4 p-4 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-all">
                  <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/25 transition-colors">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">{name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="bg-background border border-border rounded-xl p-6 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-xl font-black text-foreground tracking-tight">Recent Activity</h2>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest mt-1">Live Platform Pulse</p>
              </div>
              <button onClick={onRefresh}
                className="p-3 rounded-xl bg-card shadow-sm hover:bg-muted text-muted-foreground hover:text-foreground border border-border transition-all group">
                <ArrowPathIcon className={`w-4 h-4 ${dataLoading ? 'animate-spin' : 'group-active:rotate-180 transition-transform'}`} />
              </button>
            </div>
            {dataLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex items-center gap-4 animate-pulse">
                    <div className="w-11 h-11 bg-card shadow-sm rounded-xl flex-shrink-0" />
                    <div className="flex-1 space-y-3">
                      <div className="h-4 bg-card shadow-sm rounded w-3/4" />
                      <div className="h-3 bg-card shadow-sm rounded w-1/2 opacity-50" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activities.length === 0 ? (
              <div className="text-center py-16 bg-white/[0.02] border border-dashed border-border rounded-xl">
                <div className="w-16 h-16 bg-card shadow-sm rounded-full flex items-center justify-center mx-auto mb-4 border border-border">
                  <ClipboardDocumentListIcon className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground font-bold uppercase tracking-widest text-xs">No recent activity yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activities.map((a) => (
                  <div key={a.id} className="group flex items-start gap-4 p-4 rounded-xl hover:bg-white/[0.03] transition-all border border-transparent hover:border-border">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg ${a.color} group-hover:scale-110 transition-transform`}>
                      <a.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-foreground text-sm tracking-tight group-hover:text-primary transition-colors uppercase leading-none mt-1">{a.title}</p>
                      <p className="text-xs text-muted-foreground mt-2 font-medium truncate">{a.desc}</p>
                    </div>
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest whitespace-nowrap mt-1 bg-card shadow-sm px-2 py-0.5 rounded-full border border-border">
                      {a.time}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-5">
          <div className="bg-gradient-to-br from-primary/20 to-primary/20 border border-primary/20 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary flex items-center justify-center text-xl font-black text-foreground">
                {(profile.full_name ?? 'S')[0].toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-foreground truncate">{profile.full_name}</p>
                <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
              </div>
            </div>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border bg-primary/20 text-primary border-primary/30">School</span>
            <div className="mt-4 pt-4 border-t border-border flex flex-col gap-2">
              <Link href="/dashboard/notifications" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <CogIcon className="w-4 h-4" /> Notification Controls
              </Link>
              <Link href="/dashboard/profile" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <AcademicCapIcon className="w-4 h-4" /> School Profile
              </Link>
            </div>
          </div>

          {/* Upcoming Schedule */}
          <div className="bg-card shadow-sm border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-foreground text-sm">What's Next</h3>
              <Link href="/dashboard/timetable" className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline">Full View</Link>
            </div>
            <div className="space-y-2">
              {upcomingSlots.length > 0 ? upcomingSlots.map(slot => (
                <div key={slot.id} className="p-3 bg-card shadow-sm border border-border rounded-xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 bottom-0 w-1 bg-primary" />
                  <div className="flex justify-between items-start gap-2">
                    <p className="text-xs font-bold text-foreground truncate">{slot.subject}</p>
                    <span className="text-[9px] font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">{slot.start_time}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 truncate">
                    {slot.room ? `📍 ${slot.room}` : 'No room set'}
                    {slot.school_name && ` · ${slot.school_name}`}
                  </p>
                </div>
              )) : (
                <div className="text-center py-6 border border-dashed border-border rounded-xl">
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">No classes today</p>
                </div>
              )}
            </div>
          </div>

          {/* Performance overview rings */}
          {!dataLoading && stats.length >= 2 && (() => {
            const pct = (val: string | number) => {
              const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.]/g, '')) || 0;
              return Math.min(100, n);
            };
            return (
              <div className="bg-card shadow-sm border border-border p-5 space-y-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Performance Rings</p>
                <div className="flex items-center justify-around flex-wrap gap-4">
                  {stats.slice(0, 3).map((s, i) => {
                    const colors = [CHART_COLORS.primary, CHART_COLORS.emerald, CHART_COLORS.violet];
                    const val = pct(s.value);
                    return (
                      <RadialRing
                        key={s.label}
                        value={val}
                        max={Math.max(val, 100)}
                        size={70}
                        strokeWidth={7}
                        color={colors[i % colors.length]}
                        label={s.label.split(' ').slice(-1)[0]}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Navigate To */}
          <div className="bg-card shadow-sm border border-border rounded-xl p-5">
            <h3 className="font-bold text-foreground text-sm mb-4">Navigate To</h3>
            <div className="space-y-1">
              {[
                { label: 'Students', href: '/dashboard/students', icon: UserGroupIcon },
                { label: 'Grades', href: '/dashboard/grades', icon: TrophyIcon },
                { label: 'Reports', href: '/dashboard/results', icon: DocumentTextIcon },
              ].map(({ label, href, icon: Icon }) => (
                <Link key={label} href={href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-card hover:text-foreground transition-all group">
                  <Icon className="w-4 h-4 group-hover:text-primary transition-colors" />
                  {label}
                  <ArrowRightIcon className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-60 transition-opacity" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
