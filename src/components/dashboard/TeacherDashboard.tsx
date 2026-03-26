'use client';

import {
  UserGroupIcon, ClipboardDocumentListIcon, BookOpenIcon,
  ChartBarIcon, CalendarDaysIcon, ClockIcon, ArrowRightIcon,
  ArrowRightOnRectangleIcon
} from '@/lib/icons';
import Link from 'next/link';

interface TeacherDashboardProps {
  stats: any[];
  activities: any[];
  actionCenter: { ungradedAssignments: number; ungradedExams: number } | null;
  upcomingSlots: any[];
}

export default function TeacherDashboard({ stats, activities, actionCenter, upcomingSlots }: TeacherDashboardProps) {
  return (
    <div className="space-y-6">
      {/* Action Center - Urgent grading notifications */}
      {(actionCenter?.ungradedAssignments || 0) + (actionCenter?.ungradedExams || 0) > 0 && (
        <div className="bg-orange-600/10 border border-orange-500/20 p-6 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-orange-600/20 border border-orange-500/30 flex items-center justify-center">
              <ClipboardDocumentListIcon className="w-6 h-6 text-orange-400" />
            </div>
            <div>
              <h3 className="text-base font-black text-foreground uppercase tracking-tight">Grading Action Required</h3>
              <p className="text-xs text-muted-foreground mt-1">
                You have <span className="text-orange-400 font-bold">{actionCenter?.ungradedAssignments || 0}</span> assignments 
                and <span className="text-orange-400 font-bold">{actionCenter?.ungradedExams || 0}</span> exams pending grading.
              </p>
            </div>
          </div>
          <Link href="/dashboard/assignments"
            className="px-6 py-3 bg-orange-600 hover:bg-orange-500 text-foreground text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-orange-900/40">
            Grade Now →
          </Link>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        {stats.map(({ label, value, icon: Icon, gradient }) => (
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
        {/* Left Column: Recent Classes & Attendance */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card shadow-sm border border-border p-6 sm:p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-[9px] font-black text-orange-500 uppercase tracking-[0.4em]">Instructor Focus</p>
                <h2 className="text-xl font-black text-foreground uppercase tracking-tight mt-0.5">Teaching Schedule</h2>
              </div>
              <Link href="/dashboard/classes" className="text-[10px] font-black text-muted-foreground hover:text-foreground uppercase tracking-widest flex items-center gap-1.5 transition-colors">
                View All <ArrowRightIcon className="w-3 h-3" />
              </Link>
            </div>

            {upcomingSlots.length > 0 ? (
              <div className="space-y-4">
                {upcomingSlots.map((slot) => (
                  <div key={slot.id} className="group bg-background border border-border p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all hover:border-orange-500/20">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-muted border border-border flex flex-col items-center justify-center text-center">
                        <ClockIcon className="w-5 h-5 text-orange-400 mb-0.5" />
                        <span className="text-[8px] font-black uppercase tracking-widest">{slot.start_time.split(':')[0]}:{slot.start_time.split(':')[1]}</span>
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-foreground uppercase tracking-tight">{slot.subject}</h4>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mt-0.5">
                          {slot.school_name || 'Rillcod Portal'} · {slot.room || 'General Room'}
                        </p>
                      </div>
                    </div>
                    <Link href={`/dashboard/attendance?class_id=${slot.id}`}
                      className="px-5 py-2.5 bg-card shadow-sm hover:bg-muted border border-border text-[9px] font-black uppercase tracking-widest transition-all">
                      Mark Attendance
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 border border-dashed border-border text-center">
                <CalendarDaysIcon className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-xs text-muted-foreground font-medium">No sessions scheduled for today</p>
              </div>
            )}
          </div>

          <div className="bg-card shadow-sm border border-border p-6 sm:p-8">
             <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-[9px] font-black text-orange-500 uppercase tracking-[0.4em]">Quick Tools</p>
                  <h2 className="text-xl font-black text-foreground uppercase tracking-tight mt-0.5">Management Hub</h2>
                </div>
             </div>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Link href="/dashboard/students" className="p-5 bg-background border border-border hover:border-orange-500/20 transition-all group">
                   <UserGroupIcon className="w-6 h-6 text-orange-400 mb-3" />
                   <h4 className="text-xs font-black text-foreground uppercase tracking-widest group-hover:text-orange-400">My Students</h4>
                   <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">View roster, cards, and print login slips</p>
                </Link>
                <Link href="/dashboard/attendance" className="p-5 bg-background border border-border hover:border-orange-500/20 transition-all group">
                   <ClipboardDocumentListIcon className="w-6 h-6 text-emerald-400 mb-3" />
                   <h4 className="text-xs font-black text-foreground uppercase tracking-widest group-hover:text-emerald-400">Attendance Log</h4>
                   <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">History records and participation reports</p>
                </Link>
             </div>
          </div>
        </div>

        {/* Right Column: Recent Activity Feed */}
        <div className="bg-card shadow-sm border border-border p-6 sm:p-8 h-fit">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">Latest Workflow</h3>
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
          </div>

          {activities.length > 0 ? (
            <div className="space-y-8 relative before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-muted">
              {activities.map((act) => (
                <div key={act.id} className="relative flex items-start gap-4">
                  <div className={`w-8 h-8 ${act.color} flex items-center justify-center flex-shrink-0 z-10 relative`}>
                    <act.icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-foreground uppercase tracking-tight truncate">{act.title}</p>
                    <p className="text-[10px] text-muted-foreground font-medium truncate mt-0.5">{act.desc}</p>
                    <p className="text-[9px] font-black text-orange-500/60 uppercase tracking-widest mt-2">{act.time}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center">
              <ArrowRightOnRectangleIcon className="w-8 h-8 mx-auto text-muted-foreground/20 mb-3" />
              <p className="text-[10px] text-muted-foreground font-bold tracking-widest uppercase">No Recent Events</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
