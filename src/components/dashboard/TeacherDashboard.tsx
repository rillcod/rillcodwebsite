'use client';

import {
  UserGroupIcon, AcademicCapIcon, BookOpenIcon,
  ClipboardDocumentListIcon, ArrowRightIcon, ArrowPathIcon,
  UserPlusIcon, ClipboardDocumentCheckIcon, DocumentChartBarIcon,
  CogIcon
} from '@/lib/icons';
import Link from 'next/link';
import { SparkCard, GaugeBar, CHART_COLORS } from '@/components/charts';

interface DashStats { label: string; value: string | number; icon: any; gradient: string }
interface Activity { id: string; title: string; desc: string; time: string; icon: any; color: string }
interface QuickAction { name: string; href: string; icon: any; desc: string }
interface Slot { id: string; start_time: string; subject: string; room: string | null; school_name?: string }

interface TeacherDashboardProps {
  profile: { full_name: string | null; email: string };
  stats: DashStats[];
  activities: Activity[];
  upcomingSlots: Slot[];
  teacherActionCenter: { ungradedAssignments: number; ungradedExams: number } | null;
  quickActions: QuickAction[];
  dataLoading: boolean;
  onRefresh: () => void;
}

export default function TeacherDashboard({ profile, stats, activities, upcomingSlots, teacherActionCenter, quickActions, dataLoading, onRefresh }: TeacherDashboardProps) {
  return (
    <div className="space-y-6">

      {/* Stats Grid */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Live Stats</p>
          <button onClick={onRefresh} disabled={dataLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground bg-card shadow-sm hover:bg-muted border border-border rounded-none transition-all disabled:opacity-40">
            <ArrowPathIcon className={`w-3.5 h-3.5 ${dataLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          {dataLoading
            ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card shadow-sm border border-border rounded-none p-5 sm:p-6 animate-pulse">
                <div className="h-10 w-10 bg-muted rounded-none mb-4" />
                <div className="h-8 bg-muted rounded w-1/2 mb-2" />
                <div className="h-4 bg-card shadow-sm rounded w-2/3" />
              </div>
            ))
            : stats.map(({ label, value, icon: Icon, gradient }) => (
              <div key={label} className="bg-card shadow-sm border border-border border-t-2 border-t-brand-red-600 rounded-none p-5 sm:p-7 hover:bg-white/8 transition-all group relative overflow-hidden">
                <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${gradient} opacity-[0.03] blur-2xl -mr-12 -mt-12 group-hover:scale-150 transition-transform`} />
                <div className="flex items-start justify-between mb-5 relative z-10">
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-none bg-gradient-to-br ${gradient} flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform`}>
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


      {/* Grading Queue */}
      {teacherActionCenter !== null && (
        <div className="bg-card border border-border rounded-none p-6 sm:p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 blur-[80px] -mr-24 -mt-24 pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-[9px] font-black text-brand-red-600 uppercase tracking-[0.4em]">Smart Command Center</p>
                <h2 className="text-xl font-black text-foreground uppercase tracking-tight mt-0.5">Grading Queue</h2>
              </div>
              <div className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-widest border rounded-none ${(teacherActionCenter.ungradedAssignments + teacherActionCenter.ungradedExams) > 0
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                }`}>
                {(teacherActionCenter.ungradedAssignments + teacherActionCenter.ungradedExams) > 0
                  ? `${teacherActionCenter.ungradedAssignments + teacherActionCenter.ungradedExams} Pending`
                  : 'All Clear ✓'}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Link href="/dashboard/assignments"
                className={`group flex items-center gap-4 p-5 border rounded-none transition-all hover:scale-[1.01] ${teacherActionCenter.ungradedAssignments > 0
                    ? 'bg-rose-500/5 border-rose-500/20 hover:border-rose-500/40'
                    : 'bg-card border-border hover:border-border'
                  }`}>
                <div className={`w-12 h-12 flex items-center justify-center text-2xl font-black rounded-none ${teacherActionCenter.ungradedAssignments > 0 ? 'bg-rose-500/20' : 'bg-emerald-500/10'}`}>
                  {teacherActionCenter.ungradedAssignments > 0 ? '📋' : '✅'}
                </div>
                <div>
                  <p className={`text-2xl font-black tabular-nums ${teacherActionCenter.ungradedAssignments > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {teacherActionCenter.ungradedAssignments}
                  </p>
                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Assignments</p>
                </div>
                <ArrowRightIcon className="w-4 h-4 text-muted-foreground ml-auto opacity-0 group-hover:opacity-60 transition-opacity" />
              </Link>
              <Link href="/dashboard/cbt"
                className={`group flex items-center gap-4 p-5 border rounded-none transition-all hover:scale-[1.01] ${teacherActionCenter.ungradedExams > 0
                    ? 'bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40'
                    : 'bg-card border-border hover:border-border'
                  }`}>
                <div className={`w-12 h-12 flex items-center justify-center text-2xl font-black rounded-none ${teacherActionCenter.ungradedExams > 0 ? 'bg-amber-500/20' : 'bg-emerald-500/10'}`}>
                  {teacherActionCenter.ungradedExams > 0 ? '📝' : '✅'}
                </div>
                <div>
                  <p className={`text-2xl font-black tabular-nums ${teacherActionCenter.ungradedExams > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {teacherActionCenter.ungradedExams}
                  </p>
                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">CBT Exams</p>
                </div>
                <ArrowRightIcon className="w-4 h-4 text-muted-foreground ml-auto opacity-0 group-hover:opacity-60 transition-opacity" />
              </Link>
              <Link href="/dashboard/lessons/add"
                className="group flex items-center gap-4 p-5 bg-primary/5 border border-primary/20 hover:border-primary/40 rounded-none transition-all hover:scale-[1.01]">
                <div className="w-12 h-12 bg-primary/20 flex items-center justify-center text-2xl rounded-none">✨</div>
                <div>
                  <p className="text-sm font-black text-primary uppercase tracking-tight">AI Lesson</p>
                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Generate Now</p>
                </div>
                <ArrowRightIcon className="w-4 h-4 text-muted-foreground ml-auto opacity-0 group-hover:opacity-60 transition-opacity" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Student Registration Hub */}
      <div className="bg-card border border-border rounded-none p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 blur-[80px] -mr-24 -mt-24 pointer-events-none" />
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <p className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.4em]">Students</p>
              <h2 className="text-xl font-black text-foreground uppercase tracking-tight mt-0.5">Register Students</h2>
            </div>
            <Link href="/dashboard/students"
              className="px-4 py-2 text-[9px] font-black uppercase tracking-widest border border-border text-muted-foreground hover:text-foreground hover:border-emerald-500/40 rounded-none transition-all flex items-center gap-1.5">
              <UserGroupIcon className="w-3.5 h-3.5" /> View All Students
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link href="/dashboard/students/bulk-register"
              className="group flex flex-col gap-3 p-5 bg-emerald-500/5 border border-emerald-500/20 hover:border-emerald-500/40 rounded-none transition-all">
              <div className="w-10 h-10 bg-emerald-500/20 flex items-center justify-center rounded-none">
                <UserGroupIcon className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-black text-foreground">Bulk Register</p>
                <p className="text-xs text-muted-foreground mt-1">Paste a list of student names — fastest for a whole class</p>
              </div>
              <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mt-auto">Start →</span>
            </Link>
            <Link href="/dashboard/students/bulk-register?tab=single"
              className="group flex flex-col gap-3 p-5 bg-card border border-border hover:border-emerald-500/30 rounded-none transition-all">
              <div className="w-10 h-10 bg-muted flex items-center justify-center rounded-none">
                <UserPlusIcon className="w-5 h-5 text-muted-foreground group-hover:text-emerald-400 transition-colors" />
              </div>
              <div>
                <p className="text-sm font-black text-foreground">Single Student</p>
                <p className="text-xs text-muted-foreground mt-1">Fill in a form for one student — name, class, school</p>
              </div>
              <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mt-auto opacity-0 group-hover:opacity-100 transition-opacity">Start →</span>
            </Link>
            <Link href="/dashboard/students/import"
              className="group flex flex-col gap-3 p-5 bg-card border border-border hover:border-emerald-500/30 rounded-none transition-all">
              <div className="w-10 h-10 bg-muted flex items-center justify-center rounded-none">
                <ClipboardDocumentCheckIcon className="w-5 h-5 text-muted-foreground group-hover:text-emerald-400 transition-colors" />
              </div>
              <div>
                <p className="text-sm font-black text-foreground">Import CSV</p>
                <p className="text-xs text-muted-foreground mt-1">Upload a spreadsheet — best for large batches with full details</p>
              </div>
              <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mt-auto opacity-0 group-hover:opacity-100 transition-opacity">Start →</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Grid: Quick Actions + Activity + Sidebar */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Left: Quick Actions + Recent Activity */}
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-card shadow-sm border border-border rounded-none p-6">
            <h2 className="text-lg font-bold text-foreground mb-5">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {quickActions.map(({ name, href, icon: Icon, desc }) => (
                <Link key={name} href={href}
                  className="group flex items-start gap-4 p-4 rounded-none border border-border hover:border-primary/40 hover:bg-primary/5 transition-all">
                  <div className="w-10 h-10 rounded-none bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/25 transition-colors">
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

          <div className="bg-card border border-border rounded-none p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-foreground uppercase tracking-widest">Recent Activity</h2>
                <span className="text-[9px] font-black text-primary/60 uppercase tracking-widest hidden sm:inline">· Live Pulse</span>
              </div>
              <button onClick={onRefresh}
                className="p-1.5 rounded-none bg-background hover:bg-muted text-muted-foreground hover:text-foreground border border-border transition-all group">
                <ArrowPathIcon className={`w-3.5 h-3.5 ${dataLoading ? 'animate-spin' : 'group-active:rotate-180 transition-transform'}`} />
              </button>
            </div>
            {dataLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-3 animate-pulse py-1.5">
                    <div className="w-6 h-6 bg-muted rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-muted rounded w-3/4" />
                      <div className="h-2.5 bg-muted rounded w-1/2 opacity-50" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activities.length === 0 ? (
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest py-3 text-center border border-dashed border-border">No recent activity</p>
            ) : (
              <div className="divide-y divide-border">
                {activities.slice(0, 3).map((a) => (
                  <div key={a.id} className="flex items-center gap-3 py-2.5">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${a.color}`}>
                      <a.icon className="h-3 w-3" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">{a.title}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{a.desc}</p>
                    </div>
                    <span className="text-[9px] font-black text-muted-foreground whitespace-nowrap">{a.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-5">
          <div className="bg-gradient-to-br from-primary/20 to-primary/20 border border-primary/20 rounded-none p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-none bg-gradient-to-br from-primary to-primary flex items-center justify-center text-xl font-black text-foreground">
                {(profile.full_name ?? 'T')[0].toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-foreground truncate">{profile.full_name}</p>
                <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
              </div>
            </div>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border bg-primary/20 text-primary border-primary/30">Teacher</span>
            <div className="mt-4 pt-4 border-t border-border flex flex-col gap-2">
              <Link href="/dashboard/settings" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <CogIcon className="w-4 h-4" /> Account Settings
              </Link>
              <Link href="/dashboard/profile" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <AcademicCapIcon className="w-4 h-4" /> Edit Profile
              </Link>
            </div>
          </div>

          {/* Upcoming Schedule */}
          <div className="bg-card shadow-sm border border-border rounded-none p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-foreground text-sm">What's Next</h3>
              <Link href="/dashboard/timetable" className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline">Full View</Link>
            </div>
            <div className="space-y-2">
              {upcomingSlots.length > 0 ? upcomingSlots.map(slot => (
                <div key={slot.id} className="p-3 bg-card shadow-sm border border-border rounded-none relative overflow-hidden">
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
                <div className="text-center py-6 border border-dashed border-border rounded-none">
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">No classes today</p>
                </div>
              )}
            </div>
          </div>

          {/* Navigate To */}
          <div className="bg-card shadow-sm border border-border rounded-none p-5">
            <h3 className="font-bold text-foreground text-sm mb-4">Navigate To</h3>
            <div className="space-y-1">
              {[
                { label: 'Progress Reports', href: '/dashboard/results', icon: DocumentChartBarIcon },
                { label: 'Lessons', href: '/dashboard/lessons', icon: BookOpenIcon },
                { label: 'CBT Centre', href: '/dashboard/cbt', icon: ClipboardDocumentCheckIcon },
                { label: 'Profile', href: '/dashboard/profile', icon: AcademicCapIcon },
              ].map(({ label, href, icon: Icon }) => (
                <Link key={label} href={href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-none text-sm text-muted-foreground hover:bg-card hover:text-foreground transition-all group">
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
