'use client';

import { useAuth } from '@/contexts/auth-context';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import {
  AcademicCapIcon, DocumentChartBarIcon, ClipboardDocumentCheckIcon,
  ClipboardDocumentListIcon, BanknotesIcon, TrophyIcon,
  BuildingOfficeIcon, UserIcon, ArrowRightIcon, HeartIcon,
  ExclamationTriangleIcon,
} from '@/lib/icons';
import { RadialRing, GaugeBar, CHART_COLORS } from '@/components/charts';

interface Child {
  id: string;
  full_name: string;
  school_name: string | null;
  grade_level: string | null;
  current_class: string | null;
  section: string | null;
  status: string;
  gender: string | null;
  date_of_birth: string | null;
  enrollment_type: string | null;
  parent_relationship: string | null;
  created_at: string;
  user_id?: string | null;
}

interface ChildStats {
  attendancePct: number | null;
  lastGrade: string | null;
  unpaidInvoices: number;
  certificates: number;
  teacherName: string | null;
  teacherPhone: string | null;
}

function calcAge(dob: string | null): string | null {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  const age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  return `${age} yrs`;
}

const QUICK_LINKS = (id: string) => [
  { label: 'Report Cards',  href: `/dashboard/parent-results?student=${id}`,      icon: DocumentChartBarIcon,      color: 'bg-violet-500/20 text-violet-400', hover: 'group-hover/link:bg-violet-500/30' },
  { label: 'Attendance',    href: `/dashboard/parent-attendance?student=${id}`,   icon: ClipboardDocumentCheckIcon, color: 'bg-emerald-500/20 text-emerald-400', hover: 'group-hover/link:bg-emerald-500/30' },
  { label: 'Grades',        href: `/dashboard/parent-grades?student=${id}`,       icon: ClipboardDocumentListIcon,  color: 'bg-blue-500/20 text-blue-400', hover: 'group-hover/link:bg-blue-500/30' },
  { label: 'Invoices',      href: `/dashboard/parent-invoices?student=${id}`,     icon: BanknotesIcon,              color: 'bg-rose-500/20 text-rose-400', hover: 'group-hover/link:bg-rose-500/30' },
  { label: 'Certificates',  href: `/dashboard/parent-certificates?student=${id}`, icon: TrophyIcon,                 color: 'bg-amber-500/20 text-amber-400', hover: 'group-hover/link:bg-amber-500/30' },
];

