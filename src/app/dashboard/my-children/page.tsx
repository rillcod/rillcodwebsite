'use client';

import { useAuth } from '@/contexts/auth-context';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import {
  AcademicCapIcon, DocumentChartBarIcon, ClipboardDocumentCheckIcon,
  ClipboardDocumentListIcon, BanknotesIcon, TrophyIcon,
  BuildingOfficeIcon, UserIcon, ArrowRightIcon, HeartIcon,
} from '@/lib/icons';

interface Child {
  id: string;
  full_name: string;
  school_name: string | null;
  grade_level: string | null;
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
}

function calcAge(dob: string | null): string | null {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  const age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  return `${age} yrs`;
}

const QUICK_LINKS = (id: string) => [
  { label: 'Report Cards',  href: `/dashboard/parent-results?student=${id}`,    icon: DocumentChartBarIcon       },
  { label: 'Attendance',    href: `/dashboard/parent-attendance?student=${id}`, icon: ClipboardDocumentCheckIcon  },
  { label: 'Grades',        href: `/dashboard/parent-grades?student=${id}`,     icon: ClipboardDocumentListIcon   },
  { label: 'Invoices',      href: `/dashboard/parent-invoices?student=${id}`,   icon: BanknotesIcon               },
  { label: 'Certificates',  href: `/dashboard/parent-certificates?student=${id}`, icon: TrophyIcon               },
];

export default function MyChildrenPage() {
  const { profile } = useAuth();
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsMap, setStatsMap] = useState<Record<string, ChildStats>>({});

  useEffect(() => {
    if (!profile) return;
    const supabase = createClient();
    supabase
      .from('students')
      .select('id, full_name, school_name, grade_level, status, gender, date_of_birth, enrollment_type, parent_relationship, created_at, user_id')
      .eq('parent_email', profile.email)
      .then(async ({ data }) => {
        const kids = (data ?? []) as Child[];
        setChildren(kids);
        setLoading(false);

        // Load quick stats per child
        const stats: Record<string, ChildStats> = {};
        await Promise.all(kids.map(async (child) => {
          const [attRes, invRes, certRes] = await Promise.all([
            child.user_id
              ? supabase
                  .from('attendance')
                  .select('status')
                  .eq('user_id', child.user_id)
                  .limit(60)
              : Promise.resolve({ data: [] }),
            child.user_id
              ? supabase
                  .from('invoices')
                  .select('id', { count: 'exact', head: true })
                  .eq('portal_user_id', child.user_id)
                  .in('status', ['pending', 'overdue'])
              : Promise.resolve({ count: 0 }),
            child.user_id
              ? supabase
                  .from('certificates')
                  .select('id', { count: 'exact', head: true })
                  .eq('portal_user_id', child.user_id)
              : Promise.resolve({ count: 0 }),
          ]);

          const att = (attRes as any).data ?? [];
          const present = att.filter((a: any) => a.status === 'present').length;
          const attendancePct = att.length > 0 ? Math.round((present / att.length) * 100) : null;

          stats[child.id] = {
            attendancePct,
            lastGrade: null, // populated below if user_id exists
            unpaidInvoices: (invRes as any).count ?? 0,
            certificates: (certRes as any).count ?? 0,
          };

          // Latest grade — student_progress_reports.student_id = portal_users.id (user_id)
          if (child.user_id) {
            const gradeRes = await supabase
              .from('student_progress_reports')
              .select('overall_grade')
              .eq('student_id', child.user_id)
              .eq('is_published', true)
              .order('report_date', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (gradeRes.data?.overall_grade) {
              stats[child.id].lastGrade = gradeRes.data.overall_grade;
            }
          }
        }));
        setStatsMap(stats);
      });
  }, [profile]); // eslint-disable-line

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
        <div className="absolute inset-0 bg-gradient-to-br from-orange-600/10 via-transparent to-transparent pointer-events-none" />
        <div className="relative px-6 py-6 flex items-start gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-orange-600 to-orange-400 flex items-center justify-center flex-shrink-0 shadow-lg">
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
            <div className="flex flex-wrap gap-4 mt-4">
              {[
                { label: 'Children Enrolled', value: children.length },
                { label: 'Average Attendance', value: (() => { const p = Object.values(statsMap).filter(s => s.attendancePct != null); return p.length > 0 ? `${Math.round(p.reduce((a, s) => a + (s.attendancePct ?? 0), 0) / p.length)}%` : '—'; })() },
                { label: 'Unpaid Invoices', value: Object.values(statsMap).reduce((a, s) => a + s.unpaidInvoices, 0) },
              ].map(({ label, value }) => (
                <div key={label} className="text-center min-w-[80px]">
                  <p className="text-xl font-black text-orange-400">{value}</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mt-0.5">{label}</p>
                </div>
              ))}
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
              <div key={child.id} className="bg-card border border-border overflow-hidden hover:border-orange-500/30 transition-all group">

                {/* Card header */}
                <div className="px-6 py-5 flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-600 to-orange-400 flex items-center justify-center flex-shrink-0">
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
                        <span className="text-xs text-orange-400 font-bold">{child.parent_relationship}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stats strip */}
                {s && (
                  <div className="grid grid-cols-4 border-t border-border">
                    {[
                      {
                        label: 'Attendance',
                        value: s.attendancePct != null ? `${s.attendancePct}%` : '—',
                        color: s.attendancePct != null && s.attendancePct >= 70 ? 'text-emerald-400' : s.attendancePct != null ? 'text-rose-400' : 'text-muted-foreground',
                      },
                      {
                        label: 'Last Grade',
                        value: s.lastGrade ?? '—',
                        color: s.lastGrade?.startsWith('A') ? 'text-emerald-400' : s.lastGrade?.startsWith('B') ? 'text-blue-400' : s.lastGrade?.startsWith('C') ? 'text-amber-400' : 'text-muted-foreground',
                      },
                      {
                        label: 'Unpaid',
                        value: s.unpaidInvoices > 0 ? `${s.unpaidInvoices}` : '0',
                        color: s.unpaidInvoices > 0 ? 'text-rose-400' : 'text-muted-foreground',
                      },
                      {
                        label: 'Certs',
                        value: `${s.certificates}`,
                        color: s.certificates > 0 ? 'text-amber-400' : 'text-muted-foreground',
                      },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="py-3 text-center border-r border-border last:border-r-0">
                        <p className={`text-lg font-black ${color}`}>{value}</p>
                        <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Quick links */}
                <div className="grid grid-cols-5 border-t border-border">
                  {QUICK_LINKS(child.id).map(({ label, href, icon: Icon }) => (
                    <Link key={label} href={href}
                      className="flex flex-col items-center gap-1.5 py-3 px-2 hover:bg-orange-500/5 hover:text-orange-400 text-muted-foreground transition-all border-r border-border last:border-r-0 group/link">
                      <Icon className="w-4 h-4 group-hover/link:scale-110 transition-transform" />
                      <span className="text-[8px] font-black uppercase tracking-wider text-center leading-tight">{label}</span>
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
          <Link href="/dashboard/messages" className="text-orange-400 hover:text-orange-300 font-bold underline underline-offset-2">
            Message the admin
          </Link>
          <span>to link their account to yours.</span>
        </div>
      )}
    </div>
  );
}