export default function MyChildrenPage() {
  const { profile } = useAuth();
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsMap, setStatsMap] = useState<Record<string, ChildStats>>({});

  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    fetch('/api/parents/portal?section=summary')
      .then(res => res.json())
      .then(data => {
        const list = (data.children ?? []) as (Child & { stats: ChildStats })[];
        setChildren(list);
        
        const stats: Record<string, ChildStats> = {};
        list.forEach(c => {
          stats[c.id] = c.stats;
        });
        setStatsMap(stats);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load summary:', err);
        setLoading(false);
      });
  }, [profile]);

  if (profile?.role !== 'parent') {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground text-sm">Access restricted to parent accounts.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome hero */}
      <div className="relative bg-card border border-border overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent pointer-events-none" />
        <div className="relative px-6 py-6 flex items-start gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-primary to-primary flex items-center justify-center flex-shrink-0 shadow-lg">
            <HeartIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-foreground tracking-tight">
              Welcome, {profile.full_name?.split(' ')[0] ?? 'Parent'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-lg">
              You are an essential part of your child's learning journey. Your involvement, encouragement,
              and support make a real difference in their success at Rillcod Academy.
            </p>
            <div className="flex flex-wrap gap-6 mt-5">
              {(() => {
                const attVals = Object.values(statsMap).filter(s => s.attendancePct != null);
                const avgAtt = attVals.length > 0 ? Math.round(attVals.reduce((a, s) => a + (s.attendancePct ?? 0), 0) / attVals.length) : null;
                const unpaid = Object.values(statsMap).reduce((a, s) => a + s.unpaidInvoices, 0);
                return (
                  <>
                    <RadialRing value={children.length} max={Math.max(children.length, 5)} size={64} strokeWidth={6} color={CHART_COLORS.orange} label="Enrolled" subLabel="children" />
                    {avgAtt != null && <RadialRing value={avgAtt} max={100} size={64} strokeWidth={6} color={avgAtt >= 70 ? CHART_COLORS.emerald : CHART_COLORS.rose} label={`${avgAtt}%`} subLabel="avg attendance" />}
                    {unpaid > 0 && (
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-16 h-16 border-2 border-rose-500/40 bg-rose-500/10 flex items-center justify-center">
                          <span className="text-2xl font-black text-rose-400">{unpaid}</span>
                        </div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-rose-400">Unpaid</p>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-base font-black text-foreground tracking-tight">My Children</h2>
        <p className="text-sm text-muted-foreground mt-0.5">All children linked to your parent account.</p>
      </div>

      {loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-card border border-border p-6 animate-pulse h-48" />
          ))}
        </div>
      )}

      {!loading && children.length === 0 && (
        <div className="bg-card border border-border p-12 text-center">
          <AcademicCapIcon className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-black text-foreground uppercase tracking-wider">No children linked</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
            Contact your school administrator to link your child's enrolment to your parent account.
          </p>
        </div>
      )}

      {!loading && children.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {children.map(child => {
            const s = statsMap[child.id];
            const age = calcAge(child.date_of_birth);

            return (
              <div key={child.id} className="bg-card border border-border overflow-hidden hover:border-primary/30 transition-all group">

                {/* Card header */}
                <div className="px-6 py-5 flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-primary to-primary flex items-center justify-center flex-shrink-0">
                    <AcademicCapIcon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-black text-foreground">{child.full_name}</h2>
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 border ${
                        child.status === 'approved'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                      }`}>
                        {child.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                      {child.school_name && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <BuildingOfficeIcon className="w-3 h-3" /> {child.school_name}
                        </span>
                      )}
                      {child.grade_level && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <AcademicCapIcon className="w-3 h-3" /> {child.grade_level}
                        </span>
                      )}
                      {age && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <UserIcon className="w-3 h-3" /> {age}
                        </span>
                      )}
                      {child.parent_relationship && (
                        <span className="text-xs text-primary font-bold">{child.parent_relationship}</span>
                      )}
                      {s?.teacherName && (
                        <span className="text-xs text-violet-400 flex items-center gap-1" title={s.teacherPhone ?? undefined}>
                          <UserIcon className="w-3 h-3" /> Teacher: {s.teacherName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stats strip — visual ring charts */}
                {s && (
                  <div className="border-t border-border p-4 space-y-4">
                    {/* Radial rings row */}
                    <div className="flex items-center justify-around">
                      <RadialRing
                        value={s.attendancePct ?? 0}
                        max={100}
                        size={72}
                        strokeWidth={7}
                        color={s.attendancePct != null && s.attendancePct >= 70 ? CHART_COLORS.emerald : CHART_COLORS.rose}
                        label="Attendance"
                      />
                      <RadialRing
                        value={
                          s.lastGrade?.startsWith('A') ? 90 :
                          s.lastGrade?.startsWith('B') ? 75 :
                          s.lastGrade?.startsWith('C') ? 60 :
                          s.lastGrade?.startsWith('D') ? 45 : 0
                        }
                        max={100}
                        size={72}
                        strokeWidth={7}
                        color={
                          s.lastGrade?.startsWith('A') ? CHART_COLORS.emerald :
                          s.lastGrade?.startsWith('B') ? CHART_COLORS.blue :
                          s.lastGrade?.startsWith('C') ? CHART_COLORS.amber :
                          CHART_COLORS.rose
                        }
                        label={s.lastGrade ?? 'Grade'}
                        subLabel="Last result"
                      />
                      <div className="flex flex-col items-center gap-2">
                        <div className={`text-2xl font-black ${s.certificates > 0 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                          {s.certificates}
                        </div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Certs</p>
                        {s.unpaidInvoices > 0 && (
                          <div className="flex items-center gap-1 bg-rose-500/10 border border-rose-500/20 px-2 py-1">
                            <ExclamationTriangleIcon className="w-3 h-3 text-rose-400" />
                            <span className="text-[9px] font-black text-rose-400">{s.unpaidInvoices} unpaid</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Attendance gauge bar */}
                    {s.attendancePct != null && (
                      <GaugeBar
                        value={s.attendancePct}
                        label="Attendance rate"
                        color={s.attendancePct >= 75 ? CHART_COLORS.emerald : s.attendancePct >= 50 ? CHART_COLORS.amber : CHART_COLORS.rose}
                        height={4}
                      />
                    )}
                  </div>
                )}

                {/* Quick links */}
                <div className="grid grid-cols-5 border-t border-border">
                  {QUICK_LINKS(child.id).map(({ label, href, icon: Icon, color, hover }) => (
                    <Link key={label} href={href}
                      className="flex flex-col items-center gap-2 py-3 px-1.5 hover:bg-white/5 transition-all border-r border-border last:border-r-0 group/link">
                      <span className={`w-8 h-8 rounded-sm flex items-center justify-center ${color} ${hover} transition-colors`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="text-[8px] font-black uppercase tracking-wider text-center leading-tight text-muted-foreground group-hover/link:text-foreground transition-colors">{label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Info note */}
      {!loading && children.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Not seeing a child?</span>
          <Link href="/dashboard/messages" className="text-primary hover:text-primary font-bold underline underline-offset-2">
            Message the admin
          </Link>
          <span>to link their account to yours.</span>
        </div>
      )}
    </div>
  );
}
